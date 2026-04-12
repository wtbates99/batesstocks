import os
import subprocess
import sys
from pathlib import Path

from backend.core.duckdb import ensure_schema


def test_ensure_schema_creates_duckdb_tables(monkeypatch, tmp_path):
    db_path = tmp_path / "runtime.duckdb"
    monkeypatch.setenv("DB_PATH", str(db_path))
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "backups"))

    ensure_schema()

    import duckdb

    conn = duckdb.connect(str(db_path), read_only=True)
    try:
        tables = {row[0] for row in conn.execute("SHOW TABLES").fetchall()}
    finally:
        conn.close()

    assert "ticker_data" in tables
    assert "stock_information" in tables
    assert "ohlcv_daily" in tables
    assert "strategy_runs" in tables
    assert "backup_runs" in tables


def test_health_ready_returns_ready(monkeypatch, tmp_path):
    db_path = tmp_path / "health.duckdb"
    monkeypatch.setenv("DB_PATH", str(db_path))
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "backups"))
    script = """
import os
import main
print(main.health_ready())
"""
    result = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        text=True,
        check=True,
        env=os.environ.copy(),
        timeout=20,
    )

    assert result.stdout.strip() == "{'status': 'ready'}"
    assert Path(db_path).exists()
