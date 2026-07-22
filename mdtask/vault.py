"""Vault: scanning, in-memory model and atomic write-back."""

from __future__ import annotations

import datetime as dt
import hashlib
import logging
import os
import tempfile
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Optional

from .parser import (
    INDENT,
    MAX_LEVEL,
    TASK_RE,
    Task,
    build_tree,
    indent_to_level,
    new_id,
    parse_lines,
)

log = logging.getLogger("mdtask")

SKIP_DIRS = {".obsidian", ".trash", ".git", "node_modules", "__pycache__"}
INBOX = "Inbox.md"
TODAY_DIR = "Today"


class VaultError(Exception):
    def __init__(self, code: str, message: str, detail=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.detail = detail


@dataclass
class FileDoc:
    rel: str
    lines: list[str] = field(default_factory=list)  # line endings included
    mtime: float = 0.0
    size: int = 0
    tasks: list[Task] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def eol(self) -> str:
        for ln in self.lines:
            if ln.endswith("\r\n"):
                return "\r\n"
            if ln.endswith("\n"):
                return "\n"
        return os.linesep if os.name != "posix" else "\n"

    def text(self) -> str:
        return "".join(self.lines)


def today_str() -> str:
    return dt.date.today().isoformat()


class Vault:
    def __init__(self, root: Path):
        self.root = Path(root).expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / TODAY_DIR).mkdir(exist_ok=True)
        inbox = self.root / INBOX
        if not inbox.exists():
            inbox.write_text("", encoding="utf-8")
        self.lock = threading.RLock()
        self.files: dict[str, FileDoc] = {}
        self.warnings: list[str] = []
        self._skipped: dict[str, tuple[float, int]] = {}
        self._fingerprints: set[str] = set()
        self.scan()

    # ---------------------------------------------------------------- scanning

    def md_paths(self) -> list[Path]:
        out: list[Path] = []
        for dirpath, dirnames, filenames in os.walk(self.root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
            for name in filenames:
                if name.endswith(".md"):
                    out.append(Path(dirpath) / name)
        return sorted(out)

    def rel(self, path: Path) -> str:
        return str(Path(path).resolve().relative_to(self.root)).replace(os.sep, "/")

    def abs(self, rel: str) -> Path:
        p = (self.root / rel).resolve()
        if not str(p).startswith(str(self.root)):
            raise VaultError("BAD_PATH", f"路径越界: {rel}")
        return p

    def _load_file(self, path: Path) -> Optional[FileDoc]:
        rel = self.rel(path)
        try:
            raw = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            self.warnings.append(f"{rel}: 非 UTF-8 编码，已跳过")
            st = path.stat()
            self._skipped[rel] = (st.st_mtime, st.st_size)
            return None
        except OSError as exc:
            self.warnings.append(f"{rel}: 读取失败 ({exc})")
            return None
        lines = raw.splitlines(keepends=True)
        tasks, warns = parse_lines(lines, rel)
        st = path.stat()
        return FileDoc(
            rel=rel, lines=lines, mtime=st.st_mtime, size=st.st_size, tasks=tasks, warnings=warns
        )

    def scan(self) -> None:
        with self.lock:
            self.warnings = []
            self._skipped = {}
            files: dict[str, FileDoc] = {}
            for path in self.md_paths():
                doc = self._load_file(path)
                if doc is not None:
                    files[doc.rel] = doc
            self.files = files
            self._dedupe_ids()
            self.warnings.extend(w for doc in files.values() for w in doc.warnings)

    def _dedupe_ids(self) -> None:
        """Cross-file duplicate 🆔: keep the first, demote the rest."""
        seen: set[str] = set()
        for rel in sorted(self.files):
            for t in self.files[rel].tasks:
                if not t.id:
                    continue
                if t.id in seen:
                    self.warnings.append(f"{rel}:{t.line + 1} 跨文件重复 🆔 {t.id}，按无 id 处理")
                    t.id = None
                else:
                    seen.add(t.id)

    def _disk_state(self) -> dict[str, tuple[float, int]]:
        """(mtime, size) per file. Size is included because mtime granularity
        can be as coarse as 1s, which would hide same-second external edits."""
        state = {}
        for path in self.md_paths():
            try:
                st = path.stat()
            except OSError:
                continue
            state[self.rel(path)] = (st.st_mtime, st.st_size)
        return state

    def refresh_if_stale(self) -> bool:
        """Rescan when the file set or any mtime changed.

        Only stats files, so it is cheap enough to call on every read. This is
        what keeps the app correct when the watcher can't run (e.g. the inotify
        watch limit is exhausted).
        """
        with self.lock:
            disk = self._disk_state()
            known = {rel: (doc.mtime, doc.size) for rel, doc in self.files.items()}
            known.update(self._skipped)
            if disk == known:
                return False
            self.scan()
            return True

    def reload_file(self, path: Path) -> None:
        with self.lock:
            rel = self.rel(path)
            if not path.exists():
                self.files.pop(rel, None)
                return
            doc = self._load_file(path)
            if doc is not None:
                self.files[rel] = doc

    # ------------------------------------------------------------------ lookup

    def all_tasks(self) -> list[Task]:
        return [t for rel in sorted(self.files) for t in self.files[rel].tasks]

    def index(self) -> dict[str, Task]:
        return {t.id: t for t in self.all_tasks() if t.id}

    def taken_ids(self) -> set[str]:
        return {t.id for t in self.all_tasks() if t.id}

    def find(self, task_id: str) -> tuple[FileDoc, Task]:
        hit = self._find(task_id)
        if hit is None and self.refresh_if_stale():
            hit = self._find(task_id)  # the task may live in a file we hadn't read yet
        if hit is None:
            raise VaultError("NOT_FOUND", f"任务不存在: {task_id}")
        return hit

    def _find(self, task_id: str) -> Optional[tuple[FileDoc, Task]]:
        for rel in sorted(self.files):
            doc = self.files[rel]
            for t in doc.tasks:
                if t.id == task_id:
                    return doc, t
        return None

    # ------------------------------------------------------------ derived state

    def compute_blocked(self, tasks: Iterable[Task]) -> None:
        index = self.index()
        for t in tasks:
            blocked = False
            for dep in t.depends_on:
                dep_task = index.get(dep)
                if dep_task is None:
                    continue  # dangling dependency: ignored, warned at API layer
                if dep_task.status != "done":
                    blocked = True
            t.blocked = blocked

    def dangling_dep_warnings(self) -> list[str]:
        index = self.index()
        out = []
        for t in self.all_tasks():
            for dep in t.depends_on:
                if dep not in index:
                    out.append(f"{t.file}:{t.line + 1} 依赖的任务 {dep} 不存在，已忽略")
        return out

    def snapshot(self) -> dict:
        tasks = self.all_tasks()
        self.compute_blocked(tasks)
        by_file: dict[str, list[dict]] = {}
        for rel in sorted(self.files):
            roots = build_tree(self.files[rel].tasks)
            by_file[rel] = [r.to_dict() for r in roots]
        return {
            "files": by_file,
            "warnings": self.warnings + self.dangling_dep_warnings(),
        }

    # ------------------------------------------------------------------ writing

    def _fingerprint(self, rel: str, text: str) -> str:
        return hashlib.sha1((rel + "\x00" + text).encode("utf-8")).hexdigest()

    def is_self_write(self, path: Path) -> bool:
        """True if the on-disk content matches something we just wrote."""
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            return False
        fp = self._fingerprint(self.rel(path), text)
        with self.lock:
            if fp in self._fingerprints:
                self._fingerprints.discard(fp)
                return True
        return False

    def write_doc(self, doc: FileDoc) -> None:
        """Atomic write + mtime refresh + self-write fingerprint."""
        path = self.abs(doc.rel)
        path.parent.mkdir(parents=True, exist_ok=True)
        text = doc.text()
        with self.lock:
            self._fingerprints.add(self._fingerprint(doc.rel, text))
        try:
            fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".mdtask-", suffix=".tmp")
            with os.fdopen(fd, "w", encoding="utf-8", newline="") as fh:
                fh.write(text)
            os.replace(tmp, path)
        except OSError as exc:  # Windows / NFS fallback
            log.warning("atomic rename failed for %s (%s); falling back to direct write", path, exc)
            path.write_text(text, encoding="utf-8")
        st = path.stat()
        doc.mtime, doc.size = st.st_mtime, st.st_size
        doc.tasks, doc.warnings = parse_lines(doc.lines, doc.rel)

    def ensure_fresh(self, rel: str) -> FileDoc:
        """Re-read the file if it changed on disk since our snapshot."""
        path = self.abs(rel)
        doc = self.files.get(rel)
        if not path.exists():
            if doc is None:
                doc = FileDoc(rel=rel, lines=[])
                self.files[rel] = doc
            return doc
        st = path.stat()
        if doc is None or (st.st_mtime, st.st_size) != (doc.mtime, doc.size):
            fresh = self._load_file(path)
            if fresh is None:
                raise VaultError("UNREADABLE", f"无法读取 {rel}")
            self.files[rel] = fresh
            doc = fresh
        return doc

    # --------------------------------------------------------------- edit prims

    def _subtree_span(self, doc: FileDoc, task: Task) -> tuple[int, int]:
        """[start, end) line range covering the task and its descendants."""
        start = task.line
        end = start + 1
        for t in doc.tasks:
            if t.line <= start:
                continue
            if t.level > task.level:
                end = t.line + 1
            else:
                break
        return start, end

    def _set_line(self, doc: FileDoc, idx: int, content: str) -> None:
        eol = ""
        if idx < len(doc.lines):
            old = doc.lines[idx]
            if old.endswith("\r\n"):
                eol = "\r\n"
            elif old.endswith("\n"):
                eol = "\n"
        doc.lines[idx] = content + eol

    def _ensure_id(self, doc: FileDoc, task: Task) -> str:
        if task.id:
            return task.id
        task.id = new_id(self.taken_ids())
        return task.id

    # ------------------------------------------------------------------ commands

    def update_task(self, task_id: str, patch: dict) -> Task:
        with self.lock:
            doc, task = self.find(task_id)
            doc = self.ensure_fresh(doc.rel)
            task = next(t for t in doc.tasks if t.id == task_id)

            if "title" in patch:
                task.title = str(patch["title"]).strip()
            if "priority" in patch:
                task.priority = patch["priority"] or "none"
            if "due" in patch:
                task.due = patch["due"] or None
            if "depends_on" in patch:
                deps = [d for d in patch["depends_on"] if d]
                self._check_cycle(task_id, deps)
                task.depends_on = deps
            if "status" in patch:
                task.status = patch["status"]
                task.done_date = today_str() if task.status == "done" else None

            self._set_line(doc, task.line, task.to_line())
            self.write_doc(doc)
            return next(t for t in doc.tasks if t.id == task_id)

    def _check_cycle(self, task_id: str, deps: list[str]) -> None:
        index = self.index()
        graph = {tid: list(t.depends_on) for tid, t in index.items()}
        graph[task_id] = deps
        # DFS from task_id following depends_on edges; hitting task_id = cycle.
        path: list[str] = []
        visiting: set[str] = set()

        def dfs(node: str) -> Optional[list[str]]:
            if node in visiting:
                return path[path.index(node) :] + [node]
            visiting.add(node)
            path.append(node)
            for nxt in graph.get(node, []):
                if nxt not in graph:
                    continue
                found = dfs(nxt)
                if found:
                    return found
            path.pop()
            visiting.discard(node)
            return None

        cycle = dfs(task_id)
        if cycle:
            titles = [index[c].title if c in index else c for c in cycle]
            raise VaultError("CYCLE_DETECTED", "会形成循环依赖: " + " → ".join(titles), cycle)

    def create_task(
        self,
        title: str,
        file: Optional[str] = None,
        parent_id: Optional[str] = None,
        after_id: Optional[str] = None,
        priority: str = "none",
    ) -> Task:
        with self.lock:
            title, priority = _extract_priority_sugar(title, priority)
            if parent_id or after_id:
                anchor_id = parent_id or after_id
                doc, anchor = self.find(anchor_id)  # type: ignore[arg-type]
                doc = self.ensure_fresh(doc.rel)
                anchor = next(t for t in doc.tasks if t.id == anchor_id)
                level = anchor.level + 1 if parent_id else anchor.level
                if level > MAX_LEVEL:
                    raise VaultError("MAX_DEPTH", "已达到 4 级嵌套上限")
                _, end = self._subtree_span(doc, anchor)
                insert_at = end
            else:
                rel = file or INBOX
                doc = self.ensure_fresh(rel)
                level = 1
                insert_at = len(doc.lines)

            task = Task(
                title=title.strip(),
                priority=priority,
                id=new_id(self.taken_ids()),
                level=level,
            )
            eol = doc.eol
            if doc.lines and not doc.lines[-1].endswith("\n") and insert_at >= len(doc.lines):
                doc.lines[-1] = doc.lines[-1] + eol
            doc.lines.insert(insert_at, task.to_line() + eol)
            self.write_doc(doc)
            return next(t for t in doc.tasks if t.id == task.id)

    def delete_task(self, task_id: str) -> list[str]:
        """Delete the task and its subtree. Returns removed ids."""
        with self.lock:
            doc, task = self.find(task_id)
            doc = self.ensure_fresh(doc.rel)
            task = next(t for t in doc.tasks if t.id == task_id)
            start, end = self._subtree_span(doc, task)
            removed = [t.id for t in doc.tasks if start <= t.line < end and t.id]
            del doc.lines[start:end]
            self.write_doc(doc)
            self._purge_dependencies(removed)
            return removed

    def _purge_dependencies(self, removed_ids: list[str]) -> None:
        gone = set(removed_ids)
        for rel in sorted(self.files):
            doc = self.files[rel]
            dirty = False
            for t in doc.tasks:
                if any(d in gone for d in t.depends_on):
                    t.depends_on = [d for d in t.depends_on if d not in gone]
                    self._set_line(doc, t.line, t.to_line())
                    dirty = True
            if dirty:
                self.write_doc(doc)

    def indent_task(self, task_id: str, direction: str) -> Task:
        with self.lock:
            doc, task = self.find(task_id)
            doc = self.ensure_fresh(doc.rel)
            task = next(t for t in doc.tasks if t.id == task_id)
            start, end = self._subtree_span(doc, task)
            subtree = [t for t in doc.tasks if start <= t.line < end]

            if direction == "in":
                prev = [t for t in doc.tasks if t.line < start and t.level == task.level]
                if not prev:
                    raise VaultError("NO_SIBLING", "上方没有同级任务，无法缩进")
                if max(t.level for t in subtree) + 1 > MAX_LEVEL:
                    raise VaultError("MAX_DEPTH", "已达到 4 级嵌套上限")
                delta = 1
            elif direction == "out":
                if task.level <= 1:
                    raise VaultError("MIN_DEPTH", "已经是顶级任务")
                delta = -1
            else:
                raise VaultError("BAD_REQUEST", "direction 必须是 in 或 out")

            for t in subtree:
                t.level += delta
                self._set_line(doc, t.line, t.to_line())
            self.write_doc(doc)
            return next(t for t in doc.tasks if t.id == task_id)

    def move_task(self, task_id: str, parent_id: str) -> Task:
        """Re-parent a task (with its subtree) as the last child of parent_id.

        Works across files — 🆔 are vault-wide, so dependencies and Today
        references keep pointing at the same tasks after the move.
        """
        with self.lock:
            if parent_id == task_id:
                raise VaultError("BAD_TARGET", "不能把任务拖到它自己上")
            src, _ = self.find(task_id)
            dst, _ = self.find(parent_id)
            same_file = src.rel == dst.rel

            doc = self.ensure_fresh(src.rel)
            task = next((t for t in doc.tasks if t.id == task_id), None)
            if task is None:
                raise VaultError("NOT_FOUND", f"找不到任务 {task_id}")
            start, end = self._subtree_span(doc, task)
            subtree = [t for t in doc.tasks if start <= t.line < end]
            if any(t.id == parent_id for t in subtree):
                raise VaultError("BAD_TARGET", "不能把任务拖到它自己的子任务上")

            pdoc = doc if same_file else self.ensure_fresh(dst.rel)
            parent = next((t for t in pdoc.tasks if t.id == parent_id), None)
            if parent is None:
                raise VaultError("NOT_FOUND", f"找不到任务 {parent_id}")
            delta = parent.level + 1 - task.level
            if max(t.level for t in subtree) + delta > MAX_LEVEL:
                raise VaultError("MAX_DEPTH", "已达到 4 级嵌套上限")

            eol = doc.eol
            seg: list[str] = []
            for line in doc.lines[start:end]:
                if not line.endswith("\n"):
                    line += eol
                seg.append(line)
            for t in subtree:
                t.level += delta
                seg[t.line - start] = t.to_line() + eol

            # 先从源文件摘掉，并就地修正剩余任务的行号
            del doc.lines[start:end]
            remaining = [t for t in doc.tasks if not (start <= t.line < end)]
            for t in remaining:
                if t.line >= end:
                    t.line -= end - start
            doc.tasks = remaining
            if not same_file:
                self.write_doc(doc)

            parent = next(t for t in pdoc.tasks if t.id == parent_id)
            _, insert_at = self._subtree_span(pdoc, parent)
            peol = pdoc.eol
            if peol != eol:
                seg = [ln[: -len(eol)] + peol for ln in seg]
            if pdoc.lines and not pdoc.lines[-1].endswith("\n") and insert_at >= len(pdoc.lines):
                pdoc.lines[-1] = pdoc.lines[-1] + peol
            pdoc.lines[insert_at:insert_at] = seg
            self.write_doc(pdoc)
            return next(t for t in pdoc.tasks if t.id == task_id)

    def file_tree(self) -> list[dict]:
        out = []
        for rel in sorted(self.files):
            doc = self.files[rel]
            out.append(
                {
                    "path": rel,
                    "total": len(doc.tasks),
                    "open": sum(1 for t in doc.tasks if t.status != "done"),
                }
            )
        return out


_SUGAR = {"!1": "highest", "!2": "high", "!3": "medium", "!4": "low"}


def _extract_priority_sugar(title: str, priority: str) -> tuple[str, str]:
    title = title.strip()
    for token, name in _SUGAR.items():
        if title.endswith(token):
            return title[: -len(token)].strip(), name
    return title, priority
