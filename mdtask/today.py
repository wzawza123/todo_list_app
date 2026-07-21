"""Today schedule: ``Today/YYYY-MM-DD.md`` holding an ordered list of task ids.

Reference, never copy: the file only records *which* tasks and *in what order*.
"""

from __future__ import annotations

import datetime as dt
import re
from typing import Optional

from .vault import TODAY_DIR, FileDoc, Vault, today_str

REF_RE = re.compile(r"^\s*-\s*\[\[([^\]]+)\]\]\s*$")


def today_rel(date: str) -> str:
    return f"{TODAY_DIR}/{date}.md"


def read_ids(vault: Vault, date: str) -> list[str]:
    path = vault.abs(today_rel(date))
    if not path.exists():
        return []
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return []
    ids: list[str] = []
    for line in text.splitlines():
        m = REF_RE.match(line)
        if m:
            tid = m.group(1).strip()
            if tid and tid not in ids:  # de-dupe, keep first position
                ids.append(tid)
    return ids


def write_ids(vault: Vault, date: str, ids: list[str]) -> list[str]:
    seen: list[str] = []
    for tid in ids:
        if tid and tid not in seen:
            seen.append(tid)
    body = "---\ndate: {}\n---\n\n".format(date) + "".join(f"- [[{t}]]\n" for t in seen)
    rel = today_rel(date)
    doc = FileDoc(rel=rel, lines=body.splitlines(keepends=True))
    vault.write_doc(doc)
    return seen


def toggle(vault: Vault, date: str, task_id: str) -> list[str]:
    ids = read_ids(vault, date)
    if task_id in ids:
        ids = [t for t in ids if t != task_id]
    else:
        ids.append(task_id)
    return write_ids(vault, date, ids)


def expand(vault: Vault, date: str) -> dict:
    ids = read_ids(vault, date)
    index = vault.index()
    tasks = vault.all_tasks()
    vault.compute_blocked(tasks)
    items = []
    for tid in ids:
        task = index.get(tid)
        items.append({"id": tid, "task": task.to_dict() if task else None, "stale": task is None})
    done = sum(1 for i in items if i["task"] and i["task"]["status"] == "done")
    return {
        "date": date,
        "items": items,
        "done": done,
        "total": sum(1 for i in items if not i["stale"]),
    }


def _previous_files(vault: Vault, date: str) -> list[str]:
    d = vault.abs(TODAY_DIR)
    if not d.exists():
        return []
    out = []
    for p in sorted(d.glob("*.md")):
        name = p.stem
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", name) and name < date:
            out.append(name)
    return out


def pending_carry_over(vault: Vault, date: Optional[str] = None) -> dict:
    """Unfinished task ids from earlier Today files that aren't already today."""
    date = date or today_str()
    index = vault.index()
    current = set(read_ids(vault, date))
    pending: list[dict] = []
    seen: set[str] = set()
    for prev in _previous_files(vault, date):
        for tid in read_ids(vault, prev):
            task = index.get(tid)
            if not task or task.status == "done" or tid in current or tid in seen:
                continue
            seen.add(tid)
            pending.append({"id": tid, "from": prev, "title": task.title})
    return {"date": date, "pending": pending}


def carry_over(vault: Vault, date: Optional[str] = None) -> dict:
    date = date or today_str()
    info = pending_carry_over(vault, date)
    ids = read_ids(vault, date) + [p["id"] for p in info["pending"]]
    write_ids(vault, date, ids)
    return expand(vault, date)


def purge_ids(vault: Vault, removed: list[str]) -> None:
    """Drop deleted task ids from today's and future schedules."""
    d = vault.abs(TODAY_DIR)
    if not d.exists():
        return
    gone = set(removed)
    for p in sorted(d.glob("*.md")):
        date = p.stem
        ids = read_ids(vault, date)
        kept = [t for t in ids if t not in gone]
        if kept != ids:
            write_ids(vault, date, kept)


def clean_stale(vault: Vault, date: str) -> dict:
    index = vault.index()
    ids = [t for t in read_ids(vault, date) if t in index]
    write_ids(vault, date, ids)
    return expand(vault, date)


def default_date() -> str:
    return dt.date.today().isoformat()
