"""Debounced filesystem watcher over the vault root."""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Callable

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from .vault import SKIP_DIRS, Vault

DEBOUNCE_SECONDS = 0.5


class _Handler(FileSystemEventHandler):
    def __init__(self, vault: Vault, notify: Callable[[], None]):
        self.vault = vault
        self.notify = notify
        self._timer: threading.Timer | None = None
        self._lock = threading.Lock()

    def _relevant(self, path: str) -> bool:
        p = Path(path)
        if p.suffix != ".md":
            return False
        parts = set(p.parts)
        if parts & SKIP_DIRS or any(part.startswith(".") for part in p.parts[:-1]):
            return False
        return True

    def on_any_event(self, event):
        if event.is_directory:
            return
        paths = [getattr(event, "src_path", None), getattr(event, "dest_path", None)]
        touched = [p for p in paths if p and self._relevant(p)]
        if not touched:
            return
        # Ignore echoes of our own atomic writes.
        if all(Path(p).exists() and self.vault.is_self_write(Path(p)) for p in touched):
            return
        self._schedule()

    def _schedule(self):
        with self._lock:
            if self._timer:
                self._timer.cancel()
            self._timer = threading.Timer(DEBOUNCE_SECONDS, self._fire)
            self._timer.daemon = True
            self._timer.start()

    def _fire(self):
        try:
            self.vault.scan()
            self.notify()
        except Exception:  # pragma: no cover - watcher must never die
            import logging

            logging.getLogger("mdtask").exception("rescan failed")


def start_watcher(vault: Vault, notify: Callable[[], None]) -> Observer:
    handler = _Handler(vault, notify)
    observer = Observer()
    observer.schedule(handler, str(vault.root), recursive=True)
    observer.daemon = True
    observer.start()
    return observer
