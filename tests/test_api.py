import datetime as dt

import pytest
from fastapi.testclient import TestClient

from mdtask.server import create_app

SRC = "# 笔记\n\n- [ ] 任务甲 ⏫ 🆔 api001\n    - [ ] 子任务 🆔 api002\n- [ ] 任务乙 🆔 api003\n\n结尾。\n"


@pytest.fixture()
def client(tmp_path):
    (tmp_path / "p.md").write_text(SRC, encoding="utf-8")
    app = create_app(tmp_path, serve_static=False, watch=False)
    with TestClient(app) as c:
        c.vault_root = tmp_path  # type: ignore[attr-defined]
        yield c


def test_get_tasks_tree(client):
    data = client.get("/api/tasks").json()
    roots = data["files"]["p.md"]
    assert [r["id"] for r in roots] == ["api001", "api003"]
    assert roots[0]["children"][0]["id"] == "api002"


def test_create_and_patch(client):
    created = client.post("/api/tasks", json={"title": "买牛奶 !2"}).json()
    assert created["priority"] == "high"
    patched = client.patch(f"/api/tasks/{created['id']}", json={"status": "done"}).json()
    assert patched["done_date"] == dt.date.today().isoformat()


def test_cycle_returns_409(client):
    client.patch("/api/tasks/api001", json={"depends_on": ["api003"]})
    res = client.patch("/api/tasks/api003", json={"depends_on": ["api001"]})
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "CYCLE_DETECTED"
    assert set(res.json()["error"]["detail"]) == {"api001", "api003"}


def test_indent_endpoints(client):
    res = client.post("/api/tasks/api003/indent", json={"direction": "in"})
    assert res.json()["level"] == 2
    res = client.post("/api/tasks/api003/indent", json={"direction": "out"})
    assert res.json()["level"] == 1


def test_move_endpoint(client):
    res = client.post("/api/tasks/api003/move", json={"parent_id": "api001"})
    assert res.status_code == 200
    assert res.json()["level"] == 2
    roots = client.get("/api/tasks").json()["files"]["p.md"]
    assert [r["id"] for r in roots] == ["api001"]
    assert [c["id"] for c in roots[0]["children"]] == ["api002", "api003"]

    bad = client.post("/api/tasks/api001/move", json={"parent_id": "api002"})
    assert bad.status_code == 400
    assert bad.json()["error"]["code"] == "BAD_TARGET"


def test_move_endpoint_across_files(client):
    created = client.post("/api/tasks", json={"title": "从 Inbox 拖走"}).json()
    moved = client.post(f"/api/tasks/{created['id']}/move", json={"parent_id": "api001"}).json()
    assert moved["file"] == "p.md" and moved["level"] == 2

    files = client.get("/api/tasks").json()["files"]
    assert files.get("Inbox.md", []) == []
    assert [c["id"] for c in files["p.md"][0]["children"]] == ["api002", created["id"]]


def test_today_flow(client):
    client.post("/api/today/toggle", json={"task_id": "api001"})
    client.post("/api/today/toggle", json={"task_id": "api003"})
    payload = client.get("/api/today").json()
    assert [i["id"] for i in payload["items"]] == ["api001", "api003"]

    payload = client.put("/api/today", json={"task_ids": ["api003", "api001"]}).json()
    assert [i["id"] for i in payload["items"]] == ["api003", "api001"]

    client.patch("/api/tasks/api003", json={"status": "done"})
    payload = client.get("/api/today").json()
    assert payload["done"] == 1 and payload["total"] == 2

    # toggling off removes it
    client.post("/api/today/toggle", json={"task_id": "api003"})
    assert [i["id"] for i in client.get("/api/today").json()["items"]] == ["api001"]


def test_delete_cleans_today_and_deps(client):
    client.post("/api/today/toggle", json={"task_id": "api002"})
    client.patch("/api/tasks/api003", json={"depends_on": ["api002"]})
    res = client.delete("/api/tasks/api001").json()
    assert set(res["removed"]) == {"api001", "api002"}
    assert client.get("/api/today").json()["items"] == []
    assert client.get("/api/tasks").json()["files"]["p.md"][0]["depends_on"] == []


def test_files_endpoint_hides_today_dir(client):
    data = client.get("/api/files").json()
    assert all(not f["path"].startswith("Today/") for f in data["files"])
    assert data["inbox"] == "Inbox.md"


def test_prose_preserved_after_edits(client):
    client.patch("/api/tasks/api001", json={"priority": "highest", "title": "任务甲改名"})
    text = (client.vault_root / "p.md").read_text(encoding="utf-8")
    assert text.startswith("# 笔记\n\n")
    assert text.endswith("\n结尾。\n")
    assert "- [ ] 任务甲改名 🔺 🆔 api001" in text
