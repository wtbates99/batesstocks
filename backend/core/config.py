from __future__ import annotations

import os
from pathlib import Path


def get_db_path() -> Path:
    return Path(os.getenv("DB_PATH", "stock_data.duckdb")).resolve()


def get_backup_dir() -> Path:
    default_dir = get_db_path().parent / "backups"
    return Path(os.getenv("BACKUP_DIR", str(default_dir))).resolve()


def get_duckdb_memory_limit() -> str:
    return os.getenv("DUCKDB_MEMORY_LIMIT", "2GB")


def get_duckdb_threads() -> int:
    return int(os.getenv("DUCKDB_THREADS", "4"))
