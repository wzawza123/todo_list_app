from __future__ import annotations

import argparse
import logging
from pathlib import Path

import uvicorn

from .server import create_app

DEFAULT_PORT = 8722


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="mdtask", description="MD Task Manager")
    parser.add_argument("--vault", default="./vault", help="任务库根目录 (默认 ./vault)")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    root = Path(args.vault).expanduser().resolve()
    app = create_app(root)
    print(f"Vault: {root}")
    print(f"打开 http://{args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
