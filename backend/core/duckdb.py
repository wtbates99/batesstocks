from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import duckdb

from backend.core.config import (
    get_backup_dir,
    get_db_path,
    get_duckdb_memory_limit,
    get_duckdb_threads,
)


def _configure_connection(conn: duckdb.DuckDBPyConnection) -> None:
    conn.execute(f"SET memory_limit='{get_duckdb_memory_limit()}'")
    conn.execute(f"SET threads={get_duckdb_threads()}")
    conn.execute("SET temp_directory='/tmp'")


def open_connection(read_only: bool = False) -> duckdb.DuckDBPyConnection:
    conn = duckdb.connect(str(get_db_path()), read_only=read_only)
    _configure_connection(conn)
    return conn


@contextmanager
def duckdb_connection(read_only: bool = False) -> Iterator[duckdb.DuckDBPyConnection]:
    conn = open_connection(read_only=read_only)
    try:
        yield conn
    finally:
        conn.close()


def ensure_schema() -> None:
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


def ensure_backup_dir() -> Path:
    path = get_backup_dir()
    path.mkdir(parents=True, exist_ok=True)
    return path
