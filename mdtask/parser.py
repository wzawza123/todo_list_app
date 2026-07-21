"""Markdown checkbox task parser / serializer.

Obsidian Tasks emoji syntax. Non-task lines are never touched: the vault keeps
the original line list (with line endings) and only rewrites the lines it
actually modifies.
"""

from __future__ import annotations

import random
import re
import string
from dataclasses import dataclass, field
from typing import Iterable, Optional

TASK_RE = re.compile(r"^([ \t]*)- \[([ xX])\](?:[ \t]+(.*))?[ \t]*$")

PRIORITY_EMOJI = {"highest": "\U0001f53a", "high": "⏫", "medium": "\U0001f53c", "low": "\U0001f53d"}
EMOJI_TO_PRIORITY = {v: k for k, v in PRIORITY_EMOJI.items()}
PRIORITY_ORDER = {"highest": 4, "high": 3, "medium": 2, "low": 1, "none": 0}

DATE = r"\d{4}-\d{2}-\d{2}"
ID_CHARS = r"[A-Za-z0-9_-]+"

# Trailing-token strippers, applied repeatedly from the end of the line.
_TOKENS: list[tuple[str, re.Pattern[str]]] = [
    ("done_date", re.compile(r"[ \t]*✅[ \t]*(" + DATE + r")$")),
    ("due", re.compile(r"[ \t]*\U0001f4c5[ \t]*(" + DATE + r")$")),
    ("depends_on", re.compile(r"[ \t]*⛔[ \t]*(" + ID_CHARS + r"(?:[ \t]*,[ \t]*" + ID_CHARS + r")*)$")),
    ("id", re.compile(r"[ \t]*\U0001f194[ \t]*(" + ID_CHARS + r")$")),
    ("priority", re.compile(r"[ \t]*(\U0001f53a|⏫|\U0001f53c|\U0001f53d)$")),
]

MAX_LEVEL = 4
INDENT = "    "
_ALPHABET = string.digits + string.ascii_lowercase


def new_id(taken: Iterable[str] = ()) -> str:
    taken = set(taken)
    while True:
        candidate = "".join(random.choice(_ALPHABET) for _ in range(6))
        if candidate not in taken:
            return candidate


def indent_to_level(indent: str) -> int:
    """4 spaces per level; tab counts as 4; 2-space indent rounds up."""
    width = 0
    for ch in indent:
        width += 4 if ch == "\t" else 1
    return width // 4 + (1 if width % 4 else 0) + 1


@dataclass
class Task:
    title: str = ""
    status: str = "todo"
    priority: str = "none"
    id: Optional[str] = None
    depends_on: list[str] = field(default_factory=list)
    due: Optional[str] = None
    done_date: Optional[str] = None

    # runtime-only
    file: str = ""
    line: int = -1
    level: int = 1
    parent_id: Optional[str] = None
    children: list["Task"] = field(default_factory=list)
    blocked: bool = False

    @property
    def key(self) -> str:
        return self.id or f"{self.file}:{self.line}"

    def meta_suffix(self) -> str:
        parts: list[str] = []
        if self.priority != "none":
            parts.append(PRIORITY_EMOJI[self.priority])
        if self.id:
            parts.append("\U0001f194 " + self.id)
        if self.depends_on:
            parts.append("⛔ " + ",".join(self.depends_on))
        if self.due:
            parts.append("\U0001f4c5 " + self.due)
        if self.done_date:
            parts.append("✅ " + self.done_date)
        return " ".join(parts)

    def to_line(self) -> str:
        box = "x" if self.status == "done" else " "
        body = self.title.rstrip()
        suffix = self.meta_suffix()
        if suffix:
            body = (body + " " + suffix).strip()
        return f"{INDENT * (self.level - 1)}- [{box}] {body}".rstrip()

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "key": self.key,
            "title": self.title,
            "status": self.status,
            "priority": self.priority,
            "depends_on": list(self.depends_on),
            "due": self.due,
            "done_date": self.done_date,
            "file": self.file,
            "line": self.line,
            "level": self.level,
            "parent_id": self.parent_id,
            "blocked": self.blocked,
            "children": [c.to_dict() for c in self.children],
        }


def parse_task_body(body: str) -> dict:
    """Strip trailing emoji metadata tokens; the remainder is the title."""
    rest = (body or "").rstrip()
    out: dict = {"priority": "none", "id": None, "depends_on": [], "due": None, "done_date": None}
    seen: set[str] = set()
    changed = True
    while changed:
        changed = False
        for name, pattern in _TOKENS:
            m = pattern.search(rest)
            if not m:
                continue
            if name in seen:
                # Duplicate token of the same kind: keep the innermost (last
                # written wins is ambiguous) -- drop the outer one silently.
                rest = rest[: m.start()].rstrip()
                changed = True
                continue
            seen.add(name)
            value = m.group(1)
            if name == "priority":
                out["priority"] = EMOJI_TO_PRIORITY[value]
            elif name == "depends_on":
                out["depends_on"] = [p.strip() for p in value.split(",") if p.strip()]
            else:
                out[name] = value
            rest = rest[: m.start()].rstrip()
            changed = True
    out["title"] = rest
    return out


def parse_lines(lines: list[str], file: str = "") -> tuple[list[Task], list[str]]:
    """Parse raw lines (with or without line endings) into a flat task list.

    Returns (tasks, warnings). Tasks carry ``level`` and ``parent_id`` and are
    in document order.
    """
    tasks: list[Task] = []
    warnings: list[str] = []
    seen_ids: set[str] = set()
    stack: list[Task] = []  # index i holds the task at level i+1

    for idx, raw in enumerate(lines):
        m = TASK_RE.match(raw.rstrip("\r\n"))
        if not m:
            continue
        indent, box, body = m.group(1), m.group(2), m.group(3) or ""
        parsed = parse_task_body(body)

        raw_level = indent_to_level(indent)
        max_allowed = (stack[-1].level + 1) if stack else 1
        level = min(raw_level, max_allowed)
        if raw_level > max_allowed:
            warnings.append(f"{file}:{idx + 1} 跳级缩进，已按上一级 +1 处理")
        if level > MAX_LEVEL:
            warnings.append(f"{file}:{idx + 1} 超过 4 级嵌套，已归并到第 4 级")
            level = MAX_LEVEL

        tid = parsed["id"]
        if tid and tid in seen_ids:
            warnings.append(f"{file}:{idx + 1} 重复的 🆔 {tid}，该任务按无 id 处理")
            tid = None
            parsed["title"] = (parsed["title"] + " \U0001f194 " + parsed["id"]).strip()
        elif tid:
            seen_ids.add(tid)

        del stack[level - 1 :]
        task = Task(
            title=parsed["title"],
            status="done" if box.lower() == "x" else "todo",
            priority=parsed["priority"],
            id=tid,
            depends_on=parsed["depends_on"],
            due=parsed["due"],
            done_date=parsed["done_date"],
            file=file,
            line=idx,
            level=level,
            parent_id=stack[-1].id if stack else None,
        )
        stack.append(task)
        tasks.append(task)

    return tasks, warnings


def build_tree(flat: list[Task]) -> list[Task]:
    """Attach children by level (mutates ``children``); returns roots."""
    for t in flat:
        t.children = []
    roots: list[Task] = []
    stack: list[Task] = []
    for t in flat:
        del stack[t.level - 1 :]
        if stack:
            stack[-1].children.append(t)
        else:
            roots.append(t)
        stack.append(t)
    return roots
