import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("batesstocks.main")

import datetime
import json
import re
from collections import defaultdict

import duckdb
import fakeredis
import httpx
import pandas as pd
import yfinance as yf
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from backend.data_manipulation import (
    _add_ticker_data_indexes,
    detect_patterns,
    process_stock_data,
    update_today_indicators,
    update_today_sector_subsector,
)
from backend.data_pull import (
    backfill_historical_data,
    fetch_incremental_ohlcv,
    fetch_write_financial_data,
    get_sp500_table,
)
from backend.database import get_conn
from backend.models import (
    AlertCreate,
    AlertOut,
    BacktestRequest,
    BacktestResult,
    BacktestTrade,
    CompanyInfo,
    CorrelationMatrix,
    EarningsEvent,
    HeatmapNode,
    InsiderTransaction,
    LatestMetricsRequest,
    LivePrices,
    MarketBreadth,
    MarketPulse,
    MarketPulseItem,
    NewsItem,
    OptionsChain,
    PatternSignal,
    PeerRow,
    PortfolioCreate,
    PortfolioOut,
    PositionCreate,
    PositionOut,
    RadarData,
    ScreenerRow,
    SearchResult,
    SectorRotationRow,
    ShortInterest,
    StockData,
    StockGroupings,
    StrategyScreenRequest,
    TechnicalSignal,
    TechnicalSummary,
    WatchlistCreate,
    WatchlistOut,
)

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemini-3-flash-preview")
OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
IS_PRODUCTION = os.getenv("ENV", "development") == "production"
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:8000,http://localhost:3000,https://batesstocks.com,https://www.batesstocks.com",
).split(",")


_SESSION_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def _get_session_id(request: Request) -> str:
    """Return a validated session UUID from the X-Session-ID header, or 'default'."""
    sid = request.headers.get("X-Session-ID", "").strip().lower()
    if sid and _SESSION_RE.match(sid):
        return sid
    return "default"


def safe_convert(value: str | int | float, target_type: type):
    if value == "N/A" or value is None:
        return None
    try:
        return target_type(value)
    except (ValueError, TypeError):
        return None


def _setup_schema():
    """Create all DuckDB user tables and stock-data indexes idempotently on startup."""
    conn = get_conn()
    # Sequences for auto-increment PKs
    for seq in (
        "seq_watchlist_id",
        "seq_portfolio_id",
        "seq_position_id",
        "seq_alert_id",
        "seq_pattern_id",
    ):
        conn.execute(f"CREATE SEQUENCE IF NOT EXISTS {seq}")
    # User tables
    conn.execute("""
        CREATE TABLE IF NOT EXISTS watchlists (
            id         INTEGER DEFAULT nextval('seq_watchlist_id') PRIMARY KEY,
            session_id TEXT    NOT NULL DEFAULT 'default',
            name       TEXT    NOT NULL,
            tickers    TEXT    NOT NULL DEFAULT '[]',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS portfolios (
            id         INTEGER DEFAULT nextval('seq_portfolio_id') PRIMARY KEY,
            session_id TEXT    NOT NULL DEFAULT 'default',
            name       TEXT    NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS positions (
            id           INTEGER DEFAULT nextval('seq_position_id') PRIMARY KEY,
            portfolio_id INTEGER NOT NULL,
            ticker       TEXT    NOT NULL,
            shares       DOUBLE  NOT NULL,
            cost_basis   DOUBLE  NOT NULL,
            purchased_at TEXT,
            notes        TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id           INTEGER DEFAULT nextval('seq_alert_id') PRIMARY KEY,
            session_id   TEXT    NOT NULL DEFAULT 'default',
            ticker       TEXT    NOT NULL,
            metric       TEXT    NOT NULL,
            condition    TEXT    NOT NULL,
            threshold    DOUBLE  NOT NULL,
            triggered    INTEGER DEFAULT 0,
            triggered_at TEXT    DEFAULT NULL,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            notes        TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS pattern_signals (
            id           INTEGER DEFAULT nextval('seq_pattern_id') PRIMARY KEY,
            ticker       TEXT NOT NULL,
            detected_at  TEXT NOT NULL,
            pattern_type TEXT NOT NULL,
            level        DOUBLE,
            confidence   DOUBLE,
            notes        TEXT,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ip_requests (
            ip            TEXT PRIMARY KEY,
            requests_used INTEGER DEFAULT 0
        )
    """)
    # Indexes (safe to re-run; stock/ticker tables may not exist on first run)
    for stmt in [
        "CREATE INDEX IF NOT EXISTS idx_watchlists_session ON watchlists (session_id)",
        "CREATE INDEX IF NOT EXISTS idx_portfolios_session ON portfolios (session_id)",
        "CREATE INDEX IF NOT EXISTS idx_alerts_session     ON alerts     (session_id)",
        "CREATE INDEX IF NOT EXISTS idx_pattern_ticker_date ON pattern_signals (ticker, detected_at)",
    ]:
        conn.execute(stmt)
    for stmt in [
        "CREATE INDEX IF NOT EXISTS idx_stock_data_ticker      ON stock_data (Ticker)",
        "CREATE INDEX IF NOT EXISTS idx_stock_data_ticker_date ON stock_data (Ticker, Date)",
        "CREATE INDEX IF NOT EXISTS idx_stock_data_date        ON stock_data (Date)",
    ]:
        try:
            conn.execute(stmt)
        except Exception:
            pass  # stock_data may not exist yet on first run
    try:
        _add_ticker_data_indexes(conn)
    except Exception:
        pass  # ticker_data may not exist yet on first run
    conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger

    _setup_schema()

    # Try real Redis first, fall back to fakeredis
    try:
        import redis as redis_lib

        real_redis = redis_lib.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", 6379)),
            db=0,
            socket_connect_timeout=2,
        )
        real_redis.ping()
        redis = real_redis
        logger.info(
            "Connected to Redis at %s:%s",
            os.getenv("REDIS_HOST", "localhost"),
            os.getenv("REDIS_PORT", 6379),
        )
    except Exception as e:
        logger.warning("Redis unavailable (%s), falling back to fakeredis", e)
        redis = fakeredis.FakeRedis()

    import threading

    if not _db_has_data():
        threading.Thread(target=run_full_pipeline, daemon=True).start()
    else:
        pipeline_status["phase"] = "complete"
        await build_search_index()
        # Pre-warm homepage and screener caches in background so startup is instant
        threading.Thread(
            target=lambda: [_prewarm_homepage_caches(), _prewarm_screener_cache()],
            daemon=True,
        ).start()
        # Backfill historical data if the DB doesn't go back far enough for 250W MA
        if not _db_history_sufficient():
            logger.info("DB history < 6 years — launching historical backfill in background")
            threading.Thread(target=run_backfill_and_reprocess, daemon=True).start()

    # Every 15 min during market hours (9:30–16:00 ET, Mon–Fri)
    # Every hour off-hours for catch-up / after-hours data
    scheduler = BackgroundScheduler(timezone="US/Eastern")
    scheduler.add_job(
        run_intraday_update,
        CronTrigger(day_of_week="mon-fri", hour="9-15", minute="*/15", timezone="US/Eastern"),
        id="market_hours_update",
        replace_existing=True,
    )
    scheduler.add_job(
        run_intraday_update,
        CronTrigger(day_of_week="mon-fri", hour=16, minute=0, timezone="US/Eastern"),
        id="market_close_update",
        replace_existing=True,
    )
    scheduler.add_job(
        run_daily_update,
        CronTrigger(minute=0, timezone="US/Eastern"),
        id="hourly_update",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler started — intraday every 15 min (9–16 ET M-F), hourly off-hours")

    yield

    scheduler.shutdown(wait=False)
    redis.close()


limiter = Limiter(key_func=get_remote_address)
app = FastAPI(lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Vite outputs to assets/, CRA to static/ — support both
if os.path.isdir("frontend/build/assets"):
    app.mount("/assets", StaticFiles(directory="frontend/build/assets"), name="assets")
elif os.path.isdir("frontend/build/static"):
    app.mount("/static", StaticFiles(directory="frontend/build/static"), name="static")

redis = None
prefix_index = defaultdict(set)

# Tickers loaded in phase 1 — fast startup so the default view works immediately.
# Must include the defaultTickers from HomePage.js.
PRIORITY_TICKERS = [
    "AAPL",
    "GOOGL",
    "AMZN",
    "MSFT",
    "TSLA",
    "NKE",
    "NVDA",
    "NFLX",
    "JPM",
    "META",
    "AVGO",
    "LLY",
    "V",
    "UNH",
    "XOM",
    "MA",
    "COST",
    "HD",
    "BAC",
    "WMT",
    "PG",
    "AMD",
    "ORCL",
    "QCOM",
    "TXN",
    "CVX",
    "MRK",
]

pipeline_status = {
    "running": False,
    "phase": "idle",  # idle | fast_load | full_load | complete
    "loaded": 0,
    "total": 0,
}


# ── Data pipeline ──────────────────────────────────────────────────────────────


def create_signal_views(conn: duckdb.DuckDBPyConnection) -> None:
    conn.execute("""
        CREATE OR REPLACE VIEW signals_view AS
        WITH signals AS (
            SELECT Date, Ticker, 'Bullish' AS Signal,
                Ticker_MACD, Ticker_MACD_Signal, Ticker_RSI,
                Ticker_Stochastic_K, Ticker_Stochastic_D, Ticker_Close,
                LEAD(Ticker_Close, 1) OVER (PARTITION BY Ticker ORDER BY Date) AS Next_Close
            FROM combined_stock_data
            WHERE Ticker_MACD > Ticker_MACD_Signal
                AND Ticker_MACD - Ticker_MACD_Signal > 0.01
                AND Ticker_RSI < 30
                AND Ticker_Stochastic_K > Ticker_Stochastic_D
            UNION ALL
            SELECT Date, Ticker, 'Bearish' AS Signal,
                Ticker_MACD, Ticker_MACD_Signal, Ticker_RSI,
                Ticker_Stochastic_K, Ticker_Stochastic_D, Ticker_Close,
                LEAD(Ticker_Close, 1) OVER (PARTITION BY Ticker ORDER BY Date) AS Next_Close
            FROM combined_stock_data
            WHERE Ticker_MACD < Ticker_MACD_Signal
                AND Ticker_MACD_Signal - Ticker_MACD > 0.01
                AND Ticker_RSI > 70
                AND Ticker_Stochastic_K < Ticker_Stochastic_D
        )
        SELECT Date, Ticker, Signal, Ticker_MACD, Ticker_MACD_Signal, Ticker_RSI,
            Ticker_Stochastic_K, Ticker_Stochastic_D, Ticker_Close, Next_Close,
            CASE WHEN Next_Close IS NOT NULL
                THEN ROUND(((Next_Close - Ticker_Close) / Ticker_Close) * 100, 2)
                ELSE NULL END AS Performance
        FROM signals
    """)
    conn.execute("""
        CREATE OR REPLACE VIEW golden_death_cross_view AS
        WITH cross_signals AS (
            SELECT Date, Ticker, Ticker_SMA_10,
                LAG(Ticker_SMA_10, 1) OVER (PARTITION BY Ticker ORDER BY Date) AS Prev_SMA_10,
                Ticker_EMA_10,
                LAG(Ticker_EMA_10, 1) OVER (PARTITION BY Ticker ORDER BY Date) AS Prev_EMA_10,
                Ticker_Close,
                LEAD(Ticker_Close, 1) OVER (PARTITION BY Ticker ORDER BY Date) AS Next_Close
            FROM combined_stock_data
        )
        SELECT Date, Ticker,
            CASE
                WHEN Ticker_SMA_10 > Ticker_EMA_10 AND Prev_SMA_10 <= Prev_EMA_10 THEN 'Golden Cross (Buy)'
                WHEN Ticker_SMA_10 < Ticker_EMA_10 AND Prev_SMA_10 >= Prev_EMA_10 THEN 'Death Cross (Sell)'
            END AS CrossSignal,
            Ticker_Close, Next_Close,
            CASE WHEN Next_Close IS NOT NULL
                THEN ROUND(((Next_Close - Ticker_Close) / Ticker_Close) * 100, 2)
                ELSE NULL END AS Performance
        FROM cross_signals
        WHERE CrossSignal IS NOT NULL
    """)
    conn.execute("""
        CREATE OR REPLACE VIEW bollinger_breakouts_view AS
        WITH bollinger_data AS (
            SELECT Date, Ticker, Ticker_Close, Ticker_Bollinger_High, Ticker_Bollinger_Low,
                LEAD(Ticker_Close, 1) OVER (PARTITION BY Ticker ORDER BY Date) AS Next_Close,
                CASE
                    WHEN Ticker_Close > Ticker_Bollinger_High THEN 'Breakout Above (Potential Buy)'
                    WHEN Ticker_Close < Ticker_Bollinger_Low THEN 'Breakout Below (Potential Sell)'
                END AS BollingerSignal
            FROM combined_stock_data
        )
        SELECT Date, Ticker, Ticker_Close, Ticker_Bollinger_High, Ticker_Bollinger_Low,
            BollingerSignal, Next_Close,
            CASE WHEN Next_Close IS NOT NULL
                THEN ROUND(((Next_Close - Ticker_Close) / Ticker_Close) * 100, 2)
                ELSE NULL END AS Performance
        FROM bollinger_data WHERE BollingerSignal IS NOT NULL
    """)
    conn.execute("""
        CREATE OR REPLACE VIEW volume_breakout_view AS
        WITH volume_data AS (
            SELECT Date, Ticker, Ticker_Volume,
                AVG(Ticker_Volume) OVER (
                    PARTITION BY Ticker ORDER BY Date
                    ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING
                ) AS Avg_Volume,
                Ticker_Close,
                LEAD(Ticker_Close, 1) OVER (PARTITION BY Ticker ORDER BY Date) AS Next_Close
            FROM combined_stock_data
        )
        SELECT Date, Ticker, Ticker_Volume, Avg_Volume,
            'Volume Breakout (Potential Signal)' AS VolumeSignal,
            Ticker_Close, Next_Close,
            CASE WHEN Next_Close IS NOT NULL
                THEN ROUND(((Next_Close - Ticker_Close) / Ticker_Close) * 100, 2)
                ELSE NULL END AS Performance
        FROM volume_data WHERE Ticker_Volume > Avg_Volume * 2
    """)
    conn.execute("""
        CREATE OR REPLACE VIEW macd_histogram_reversal_view AS
        WITH macd_data AS (
            SELECT Date, Ticker, Ticker_MACD_Diff,
                LAG(Ticker_MACD_Diff, 1) OVER (PARTITION BY Ticker ORDER BY Date) AS Prev_MACD_Diff,
                Ticker_Close,
                LEAD(Ticker_Close, 1) OVER (PARTITION BY Ticker ORDER BY Date) AS Next_Close
            FROM combined_stock_data
        )
        SELECT Date, Ticker, Ticker_MACD_Diff,
            CASE
                WHEN Ticker_MACD_Diff > 0 AND Prev_MACD_Diff <= 0
                    THEN 'MACD Histogram Reversal (Potential Buy)'
                WHEN Ticker_MACD_Diff < 0 AND Prev_MACD_Diff >= 0
                    THEN 'MACD Histogram Reversal (Potential Sell)'
            END AS MACDReversal,
            Ticker_Close, Next_Close,
            CASE WHEN Next_Close IS NOT NULL
                THEN ROUND(((Next_Close - Ticker_Close) / Ticker_Close) * 100, 2)
                ELSE NULL END AS Performance
        FROM macd_data WHERE MACDReversal IS NOT NULL
    """)


def _build_search_index_sync():
    """Populate prefix_index from the database synchronously (safe to call from any thread)."""
    try:
        conn = get_conn()
        rows = conn.execute("SELECT DISTINCT Ticker, FullName FROM combined_stock_data").fetchall()
        conn.close()
        prefix_index.clear()
        for ticker, full_name in rows:
            if not ticker or not full_name:
                continue
            for i in range(1, len(ticker) + 1):
                prefix_index[ticker[:i].lower()].add((ticker, full_name))
            for word in re.findall(r"\w+", full_name.lower()):
                for i in range(1, len(word) + 1):
                    prefix_index[word[:i]].add((ticker, full_name))
    except Exception as e:
        logger.error("Search index build failed: %s", e)


def _run_phase(conn, table, tickers, append):
    fetch_write_financial_data(conn, table, tickers, append=append)
    process_stock_data(conn)
    create_signal_views(conn)
    _build_search_index_sync()


def run_full_pipeline():
    global pipeline_status
    try:
        table = get_sp500_table()
        all_tickers = table["Symbol"].tolist()
        priority = [t for t in PRIORITY_TICKERS if t in set(all_tickers)]
        remaining = [t for t in all_tickers if t not in set(priority)]

        pipeline_status.update(
            {"running": True, "phase": "fast_load", "loaded": 0, "total": len(all_tickers)}
        )

        conn = get_conn()
        _run_phase(conn, table, priority, append=False)
        conn.close()
        pipeline_status["loaded"] = len(priority)
        logger.info("Phase 1 complete: %d priority tickers loaded", len(priority))

        pipeline_status["phase"] = "full_load"
        conn = get_conn()
        _run_phase(conn, table, remaining, append=True)
        conn.close()
        pipeline_status["loaded"] = len(all_tickers)
        logger.info("Phase 2 complete: %d total tickers loaded", len(all_tickers))

        pipeline_status["phase"] = "complete"
    except Exception as e:
        logger.error("Pipeline error: %s", e)
        pipeline_status["phase"] = "error"
    finally:
        pipeline_status["running"] = False


def _flush_stock_cache():
    """Evict all stock/heatmap/screener entries from Redis so fresh data is served."""
    try:
        for pattern in (
            "stock_data:*",
            "heatmap:*",
            "groupings:*",
            "screener:*",
            "market_pulse:*",
            "live_prices:*",
            "market_indices:*",
        ):
            keys = redis.keys(pattern)
            if keys:
                redis.delete(*keys)
        logger.info("Redis cache flushed after daily update")
    except Exception as e:
        logger.warning("Cache flush failed: %s", e)


def _prewarm_screener_cache():
    """Build screener data synchronously and populate Redis so the first user request is instant."""
    try:
        conn = get_conn()
        rows = conn.execute("""
            WITH latest AS (
                SELECT * FROM combined_stock_data
                WHERE Date = (SELECT MAX(Date) FROM combined_stock_data)
            ),
            year_ago AS (
                SELECT Ticker, Ticker_Close AS year_ago_close
                FROM combined_stock_data
                WHERE Date = (
                    SELECT MAX(Date) FROM combined_stock_data
                    WHERE Date <= (SELECT MAX(Date) FROM combined_stock_data)::DATE - INTERVAL '1 year'
                )
            )
            SELECT
                l.Ticker,
                l.FullName,
                l.Sector,
                l.Subsector,
                l.MarketCap   AS market_cap,
                l.PE          AS pe,
                l.EPS         AS eps,
                l.Beta        AS beta,
                l.Ticker_RSI  AS rsi,
                l.Ticker_Close AS latest_close,
                CASE
                    WHEN y.year_ago_close IS NOT NULL AND y.year_ago_close > 0
                    THEN ROUND((l.Ticker_Close - y.year_ago_close) / y.year_ago_close * 100, 2)
                    ELSE NULL
                END AS return_52w,
                l.Ticker_Tech_Score AS tech_score
            FROM latest l
            LEFT JOIN year_ago y ON y.Ticker = l.Ticker
            WHERE l.Ticker IS NOT NULL
            ORDER BY market_cap DESC NULLS LAST
        """).fetchall()

        cols = [
            "ticker",
            "name",
            "sector",
            "subsector",
            "market_cap",
            "pe",
            "eps",
            "beta",
            "rsi",
            "latest_close",
            "return_52w",
            "tech_score",
        ]
        result = [dict(zip(cols, r)) for r in rows]

        tickers_in_page = [r["ticker"] for r in result]
        if tickers_in_page:
            ph = ",".join("?" * len(tickers_in_page))
            spark_rows = conn.execute(
                f"""
                SELECT Ticker, Ticker_Close
                FROM combined_stock_data
                WHERE Ticker IN ({ph})
                  AND Date >= (SELECT MAX(Date) FROM combined_stock_data)::DATE - INTERVAL '30 days'
                ORDER BY Ticker, Date ASC
                """,
                tickers_in_page,
            ).fetchall()
            spark_map: dict = {}
            for t, c in spark_rows:
                if t not in spark_map:
                    spark_map[t] = []
                if c is not None:
                    spark_map[t].append(round(float(c), 2))
            for r in result:
                r["spark"] = spark_map.get(r["ticker"], [])

        conn.close()
        redis.set("screener:all", json.dumps(result), ex=1800)
        logger.info("Screener cache pre-warmed with %d tickers", len(result))
    except Exception as e:
        logger.warning("Screener pre-warm failed: %s", e)


def _prewarm_homepage_caches():
    """Pre-warm all caches hit on page load so the site is instant after a sync."""
    try:
        conn = get_conn()

        # 1. Groupings (homepage sidebar — no cache otherwise)
        groupings = _get_bullish_groupings_from_db()
        redis.set("groupings:bullish", json.dumps(groupings), ex=300)

        # 2. Market indices (macro strip at top of page)
        INDEX_TICKERS = ["SPY", "QQQ", "DIA", "IWM", "GLD", "TLT"]
        latest_date = conn.execute("SELECT MAX(Date) FROM combined_stock_data").fetchone()[0]
        prev_date = conn.execute(
            "SELECT MAX(Date) FROM combined_stock_data WHERE Date < ?", [latest_date]
        ).fetchone()[0]
        if latest_date and prev_date:
            ph = ",".join("?" * len(INDEX_TICKERS))
            latest_rows = conn.execute(
                f"SELECT Ticker, Ticker_Close FROM combined_stock_data WHERE Ticker IN ({ph}) AND Date=?",
                INDEX_TICKERS + [latest_date],
            ).fetchall()
            prev_rows = conn.execute(
                f"SELECT Ticker, Ticker_Close FROM combined_stock_data WHERE Ticker IN ({ph}) AND Date=?",
                INDEX_TICKERS + [prev_date],
            ).fetchall()
            latest_m = {r[0]: float(r[1]) for r in latest_rows}
            prev_m = {r[0]: float(r[1]) for r in prev_rows}
            indices_result = []
            for t in INDEX_TICKERS:
                if t not in latest_m:
                    continue
                p = prev_m.get(t)
                chg_pct = round((latest_m[t] - p) / p * 100, 2) if p else None
                indices_result.append(
                    {"ticker": t, "price": round(latest_m[t], 2), "change_pct": chg_pct}
                )
            redis.set("market_indices", json.dumps(indices_result), ex=300)

        # 3. Live prices for priority tickers
        if latest_date:
            ph = ",".join("?" * len(PRIORITY_TICKERS))
            price_rows = conn.execute(
                f"SELECT Ticker, Ticker_Close FROM combined_stock_data WHERE Ticker IN ({ph}) AND Date=?",
                [*PRIORITY_TICKERS, latest_date],
            ).fetchall()
            prices_map = {r[0]: float(r[1]) for r in price_rows if r[1] is not None}
            live_key = f"live:{','.join(sorted(PRIORITY_TICKERS[:9]))}"
            redis.set(
                live_key,
                json.dumps(
                    {
                        "prices": prices_map,
                        "timestamp": datetime.datetime.utcnow().isoformat(),
                    }
                ),
                ex=60,
            )

        # 4. Stock data for priority tickers (30-day range, most common page load)
        cutoff_30 = (datetime.date.today() - datetime.timedelta(days=30)).isoformat()
        cols = [
            "Date",
            "Ticker",
            "Ticker_Open",
            "Ticker_Close",
            "Ticker_High",
            "Ticker_Low",
            "Ticker_Volume",
            "Ticker_SMA_10",
            "Ticker_EMA_10",
            "Ticker_SMA_30",
            "Ticker_EMA_30",
            "Ticker_RSI",
            "Ticker_Stochastic_K",
            "Ticker_Stochastic_D",
            "Ticker_MACD",
            "Ticker_MACD_Signal",
            "Ticker_MACD_Diff",
            "Ticker_TSI",
            "Ticker_UO",
            "Ticker_ROC",
            "Ticker_Williams_R",
            "Ticker_Bollinger_High",
            "Ticker_Bollinger_Low",
            "Ticker_Bollinger_Mid",
            "Ticker_Bollinger_PBand",
            "Ticker_Bollinger_WBand",
            "Ticker_On_Balance_Volume",
            "Ticker_Chaikin_MF",
            "Ticker_Force_Index",
            "Ticker_MFI",
        ]
        col_sel = ", ".join(cols)
        for ticker in PRIORITY_TICKERS[:20]:
            try:
                rows_t = conn.execute(
                    f"SELECT {col_sel} FROM combined_stock_data "
                    f"WHERE Ticker=? AND Date>=? ORDER BY Date DESC",
                    [ticker, cutoff_30],
                ).fetchall()
                if not rows_t:
                    continue
                data_list = []
                for row in rows_t:
                    d = dict(zip(cols, row))
                    if d["Date"]:
                        d["Date"] = str(d["Date"])[:10]
                    data_list.append(d)
                cache_key = f"stock_data:{ticker}:{cutoff_30}:None:1:100"
                redis.set(cache_key, json.dumps(data_list), ex=3600)
            except Exception:
                pass

        conn.close()
        logger.info(
            "Homepage caches pre-warmed (groupings, indices, live-prices, %d priority stocks)",
            len(PRIORITY_TICKERS[:20]),
        )
    except Exception as e:
        logger.warning("Homepage pre-warm failed: %s", e)


def _evaluate_alerts(conn: duckdb.DuckDBPyConnection) -> None:
    pending = conn.execute(
        "SELECT id, ticker, metric, condition, threshold FROM alerts WHERE triggered=0"
    ).fetchall()
    for aid, ticker, metric, cond, threshold in pending:
        try:
            row = conn.execute(
                f"SELECT {metric} FROM combined_stock_data WHERE Ticker=? ORDER BY Date DESC LIMIT 1",
                [ticker],
            ).fetchone()
            if not row or row[0] is None:
                continue
            val = float(row[0])
            if (cond == "above" and val > threshold) or (cond == "below" and val < threshold):
                conn.execute(
                    "UPDATE alerts SET triggered=1, triggered_at=CURRENT_TIMESTAMP WHERE id=?",
                    [aid],
                )
        except Exception as e:
            logger.warning("Alert eval error id=%s: %s", aid, e)


def run_intraday_update():
    """Refresh today's live prices — deletes today's rows and re-fetches the current bar.

    Runs every 15 min during market hours so intraday prices + all signals stay current.
    All technical indicators, pattern signals, and alerts are recomputed on each run.
    """
    if pipeline_status["running"]:
        logger.info("Intraday update skipped: pipeline already running")
        return

    pipeline_status.update({"running": True, "phase": "intraday_update", "loaded": 0, "total": 0})
    try:
        conn = get_conn()
        tickers = [
            r[0] for r in conn.execute("SELECT DISTINCT Ticker FROM stock_information").fetchall()
        ]
        if not tickers:
            conn.close()
            pipeline_status["phase"] = "complete"
            return

        import pytz as _pytz

        _et = _pytz.timezone("US/Eastern")
        today = datetime.datetime.now(_et).date().isoformat()

        # Delete today's stale rows so we can re-insert fresh ones
        conn.execute("DELETE FROM stock_data WHERE Date >= ?", [today])

        data = yf.download(
            tickers,
            period="5d",
            interval="1d",
            group_by="ticker",
            auto_adjust=True,
            progress=False,
        )
        if data is None or data.empty:
            logger.info("Intraday update: no data returned")
            conn.close()
            pipeline_status["phase"] = "complete"
            return

        result = data.stack(level=0, future_stack=True).reset_index()
        if result.empty:
            conn.close()
            pipeline_status["phase"] = "complete"
            return

        result["Date"] = pd.to_datetime(result["Date"]).dt.tz_localize(None)
        today_ts = pd.Timestamp(today)
        result = result[result["Date"] >= today_ts]

        if result.empty:
            logger.info("Intraday update: no data for %s yet (pre-market or no session)", today)
            conn.close()
            pipeline_status["phase"] = "complete"
            return

        conn.register("_intraday_tmp", result)
        conn.execute("INSERT INTO stock_data SELECT * FROM _intraday_tmp")
        conn.unregister("_intraday_tmp")
        new_rows = len(result)
        logger.info("Intraday update: inserted %d rows for %s", new_rows, today)

        # Fast incremental path: only recompute today's rows (~2-3s vs ~38s full rebuild)
        update_today_indicators(conn)
        update_today_sector_subsector(conn)  # keeps combined_stock_data JOIN intact for today
        create_signal_views(conn)
        detect_patterns(conn)
        _evaluate_alerts(conn)
        conn.close()
        _flush_stock_cache()
        _build_search_index_sync()
        logger.info("Intraday update complete — indicators, patterns, alerts recomputed")

        # Mark complete NOW so the site stops showing the loading state immediately,
        # then pre-warm all caches in a background thread so the first page load is fast.
        pipeline_status["phase"] = "complete"
        pipeline_status["running"] = False
        import threading

        threading.Thread(
            target=lambda: [_prewarm_homepage_caches(), _prewarm_screener_cache()],
            daemon=True,
        ).start()
    except Exception as e:
        logger.error("Intraday update error: %s", e)
        pipeline_status["phase"] = "error"
    finally:
        pipeline_status["running"] = False


def run_daily_update():
    """Incremental daily refresh — appends only new OHLCV rows since the last stored date."""
    if pipeline_status["running"]:
        logger.info("Daily update skipped: pipeline already running")
        return

    pipeline_status.update({"running": True, "phase": "daily_update", "loaded": 0, "total": 0})
    try:
        conn = get_conn()
        tickers = [
            r[0] for r in conn.execute("SELECT DISTINCT Ticker FROM stock_information").fetchall()
        ]

        if not tickers:
            logger.info("No tickers in stock_information — daily update skipped")
            conn.close()
            return

        pipeline_status["total"] = len(tickers)
        new_rows = fetch_incremental_ohlcv(conn, tickers)

        if new_rows > 0:
            process_stock_data(conn)
            create_signal_views(conn)
            detect_patterns(conn)
            _evaluate_alerts(conn)
            conn.close()
            _flush_stock_cache()
            _build_search_index_sync()
            logger.info("Daily update complete: %d new rows, %d tickers", new_rows, len(tickers))

            # Mark complete immediately, then pre-warm caches in background
            pipeline_status["phase"] = "complete"
            pipeline_status["running"] = False
            import threading

            threading.Thread(
                target=lambda: [_prewarm_homepage_caches(), _prewarm_screener_cache()],
                daemon=True,
            ).start()
        else:
            conn.close()
            logger.info("Daily update: no new data to process")
            pipeline_status["phase"] = "complete"
    except Exception as e:
        logger.error("Daily update error: %s", e)
        pipeline_status["phase"] = "error"
    finally:
        pipeline_status["running"] = False


def _db_history_sufficient(min_years: int = 6) -> bool:
    """Return True if stock_data goes back at least ``min_years`` years.

    SMA_250W needs 1250 trading days (~5 years).  We require 6 to be safe.
    """
    try:
        conn = get_conn()
        min_date_str = conn.execute("SELECT MIN(Date) FROM stock_data").fetchone()[0]
        conn.close()
        if not min_date_str:
            return True  # No data at all — let _db_has_data handle it
        import datetime as _dt

        min_date = _dt.date.fromisoformat(str(min_date_str)[:10])
        target = _dt.date.today() - _dt.timedelta(days=min_years * 365)
        return min_date <= target
    except Exception:
        return True  # Don't block startup on unexpected errors


def run_backfill_and_reprocess():
    """Fetch missing historical OHLCV data (years 3-7) then recompute all indicators.

    Called automatically on startup when the DB exists but has < 6 years of history.
    Also exposed via POST /admin/backfill for manual triggering.
    """
    if pipeline_status["running"]:
        logger.info("Backfill skipped: pipeline already running")
        return

    pipeline_status.update({"running": True, "phase": "backfill", "loaded": 0, "total": 0})
    try:
        conn = get_conn()
        tickers = [
            r[0] for r in conn.execute("SELECT DISTINCT Ticker FROM stock_information").fetchall()
        ]
        if not tickers:
            conn.close()
            pipeline_status["phase"] = "complete"
            return

        backfilled = backfill_historical_data(conn, tickers)
        if backfilled > 0:
            logger.info("Backfilled %d rows — recomputing all indicators...", backfilled)
            pipeline_status["phase"] = "reprocessing"
            process_stock_data(conn)
            create_signal_views(conn)
            detect_patterns(conn)
            conn.close()
            _flush_stock_cache()
            _build_search_index_sync()
            logger.info("Backfill + reprocess complete")
        else:
            conn.close()
            logger.info("Backfill check complete — data already sufficient")

        pipeline_status["phase"] = "complete"
    except Exception as e:
        logger.error("Backfill error: %s", e)
        pipeline_status["phase"] = "error"
    finally:
        pipeline_status["running"] = False


def _db_has_data() -> bool:
    try:
        conn = get_conn()
        count = conn.execute("SELECT COUNT(*) FROM stock_data LIMIT 1").fetchone()[0]
        conn.close()
        return count > 0
    except Exception:
        return False


def _get_bullish_groupings_from_db() -> dict:
    try:
        conn = get_conn()
        max_date_q = "(SELECT MAX(Date) FROM combined_stock_data)"
        momentum = [
            r[0]
            for r in conn.execute(f"""
            SELECT Ticker FROM combined_stock_data
            WHERE Date = {max_date_q}
              AND Ticker_Close > Ticker_SMA_10 AND Ticker_SMA_10 > Ticker_SMA_30
              AND Ticker_RSI > 50 AND Ticker_MACD > Ticker_MACD_Signal
            ORDER BY (Ticker_Close / Ticker_SMA_10) DESC LIMIT 9
            """).fetchall()
        ]
        breakout = [
            r[0]
            for r in conn.execute(f"""
            SELECT Ticker FROM combined_stock_data
            WHERE Date = {max_date_q}
              AND Ticker_Close > Ticker_Bollinger_High
              AND Ticker_Volume > Ticker_SMA_30 * 1.5
              AND Ticker_Williams_R > -20
            ORDER BY (Ticker_Close / Ticker_Bollinger_High) DESC LIMIT 9
            """).fetchall()
        ]
        trend_strength = [
            r[0]
            for r in conn.execute(f"""
            SELECT Ticker FROM combined_stock_data
            WHERE Date = {max_date_q}
              AND Ticker_TSI > 0 AND Ticker_UO > 50
              AND Ticker_MFI > 50 AND Ticker_Chaikin_MF > 0
            ORDER BY (Ticker_TSI + Ticker_UO + Ticker_MFI) DESC LIMIT 9
            """).fetchall()
        ]
        conn.close()
        return {"momentum": momentum, "breakout": breakout, "trend_strength": trend_strength}
    except Exception as e:
        logger.error("Failed to get bullish groupings: %s", e)
        return {"momentum": [], "breakout": [], "trend_strength": []}


# ── AI request tracking (per-IP, production only) ──────────────────────────────

IP_REQUEST_LIMIT = 100


def ip_has_requests(ip: str) -> bool:
    conn = get_conn()
    row = conn.execute("SELECT requests_used FROM ip_requests WHERE ip = ?", [ip]).fetchone()
    conn.close()
    if row is None:
        return True
    return row[0] < IP_REQUEST_LIMIT


def ip_record_request(ip: str) -> None:
    conn = get_conn()
    conn.execute(
        "INSERT INTO ip_requests (ip, requests_used) VALUES (?, 1) "
        "ON CONFLICT (ip) DO UPDATE SET requests_used = requests_used + 1",
        [ip],
    )
    conn.close()


# ── AI chat ────────────────────────────────────────────────────────────────────


class AiChatRequest(BaseModel):
    provider: str = "ollama"
    model: str = "gemini-3-flash-preview"
    api_key: str | None = None
    # Accept either a full conversation history or a single message
    messages: list[dict] | None = None
    message: str | None = None
    context: dict | None = None

    @property
    def last_message(self) -> str:
        if self.messages:
            for m in reversed(self.messages):
                if m.get("role") == "user":
                    return m.get("content", "")
        return self.message or ""

    @property
    def conversation_history(self) -> list[dict]:
        if self.messages:
            return [{"role": m["role"], "content": m["content"]} for m in self.messages]
        return [{"role": "user", "content": self.message or ""}]


class _LivePricesBody(BaseModel):
    tickers: list[str]


class _CorrelationsBody(BaseModel):
    tickers: list[str]
    days: int = 90


def build_system_prompt(context: dict) -> str:
    tickers = context.get("tickers", [])
    date_range = context.get("dateRange", "recent period")
    metrics = context.get("metrics", [])
    data_summary = context.get("dataSummary", "")

    readable_metrics = ", ".join(m.replace("Ticker_", "").replace("_", " ") for m in metrics)

    prompt = f"""You are an expert financial analyst specializing in technical analysis of equity markets.
Currently displayed: {", ".join(tickers)} over {date_range}
Active indicators: {readable_metrics}"""

    if data_summary:
        prompt += f"\n\nLatest indicator readings (most recent session):\n{data_summary}"

    prompt += """

Provide concise, actionable technical analysis. Reference specific tickers and indicator values when relevant.

Interpretation guide:
- RSI > 70: overbought | RSI < 30: oversold | RSI 50-70: bullish momentum
- MACD above signal line: bullish divergence | below: bearish
- Price above Bollinger High: potential breakout or overbought condition
- Price below Bollinger Low: potential breakdown or oversold condition
- SMA10 crossing above SMA30: golden cross (bullish) | below: death cross (bearish)
- Williams %R > -20: overbought | < -80: oversold

Keep responses focused and under 300 words. Always note that technical analysis is probabilistic, not predictive."""

    return prompt


@app.get("/ai/config")
async def ai_config():
    """Returns AI configuration so the frontend knows whether provider selection is available."""
    return {
        "production": IS_PRODUCTION,
        "provider": "ollama" if IS_PRODUCTION else None,
        "model": OLLAMA_MODEL if IS_PRODUCTION else None,
        "request_limit": IP_REQUEST_LIMIT,
    }


@app.post("/ai/chat")
@limiter.limit("10/minute")
async def ai_chat(request: Request, body: AiChatRequest):
    system_prompt = build_system_prompt(body.context or {})

    # In production: always Ollama. In dev: use provider from request body.
    if IS_PRODUCTION:
        client_ip = request.client.host if request.client else "unknown"
        if not ip_has_requests(client_ip):
            raise HTTPException(status_code=429, detail="Request limit reached (100 per IP)")
        provider = "ollama"
        model = OLLAMA_MODEL
    else:
        provider = body.provider
        model = body.model

    history = body.conversation_history

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            if provider == "ollama":
                ollama_headers = {}
                if OLLAMA_API_KEY:
                    ollama_headers["Authorization"] = f"Bearer {OLLAMA_API_KEY}"
                # Build full conversation with system prompt prepended
                full_messages = [{"role": "system", "content": system_prompt}] + history
                content = ""
                async with client.stream(
                    "POST",
                    f"{OLLAMA_HOST}/api/chat",
                    headers=ollama_headers,
                    json={
                        "model": model,
                        "messages": full_messages,
                        "stream": True,
                        "think": False,
                        "options": {"num_predict": 400},
                    },
                ) as stream_resp:
                    stream_resp.raise_for_status()
                    async for line in stream_resp.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                            content += chunk.get("message", {}).get("content", "")
                            if chunk.get("done"):
                                break
                        except Exception:
                            pass
                if IS_PRODUCTION:
                    ip_record_request(client_ip)
                content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
                return {"content": content}

            elif provider == "anthropic":
                if not body.api_key:
                    raise HTTPException(status_code=400, detail="API key required for Anthropic")
                # Anthropic requires alternating user/assistant; collapse if needed
                anthropic_msgs = [{"role": m["role"], "content": m["content"]} for m in history]
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": body.api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": model,
                        "max_tokens": 400,
                        "system": system_prompt,
                        "messages": anthropic_msgs,
                    },
                )
                if resp.status_code != 200:
                    raise HTTPException(status_code=resp.status_code, detail=resp.text)
                return {"content": resp.json()["content"][0]["text"]}

            elif provider == "openai":
                if not body.api_key:
                    raise HTTPException(status_code=400, detail="API key required for OpenAI")
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {body.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "max_tokens": 400,
                        "messages": [{"role": "system", "content": system_prompt}] + history,
                    },
                )
                if resp.status_code != 200:
                    raise HTTPException(status_code=resp.status_code, detail=resp.text)
                return {"content": resp.json()["choices"][0]["message"]["content"]}

            else:
                raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="AI service timed out — is Ollama running?")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Could not connect to AI service")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── App lifecycle ──────────────────────────────────────────────────────────────


@app.get("/", response_class=HTMLResponse)
async def serve_react_app():
    with open(os.path.join("frontend/build", "index.html")) as f:
        return f.read()


app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def build_search_index():
    _build_search_index_sync()


# ── API routes ─────────────────────────────────────────────────────────────────


@app.post("/refresh_data")
@limiter.limit("2/minute")
async def refresh_data(
    request: Request,
    background_tasks: BackgroundTasks,
    full: bool = Query(False),
):
    if pipeline_status["running"]:
        return {"status": "already_running", "message": "Data refresh already in progress"}
    if full or not _db_has_data():
        background_tasks.add_task(run_full_pipeline)
        return {"status": "started", "message": "Full data refresh started in background"}
    background_tasks.add_task(run_daily_update)
    return {"status": "started", "message": "Incremental data refresh started in background"}


@app.post("/admin/backfill")
@limiter.limit("2/minute")
async def admin_backfill(request: Request, background_tasks: BackgroundTasks):
    """Manually trigger a historical OHLCV backfill + full indicator recompute.

    Use this once to seed the 250W MA data on an existing database that only has 2 years of history.
    """
    if pipeline_status["running"]:
        return {"status": "already_running", "message": "Pipeline already running"}
    background_tasks.add_task(run_backfill_and_reprocess)
    return {
        "status": "started",
        "message": "Historical backfill started in background — check /refresh_status",
    }


@app.get("/refresh_status")
@limiter.limit("20/minute")
async def refresh_status(request: Request):
    return pipeline_status


# ── Pipeline aliases (new client-friendly names) ────────────────────────────────
@app.get("/pipeline/status")
@limiter.limit("20/minute")
async def pipeline_status_endpoint(request: Request):
    return pipeline_status


@app.post("/pipeline/trigger")
@limiter.limit("2/minute")
async def pipeline_trigger(request: Request, background_tasks: BackgroundTasks):
    if pipeline_status["running"]:
        return {"status": "already_running", "message": "Data refresh already in progress"}
    background_tasks.add_task(run_daily_update)
    return {"status": "started", "message": "Data refresh started in background"}


# ── Macro series (yfinance pull for TNX, DX, GC=F, CL=F, etc.) ─────────────────
@app.get("/macro/{series}")
@limiter.limit("10/minute")
async def get_macro_series(request: Request, series: str, days: int = Query(180, ge=30, le=730)):
    """Return historical close prices for any yfinance-valid symbol (indices, futures, bonds)."""
    cache_key = f"macro:{series}:{days}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    try:
        import yfinance as yf_local

        end = datetime.date.today()
        start = end - datetime.timedelta(days=days)
        hist = yf_local.Ticker(series).history(start=str(start), end=str(end), interval="1d")
        if hist.empty:
            raise HTTPException(status_code=404, detail=f"No data for {series}")
        dates = [str(d.date()) for d in hist.index]
        values = [float(v) if pd.notna(v) else None for v in hist["Close"]]
        result = {"ticker": series, "name": series, "dates": dates, "values": values}
        redis.set(cache_key, json.dumps(result), ex=3600)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Insider transactions (SEC Form 4 via yfinance) ───────────────────────────────
@app.get("/insider/{ticker}", response_model=list[InsiderTransaction])
@limiter.limit("10/minute")
async def get_insider_transactions(request: Request, ticker: str):
    cache_key = f"insider:{ticker.upper()}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    try:
        import yfinance as yf_local

        t = yf_local.Ticker(ticker.upper())
        tx = t.insider_transactions
        if tx is None or (hasattr(tx, "empty") and tx.empty):
            return []
        results = []
        for _, row in tx.iterrows():
            results.append(
                {
                    "filer_name": row.get("Insider") or row.get("Name") or None,
                    "ticker": ticker.upper(),
                    "transaction_date": str(row.get("Start Date") or row.get("Date") or "")[:10]
                    or None,
                    "transaction_type": row.get("Transaction") or None,
                    "shares": float(row["Shares"]) if pd.notna(row.get("Shares")) else None,
                    "price_per_share": float(row["Value"]) / float(row["Shares"])
                    if pd.notna(row.get("Value"))
                    and pd.notna(row.get("Shares"))
                    and float(row.get("Shares", 0)) != 0
                    else None,
                    "total_value": float(row["Value"]) if pd.notna(row.get("Value")) else None,
                    "form_url": None,
                }
            )
        redis.set(cache_key, json.dumps(results[:20]), ex=3600)
        return results[:20]
    except Exception as e:
        logger.warning("Insider data error for %s: %s", ticker, e)
        return []


# ── Short interest ───────────────────────────────────────────────────────────────
@app.get("/short-interest/{ticker}", response_model=ShortInterest)
@limiter.limit("10/minute")
async def get_short_interest(request: Request, ticker: str):
    cache_key = f"short_interest:{ticker.upper()}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    try:
        import yfinance as yf_local

        info = yf_local.Ticker(ticker.upper()).info
        result = {
            "ticker": ticker.upper(),
            "settlement_date": None,
            "short_interest": float(info.get("sharesShort", 0)) or None,
            "avg_daily_volume": float(info.get("averageVolume", 0)) or None,
            "days_to_cover": float(info.get("shortRatio", 0)) or None,
        }
        redis.set(cache_key, json.dumps(result), ex=3600)
        return result
    except Exception as e:
        logger.warning("Short interest error for %s: %s", ticker, e)
        return ShortInterest(ticker=ticker.upper())


@app.get("/stock/{ticker}", response_model=list[StockData])
@limiter.limit("60/minute")
async def get_stock_data(
    request: Request,
    ticker: str,
    start_date: str | None = None,
    end_date: str | None = None,
    days: int | None = Query(None, ge=1, le=3650),
    metrics: list[str] | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(500, ge=1, le=2000),
):
    # `days` is a convenience shortcut that computes start_date relative to the latest date
    cache_key = f"stock_data:{ticker}:{start_date}:{end_date}:{days}:{page}:{page_size}"
    cached_data = redis.get(cache_key)

    if cached_data:
        return json.loads(cached_data)

    _STOCK_COLS = [
        "Date",
        "Ticker",
        "Ticker_Open",
        "Ticker_Close",
        "Ticker_High",
        "Ticker_Low",
        "Ticker_Volume",
        "Ticker_SMA_10",
        "Ticker_EMA_10",
        "Ticker_SMA_30",
        "Ticker_EMA_30",
        "Ticker_SMA_200W",
        "Ticker_SMA_250W",
        "Ticker_RSI",
        "Ticker_Stochastic_K",
        "Ticker_Stochastic_D",
        "Ticker_MACD",
        "Ticker_MACD_Signal",
        "Ticker_MACD_Diff",
        "Ticker_TSI",
        "Ticker_UO",
        "Ticker_ROC",
        "Ticker_Williams_R",
        "Ticker_Bollinger_High",
        "Ticker_Bollinger_Low",
        "Ticker_Bollinger_Mid",
        "Ticker_Bollinger_PBand",
        "Ticker_Bollinger_WBand",
        "Ticker_On_Balance_Volume",
        "Ticker_Chaikin_MF",
        "Ticker_Force_Index",
        "Ticker_MFI",
        "Ticker_VWAP",
        "Ticker_Tech_Score",
    ]
    col_sel = ", ".join(_STOCK_COLS)
    where = "WHERE Ticker = ?"
    params: list = [ticker.upper()]
    if start_date:
        where += " AND Date >= ?"
        params.append(start_date)
    if end_date:
        where += " AND Date <= ?"
        params.append(end_date)

    conn = get_conn()
    # If `days` given, resolve to an absolute start_date from the latest available date
    if days and not start_date:
        latest_row = conn.execute(
            "SELECT MAX(Date) FROM combined_stock_data WHERE Ticker = ?", [ticker.upper()]
        ).fetchone()
        if latest_row and latest_row[0]:
            start_date = conn.execute(
                f"SELECT ('{latest_row[0]}'::DATE - INTERVAL '{days} days')::TEXT"
            ).fetchone()[0]
    rows = conn.execute(
        f"SELECT {col_sel} FROM combined_stock_data {where} ORDER BY Date ASC",
        params,
    ).fetchall()
    conn.close()

    stock_data = [
        StockData(
            **{
                k: (str(v)[:10] if k == "Date" and v is not None else v)
                for k, v in zip(_STOCK_COLS, row)
            }
        )
        for row in rows
    ]

    redis.set(cache_key, json.dumps([sd.model_dump() for sd in stock_data]), ex=3600)
    return stock_data


@app.get("/company/{ticker}", response_model=CompanyInfo)
@limiter.limit("30/minute")
async def get_company_info(request: Request, ticker: str):
    cache_key = f"company_info:{ticker}"
    cached_data = redis.get(cache_key)

    if cached_data:
        return CompanyInfo(**json.loads(cached_data))

    _INFO_COLS = [
        "Ticker",
        "FullName",
        "Sector",
        "Subsector",
        "MarketCap",
        "Country",
        "Website",
        "Description",
        "CEO",
        "Employees",
        "City",
        "State",
        "Zip",
        "Address",
        "Phone",
        "Exchange",
        "Currency",
        "QuoteType",
        "ShortName",
        "Price",
        "DividendRate",
        "DividendYield",
        "PayoutRatio",
        "Beta",
        "PE",
        "EPS",
        "Revenue",
        "GrossProfit",
        "FreeCashFlow",
    ]
    col_sel = ", ".join(_INFO_COLS)
    conn = get_conn()
    row = conn.execute(
        f"SELECT {col_sel} FROM combined_stock_data WHERE Ticker = ? ORDER BY Date DESC LIMIT 1",
        [ticker.upper()],
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Company not found")

    company_data = dict(zip(_INFO_COLS, row))
    for key in ["MarketCap", "Employees", "Revenue", "GrossProfit", "FreeCashFlow"]:
        company_data[key] = safe_convert(company_data[key], int)
    for key in ["Price", "DividendRate", "DividendYield", "PayoutRatio", "Beta", "PE", "EPS"]:
        company_data[key] = safe_convert(company_data[key], float)

    redis.set(cache_key, json.dumps(company_data), ex=600)
    return CompanyInfo(**company_data)


@app.get("/news/{ticker}", response_model=list[NewsItem])
@limiter.limit("20/minute")
async def get_news(request: Request, ticker: str):
    cache_key = f"news:{ticker}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    try:
        raw = yf.Ticker(ticker).news or []
        items = []
        for n in raw[:15]:
            ct = n.get("content", {}) or {}
            pub = n.get("providerPublishTime") or ct.get("pubDate", "")
            if isinstance(pub, (int, float)):
                pub = datetime.datetime.utcfromtimestamp(pub).isoformat()
            items.append(
                NewsItem(
                    title=ct.get("title") or n.get("title", ""),
                    publisher=(ct.get("provider") or {}).get("displayName", "")
                    or n.get("publisher", ""),
                    link=(ct.get("canonicalUrl") or {}).get("url", "") or n.get("link", ""),
                    published_at=str(pub),
                    thumbnail=(((ct.get("thumbnail") or {}).get("resolutions") or [{}])[0]).get(
                        "url"
                    ),
                )
            )
        redis.set(cache_key, json.dumps([i.model_dump() for i in items]), ex=900)
        return items
    except Exception as e:
        logger.error("News fetch error for %s: %s", ticker, e)
        return []


@app.get("/options/{ticker}", response_model=OptionsChain)
@limiter.limit("10/minute")
async def get_options(request: Request, ticker: str, expiry: str | None = None):
    cache_key = f"options:{ticker}:{expiry}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    try:
        stock = yf.Ticker(ticker)
        expirations = list(stock.options or [])
        if not expirations:
            raise HTTPException(status_code=404, detail="No options data")
        chosen = expiry if expiry in expirations else expirations[0]
        chain = stock.option_chain(chosen)
        keep = [
            "contractSymbol",
            "strike",
            "lastPrice",
            "bid",
            "ask",
            "volume",
            "openInterest",
            "impliedVolatility",
            "inTheMoney",
        ]

        def df_to_contracts(df):
            df = df[[c for c in keep if c in df.columns]].copy()
            df = df.where(pd.notna(df), None)
            return df.to_dict(orient="records")

        result = OptionsChain(
            expiry=chosen,
            expirations=expirations,
            calls=df_to_contracts(chain.calls),
            puts=df_to_contracts(chain.puts),
        )
        redis.set(cache_key, result.model_dump_json(), ex=600)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Options error for %s: %s", ticker, e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/earnings/{ticker}", response_model=list[EarningsEvent])
@limiter.limit("20/minute")
async def get_ticker_earnings(request: Request, ticker: str):
    cache_key = f"earnings:ticker:{ticker}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    try:
        t = yf.Ticker(ticker)
        hist = t.earnings_dates
        if hist is None or hist.empty:
            return []
        results = []
        for idx, row in hist.iterrows():
            est = row.get("EPS Estimate")
            act = row.get("Reported EPS")
            est_f = float(est) if pd.notna(est) else None
            act_f = float(act) if pd.notna(act) else None
            surp = (
                round((act_f - est_f) / abs(est_f) * 100, 2)
                if est_f and act_f and est_f != 0
                else None
            )
            results.append(
                EarningsEvent(
                    ticker=ticker,
                    earnings_date=str(pd.Timestamp(idx).date()),
                    eps_estimate=est_f,
                    eps_actual=act_f,
                    surprise_pct=surp,
                )
            )
        redis.set(cache_key, json.dumps([e.model_dump() for e in results]), ex=3600)
        return results
    except Exception as e:
        logger.error("Earnings error for %s: %s", ticker, e)
        return []


@app.get("/earnings", response_model=list[EarningsEvent])
@limiter.limit("5/minute")
async def get_earnings_calendar(request: Request, days_ahead: int = Query(14, ge=1, le=60)):
    cache_key = f"earnings:calendar:{days_ahead}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    try:
        import concurrent.futures

        conn = get_conn()
        rows = conn.execute("SELECT Ticker, FullName FROM stock_information").fetchall()
        conn.close()
        today = datetime.date.today()
        end_d = today + datetime.timedelta(days=days_ahead)

        def _fetch(ticker_name):
            ticker, name = ticker_name
            try:
                cal = yf.Ticker(ticker).calendar
                if not cal or not isinstance(cal, dict):
                    return []
                dates = cal.get("Earnings Date", [])
                if not dates:
                    return []
                est_raw = cal.get("Earnings Average")
                est = float(est_raw) if est_raw is not None and pd.notna(est_raw) else None
                out = []
                for d in dates:
                    if isinstance(d, datetime.date) and today <= d <= end_d:
                        out.append(
                            EarningsEvent(
                                ticker=ticker,
                                company_name=name,
                                earnings_date=str(d),
                                eps_estimate=est,
                            )
                        )
                return out
            except Exception:
                return []

        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
            for batch in pool.map(_fetch, rows):
                results.extend(batch)

        results.sort(key=lambda x: x.earnings_date)
        redis.set(cache_key, json.dumps([e.model_dump() for e in results]), ex=3600)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/peers/{ticker}", response_model=list[PeerRow])
@limiter.limit("20/minute")
async def get_peers(request: Request, ticker: str):
    cache_key = f"peers:{ticker}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    try:
        conn = get_conn()
        sub_row = conn.execute(
            "SELECT Subsector FROM stock_information WHERE Ticker=?", [ticker.upper()]
        ).fetchone()
        if not sub_row:
            conn.close()
            raise HTTPException(status_code=404, detail="Ticker not found")
        subsector = sub_row[0]
        rows = conn.execute(
            """
            WITH latest AS (
                SELECT Ticker, FullName, Ticker_Close, Ticker_RSI, Ticker_Tech_Score,
                       MarketCap, PE, EPS, Beta
                FROM combined_stock_data
                WHERE Date = (SELECT MAX(Date) FROM combined_stock_data)
                  AND Subsector = ?
            ),
            year_ago AS (
                SELECT Ticker, Ticker_Close AS prev_close
                FROM combined_stock_data
                WHERE Date = (
                    SELECT MAX(Date) FROM combined_stock_data
                    WHERE Date <= (SELECT MAX(Date) FROM combined_stock_data)::DATE - INTERVAL '1 year'
                )
            )
            SELECT l.Ticker, l.FullName,
                l.MarketCap AS mc, l.PE AS pe, l.EPS AS eps, l.Beta AS beta,
                l.Ticker_RSI, l.Ticker_Tech_Score,
                CASE WHEN y.prev_close > 0
                     THEN ROUND((l.Ticker_Close - y.prev_close) / y.prev_close * 100, 2)
                     ELSE NULL END AS ret52w
            FROM latest l LEFT JOIN year_ago y ON y.Ticker = l.Ticker
            ORDER BY mc DESC NULLS LAST
            LIMIT 15
        """,
            [subsector],
        ).fetchall()
        conn.close()
        result = [
            PeerRow(
                ticker=r[0],
                name=r[1],
                market_cap=r[2],
                pe=r[3],
                eps=r[4],
                beta=r[5],
                rsi=r[6],
                tech_score=r[7],
                return_52w=r[8],
            )
            for r in rows
        ]
        redis.set(cache_key, json.dumps([p.model_dump() for p in result]), ex=1800)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sector-rotation", response_model=list[SectorRotationRow])
@limiter.limit("10/minute")
async def get_sector_rotation(request: Request, days: int = Query(90, ge=30, le=730)):
    cache_key = f"sector_rotation:{days}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    try:
        conn = get_conn()
        rows = conn.execute(f"""
            WITH latest AS (
                SELECT Sector, AVG(Ticker_Close) AS cn,
                       AVG(Ticker_RSI) AS ar, AVG(Ticker_Tech_Score) AS at
                FROM combined_stock_data
                WHERE Date = (SELECT MAX(Date) FROM combined_stock_data)
                GROUP BY Sector
            ),
            past AS (
                SELECT Sector, AVG(Ticker_Close) AS cp
                FROM combined_stock_data
                WHERE Date = (
                    SELECT MAX(Date) FROM combined_stock_data
                    WHERE Date <= (SELECT MAX(Date) FROM combined_stock_data)::DATE
                                  - INTERVAL '{days} days'
                )
                GROUP BY Sector
            )
            SELECT l.Sector,
                   ROUND((l.cn - p.cp) / NULLIF(p.cp, 0) * 100, 2),
                   l.ar, l.at
            FROM latest l LEFT JOIN past p ON l.Sector = p.Sector
            WHERE l.Sector IS NOT NULL AND l.Sector != ''
            ORDER BY ROUND((l.cn - p.cp) / NULLIF(p.cp, 0) * 100, 2) DESC NULLS LAST
        """).fetchall()
        conn.close()
        result = [
            SectorRotationRow(sector=r[0], return_pct=r[1], avg_rsi=r[2], avg_tech_score=r[3])
            for r in rows
        ]
        redis.set(cache_key, json.dumps([x.model_dump() for x in result]), ex=1800)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/market-breadth", response_model=MarketBreadth)
@limiter.limit("20/minute")
async def get_market_breadth(request: Request):
    cache_key = "market_breadth"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    try:
        conn = get_conn()
        row = conn.execute("""
            WITH latest AS (
                SELECT Ticker, Ticker_Close, Ticker_RSI, Ticker_SMA_30, Ticker_Tech_Score
                FROM combined_stock_data
                WHERE Date = (SELECT MAX(Date) FROM combined_stock_data)
            ),
            prev AS (
                SELECT Ticker, Ticker_Close AS pc
                FROM combined_stock_data
                WHERE Date = (
                    SELECT MAX(Date) FROM combined_stock_data
                    WHERE Date < (SELECT MAX(Date) FROM combined_stock_data)
                )
            ),
            hi52 AS (
                SELECT Ticker,
                       MAX(Ticker_High) AS h52,
                       MIN(Ticker_Low)  AS l52
                FROM combined_stock_data
                WHERE Date >= (SELECT MAX(Date) FROM combined_stock_data)::DATE - INTERVAL '1 year'
                GROUP BY Ticker
            )
            SELECT
                COUNT(CASE WHEN l.Ticker_Close > p.pc THEN 1 END),
                COUNT(CASE WHEN l.Ticker_Close < p.pc THEN 1 END),
                COUNT(CASE WHEN l.Ticker_Close = p.pc THEN 1 END),
                COUNT(CASE WHEN l.Ticker_Close >= h.h52 * 0.99 THEN 1 END),
                COUNT(CASE WHEN l.Ticker_Close <= h.l52 * 1.01 THEN 1 END),
                COUNT(CASE WHEN l.Ticker_Close > l.Ticker_SMA_30 THEN 1 END),
                COUNT(CASE WHEN l.Ticker_Close <= l.Ticker_SMA_30 THEN 1 END),
                ROUND(AVG(l.Ticker_RSI), 1),
                ROUND(AVG(l.Ticker_Tech_Score), 1),
                COUNT(*)
            FROM latest l
            JOIN prev p ON p.Ticker = l.Ticker
            JOIN hi52 h ON h.Ticker = l.Ticker
        """).fetchone()
        conn.close()
        adv, dec, unch, nh, nl, asma, bsma, avg_rsi, avg_ts, total = row
        pct_adv = round(adv / total * 100, 1) if total else None
        result = MarketBreadth(
            date=datetime.date.today().isoformat(),
            advancing=adv or 0,
            declining=dec or 0,
            unchanged=unch or 0,
            new_highs_52w=nh or 0,
            new_lows_52w=nl or 0,
            above_sma50=asma or 0,
            below_sma50=bsma or 0,
            avg_rsi=avg_rsi,
            avg_tech_score=avg_ts,
            pct_advancing=pct_adv,
            total=total or 0,
        )
        redis.set(cache_key, result.model_dump_json(), ex=600)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/correlations", response_model=CorrelationMatrix)
@limiter.limit("10/minute")
async def get_correlations(
    request: Request,
    tickers: list[str] = Query(...),
    days: int = Query(90, ge=30, le=730),
):
    tickers = [t.upper() for t in tickers if t][:20]
    if len(tickers) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 tickers")
    cache_key = f"correlations:{','.join(sorted(tickers))}:{days}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    try:
        placeholders = ",".join("?" * len(tickers))
        conn = get_conn()
        rows = conn.execute(
            f"SELECT Date, Ticker, Ticker_Close FROM combined_stock_data "
            f"WHERE Ticker IN ({placeholders}) "
            f"AND Date >= ((SELECT MAX(Date) FROM combined_stock_data)::DATE - INTERVAL '{days} days')::TEXT "
            f"ORDER BY Date",
            tickers,
        ).fetchall()
        conn.close()
        df = pd.DataFrame(rows, columns=["date", "ticker", "close"])
        pivot = df.pivot(index="date", columns="ticker", values="close").sort_index()
        returns = pivot.pct_change().dropna()
        corr = returns.corr()
        available = [t for t in tickers if t in corr.columns]
        matrix = [
            [
                round(corr.loc[a, b], 4) if a in corr.index and b in corr.columns else None
                for b in available
            ]
            for a in available
        ]
        result = CorrelationMatrix(tickers=available, matrix=matrix)
        redis.set(cache_key, result.model_dump_json(), ex=1800)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/correlations", response_model=CorrelationMatrix)
@limiter.limit("10/minute")
async def post_correlations(request: Request, body: _CorrelationsBody):
    """POST variant of /correlations — accepts tickers + days in body."""
    tickers = [t.upper() for t in body.tickers if t][:20]
    days = max(30, min(730, body.days))
    if len(tickers) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 tickers")
    cache_key = f"correlations:{','.join(sorted(tickers))}:{days}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    try:
        placeholders = ",".join("?" * len(tickers))
        conn = get_conn()
        rows = conn.execute(
            f"SELECT Date, Ticker, Ticker_Close FROM combined_stock_data "
            f"WHERE Ticker IN ({placeholders}) "
            f"AND Date >= ((SELECT MAX(Date) FROM combined_stock_data)::DATE - INTERVAL '{days} days')::TEXT "
            f"ORDER BY Date",
            tickers,
        ).fetchall()
        conn.close()
        df = pd.DataFrame(rows, columns=["date", "ticker", "close"])
        pivot = df.pivot(index="date", columns="ticker", values="close").sort_index()
        returns = pivot.pct_change().dropna()
        corr = returns.corr()
        available = [t for t in tickers if t in corr.columns]
        matrix = [
            [
                round(corr.loc[a, b], 4) if a in corr.index and b in corr.columns else None
                for b in available
            ]
            for a in available
        ]
        result = CorrelationMatrix(tickers=available, matrix=matrix)
        redis.set(cache_key, result.model_dump_json(), ex=1800)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


_ALERT_KEYS = [
    "id",
    "ticker",
    "metric",
    "condition",
    "threshold",
    "triggered",
    "triggered_at",
    "created_at",
    "notes",
]


@app.get("/alerts", response_model=list[AlertOut])
async def list_alerts(request: Request):
    sid = _get_session_id(request)
    conn = get_conn()
    rows = conn.execute(
        "SELECT id,ticker,metric,condition,threshold,triggered,triggered_at,created_at,notes "
        "FROM alerts WHERE session_id=? ORDER BY created_at DESC",
        (sid,),
    ).fetchall()
    conn.close()
    return [dict(zip(_ALERT_KEYS, r)) for r in rows]


@app.post("/alerts", response_model=AlertOut)
async def create_alert(request: Request, body: AlertCreate):
    sid = _get_session_id(request)
    conn = get_conn()
    rid = conn.execute(
        "INSERT INTO alerts (session_id,ticker,metric,condition,threshold,notes) "
        "VALUES (?,?,?,?,?,?) RETURNING id",
        [sid, body.ticker.upper(), body.metric, body.condition, body.threshold, body.notes],
    ).fetchone()[0]
    row = conn.execute(
        "SELECT id,ticker,metric,condition,threshold,triggered,triggered_at,created_at,notes "
        "FROM alerts WHERE id=?",
        [rid],
    ).fetchone()
    conn.close()
    return dict(zip(_ALERT_KEYS, row))


@app.delete("/alerts/{alert_id}")
async def delete_alert(request: Request, alert_id: int):
    sid = _get_session_id(request)
    conn = get_conn()
    conn.execute("DELETE FROM alerts WHERE id=? AND session_id=?", [alert_id, sid])
    conn.close()
    return {"ok": True}


@app.get("/patterns/{ticker}", response_model=list[PatternSignal])
@limiter.limit("20/minute")
async def get_ticker_patterns(request: Request, ticker: str, days: int = Query(7, ge=1, le=30)):
    cache_key = f"patterns:{ticker}:{days}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    conn = get_conn()
    rows = conn.execute(
        f"SELECT id,ticker,detected_at,pattern_type,level,confidence,notes FROM pattern_signals "
        f"WHERE ticker=? AND detected_at >= (CURRENT_DATE - INTERVAL '{days} days')::TEXT "
        f"ORDER BY detected_at DESC, confidence DESC",
        [ticker.upper()],
    ).fetchall()
    conn.close()
    keys = ["id", "ticker", "detected_at", "pattern_type", "level", "confidence", "notes"]
    result = [dict(zip(keys, r)) for r in rows]
    redis.set(cache_key, json.dumps(result), ex=3600)
    return result


@app.get("/patterns", response_model=list[PatternSignal])
@limiter.limit("10/minute")
async def get_recent_patterns(
    request: Request,
    pattern_type: str | None = None,
    days: int = Query(1, ge=1, le=7),
):
    cache_key = f"patterns:all:{pattern_type}:{days}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    conn = get_conn()
    if pattern_type:
        rows = conn.execute(
            "SELECT id,ticker,detected_at,pattern_type,level,confidence,notes FROM pattern_signals "
            f"WHERE pattern_type=? AND detected_at >= (CURRENT_DATE - INTERVAL '{days} days')::TEXT "
            "ORDER BY confidence DESC LIMIT 100",
            [pattern_type],
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT id,ticker,detected_at,pattern_type,level,confidence,notes FROM pattern_signals "
            f"WHERE detected_at >= (CURRENT_DATE - INTERVAL '{days} days')::TEXT "
            "ORDER BY confidence DESC LIMIT 100",
        ).fetchall()
    conn.close()
    keys = ["id", "ticker", "detected_at", "pattern_type", "level", "confidence", "notes"]
    result = [dict(zip(keys, r)) for r in rows]
    redis.set(cache_key, json.dumps(result), ex=1800)
    return result


@app.get("/groupings", response_model=StockGroupings)
@limiter.limit("20/minute")
async def get_stock_groupings(request: Request):
    cached = redis.get("groupings:bullish")
    if cached:
        return json.loads(cached)
    result = _get_bullish_groupings_from_db()
    redis.set("groupings:bullish", json.dumps(result), ex=300)
    return result


@app.get("/search", response_model=list[SearchResult])
@limiter.limit("30/minute")
async def search_companies(request: Request, query: str, limit: int = Query(10, ge=1, le=50)):
    cache_key = f"search:{query}:{limit}"
    cached_data = redis.get(cache_key)

    if cached_data:
        return json.loads(cached_data)

    term = query.lower().strip()
    results = set(prefix_index.get(term, set()))

    sorted_results = sorted(
        results,
        key=lambda x: (
            not x[0].lower().startswith(term),  # exact ticker prefix first
            not x[1].lower().startswith(term),  # then company name prefix
            len(x[0]),  # shorter tickers first
            x[0].lower(),
        ),
    )[:limit]

    search_results = [
        SearchResult(ticker=ticker, name=full_name) for ticker, full_name in sorted_results
    ]

    redis.set(cache_key, json.dumps([sr.model_dump() for sr in search_results]), ex=3600)

    return search_results


# ── Heatmap ────────────────────────────────────────────────────────────────────


@app.get("/heatmap", response_model=list[HeatmapNode])
@limiter.limit("20/minute")
async def get_heatmap(
    request: Request,
    level: str = "sector",
    sector: str | None = None,
    subsector: str | None = None,
):
    cache_key = f"heatmap:{level}:{sector}:{subsector}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)

    prev_date_sql = (
        "(SELECT MAX(Date) FROM combined_stock_data "
        " WHERE Date < (SELECT MAX(Date) FROM combined_stock_data))"
    )
    latest_date_sql = "(SELECT MAX(Date) FROM combined_stock_data)"

    try:
        conn = get_conn()

        if level == "sector":
            rows = conn.execute(f"""
                SELECT
                    t.Sector,
                    SUM(t.MarketCap) AS market_cap,
                    AVG((t.Ticker_Close - p.Ticker_Close) / NULLIF(p.Ticker_Close, 0) * 100) AS pct_change
                FROM combined_stock_data t
                LEFT JOIN combined_stock_data p
                    ON p.Ticker = t.Ticker AND p.Date = {prev_date_sql}
                WHERE t.Date = {latest_date_sql}
                  AND t.Sector IS NOT NULL AND t.Sector != ''
                GROUP BY t.Sector
                ORDER BY market_cap DESC
            """).fetchall()
            result = [
                {"name": r[0], "market_cap": r[1], "pct_change": r[2], "ticker": None}
                for r in rows
                if r[0]
            ]

        elif level == "subsector":
            if not sector:
                raise HTTPException(status_code=400, detail="sector required for subsector level")
            rows = conn.execute(
                f"""
                SELECT
                    t.Subsector,
                    SUM(t.MarketCap) AS market_cap,
                    AVG((t.Ticker_Close - p.Ticker_Close) / NULLIF(p.Ticker_Close, 0) * 100) AS pct_change
                FROM combined_stock_data t
                LEFT JOIN combined_stock_data p
                    ON p.Ticker = t.Ticker AND p.Date = {prev_date_sql}
                WHERE t.Date = {latest_date_sql}
                  AND t.Sector = ?
                  AND t.Subsector IS NOT NULL AND t.Subsector != ''
                GROUP BY t.Subsector
                ORDER BY market_cap DESC
            """,
                [sector],
            ).fetchall()
            result = [
                {"name": r[0], "market_cap": r[1], "pct_change": r[2], "ticker": None}
                for r in rows
                if r[0]
            ]

        elif level == "stock":
            if not subsector:
                raise HTTPException(status_code=400, detail="subsector required for stock level")
            rows = conn.execute(
                f"""
                SELECT
                    t.Ticker,
                    t.FullName,
                    t.MarketCap AS market_cap,
                    (t.Ticker_Close - p.Ticker_Close) / NULLIF(p.Ticker_Close, 0) * 100 AS pct_change
                FROM combined_stock_data t
                LEFT JOIN combined_stock_data p
                    ON p.Ticker = t.Ticker AND p.Date = {prev_date_sql}
                WHERE t.Date = {latest_date_sql}
                  AND t.Subsector = ?
                ORDER BY market_cap DESC
            """,
                [subsector],
            ).fetchall()
            result = [
                {"name": r[1] or r[0], "market_cap": r[2], "pct_change": r[3], "ticker": r[0]}
                for r in rows
            ]

        else:
            raise HTTPException(status_code=400, detail="level must be sector, subsector, or stock")

        conn.close()
        redis.set(cache_key, json.dumps(result), ex=300)
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Heatmap error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ── Screener ───────────────────────────────────────────────────────────────────


@app.get("/screener", response_model=list[ScreenerRow])
@limiter.limit("20/minute")
async def get_screener(request: Request):
    cache_key = "screener:all"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)

    try:
        conn = get_conn()
        rows = conn.execute("""
            WITH latest AS (
                SELECT * FROM combined_stock_data
                WHERE Date = (SELECT MAX(Date) FROM combined_stock_data)
            ),
            year_ago AS (
                SELECT Ticker, Ticker_Close AS year_ago_close
                FROM combined_stock_data
                WHERE Date = (
                    SELECT MAX(Date) FROM combined_stock_data
                    WHERE Date <= ((SELECT MAX(Date) FROM combined_stock_data)::DATE - INTERVAL '1 year')::TEXT
                )
            )
            SELECT
                l.Ticker,
                l.FullName,
                l.Sector,
                l.Subsector,
                l.MarketCap  AS market_cap,
                l.PE         AS pe,
                l.EPS        AS eps,
                l.Beta       AS beta,
                l.Ticker_RSI AS rsi,
                l.Ticker_Close AS latest_close,
                CASE
                    WHEN y.year_ago_close IS NOT NULL AND y.year_ago_close > 0
                    THEN ROUND((l.Ticker_Close - y.year_ago_close) / y.year_ago_close * 100, 2)
                    ELSE NULL
                END AS return_52w,
                l.Ticker_Tech_Score AS tech_score
            FROM latest l
            LEFT JOIN year_ago y ON y.Ticker = l.Ticker
            WHERE l.Ticker IS NOT NULL
            ORDER BY market_cap DESC
        """).fetchall()

        cols = [
            "ticker",
            "name",
            "sector",
            "subsector",
            "market_cap",
            "pe",
            "eps",
            "beta",
            "rsi",
            "latest_close",
            "return_52w",
            "tech_score",
        ]
        result = [dict(zip(cols, r)) for r in rows]

        # Batch fetch sparkline data for all returned tickers
        tickers_in_page = [r["ticker"] for r in result]
        if tickers_in_page:
            ph = ",".join("?" * len(tickers_in_page))
            spark_rows = conn.execute(
                f"""
                SELECT Ticker, Ticker_Close
                FROM combined_stock_data
                WHERE Ticker IN ({ph})
                  AND Date >= ((SELECT MAX(Date) FROM combined_stock_data)::DATE - INTERVAL '30 days')::TEXT
                ORDER BY Ticker, Date ASC
            """,
                tickers_in_page,
            ).fetchall()
            spark_map = {}
            for t, c in spark_rows:
                if t not in spark_map:
                    spark_map[t] = []
                if c is not None:
                    spark_map[t].append(round(float(c), 2))
            for r in result:
                r["spark"] = spark_map.get(r["ticker"], [])

        conn.close()
        redis.set(cache_key, json.dumps(result), ex=1800)
        return result

    except Exception as e:
        logger.error("Screener error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ── Watchlists ─────────────────────────────────────────────────────────────────


def _row_to_watchlist(row) -> dict:
    return {
        "id": row[0],
        "name": row[1],
        "tickers": json.loads(row[2] or "[]"),
        "created_at": row[3] or "",
        "updated_at": row[4] or "",
    }


@app.get("/watchlists", response_model=list[WatchlistOut])
@limiter.limit("60/minute")
async def list_watchlists(request: Request):
    sid = _get_session_id(request)
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, name, tickers, created_at, updated_at FROM watchlists "
        "WHERE session_id=? ORDER BY updated_at DESC",
        [sid],
    ).fetchall()
    conn.close()
    return [_row_to_watchlist(r) for r in rows]


@app.post("/watchlists", response_model=WatchlistOut)
@limiter.limit("30/minute")
async def create_watchlist(request: Request, body: WatchlistCreate):
    sid = _get_session_id(request)
    conn = get_conn()
    row_id = conn.execute(
        "INSERT INTO watchlists (session_id, name, tickers) VALUES (?, ?, ?) RETURNING id",
        [sid, body.name, json.dumps(body.tickers)],
    ).fetchone()[0]
    row = conn.execute(
        "SELECT id, name, tickers, created_at, updated_at FROM watchlists WHERE id = ?",
        [row_id],
    ).fetchone()
    conn.close()
    return _row_to_watchlist(row)


@app.get("/watchlists/{wl_id}", response_model=WatchlistOut)
@limiter.limit("60/minute")
async def get_watchlist(request: Request, wl_id: int):
    sid = _get_session_id(request)
    conn = get_conn()
    row = conn.execute(
        "SELECT id, name, tickers, created_at, updated_at FROM watchlists WHERE id=? AND session_id=?",
        [wl_id, sid],
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    return _row_to_watchlist(row)


@app.put("/watchlists/{wl_id}", response_model=WatchlistOut)
@limiter.limit("30/minute")
async def update_watchlist(request: Request, wl_id: int, body: WatchlistCreate):
    sid = _get_session_id(request)
    conn = get_conn()
    conn.execute(
        "UPDATE watchlists SET name=?, tickers=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND session_id=?",
        [body.name, json.dumps(body.tickers), wl_id, sid],
    )
    row = conn.execute(
        "SELECT id, name, tickers, created_at, updated_at FROM watchlists WHERE id=? AND session_id=?",
        [wl_id, sid],
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    return _row_to_watchlist(row)


@app.delete("/watchlists/{wl_id}")
@limiter.limit("30/minute")
async def delete_watchlist(request: Request, wl_id: int):
    sid = _get_session_id(request)
    conn = get_conn()
    conn.execute("DELETE FROM watchlists WHERE id=? AND session_id=?", [wl_id, sid])
    conn.close()
    return {"ok": True}


# ── Portfolio ──────────────────────────────────────────────────────────────────


def _get_portfolio_with_positions(portfolio_id: int, session_id: str = "default") -> dict | None:
    conn = get_conn()
    port_row = conn.execute(
        "SELECT id, name, created_at FROM portfolios WHERE id=? AND session_id=?",
        [portfolio_id, session_id],
    ).fetchone()
    if not port_row:
        conn.close()
        return None

    # Join positions with latest close prices
    pos_rows = conn.execute(
        """
        SELECT p.id, p.portfolio_id, p.ticker, p.shares, p.cost_basis,
               p.purchased_at, p.notes, csd.Ticker_Close
        FROM positions p
        LEFT JOIN combined_stock_data csd
            ON csd.Ticker = p.ticker
           AND csd.Date = (SELECT MAX(Date) FROM combined_stock_data)
        WHERE p.portfolio_id = ?
        ORDER BY p.id
    """,
        [portfolio_id],
    ).fetchall()
    conn.close()

    positions = []
    total_cost = total_value = 0.0
    for r in pos_rows:
        current_price = float(r[7]) if r[7] is not None else None
        cost_total = float(r[4]) * float(r[3])
        value_total = current_price * float(r[3]) if current_price is not None else cost_total
        pnl = value_total - cost_total
        pnl_pct = (pnl / cost_total * 100) if cost_total else None
        total_cost += cost_total
        total_value += value_total
        positions.append(
            {
                "id": r[0],
                "portfolio_id": r[1],
                "ticker": r[2],
                "shares": r[3],
                "cost_basis": r[4],
                "purchased_at": r[5],
                "notes": r[6],
                "current_price": current_price,
                "unrealized_pnl": round(pnl, 2),
                "unrealized_pnl_pct": round(pnl_pct, 2) if pnl_pct is not None else None,
            }
        )

    return {
        "id": port_row[0],
        "name": port_row[1],
        "positions": positions,
        "total_cost": round(total_cost, 2),
        "total_value": round(total_value, 2),
        "total_pnl": round(total_value - total_cost, 2),
    }


@app.get("/portfolios")
@limiter.limit("60/minute")
async def list_portfolios(request: Request):
    sid = _get_session_id(request)
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, name, created_at FROM portfolios WHERE session_id=? ORDER BY id", [sid]
    ).fetchall()
    conn.close()
    return [{"id": r[0], "name": r[1], "created_at": r[2]} for r in rows]


@app.post("/portfolios")
@limiter.limit("30/minute")
async def create_portfolio(request: Request, body: PortfolioCreate):
    sid = _get_session_id(request)
    conn = get_conn()
    row_id = conn.execute(
        "INSERT INTO portfolios (session_id, name) VALUES (?, ?) RETURNING id", [sid, body.name]
    ).fetchone()[0]
    conn.close()
    return _get_portfolio_with_positions(row_id, sid)


@app.get("/portfolios/{portfolio_id}", response_model=PortfolioOut)
@limiter.limit("60/minute")
async def get_portfolio(request: Request, portfolio_id: int):
    sid = _get_session_id(request)
    result = _get_portfolio_with_positions(portfolio_id, sid)
    if not result:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return result


@app.post("/portfolios/{portfolio_id}/positions", response_model=PositionOut)
@limiter.limit("30/minute")
async def add_position(request: Request, portfolio_id: int, body: PositionCreate):
    sid = _get_session_id(request)
    conn = get_conn()
    port = conn.execute(
        "SELECT id FROM portfolios WHERE id=? AND session_id=?", [portfolio_id, sid]
    ).fetchone()
    if not port:
        conn.close()
        raise HTTPException(status_code=404, detail="Portfolio not found")
    pos_id = conn.execute(
        "INSERT INTO positions (portfolio_id, ticker, shares, cost_basis, purchased_at, notes) "
        "VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
        [
            portfolio_id,
            body.ticker.upper(),
            body.shares,
            body.cost_basis,
            body.purchased_at,
            body.notes,
        ],
    ).fetchone()[0]
    conn.close()
    portfolio = _get_portfolio_with_positions(portfolio_id, sid)
    pos = next((p for p in portfolio["positions"] if p["id"] == pos_id), None)
    if not pos:
        raise HTTPException(status_code=500, detail="Position creation failed")
    return pos


@app.put("/portfolios/{portfolio_id}/positions/{pos_id}", response_model=PositionOut)
@limiter.limit("30/minute")
async def update_position(request: Request, portfolio_id: int, pos_id: int, body: PositionCreate):
    sid = _get_session_id(request)
    conn = get_conn()
    conn.execute(
        "UPDATE positions SET ticker=?, shares=?, cost_basis=?, purchased_at=?, notes=? "
        "WHERE id=? AND portfolio_id=? AND portfolio_id IN "
        "(SELECT id FROM portfolios WHERE session_id=?)",
        (
            body.ticker.upper(),
            body.shares,
            body.cost_basis,
            body.purchased_at,
            body.notes,
            pos_id,
            portfolio_id,
            sid,
        ),
    )
    conn.close()
    portfolio = _get_portfolio_with_positions(portfolio_id, sid)
    pos = next((p for p in portfolio["positions"] if p["id"] == pos_id), None)
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")
    return pos


@app.delete("/portfolios/{portfolio_id}/positions/{pos_id}")
@limiter.limit("30/minute")
async def delete_position(request: Request, portfolio_id: int, pos_id: int):
    sid = _get_session_id(request)
    conn = get_conn()
    conn.execute(
        "DELETE FROM positions WHERE id=? AND portfolio_id=? AND portfolio_id IN "
        "(SELECT id FROM portfolios WHERE session_id=?)",
        (pos_id, portfolio_id, sid),
    )
    conn.close()
    return {"ok": True}


@app.get("/portfolios/{portfolio_id}/chart")
@limiter.limit("20/minute")
async def get_portfolio_chart(
    request: Request, portfolio_id: int, days: int = Query(90, ge=7, le=1825)
):
    sid = _get_session_id(request)
    cache_key = f"portfolio_chart:{sid}:{portfolio_id}:{days}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)

    try:
        conn = get_conn()
        # Verify portfolio belongs to this session
        owns = conn.execute(
            "SELECT id FROM portfolios WHERE id=? AND session_id=?", [portfolio_id, sid]
        ).fetchone()
        if not owns:
            conn.close()
            return []
        has_positions = conn.execute(
            "SELECT COUNT(*) FROM positions WHERE portfolio_id = ?", [portfolio_id]
        ).fetchone()[0]
        if not has_positions:
            conn.close()
            return []

        rows = conn.execute(
            f"""
            SELECT csd.Date, SUM(p.shares * csd.Ticker_Close) AS portfolio_value
            FROM positions p
            JOIN combined_stock_data csd ON csd.Ticker = p.ticker
            WHERE p.portfolio_id = ?
              AND csd.Date >= ((SELECT MAX(Date) FROM combined_stock_data)::DATE - INTERVAL '{days} days')::TEXT
            GROUP BY csd.Date
            ORDER BY csd.Date
        """,
            [portfolio_id],
        ).fetchall()
        conn.close()

        result = [{"date": str(r[0])[:10], "value": round(float(r[1]), 2)} for r in rows]
        redis.set(cache_key, json.dumps(result), ex=600)
        return result
    except Exception as e:
        logger.error("Portfolio chart error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


ALLOWED_BACKTEST_METRICS = {
    "Ticker_RSI",
    "Ticker_MACD",
    "Ticker_MACD_Diff",
    "Ticker_MACD_Signal",
    "Ticker_Close",
    "Ticker_SMA_10",
    "Ticker_SMA_30",
    "Ticker_SMA_200W",
    "Ticker_SMA_250W",
    "Ticker_EMA_10",
    "Ticker_EMA_30",
    "Ticker_Bollinger_PBand",
    "Ticker_Bollinger_WBand",
    "Ticker_MFI",
    "Ticker_Tech_Score",
    "Ticker_Stochastic_K",
    "Ticker_Stochastic_D",
    "Ticker_Williams_R",
    "Ticker_ROC",
    "Ticker_VWAP",
}


@app.post("/backtest", response_model=BacktestResult)
@limiter.limit("5/minute")
async def run_backtest(request: Request, body: BacktestRequest):
    if body.entry_metric not in ALLOWED_BACKTEST_METRICS:
        raise HTTPException(status_code=400, detail=f"Invalid entry_metric: {body.entry_metric}")
    if body.exit_metric not in ALLOWED_BACKTEST_METRICS:
        raise HTTPException(status_code=400, detail=f"Invalid exit_metric: {body.exit_metric}")
    if body.entry_threshold_metric and body.entry_threshold_metric not in ALLOWED_BACKTEST_METRICS:
        raise HTTPException(
            status_code=400, detail=f"Invalid entry_threshold_metric: {body.entry_threshold_metric}"
        )
    if body.exit_threshold_metric and body.exit_threshold_metric not in ALLOWED_BACKTEST_METRICS:
        raise HTTPException(
            status_code=400, detail=f"Invalid exit_threshold_metric: {body.exit_threshold_metric}"
        )

    cache_key = (
        f"backtest:{body.ticker}:{body.entry_metric}:{body.entry_condition}:"
        f"{body.entry_threshold_metric or body.entry_threshold}:{body.exit_metric}:{body.exit_condition}:"
        f"{body.exit_threshold_metric or body.exit_threshold}:{body.start_date}:{body.end_date}"
    )
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)

    try:
        conn = get_conn()
        date_filter = ""
        params: list = [body.ticker.upper()]
        if body.start_date:
            date_filter += " AND Date >= ?"
            params.append(body.start_date)
        if body.end_date:
            date_filter += " AND Date <= ?"
            params.append(body.end_date)

        etm = body.entry_threshold_metric or "NULL"
        xtm = body.exit_threshold_metric or "NULL"
        query = (
            f"SELECT Date, Ticker_Close, {body.entry_metric}, {body.exit_metric}, "
            f"{etm} AS entry_thresh_val, {xtm} AS exit_thresh_val "
            f"FROM combined_stock_data WHERE Ticker = ? {date_filter} ORDER BY Date ASC"
        )
        rows = conn.execute(query, params).fetchall()
        conn.close()

        if not rows:
            raise HTTPException(status_code=404, detail="No data found for ticker")

        df = pd.DataFrame(
            rows,
            columns=[
                "date",
                "close",
                "entry_val",
                "exit_val",
                "entry_thresh_val",
                "exit_thresh_val",
            ],
        )
        df["close"] = df["close"].astype(float)
        df["entry_val"] = pd.to_numeric(df["entry_val"], errors="coerce")
        df["exit_val"] = pd.to_numeric(df["exit_val"], errors="coerce")
        if body.entry_threshold_metric:
            df["entry_thresh_val"] = pd.to_numeric(df["entry_thresh_val"], errors="coerce")
        if body.exit_threshold_metric:
            df["exit_thresh_val"] = pd.to_numeric(df["exit_thresh_val"], errors="coerce")

        drop_cols = ["date", "close", "entry_val", "exit_val"]
        if body.entry_threshold_metric:
            drop_cols.append("entry_thresh_val")
        if body.exit_threshold_metric:
            drop_cols.append("exit_thresh_val")
        df = df.dropna(subset=drop_cols).reset_index(drop=True)

        def check_condition(val, prev_val, cond, threshold):
            if threshold is None or (hasattr(threshold, "__float__") and pd.isna(threshold)):
                return False
            threshold = float(threshold)
            if cond == "above":
                return val > threshold
            if cond == "below":
                return val < threshold
            if cond == "crosses_above":
                return prev_val is not None and prev_val <= threshold and val > threshold
            if cond == "crosses_below":
                return prev_val is not None and prev_val >= threshold and val < threshold
            return False

        capital = body.initial_capital
        in_position = False
        entry_price = 0.0
        entry_date = ""
        shares = 0.0
        trades: list[BacktestTrade] = []
        equity_curve = []

        for i in range(len(df)):
            row = df.iloc[i]
            prev_row = df.iloc[i - 1] if i > 0 else None
            prev_entry = prev_row["entry_val"] if prev_row is not None else None
            prev_exit = prev_row["exit_val"] if prev_row is not None else None

            entry_thresh = (
                row["entry_thresh_val"] if body.entry_threshold_metric else body.entry_threshold
            )
            exit_thresh = (
                row["exit_thresh_val"] if body.exit_threshold_metric else body.exit_threshold
            )

            if not in_position:
                if check_condition(
                    row["entry_val"], prev_entry, body.entry_condition, entry_thresh
                ):
                    in_position = True
                    entry_price = float(row["close"])
                    entry_date = str(row["date"])[:10]
                    shares = capital / entry_price
            else:
                if check_condition(row["exit_val"], prev_exit, body.exit_condition, exit_thresh):
                    exit_price = float(row["close"])
                    ret = (exit_price - entry_price) / entry_price * 100
                    pnl = (exit_price - entry_price) * shares
                    capital += pnl
                    trades.append(
                        BacktestTrade(
                            entry_date=entry_date,
                            entry_price=round(entry_price, 2),
                            exit_date=str(row["date"])[:10],
                            exit_price=round(exit_price, 2),
                            return_pct=round(ret, 2),
                            pnl=round(pnl, 2),
                        )
                    )
                    in_position = False

            equity_curve.append({"date": str(row["date"])[:10], "value": round(capital, 2)})

        first_price = float(df.iloc[0]["close"])
        last_price = float(df.iloc[-1]["close"])
        buy_hold = (last_price - first_price) / first_price * 100

        returns = [t.return_pct for t in trades]
        win_rate = sum(1 for r in returns if r > 0) / len(returns) if returns else 0
        avg_ret = sum(returns) / len(returns) if returns else 0

        peak = body.initial_capital
        max_dd = 0.0
        for pt in equity_curve:
            if pt["value"] > peak:
                peak = pt["value"]
            dd = (peak - pt["value"]) / peak * 100
            if dd > max_dd:
                max_dd = dd

        sharpe = None
        if len(returns) >= 5:
            import statistics

            std = statistics.stdev(returns) if len(returns) > 1 else 0
            if std > 0:
                sharpe = round((avg_ret - 5.0 / 252) / std * (252**0.5), 2)

        total_ret = (capital - body.initial_capital) / body.initial_capital * 100

        result = BacktestResult(
            ticker=body.ticker.upper(),
            total_return_pct=round(total_ret, 2),
            buy_hold_return_pct=round(buy_hold, 2),
            num_trades=len(trades),
            win_rate=round(win_rate * 100, 1),
            avg_return_pct=round(avg_ret, 2),
            max_drawdown_pct=round(max_dd, 2),
            sharpe_ratio=sharpe,
            equity_curve=equity_curve,
            trades=trades,
            strategy=(
                f"{body.entry_metric} {body.entry_condition} "
                f"{body.entry_threshold_metric or body.entry_threshold} "
                f"→ {body.exit_metric} {body.exit_condition} "
                f"{body.exit_threshold_metric or body.exit_threshold}"
            ),
        )
        redis.set(cache_key, result.model_dump_json(), ex=3600)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Backtest error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/strategy-screen", response_model=list[str])
@limiter.limit("10/minute")
async def strategy_screen(request: Request, body: StrategyScreenRequest):
    """Return tickers where the entry condition is met on the most recent trading day."""
    if body.entry_metric not in ALLOWED_BACKTEST_METRICS:
        raise HTTPException(status_code=400, detail=f"Invalid entry_metric: {body.entry_metric}")
    if body.entry_threshold_metric and body.entry_threshold_metric not in ALLOWED_BACKTEST_METRICS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid entry_threshold_metric: {body.entry_threshold_metric}",
        )

    etm = body.entry_threshold_metric or "NULL"
    cond = body.entry_condition

    # Build the SQL WHERE clause for the condition
    if cond == "above":
        where_clause = "cur_val > thresh_val"
    elif cond == "below":
        where_clause = "cur_val < thresh_val"
    elif cond == "crosses_above":
        where_clause = "prev_val IS NOT NULL AND prev_val <= thresh_val AND cur_val > thresh_val"
    elif cond == "crosses_below":
        where_clause = "prev_val IS NOT NULL AND prev_val >= thresh_val AND cur_val < thresh_val"
    else:
        raise HTTPException(status_code=400, detail=f"Invalid entry_condition: {cond}")

    try:
        conn = get_conn()
        # Get the two most recent dates in the DB
        rows = conn.execute(
            f"""
            WITH ranked AS (
                SELECT
                    Ticker,
                    Date,
                    CAST({body.entry_metric} AS REAL) AS cur_val,
                    LAG(CAST({body.entry_metric} AS REAL)) OVER (
                        PARTITION BY Ticker ORDER BY Date
                    ) AS prev_val,
                    CAST(COALESCE({etm}, ?) AS REAL) AS thresh_val
                FROM combined_stock_data
                WHERE Date >= ((SELECT MAX(Date) FROM combined_stock_data)::DATE - INTERVAL '10 days')::TEXT
            ),
            latest AS (
                SELECT * FROM ranked
                WHERE Date = (SELECT MAX(Date) FROM combined_stock_data)
            )
            SELECT Ticker FROM latest
            WHERE cur_val IS NOT NULL AND thresh_val IS NOT NULL
              AND {where_clause}
            ORDER BY Ticker
            """,
            (body.entry_threshold,),
        ).fetchall()
        conn.close()
        return [r[0] for r in rows]
    except Exception as e:
        logger.error("Strategy screen error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/metrics/latest")
@limiter.limit("30/minute")
async def get_latest_metrics(request: Request, body: LatestMetricsRequest):
    if not body.tickers or not body.metrics:
        return []
    for m in body.metrics:
        if m not in ALLOWED_BACKTEST_METRICS:
            raise HTTPException(status_code=400, detail=f"Invalid metric: {m}")
    if len(body.tickers) > 200:
        raise HTTPException(status_code=400, detail="Too many tickers (max 200)")

    cols_sql = ", ".join(body.metrics)
    tickers_ph = ",".join("?" * len(body.tickers))
    try:
        conn = get_conn()
        rows = conn.execute(
            f"""
            WITH latest_dates AS (
                SELECT Ticker, MAX(Date) AS max_date
                FROM combined_stock_data
                WHERE Ticker IN ({tickers_ph})
                GROUP BY Ticker
            )
            SELECT c.Ticker, {cols_sql}
            FROM combined_stock_data c
            JOIN latest_dates l ON c.Ticker = l.Ticker AND c.Date = l.max_date
            """,
            body.tickers,
        ).fetchall()
        conn.close()
        result = []
        for row in rows:
            d = {"ticker": row[0]}
            for i, m in enumerate(body.metrics):
                d[m] = row[i + 1]
            result.append(d)
        return result
    except Exception as e:
        logger.error("Latest metrics error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/radar/{ticker}", response_model=RadarData)
@limiter.limit("20/minute")
async def get_radar(request: Request, ticker: str):
    cache_key = f"radar:{ticker.upper()}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    try:
        conn = get_conn()
        row = conn.execute(
            """
            SELECT t.Ticker_RSI, t.Ticker_MACD, t.Ticker_MACD_Signal,
                   t.Ticker_Close, t.Ticker_SMA_10, t.Ticker_SMA_30,
                   t.Ticker_MFI, t.Ticker_Chaikin_MF,
                   t.Ticker_Bollinger_WBand, t.Ticker_Bollinger_PBand,
                   t.PE, t.Ticker_Tech_Score
            FROM combined_stock_data t
            WHERE t.Ticker = ?
            ORDER BY t.Date DESC LIMIT 1
            """,
            (ticker.upper(),),
        ).fetchone()
        conn.close()

        if not row:
            raise HTTPException(status_code=404, detail="Ticker not found")

        rsi, macd, macd_sig, close, sma10, sma30, mfi, cmf, bb_w, bb_pb, pe, _tech = row

        def safe(v, default=50.0):
            return float(v) if v is not None else default

        # Momentum: RSI + MACD direction
        momentum = safe(rsi) * 0.6 + (70 if safe(macd, 0) > safe(macd_sig, 0) else 30) * 0.4
        momentum = max(0.0, min(100.0, momentum))

        # Trend: price vs SMAs
        c = safe(close, 100)
        s10 = safe(sma10, c)
        s30 = safe(sma30, c)
        trend = 100.0 if c > s10 > s30 else (70.0 if c > s10 else (40.0 if c > s30 else 20.0))

        # Volume: MFI + CMF
        volume_score = safe(mfi) * 0.7 + (70 if safe(cmf, 0) > 0 else 30) * 0.3
        volume_score = max(0.0, min(100.0, volume_score))

        # Volatility: inverse Bollinger width + %B position
        bw = safe(bb_w, 0.1)
        bb_p = safe(bb_pb, 0.5)
        vol_score = max(0.0, min(100.0, 100 - bw * 100)) * 0.5 + bb_p * 100 * 0.5

        # Value: P/E relative
        pe_v = safe(pe, 20)
        value_score = max(0.0, min(100.0, 100 - (pe_v - 10) * 2)) if pe_v > 0 else 50.0

        result = RadarData(
            ticker=ticker.upper(),
            momentum=round(momentum, 1),
            trend=round(trend, 1),
            volume=round(volume_score, 1),
            volatility=round(vol_score, 1),
            value=round(value_score, 1),
            sector_momentum=50.0,
            sector_trend=50.0,
            sector_volume=50.0,
            sector_volatility=50.0,
            sector_value=50.0,
        )
        redis.set(cache_key, result.model_dump_json(), ex=1800)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Radar error for %s: %s", ticker, e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/live-prices", response_model=LivePrices)
@limiter.limit("30/minute")
async def get_live_prices(request: Request, tickers: list[str] = Query(...)):
    tickers = [t.upper() for t in tickers if t][:20]
    cache_key = f"live:{','.join(sorted(tickers))}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    try:
        conn = get_conn()
        placeholders = ",".join("?" * len(tickers))
        rows = conn.execute(
            f"SELECT Ticker, Ticker_Close FROM combined_stock_data "
            f"WHERE Ticker IN ({placeholders}) "
            f"AND Date = (SELECT MAX(Date) FROM combined_stock_data)",
            tickers,
        ).fetchall()
        conn.close()
        prices = {r[0]: float(r[1]) if r[1] is not None else None for r in rows}
        result = LivePrices(prices=prices, timestamp=datetime.datetime.utcnow().isoformat())
        redis.set(cache_key, result.model_dump_json(), ex=60)
        return result
    except Exception as e:
        logger.error("Live prices error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/live-prices", response_model=LivePrices)
@limiter.limit("30/minute")
async def post_live_prices(request: Request, body: _LivePricesBody):
    """POST variant of /live-prices — accepts tickers in request body."""
    tickers = [t.upper() for t in body.tickers if t][:20]
    cache_key = f"live:{','.join(sorted(tickers))}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    try:
        conn = get_conn()
        placeholders = ",".join("?" * len(tickers))
        rows = conn.execute(
            f"SELECT Ticker, Ticker_Close FROM combined_stock_data "
            f"WHERE Ticker IN ({placeholders}) "
            f"AND Date = (SELECT MAX(Date) FROM combined_stock_data)",
            tickers,
        ).fetchall()
        conn.close()
        prices = {r[0]: float(r[1]) if r[1] is not None else None for r in rows}
        result = LivePrices(prices=prices, timestamp=datetime.datetime.utcnow().isoformat())
        redis.set(cache_key, result.model_dump_json(), ex=60)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/market-indices")
@limiter.limit("30/minute")
async def get_market_indices(request: Request):
    cache_key = "market_indices"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    try:
        INDEX_TICKERS = ["SPY", "QQQ", "DIA", "IWM", "GLD", "TLT"]
        conn = get_conn()
        latest_date = conn.execute("SELECT MAX(Date) FROM combined_stock_data").fetchone()[0]
        prev_date = conn.execute(
            "SELECT MAX(Date) FROM combined_stock_data WHERE Date < ?", (latest_date,)
        ).fetchone()[0]
        placeholders = ",".join("?" * len(INDEX_TICKERS))
        latest_rows = conn.execute(
            f"SELECT Ticker, Ticker_Close FROM combined_stock_data WHERE Ticker IN ({placeholders}) AND Date=?",
            INDEX_TICKERS + [latest_date],
        ).fetchall()
        prev_rows = conn.execute(
            f"SELECT Ticker, Ticker_Close FROM combined_stock_data WHERE Ticker IN ({placeholders}) AND Date=?",
            INDEX_TICKERS + [prev_date],
        ).fetchall()
        conn.close()
        latest = {r[0]: float(r[1]) for r in latest_rows}
        prev = {r[0]: float(r[1]) for r in prev_rows}
        result = []
        for t in INDEX_TICKERS:
            if t not in latest:
                continue
            p = prev.get(t)
            chg_pct = round((latest[t] - p) / p * 100, 2) if p else None
            result.append({"ticker": t, "price": round(latest[t], 2), "change_pct": chg_pct})
        redis.set(cache_key, json.dumps(result), ex=300)
        return result
    except Exception as e:
        logger.error("Market indices error: %s", e)
        return []


@app.get("/technical-summary/{ticker}", response_model=TechnicalSummary)
@limiter.limit("20/minute")
async def get_technical_summary(request: Request, ticker: str):
    cache_key = f"tech_summary:{ticker.upper()}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    try:
        conn = get_conn()
        row = conn.execute(
            """
            SELECT Ticker_RSI, Ticker_MACD, Ticker_MACD_Signal, Ticker_MACD_Diff,
                   Ticker_Close, Ticker_SMA_10, Ticker_SMA_30,
                   Ticker_Bollinger_PBand, Ticker_Bollinger_WBand,
                   Ticker_MFI, Ticker_Stochastic_K, Ticker_Tech_Score
            FROM combined_stock_data WHERE Ticker=? ORDER BY Date DESC LIMIT 1
        """,
            (ticker.upper(),),
        ).fetchone()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Ticker not found")
        (
            rsi,
            macd,
            macd_sig,
            macd_diff,
            close,
            sma10,
            sma30,
            bb_pb,
            bb_wb,
            mfi,
            stoch_k,
            tech_score,
        ) = row

        def s(v):
            return float(v) if v is not None else None

        signals = []
        bull_count = 0
        bear_count = 0

        # RSI
        r = s(rsi)
        if r is not None:
            if r > 70:
                sig = "bear"
                bear_count += 1
            elif r < 30:
                sig = "bull"
                bull_count += 1
            else:
                sig = "neutral"
            signals.append(
                TechnicalSignal(
                    label="RSI",
                    signal=sig,
                    value=f"{r:.1f}",
                    detail="Overbought" if r > 70 else "Oversold" if r < 30 else "Neutral",
                )
            )

        # MACD
        md, ms = s(macd), s(macd_sig)
        if md is not None and ms is not None:
            sig = "bull" if md > ms else "bear"
            if sig == "bull":
                bull_count += 1
            else:
                bear_count += 1
            signals.append(
                TechnicalSignal(
                    label="MACD",
                    signal=sig,
                    value=f"{s(macd_diff):+.3f}" if s(macd_diff) is not None else "—",
                    detail="Bullish crossover" if sig == "bull" else "Bearish crossover",
                )
            )

        # Trend (price vs SMAs)
        c = s(close)
        s10 = s(sma10)
        s30 = s(sma30)
        if c and s10 and s30:
            if c > s10 > s30:
                sig, detail = "bull", "Price > SMA10 > SMA30"
            elif c < s10 < s30:
                sig, detail = "bear", "Price < SMA10 < SMA30"
            else:
                sig, detail = "neutral", "Mixed trend"
            if sig == "bull":
                bull_count += 1
            elif sig == "bear":
                bear_count += 1
            signals.append(
                TechnicalSignal(label="TREND", signal=sig, value=f"${c:.2f}", detail=detail)
            )

        # Bollinger
        pb = s(bb_pb)
        if pb is not None:
            if pb > 0.9:
                sig, detail = "bear", "Near upper band"
            elif pb < 0.1:
                sig, detail = "bull", "Near lower band"
            else:
                sig, detail = "neutral", f"%B {pb:.2f}"
            if sig == "bull":
                bull_count += 1
            elif sig == "bear":
                bear_count += 1
            signals.append(
                TechnicalSignal(label="BOLLINGER", signal=sig, value=f"{pb:.2f}", detail=detail)
            )

        # MFI
        m = s(mfi)
        if m is not None:
            if m > 80:
                sig, detail = "bear", "Overbought"
            elif m < 20:
                sig, detail = "bull", "Oversold"
            else:
                sig, detail = "neutral", "Normal flow"
            if sig == "bull":
                bull_count += 1
            elif sig == "bear":
                bear_count += 1
            signals.append(
                TechnicalSignal(label="MFI", signal=sig, value=f"{m:.1f}", detail=detail)
            )

        # Stochastic
        sk = s(stoch_k)
        if sk is not None:
            if sk > 80:
                sig, detail = "bear", "Overbought"
            elif sk < 20:
                sig, detail = "bull", "Oversold"
            else:
                sig, detail = "neutral", "Normal"
            if sig == "bull":
                bull_count += 1
            elif sig == "bear":
                bear_count += 1
            signals.append(
                TechnicalSignal(label="STOCH %K", signal=sig, value=f"{sk:.1f}", detail=detail)
            )

        # Tech Score
        ts = s(tech_score)
        if ts is not None:
            if ts >= 70:
                sig, detail = "bull", "Strong"
            elif ts < 40:
                sig, detail = "bear", "Weak"
            else:
                sig, detail = "neutral", "Moderate"
            if sig == "bull":
                bull_count += 1
            elif sig == "bear":
                bear_count += 1
            signals.append(
                TechnicalSignal(label="TECH SCORE", signal=sig, value=f"{ts:.0f}", detail=detail)
            )

        total = bull_count + bear_count
        if total == 0:
            overall = "neutral"
        elif bull_count / total >= 0.6:
            overall = "bull"
        elif bear_count / total >= 0.6:
            overall = "bear"
        else:
            overall = "neutral"

        result = TechnicalSummary(ticker=ticker.upper(), signals=signals, overall=overall)
        redis.set(cache_key, result.model_dump_json(), ex=1800)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Technical summary error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/market-pulse", response_model=MarketPulse)
@limiter.limit("10/minute")
async def get_market_pulse(request: Request):
    cache_key = "market_pulse"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    try:
        conn = get_conn()
        items: list[MarketPulseItem] = []

        # Top movers (by absolute % change)
        movers = conn.execute("""
            WITH latest AS (
                SELECT Ticker, Ticker_Close FROM combined_stock_data
                WHERE Date = (SELECT MAX(Date) FROM combined_stock_data)
            ),
            prev AS (
                SELECT Ticker, Ticker_Close AS pc FROM combined_stock_data
                WHERE Date = (
                    SELECT MAX(Date) FROM combined_stock_data
                    WHERE Date < (SELECT MAX(Date) FROM combined_stock_data)
                )
            )
            SELECT l.Ticker, ROUND((l.Ticker_Close - p.pc) / NULLIF(p.pc, 0) * 100, 2) AS chg
            FROM latest l JOIN prev p ON p.Ticker = l.Ticker
            ORDER BY ABS(chg) DESC LIMIT 6
        """).fetchall()
        for ticker_m, chg in movers:
            if chg is None:
                continue
            items.append(
                MarketPulseItem(
                    type="mover",
                    ticker=ticker_m,
                    headline=f"{'▲' if chg > 0 else '▼'} {abs(chg):.1f}% today",
                    value=f"{chg:+.1f}%",
                    color="green" if chg > 0 else "red",
                )
            )

        # RSI extremes
        extremes = conn.execute("""
            SELECT Ticker, Ticker_RSI FROM combined_stock_data
            WHERE Date = (SELECT MAX(Date) FROM combined_stock_data)
              AND (Ticker_RSI > 75 OR Ticker_RSI < 25)
            ORDER BY ABS(Ticker_RSI - 50) DESC LIMIT 4
        """).fetchall()
        for ticker_e, rsi in extremes:
            if rsi is None:
                continue
            overbought = rsi > 70
            items.append(
                MarketPulseItem(
                    type="extreme",
                    ticker=ticker_e,
                    headline=f"RSI {'overbought' if overbought else 'oversold'} at {rsi:.0f}",
                    value=f"RSI {rsi:.0f}",
                    color="red" if overbought else "green",
                )
            )

        # Pattern signals
        patterns = conn.execute("""
            SELECT ticker, pattern_type FROM pattern_signals
            WHERE pattern_type IN ('double_bottom', 'double_top')
            ORDER BY detected_at DESC LIMIT 4
        """).fetchall()
        for ticker_p, ptype in patterns:
            color = "green" if "bottom" in ptype else "red"
            label = ptype.replace("_", " ").title()
            items.append(
                MarketPulseItem(
                    type="signal",
                    ticker=ticker_p,
                    headline=f"{label} pattern detected",
                    value=label,
                    color=color,
                )
            )

        conn.close()
        result = MarketPulse(items=items[:12], generated_at=datetime.datetime.utcnow().isoformat())
        redis.set(cache_key, result.model_dump_json(), ex=600)
        return result
    except Exception as e:
        logger.error("Market pulse error: %s", e)
        return MarketPulse(items=[], generated_at=datetime.datetime.utcnow().isoformat())


@app.get("/{full_path:path}", response_class=HTMLResponse)
async def catch_all(full_path: str):
    with open(os.path.join("frontend/build", "index.html")) as f:
        return f.read()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=os.getenv("APP_HOST", "0.0.0.0"), port=int(os.getenv("APP_PORT", 8000)))
