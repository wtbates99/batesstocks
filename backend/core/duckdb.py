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
_SCHEMA_DB_PATH: Path | None = None


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
    global _SCHEMA_READY, _SCHEMA_DB_PATH
    db_path = get_db_path()
    if _SCHEMA_READY and _SCHEMA_DB_PATH == db_path:
        return

    with _SCHEMA_LOCK:
        db_path = get_db_path()
        if _SCHEMA_READY and _SCHEMA_DB_PATH == db_path:
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
            for column_name in (
                "Ticker_SMA_50",
                "Ticker_SMA_100",
                "Ticker_SMA_200",
                "Ticker_SMA_250",
                "Ticker_EMA_50",
                "Ticker_EMA_100",
                "Ticker_EMA_200",
                "Ticker_Return_20D",
                "Ticker_Return_63D",
                "Ticker_Return_126D",
                "Ticker_Return_252D",
                "Ticker_52W_High",
                "Ticker_52W_Low",
                "Ticker_52W_Range_Pct",
                "Ticker_Avg_Volume_20D",
            ):
                conn.execute(
                    f"ALTER TABLE ticker_data ADD COLUMN IF NOT EXISTS {column_name} DOUBLE"
                )
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
            conn.execute("""
                CREATE TABLE IF NOT EXISTS news_cache (
                    id TEXT PRIMARY KEY,
                    ticker TEXT,
                    title TEXT NOT NULL,
                    summary TEXT,
                    publisher TEXT,
                    link TEXT NOT NULL,
                    published_at TIMESTAMP,
                    related_tickers JSON NOT NULL,
                    fetched_at TIMESTAMP NOT NULL
                )
            """)
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_strategy_runs_created_at ON strategy_runs (created_at)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_backup_runs_created_at ON backup_runs (created_at)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_news_cache_ticker_fetched_at ON news_cache (ticker, fetched_at)"
            )

            # ── Serving views ─────────────────────────────────────────────────
            # v_latest_ticker: most recent row per ticker with day-over-day change
            conn.execute("""
                CREATE OR REPLACE VIEW v_latest_ticker AS
                WITH ordered AS (
                    SELECT
                        *,
                        LAG(Close) OVER (PARTITION BY Ticker ORDER BY Date) AS prev_close,
                        ROW_NUMBER() OVER (PARTITION BY Ticker ORDER BY Date DESC) AS rn
                    FROM ticker_data
                )
                SELECT
                    Ticker,
                    Date,
                    Open,
                    High,
                    Low,
                    Close,
                    Volume,
                    prev_close,
                    CASE WHEN prev_close IS NULL OR prev_close = 0 THEN NULL
                         ELSE ((Close / prev_close) - 1) * 100
                    END AS change_pct,
                    Ticker_RSI,
                    Ticker_MACD,
                    Ticker_MACD_Signal,
                    Ticker_Tech_Score,
                    Ticker_SMA_10,
                    Ticker_SMA_30,
                    Ticker_SMA_50,
                    Ticker_SMA_100,
                    Ticker_SMA_200,
                    Ticker_SMA_250,
                    Ticker_EMA_10,
                    Ticker_EMA_50,
                    Ticker_EMA_100,
                    Ticker_EMA_200,
                    Ticker_Return_20D,
                    Ticker_Return_63D,
                    Ticker_Return_126D,
                    Ticker_Return_252D,
                    Ticker_52W_High,
                    Ticker_52W_Low,
                    Ticker_52W_Range_Pct,
                    Ticker_Avg_Volume_20D,
                    CASE WHEN Ticker_Avg_Volume_20D > 0
                         THEN Volume / Ticker_Avg_Volume_20D
                         ELSE NULL
                    END AS volume_ratio
                FROM ordered
                WHERE rn = 1
            """)

            # v_latest_security: latest ticker snapshot joined with company info
            conn.execute("""
                CREATE OR REPLACE VIEW v_latest_security AS
                SELECT
                    t.*,
                    si.FullName,
                    si.ShortName,
                    si.Sector,
                    si.Subsector,
                    si.MarketCap,
                    si.Exchange,
                    si.Currency,
                    si.QuoteType
                FROM v_latest_ticker t
                LEFT JOIN stock_information si ON si.Ticker = t.Ticker
            """)

            # v_sector_breadth: sector-level aggregation from latest snapshot
            conn.execute("""
                CREATE OR REPLACE VIEW v_sector_breadth AS
                SELECT
                    si.Sector,
                    COUNT(*) AS members,
                    AVG(t.change_pct) AS avg_change_pct,
                    AVG(t.Ticker_Return_20D) AS avg_return_20d,
                    AVG(t.Ticker_RSI) AS avg_rsi,
                    100.0 * AVG(CASE WHEN t.Close > t.Ticker_SMA_200 THEN 1.0 ELSE 0.0 END)
                        AS pct_above_200d,
                    MAX(t.Date) AS latest_date
                FROM v_latest_ticker t
                JOIN stock_information si ON si.Ticker = t.Ticker
                WHERE si.Sector IS NOT NULL
                GROUP BY si.Sector
            """)

        _SCHEMA_READY = True
        _SCHEMA_DB_PATH = db_path


def ensure_backup_dir() -> Path:
    path = get_backup_dir()
    path.mkdir(parents=True, exist_ok=True)
    return path
