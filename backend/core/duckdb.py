from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from threading import Lock

import duckdb

from backend.core.config import (
    get_backup_dir,
    get_db_path,
    get_duckdb_memory_limit,
    get_duckdb_threads,
)

_SCHEMA_LOCK = Lock()
_SCHEMA_READY = False


def _connection_config() -> dict[str, str]:
    return {
        "memory_limit": get_duckdb_memory_limit(),
        "threads": str(get_duckdb_threads()),
        "temp_directory": "/tmp",
    }


def open_connection(read_only: bool = False) -> duckdb.DuckDBPyConnection:
    _ = read_only
    return duckdb.connect(
        str(get_db_path()),
        read_only=False,
        config=_connection_config(),
    )


@contextmanager
def duckdb_connection(read_only: bool = False) -> Iterator[duckdb.DuckDBPyConnection]:
    conn = open_connection(read_only=read_only)
    try:
        yield conn
    finally:
        conn.close()


def ensure_schema() -> None:
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return

    with _SCHEMA_LOCK:
        if _SCHEMA_READY:
            return

        with duckdb_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS ohlcv_daily (
                    Date TIMESTAMP NOT NULL,
                    Ticker TEXT NOT NULL,
                    Open DOUBLE,
                    High DOUBLE,
                    Low DOUBLE,
                    Close DOUBLE,
                    AdjClose DOUBLE,
                    Volume DOUBLE
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS stock_information (
                    Ticker TEXT PRIMARY KEY,
                    FullName TEXT,
                    ShortName TEXT,
                    Sector TEXT,
                    Subsector TEXT,
                    MarketCap DOUBLE,
                    Exchange TEXT,
                    Currency TEXT,
                    Website TEXT,
                    QuoteType TEXT
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS ticker_data (
                    Date TIMESTAMP NOT NULL,
                    Ticker TEXT NOT NULL,
                    Open DOUBLE,
                    High DOUBLE,
                    Low DOUBLE,
                    Close DOUBLE,
                    Volume DOUBLE,
                    Ticker_SMA_10 DOUBLE,
                    Ticker_EMA_10 DOUBLE,
                    Ticker_SMA_30 DOUBLE,
                    Ticker_EMA_30 DOUBLE,
                    Ticker_RSI DOUBLE,
                    Ticker_MACD DOUBLE,
                    Ticker_MACD_Signal DOUBLE,
                    Ticker_MACD_Diff DOUBLE,
                    Ticker_Bollinger_PBand DOUBLE,
                    Ticker_MFI DOUBLE,
                    Ticker_VWAP DOUBLE,
                    Ticker_Tech_Score DOUBLE
                )
            """)
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_ticker_data_ticker_date ON ticker_data (Ticker, Date)"
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_ticker_data_date ON ticker_data (Date)")
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_ohlcv_daily_ticker_date ON ohlcv_daily (Ticker, Date)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_stock_information_sector ON stock_information (Sector)"
            )
            conn.execute("CREATE SEQUENCE IF NOT EXISTS seq_strategy_run_id START 1")
            conn.execute("CREATE SEQUENCE IF NOT EXISTS seq_backup_run_id START 1")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS strategy_runs (
                    id BIGINT PRIMARY KEY DEFAULT nextval('seq_strategy_run_id'),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    ticker TEXT NOT NULL,
                    strategy_name TEXT NOT NULL,
                    request_json JSON NOT NULL,
                    summary_json JSON NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS backup_runs (
                    id BIGINT PRIMARY KEY DEFAULT nextval('seq_backup_run_id'),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    filename TEXT NOT NULL,
                    size_bytes BIGINT NOT NULL,
                    compressed BOOLEAN NOT NULL
                )
            """)
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_strategy_runs_created_at ON strategy_runs (created_at)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_backup_runs_created_at ON backup_runs (created_at)"
            )
        _SCHEMA_READY = True


def ensure_backup_dir() -> Path:
    path = get_backup_dir()
    path.mkdir(parents=True, exist_ok=True)
    return path
