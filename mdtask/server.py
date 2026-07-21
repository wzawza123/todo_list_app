"""FastAPI app: REST + WebSocket over a Vault."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import Body, FastAPI, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import today as today_mod
from .vault import INBOX, TODAY_DIR, Vault, VaultError, today_str
from .watcher import start_watcher

log = logging.getLogger("mdtask")


class Hub:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self.loop: Optional[asyncio.AbstractEventLoop] = None

    async def broadcast(self, message: dict) -> None:
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)

    def notify_threadsafe(self, message: dict) -> None:
        if self.loop is None:
            return
        asyncio.run_coroutine_threadsafe(self.broadcast(message), self.loop)


class CreateTask(BaseModel):
    title: str
    file: Optional[str] = None
    parent_id: Optional[str] = None
    after_id: Optional[str] = None
    priority: str = "none"


class PatchTask(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    depends_on: Optional[list[str]] = None
    due: Optional[str] = None


class IndentBody(BaseModel):
    direction: str


class TodayBody(BaseModel):
    date: Optional[str] = None
    task_ids: list[str]


def create_app(vault_path: Path, serve_static: bool = True, watch: bool = True) -> FastAPI:
    vault = Vault(vault_path)
    hub = Hub()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        hub.loop = asyncio.get_running_loop()
        observer = None
        if watch:
            try:
                observer = start_watcher(vault, lambda: hub.notify_threadsafe({"type": "vault_changed"}))
            except OSError as exc:
                # e.g. inotify watch limit reached: the app stays usable, it
                # just won't auto-refresh on external edits.
                log.warning("文件监听启动失败（%s），外部编辑不会自动刷新", exc)
        try:
            yield
        finally:
            if observer:
                observer.stop()

    app = FastAPI(title="MD Task Manager", lifespan=lifespan)
    app.state.vault = vault

    @app.exception_handler(VaultError)
    async def _vault_error(_request: Request, exc: VaultError):
        status = {"CYCLE_DETECTED": 409, "NOT_FOUND": 404}.get(exc.code, 400)
        return JSONResponse(
            status_code=status,
            content={"error": {"code": exc.code, "message": exc.message, "detail": exc.detail}},
        )

    def changed():
        hub.notify_threadsafe({"type": "vault_changed"})

    # ------------------------------------------------------------------ tasks

    @app.get("/api/tasks")
    def get_tasks():
        vault.refresh_if_stale()
        return vault.snapshot()

    @app.post("/api/tasks")
    def post_task(body: CreateTask):
        task = vault.create_task(
            title=body.title,
            file=body.file,
            parent_id=body.parent_id,
            after_id=body.after_id,
            priority=body.priority,
        )
        changed()
        return task.to_dict()

    @app.patch("/api/tasks/{task_id}")
    def patch_task(task_id: str, body: PatchTask):
        patch = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
        task = vault.update_task(task_id, patch)
        changed()
        return task.to_dict()

    @app.delete("/api/tasks/{task_id}")
    def delete_task(task_id: str):
        removed = vault.delete_task(task_id)
        today_mod.purge_ids(vault, removed)
        changed()
        return {"removed": removed}

    @app.post("/api/tasks/{task_id}/indent")
    def indent_task(task_id: str, body: IndentBody):
        task = vault.indent_task(task_id, body.direction)
        changed()
        return task.to_dict()

    # ------------------------------------------------------------------ files

    @app.get("/api/files")
    def get_files():
        vault.refresh_if_stale()
        files = [f for f in vault.file_tree() if not f["path"].startswith(TODAY_DIR + "/")]
        return {"files": files, "inbox": INBOX}

    # ------------------------------------------------------------------ today

    @app.get("/api/today")
    def get_today(date: Optional[str] = Query(None)):
        date = date or today_str()
        vault.refresh_if_stale()
        payload = today_mod.expand(vault, date)
        payload["carry_over"] = today_mod.pending_carry_over(vault, date)["pending"]
        return payload

    @app.put("/api/today")
    def put_today(body: TodayBody):
        date = body.date or today_str()
        today_mod.write_ids(vault, date, body.task_ids)
        return today_mod.expand(vault, date)

    @app.post("/api/today/toggle")
    def toggle_today(payload: dict = Body(...)):
        date = payload.get("date") or today_str()
        today_mod.toggle(vault, date, payload["task_id"])
        return today_mod.expand(vault, date)

    @app.post("/api/today/carry-over")
    def do_carry_over(payload: dict = Body(default={})):
        return today_mod.carry_over(vault, (payload or {}).get("date"))

    @app.post("/api/today/clean")
    def clean_today(payload: dict = Body(default={})):
        return today_mod.clean_stale(vault, (payload or {}).get("date") or today_str())

    # --------------------------------------------------------------- websocket

    @app.websocket("/ws")
    async def ws_endpoint(ws: WebSocket):
        await ws.accept()
        hub.clients.add(ws)
        try:
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            hub.clients.discard(ws)

    # ------------------------------------------------------------------ static

    dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
    if serve_static and dist.exists():
        app.mount("/assets", StaticFiles(directory=str(dist / "assets")), name="assets")

        @app.get("/{full_path:path}")
        def spa(full_path: str):
            candidate = dist / full_path
            if full_path and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(dist / "index.html")

    return app
