from __future__ import annotations

import gzip
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import duckdb

from backend.core.config import get_backup_dir, get_db_path
from backend.core.duckdb import duckdb_connection, ensure_backup_dir
from backend.models import BackupCreateResponse, BackupManifest, BackupStatus


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _backup_manifest(path: Path, compressed: bool) -> BackupManifest:
    stat = path.stat()
    return BackupManifest(
        filename=path.name,
        created_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
        size_bytes=stat.st_size,
        compressed=compressed,
    )


def _validate_backup(path: Path) -> None:
    if path.suffix == ".gz":
        with tempfile.NamedTemporaryFile(suffix=".duckdb") as temp_file:
            with gzip.open(path, "rb") as src, open(temp_file.name, "wb") as dst:
                shutil.copyfileobj(src, dst)
            conn = duckdb.connect(temp_file.name, read_only=True)
            try:
                conn.execute("SELECT 1").fetchone()
                conn.execute("PRAGMA database_list").fetchall()
            finally:
                conn.close()
        return

    conn = duckdb.connect(str(path), read_only=True)
    try:
        conn.execute("SELECT 1").fetchone()
        conn.execute("PRAGMA database_list").fetchall()
    finally:
        conn.close()


def list_backups(retention_count: int = 7) -> BackupStatus:
    backup_dir = ensure_backup_dir()
    files = sorted(
        [p for p in backup_dir.iterdir() if p.is_file() and p.name.endswith((".duckdb", ".duckdb.gz"))],
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    manifests = [_backup_manifest(path, path.suffix == ".gz") for path in files[:retention_count]]
    return BackupStatus(
        database_path=str(get_db_path()),
        backup_directory=str(backup_dir),
        retention_count=retention_count,
        available_backups=manifests,
    )


def create_backup(compress: bool = True, retention_count: int = 7) -> BackupCreateResponse:
    backup_dir = ensure_backup_dir()
    db_path = get_db_path()
    timestamp = _utc_now().strftime("%Y%m%dT%H%M%SZ")
    base_name = f"{db_path.stem}-{timestamp}.duckdb"
    dest_path = backup_dir / base_name

    with duckdb_connection() as conn:
        conn.execute("CHECKPOINT")
        conn.execute("PRAGMA wal_checkpoint")

    shutil.copy2(db_path, dest_path)
    final_path = dest_path
    if compress:
        gz_path = dest_path.with_suffix(dest_path.suffix + ".gz")
        with dest_path.open("rb") as src, gzip.open(gz_path, "wb", compresslevel=6) as dst:
            shutil.copyfileobj(src, dst)
        dest_path.unlink()
        final_path = gz_path

    _validate_backup(final_path)

    pruned: list[str] = []
    files = sorted(
        [p for p in backup_dir.iterdir() if p.is_file() and p.name.endswith((".duckdb", ".duckdb.gz"))],
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    for obsolete in files[retention_count:]:
        pruned.append(obsolete.name)
        obsolete.unlink(missing_ok=True)

    return BackupCreateResponse(
        created=_backup_manifest(final_path, final_path.suffix == ".gz"),
        pruned=pruned,
    )
