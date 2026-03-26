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
import sqlite3
from collections import defaultdict

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
from sqlalchemy import select

from backend.data_manipulation import detect_patterns, process_stock_data
from backend.data_pull import fetch_incremental_ohlcv, fetch_write_financial_data, get_sp500_table
from backend.database import CombinedStockData, database
from backend.models import (
    AlertCreate,
    AlertOut,
    CompanyInfo,
    CorrelationMatrix,
    EarningsEvent,
    HeatmapNode,
    MarketBreadth,
    NewsItem,
    OptionsChain,
    PatternSignal,
    PeerRow,
    PortfolioCreate,
    PortfolioOut,
    PositionCreate,
    PositionOut,
    ScreenerRow,
    SearchResult,
    SectorRotationRow,
    StockData,
    StockGroupings,
    WatchlistCreate,
    WatchlistOut,
)

DB_PATH = os.getenv("DB_PATH", "stock_data.db")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3.5:cloud")
OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
IS_PRODUCTION = os.getenv("ENV", "development") == "production"
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:8000,http://localhost:3000,https://batesstocks.com,https://www.batesstocks.com",
).split(",")


def safe_convert(value: str | int | float, target_type: type):
    if value == "N/A" or value is None:
        return None
    try:
        return target_type(value)
    except (ValueError, TypeError):
        return None


def _create_user_tables():
    """Create watchlist/portfolio tables idempotently on startup."""
    conn = sqlite3.connect(DB_PATH)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS watchlists (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT    NOT NULL UNIQUE,
            tickers    TEXT    NOT NULL DEFAULT '[]',
            created_at TEXT    DEFAULT (datetime('now')),
            updated_at TEXT    DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS portfolios (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT    NOT NULL,
            created_at TEXT    DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS positions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            portfolio_id INTEGER NOT NULL,
            ticker       TEXT    NOT NULL,
            shares       REAL    NOT NULL,
            cost_basis   REAL    NOT NULL,
            purchased_at TEXT,
            notes        TEXT
        );
        CREATE TABLE IF NOT EXISTS alerts (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker       TEXT NOT NULL,
            metric       TEXT NOT NULL,
            condition    TEXT NOT NULL,
            threshold    REAL NOT NULL,
            triggered    INTEGER DEFAULT 0,
            triggered_at TEXT DEFAULT NULL,
            created_at   TEXT DEFAULT (datetime('now')),
            notes        TEXT
        );
        CREATE TABLE IF NOT EXISTS pattern_signals (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker       TEXT NOT NULL,
            detected_at  TEXT NOT NULL,
            pattern_type TEXT NOT NULL,
            level        REAL,
            confidence   REAL,
            notes        TEXT,
            created_at   TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_ticker_data_ticker_date ON ticker_data (Ticker, Date);
        CREATE INDEX IF NOT EXISTS idx_stock_data_ticker_date  ON stock_data  (Ticker, Date);
        CREATE INDEX IF NOT EXISTS idx_stock_data_date         ON stock_data  (Date);
        CREATE INDEX IF NOT EXISTS idx_pattern_ticker_date ON pattern_signals (ticker, detected_at);
    """)
    conn.commit()
    conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger

    await database.connect()
    _create_user_tables()

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

    if not _db_has_data():
        import threading

        threading.Thread(target=run_full_pipeline, daemon=True).start()
    else:
        pipeline_status["phase"] = "complete"
        await build_search_index()

    # Daily incremental refresh at 18:30 ET (after market close)
    scheduler = BackgroundScheduler(timezone="US/Eastern")
    scheduler.add_job(
        run_daily_update,
        CronTrigger(hour=18, minute=30, timezone="US/Eastern"),
        id="daily_update",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler started — daily update at 18:30 US/Eastern")

    yield

    scheduler.shutdown(wait=False)
    await database.disconnect()
    redis.close()


limiter = Limiter(key_func=get_remote_address)
app = FastAPI(lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

if os.path.isdir("frontend/build/static"):
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


def create_signal_views(conn: sqlite3.Connection):
    cursor = conn.cursor()
    cursor.executescript("""
DROP VIEW IF EXISTS signals_view;
CREATE VIEW signals_view AS
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
FROM signals;

DROP VIEW IF EXISTS golden_death_cross_view;
CREATE VIEW golden_death_cross_view AS
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
WHERE CrossSignal IS NOT NULL;

DROP VIEW IF EXISTS bollinger_breakouts_view;
CREATE VIEW bollinger_breakouts_view AS
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
FROM bollinger_data WHERE BollingerSignal IS NOT NULL;

DROP VIEW IF EXISTS volume_breakout_view;
CREATE VIEW volume_breakout_view AS
WITH volume_data AS (
    SELECT Date, Ticker, Ticker_Volume,
        AVG(Ticker_Volume) OVER (PARTITION BY Ticker ORDER BY Date ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING) AS Avg_Volume,
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
FROM volume_data WHERE Ticker_Volume > Avg_Volume * 2;

DROP VIEW IF EXISTS macd_histogram_reversal_view;
CREATE VIEW macd_histogram_reversal_view AS
WITH macd_data AS (
    SELECT Date, Ticker, Ticker_MACD_Diff,
        LAG(Ticker_MACD_Diff, 1) OVER (PARTITION BY Ticker ORDER BY Date) AS Prev_MACD_Diff,
        Ticker_Close,
        LEAD(Ticker_Close, 1) OVER (PARTITION BY Ticker ORDER BY Date) AS Next_Close
    FROM combined_stock_data
)
SELECT Date, Ticker, Ticker_MACD_Diff,
    CASE
        WHEN Ticker_MACD_Diff > 0 AND Prev_MACD_Diff <= 0 THEN 'MACD Histogram Reversal (Potential Buy)'
        WHEN Ticker_MACD_Diff < 0 AND Prev_MACD_Diff >= 0 THEN 'MACD Histogram Reversal (Potential Sell)'
    END AS MACDReversal,
    Ticker_Close, Next_Close,
    CASE WHEN Next_Close IS NOT NULL
        THEN ROUND(((Next_Close - Ticker_Close) / Ticker_Close) * 100, 2)
        ELSE NULL END AS Performance
FROM macd_data WHERE MACDReversal IS NOT NULL;
""")
    conn.commit()


def _build_search_index_sync():
    """Populate prefix_index from the database synchronously (safe to call from any thread)."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT Ticker, FullName FROM combined_stock_data")
        rows = cursor.fetchall()
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

        conn = sqlite3.connect(DB_PATH)
        _run_phase(conn, table, priority, append=False)
        conn.close()
        pipeline_status["loaded"] = len(priority)
        logger.info("Phase 1 complete: %d priority tickers loaded", len(priority))

        pipeline_status["phase"] = "full_load"
        conn = sqlite3.connect(DB_PATH)
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
        for pattern in ("stock_data:*", "heatmap:*", "groupings:*", "screener:*"):
            keys = redis.keys(pattern)
            if keys:
                redis.delete(*keys)
        logger.info("Redis cache flushed after daily update")
    except Exception as e:
        logger.warning("Cache flush failed: %s", e)


def _evaluate_alerts(conn: sqlite3.Connection):
    pending = conn.execute(
        "SELECT id, ticker, metric, condition, threshold FROM alerts WHERE triggered=0"
    ).fetchall()
    for aid, ticker, metric, cond, threshold in pending:
        try:
            row = conn.execute(
                f"SELECT {metric} FROM combined_stock_data WHERE Ticker=? ORDER BY Date DESC LIMIT 1",
                (ticker,),
            ).fetchone()
            if not row or row[0] is None:
                continue
            val = float(row[0])
            if (cond == "above" and val > threshold) or (cond == "below" and val < threshold):
                conn.execute(
                    "UPDATE alerts SET triggered=1, triggered_at=datetime('now') WHERE id=?",
                    (aid,),
                )
        except Exception as e:
            logger.warning("Alert eval error id=%s: %s", aid, e)
    conn.commit()


def run_daily_update():
    """Incremental daily refresh — appends only new OHLCV rows since the last stored date."""
    if pipeline_status["running"]:
        logger.info("Daily update skipped: pipeline already running")
        return

    pipeline_status.update({"running": True, "phase": "daily_update", "loaded": 0, "total": 0})
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT Ticker FROM stock_information")
        tickers = [row[0] for row in cursor.fetchall()]

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
        else:
            conn.close()
            logger.info("Daily update: no new data to process")

        pipeline_status["phase"] = "complete"
    except Exception as e:
        logger.error("Daily update error: %s", e)
        pipeline_status["phase"] = "error"
    finally:
        pipeline_status["running"] = False


def _db_has_data() -> bool:
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM combined_stock_data LIMIT 1")
        count = cursor.fetchone()[0]
        conn.close()
        return count > 0
    except Exception:
        return False


def _get_bullish_groupings_from_db() -> dict:
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        momentum = [
            r[0]
            for r in cursor.execute("""
            SELECT Ticker FROM combined_stock_data
            WHERE Date = (SELECT MAX(Date) FROM combined_stock_data)
            AND Ticker_Close > Ticker_SMA_10 AND Ticker_SMA_10 > Ticker_SMA_30
            AND Ticker_RSI > 50 AND Ticker_MACD > Ticker_MACD_Signal
            ORDER BY (Ticker_Close / Ticker_SMA_10) DESC LIMIT 9
        """).fetchall()
        ]

        breakout = [
            r[0]
            for r in cursor.execute("""
            SELECT Ticker FROM combined_stock_data
            WHERE Date = (SELECT MAX(Date) FROM combined_stock_data)
            AND Ticker_Close > Ticker_Bollinger_High
            AND Ticker_Volume > Ticker_SMA_30 * 1.5
            AND Ticker_Williams_R > -20
            ORDER BY (Ticker_Close / Ticker_Bollinger_High) DESC LIMIT 9
        """).fetchall()
        ]

        trend_strength = [
            r[0]
            for r in cursor.execute("""
            SELECT Ticker FROM combined_stock_data
            WHERE Date = (SELECT MAX(Date) FROM combined_stock_data)
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

_ip_request_conn: sqlite3.Connection | None = None


def _get_ip_conn() -> sqlite3.Connection:
    global _ip_request_conn
    if _ip_request_conn is None:
        _ip_request_conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _ip_request_conn.execute(
            "CREATE TABLE IF NOT EXISTS ip_requests "
            "(ip TEXT PRIMARY KEY, requests_used INTEGER DEFAULT 0)"
        )
        _ip_request_conn.commit()
    return _ip_request_conn


def ip_has_requests(ip: str) -> bool:
    conn = _get_ip_conn()
    row = conn.execute("SELECT requests_used FROM ip_requests WHERE ip = ?", (ip,)).fetchone()
    if row is None:
        return True
    return row[0] < IP_REQUEST_LIMIT


def ip_record_request(ip: str) -> None:
    conn = _get_ip_conn()
    conn.execute(
        "INSERT INTO ip_requests (ip, requests_used) VALUES (?, 1) "
        "ON CONFLICT(ip) DO UPDATE SET requests_used = requests_used + 1",
        (ip,),
    )
    conn.commit()


# ── AI chat ────────────────────────────────────────────────────────────────────


class AiChatRequest(BaseModel):
    provider: str
    model: str
    api_key: str | None = None
    message: str
    context: dict | None = None


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

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            if provider == "ollama":
                ollama_headers = {}
                if OLLAMA_API_KEY:
                    ollama_headers["Authorization"] = f"Bearer {OLLAMA_API_KEY}"
                resp = await client.post(
                    f"{OLLAMA_HOST}/api/chat",
                    headers=ollama_headers,
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": body.message},
                        ],
                        "stream": False,
                        "think": False,
                    },
                )
                resp.raise_for_status()
                if IS_PRODUCTION:
                    ip_record_request(client_ip)
                return {"response": resp.json()["message"]["content"]}

            elif provider == "anthropic":
                if not body.api_key:
                    raise HTTPException(status_code=400, detail="API key required for Anthropic")
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": body.api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": model,
                        "max_tokens": 1024,
                        "system": system_prompt,
                        "messages": [{"role": "user", "content": body.message}],
                    },
                )
                if resp.status_code != 200:
                    raise HTTPException(status_code=resp.status_code, detail=resp.text)
                return {"response": resp.json()["content"][0]["text"]}

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
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": body.message},
                        ],
                    },
                )
                if resp.status_code != 200:
                    raise HTTPException(status_code=resp.status_code, detail=resp.text)
                return {"response": resp.json()["choices"][0]["message"]["content"]}

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
async def refresh_data(request: Request, background_tasks: BackgroundTasks):
    if pipeline_status["running"]:
        return {"status": "already_running", "message": "Data refresh already in progress"}
    background_tasks.add_task(run_full_pipeline)
    return {"status": "started", "message": "Data refresh started in background"}


@app.get("/refresh_status")
@limiter.limit("20/minute")
async def refresh_status(request: Request):
    return pipeline_status


@app.get("/stock/{ticker}", response_model=list[StockData])
@limiter.limit("60/minute")
async def get_stock_data(
    request: Request,
    ticker: str,
    start_date: str | None = None,
    end_date: str | None = None,
    metrics: list[str] | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=1000),
):
    cache_key = f"stock_data:{ticker}:{start_date}:{end_date}:{page}:{page_size}"
    cached_data = redis.get(cache_key)

    if cached_data:
        return json.loads(cached_data)

    selected_metrics = [
        CombinedStockData.Date,
        CombinedStockData.Ticker,
        CombinedStockData.Ticker_Open,
        CombinedStockData.Ticker_Close,
        CombinedStockData.Ticker_High,
        CombinedStockData.Ticker_Low,
        CombinedStockData.Ticker_Volume,
        CombinedStockData.Ticker_SMA_10,
        CombinedStockData.Ticker_EMA_10,
        CombinedStockData.Ticker_SMA_30,
        CombinedStockData.Ticker_EMA_30,
        CombinedStockData.Ticker_RSI,
        CombinedStockData.Ticker_Stochastic_K,
        CombinedStockData.Ticker_Stochastic_D,
        CombinedStockData.Ticker_MACD,
        CombinedStockData.Ticker_MACD_Signal,
        CombinedStockData.Ticker_MACD_Diff,
        CombinedStockData.Ticker_TSI,
        CombinedStockData.Ticker_UO,
        CombinedStockData.Ticker_ROC,
        CombinedStockData.Ticker_Williams_R,
        CombinedStockData.Ticker_Bollinger_High,
        CombinedStockData.Ticker_Bollinger_Low,
        CombinedStockData.Ticker_Bollinger_Mid,
        CombinedStockData.Ticker_Bollinger_PBand,
        CombinedStockData.Ticker_Bollinger_WBand,
        CombinedStockData.Ticker_On_Balance_Volume,
        CombinedStockData.Ticker_Chaikin_MF,
        CombinedStockData.Ticker_Force_Index,
        CombinedStockData.Ticker_MFI,
    ]

    query = select(*selected_metrics).where(CombinedStockData.Ticker == ticker)

    if start_date:
        start_date_obj = datetime.datetime.strptime(start_date, "%Y-%m-%d")
        query = query.where(CombinedStockData.Date >= start_date_obj)
    if end_date:
        end_date_obj = datetime.datetime.strptime(end_date, "%Y-%m-%d")
        query = query.where(CombinedStockData.Date <= end_date_obj)

    query = query.order_by(CombinedStockData.Date.desc())
    result = await database.fetch_all(query)

    stock_data = [
        StockData(
            Date=record["Date"].strftime("%Y-%m-%d"),
            **{k: record[k] for k in record.keys() if k != "Date"},
        )
        for record in result
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

    query = select(
        CombinedStockData.Ticker,
        CombinedStockData.FullName,
        CombinedStockData.Sector,
        CombinedStockData.Subsector,
        CombinedStockData.MarketCap,
        CombinedStockData.Country,
        CombinedStockData.Website,
        CombinedStockData.Description,
        CombinedStockData.CEO,
        CombinedStockData.Employees,
        CombinedStockData.City,
        CombinedStockData.State,
        CombinedStockData.Zip,
        CombinedStockData.Address,
        CombinedStockData.Phone,
        CombinedStockData.Exchange,
        CombinedStockData.Currency,
        CombinedStockData.QuoteType,
        CombinedStockData.ShortName,
        CombinedStockData.Price,
        CombinedStockData.DividendRate,
        CombinedStockData.DividendYield,
        CombinedStockData.PayoutRatio,
        CombinedStockData.Beta,
        CombinedStockData.PE,
        CombinedStockData.EPS,
        CombinedStockData.Revenue,
        CombinedStockData.GrossProfit,
        CombinedStockData.FreeCashFlow,
    ).where(CombinedStockData.Ticker == ticker)

    result = await database.fetch_one(query)
    if not result:
        raise HTTPException(status_code=404, detail="Company not found")

    company_data = dict(result)
    for key, value in company_data.items():
        if key in ["MarketCap", "Employees", "Revenue", "GrossProfit", "FreeCashFlow"]:
            company_data[key] = safe_convert(value, int)
        elif key in ["Price", "DividendRate", "DividendYield", "PayoutRatio", "Beta", "PE", "EPS"]:
            company_data[key] = safe_convert(value, float)

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
        conn = sqlite3.connect(DB_PATH)
        rows = conn.execute("SELECT Ticker, FullName FROM stock_information").fetchall()
        conn.close()
        today = datetime.date.today()
        end_d = today + datetime.timedelta(days=days_ahead)
        results = []
        for ticker, name in rows:
            try:
                cal = yf.Ticker(ticker).calendar
                if cal is None or cal.empty:
                    continue
                for col in cal.columns:
                    if "Earnings Date" not in col:
                        continue
                    for ed in cal[col].dropna():
                        d = pd.Timestamp(ed).date()
                        if today <= d <= end_d:
                            est = (
                                cal.get("EPS Estimate", pd.Series([None])).iloc[0]
                                if "EPS Estimate" in cal
                                else None
                            )
                            results.append(
                                EarningsEvent(
                                    ticker=ticker,
                                    company_name=name,
                                    earnings_date=str(d),
                                    eps_estimate=float(est)
                                    if est is not None and pd.notna(est)
                                    else None,
                                )
                            )
            except Exception:
                continue
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
        conn = sqlite3.connect(DB_PATH)
        sub_row = conn.execute(
            "SELECT Subsector FROM stock_information WHERE Ticker=?", (ticker.upper(),)
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
                    WHERE Date <= date(
                        (SELECT MAX(Date) FROM combined_stock_data), '-1 year'
                    )
                )
            )
            SELECT l.Ticker, l.FullName,
                CAST(NULLIF(l.MarketCap,'N/A') AS REAL) AS mc,
                CAST(NULLIF(l.PE,'N/A') AS REAL) AS pe,
                CAST(NULLIF(l.EPS,'N/A') AS REAL) AS eps,
                CAST(NULLIF(l.Beta,'N/A') AS REAL) AS beta,
                l.Ticker_RSI, l.Ticker_Tech_Score,
                CASE WHEN y.prev_close > 0
                     THEN ROUND((l.Ticker_Close - y.prev_close) / y.prev_close * 100, 2)
                     ELSE NULL END AS ret52w
            FROM latest l LEFT JOIN year_ago y ON y.Ticker = l.Ticker
            ORDER BY mc DESC NULLS LAST
            LIMIT 15
        """,
            (subsector,),
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
        conn = sqlite3.connect(DB_PATH)
        rows = conn.execute(
            f"""
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
                    WHERE Date <= date((SELECT MAX(Date) FROM combined_stock_data), '-{days} days')
                )
                GROUP BY Sector
            )
            SELECT l.Sector,
                   ROUND((l.cn - p.cp) / NULLIF(p.cp, 0) * 100, 2),
                   l.ar, l.at
            FROM latest l LEFT JOIN past p ON l.Sector = p.Sector
            WHERE l.Sector IS NOT NULL AND l.Sector != ''
            ORDER BY ROUND((l.cn - p.cp) / NULLIF(p.cp, 0) * 100, 2) DESC NULLS LAST
        """
        ).fetchall()
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
        conn = sqlite3.connect(DB_PATH)
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
                WHERE Date >= date((SELECT MAX(Date) FROM combined_stock_data), '-1 year')
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
        conn = sqlite3.connect(DB_PATH)
        rows = conn.execute(
            f"SELECT Date, Ticker, Ticker_Close FROM combined_stock_data "
            f"WHERE Ticker IN ({placeholders}) "
            f"AND Date >= date((SELECT MAX(Date) FROM combined_stock_data), '-{days} days') "
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


@app.get("/alerts", response_model=list[AlertOut])
async def list_alerts(request: Request):
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT id,ticker,metric,condition,threshold,triggered,triggered_at,created_at,notes FROM alerts ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    keys = [
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
    return [dict(zip(keys, r)) for r in rows]


@app.post("/alerts", response_model=AlertOut)
async def create_alert(request: Request, body: AlertCreate):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.execute(
        "INSERT INTO alerts (ticker,metric,condition,threshold,notes) VALUES (?,?,?,?,?)",
        (body.ticker.upper(), body.metric, body.condition, body.threshold, body.notes),
    )
    rid = cur.lastrowid
    conn.commit()
    row = conn.execute(
        "SELECT id,ticker,metric,condition,threshold,triggered,triggered_at,created_at,notes FROM alerts WHERE id=?",
        (rid,),
    ).fetchone()
    conn.close()
    keys = [
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
    return dict(zip(keys, row))


@app.delete("/alerts/{alert_id}")
async def delete_alert(request: Request, alert_id: int):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM alerts WHERE id=?", (alert_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@app.get("/patterns/{ticker}", response_model=list[PatternSignal])
@limiter.limit("20/minute")
async def get_ticker_patterns(request: Request, ticker: str, days: int = Query(7, ge=1, le=30)):
    cache_key = f"patterns:{ticker}:{days}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT id,ticker,detected_at,pattern_type,level,confidence,notes FROM pattern_signals "
        "WHERE ticker=? AND detected_at >= date('now', ?) ORDER BY detected_at DESC, confidence DESC",
        (ticker.upper(), f"-{days} days"),
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
    conn = sqlite3.connect(DB_PATH)
    if pattern_type:
        rows = conn.execute(
            "SELECT id,ticker,detected_at,pattern_type,level,confidence,notes FROM pattern_signals "
            "WHERE pattern_type=? AND detected_at >= date('now', ?) ORDER BY confidence DESC LIMIT 100",
            (pattern_type, f"-{days} days"),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT id,ticker,detected_at,pattern_type,level,confidence,notes FROM pattern_signals "
            "WHERE detected_at >= date('now', ?) ORDER BY confidence DESC LIMIT 100",
            (f"-{days} days",),
        ).fetchall()
    conn.close()
    keys = ["id", "ticker", "detected_at", "pattern_type", "level", "confidence", "notes"]
    result = [dict(zip(keys, r)) for r in rows]
    redis.set(cache_key, json.dumps(result), ex=1800)
    return result


@app.get("/groupings", response_model=StockGroupings)
@limiter.limit("20/minute")
async def get_stock_groupings(request: Request):
    return _get_bullish_groupings_from_db()


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
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        if level == "sector":
            rows = cursor.execute(f"""
                SELECT
                    t.Sector,
                    SUM(CAST(NULLIF(t.MarketCap, 'N/A') AS REAL)) AS market_cap,
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
            rows = cursor.execute(
                f"""
                SELECT
                    t.Subsector,
                    SUM(CAST(NULLIF(t.MarketCap, 'N/A') AS REAL)) AS market_cap,
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
                (sector,),
            ).fetchall()
            result = [
                {"name": r[0], "market_cap": r[1], "pct_change": r[2], "ticker": None}
                for r in rows
                if r[0]
            ]

        elif level == "stock":
            if not subsector:
                raise HTTPException(status_code=400, detail="subsector required for stock level")
            rows = cursor.execute(
                f"""
                SELECT
                    t.Ticker,
                    t.FullName,
                    CAST(NULLIF(t.MarketCap, 'N/A') AS REAL) AS market_cap,
                    (t.Ticker_Close - p.Ticker_Close) / NULLIF(p.Ticker_Close, 0) * 100 AS pct_change
                FROM combined_stock_data t
                LEFT JOIN combined_stock_data p
                    ON p.Ticker = t.Ticker AND p.Date = {prev_date_sql}
                WHERE t.Date = {latest_date_sql}
                  AND t.Subsector = ?
                ORDER BY market_cap DESC
            """,
                (subsector,),
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
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        rows = cursor.execute("""
            WITH latest AS (
                SELECT * FROM combined_stock_data
                WHERE Date = (SELECT MAX(Date) FROM combined_stock_data)
            ),
            year_ago AS (
                SELECT Ticker, Ticker_Close AS year_ago_close
                FROM combined_stock_data
                WHERE Date = (
                    SELECT MAX(Date) FROM combined_stock_data
                    WHERE Date <= date(
                        (SELECT MAX(Date) FROM combined_stock_data), '-1 year'
                    )
                )
            )
            SELECT
                l.Ticker,
                l.FullName,
                l.Sector,
                l.Subsector,
                CAST(NULLIF(l.MarketCap, 'N/A') AS REAL)  AS market_cap,
                CAST(NULLIF(l.PE,        'N/A') AS REAL)  AS pe,
                CAST(NULLIF(l.EPS,       'N/A') AS REAL)  AS eps,
                CAST(NULLIF(l.Beta,      'N/A') AS REAL)  AS beta,
                l.Ticker_RSI                              AS rsi,
                l.Ticker_Close                            AS latest_close,
                CASE
                    WHEN y.year_ago_close IS NOT NULL AND y.year_ago_close > 0
                    THEN ROUND((l.Ticker_Close - y.year_ago_close) / y.year_ago_close * 100, 2)
                    ELSE NULL
                END AS return_52w,
                l.Ticker_Tech_Score                       AS tech_score
            FROM latest l
            LEFT JOIN year_ago y ON y.Ticker = l.Ticker
            WHERE l.Ticker IS NOT NULL
            ORDER BY market_cap DESC
        """).fetchall()
        conn.close()

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
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT id, name, tickers, created_at, updated_at FROM watchlists ORDER BY updated_at DESC"
    ).fetchall()
    conn.close()
    return [_row_to_watchlist(r) for r in rows]


@app.post("/watchlists", response_model=WatchlistOut)
@limiter.limit("30/minute")
async def create_watchlist(request: Request, body: WatchlistCreate):
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.execute(
            "INSERT INTO watchlists (name, tickers) VALUES (?, ?)",
            (body.name, json.dumps(body.tickers)),
        )
        row_id = cursor.lastrowid
        conn.commit()
        row = conn.execute(
            "SELECT id, name, tickers, created_at, updated_at FROM watchlists WHERE id = ?",
            (row_id,),
        ).fetchone()
        conn.close()
        return _row_to_watchlist(row)
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=409, detail="Watchlist name already exists")


@app.get("/watchlists/{wl_id}", response_model=WatchlistOut)
@limiter.limit("60/minute")
async def get_watchlist(request: Request, wl_id: int):
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT id, name, tickers, created_at, updated_at FROM watchlists WHERE id = ?",
        (wl_id,),
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    return _row_to_watchlist(row)


@app.put("/watchlists/{wl_id}", response_model=WatchlistOut)
@limiter.limit("30/minute")
async def update_watchlist(request: Request, wl_id: int, body: WatchlistCreate):
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "UPDATE watchlists SET name=?, tickers=?, updated_at=datetime('now') WHERE id=?",
        (body.name, json.dumps(body.tickers), wl_id),
    )
    conn.commit()
    row = conn.execute(
        "SELECT id, name, tickers, created_at, updated_at FROM watchlists WHERE id = ?",
        (wl_id,),
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    return _row_to_watchlist(row)


@app.delete("/watchlists/{wl_id}")
@limiter.limit("30/minute")
async def delete_watchlist(request: Request, wl_id: int):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM watchlists WHERE id = ?", (wl_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ── Portfolio ──────────────────────────────────────────────────────────────────


def _get_portfolio_with_positions(portfolio_id: int) -> dict | None:
    conn = sqlite3.connect(DB_PATH)
    port_row = conn.execute(
        "SELECT id, name, created_at FROM portfolios WHERE id = ?", (portfolio_id,)
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
        (portfolio_id,),
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
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute("SELECT id, name, created_at FROM portfolios ORDER BY id").fetchall()
    conn.close()
    return [{"id": r[0], "name": r[1], "created_at": r[2]} for r in rows]


@app.post("/portfolios")
@limiter.limit("30/minute")
async def create_portfolio(request: Request, body: PortfolioCreate):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.execute("INSERT INTO portfolios (name) VALUES (?)", (body.name,))
    row_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return _get_portfolio_with_positions(row_id)


@app.get("/portfolios/{portfolio_id}", response_model=PortfolioOut)
@limiter.limit("60/minute")
async def get_portfolio(request: Request, portfolio_id: int):
    result = _get_portfolio_with_positions(portfolio_id)
    if not result:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return result


@app.post("/portfolios/{portfolio_id}/positions", response_model=PositionOut)
@limiter.limit("30/minute")
async def add_position(request: Request, portfolio_id: int, body: PositionCreate):
    conn = sqlite3.connect(DB_PATH)
    port = conn.execute("SELECT id FROM portfolios WHERE id = ?", (portfolio_id,)).fetchone()
    if not port:
        conn.close()
        raise HTTPException(status_code=404, detail="Portfolio not found")
    cursor = conn.execute(
        "INSERT INTO positions (portfolio_id, ticker, shares, cost_basis, purchased_at, notes) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            portfolio_id,
            body.ticker.upper(),
            body.shares,
            body.cost_basis,
            body.purchased_at,
            body.notes,
        ),
    )
    pos_id = cursor.lastrowid
    conn.commit()
    conn.close()
    portfolio = _get_portfolio_with_positions(portfolio_id)
    pos = next((p for p in portfolio["positions"] if p["id"] == pos_id), None)
    if not pos:
        raise HTTPException(status_code=500, detail="Position creation failed")
    return pos


@app.put("/portfolios/{portfolio_id}/positions/{pos_id}", response_model=PositionOut)
@limiter.limit("30/minute")
async def update_position(request: Request, portfolio_id: int, pos_id: int, body: PositionCreate):
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "UPDATE positions SET ticker=?, shares=?, cost_basis=?, purchased_at=?, notes=? "
        "WHERE id=? AND portfolio_id=?",
        (
            body.ticker.upper(),
            body.shares,
            body.cost_basis,
            body.purchased_at,
            body.notes,
            pos_id,
            portfolio_id,
        ),
    )
    conn.commit()
    conn.close()
    portfolio = _get_portfolio_with_positions(portfolio_id)
    pos = next((p for p in portfolio["positions"] if p["id"] == pos_id), None)
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")
    return pos


@app.delete("/portfolios/{portfolio_id}/positions/{pos_id}")
@limiter.limit("30/minute")
async def delete_position(request: Request, portfolio_id: int, pos_id: int):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM positions WHERE id = ? AND portfolio_id = ?", (pos_id, portfolio_id))
    conn.commit()
    conn.close()
    return {"ok": True}


@app.get("/portfolios/{portfolio_id}/chart")
@limiter.limit("20/minute")
async def get_portfolio_chart(
    request: Request, portfolio_id: int, days: int = Query(90, ge=7, le=1825)
):
    cache_key = f"portfolio_chart:{portfolio_id}:{days}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)

    try:
        conn = sqlite3.connect(DB_PATH)
        has_positions = conn.execute(
            "SELECT COUNT(*) FROM positions WHERE portfolio_id = ?", (portfolio_id,)
        ).fetchone()[0]
        if not has_positions:
            conn.close()
            return []

        rows = conn.execute(
            """
            SELECT csd.Date, SUM(p.shares * csd.Ticker_Close) AS portfolio_value
            FROM positions p
            JOIN combined_stock_data csd ON csd.Ticker = p.ticker
            WHERE p.portfolio_id = ?
              AND csd.Date >= date(
                  (SELECT MAX(Date) FROM combined_stock_data), ? || ' days'
              )
            GROUP BY csd.Date
            ORDER BY csd.Date
        """,
            (portfolio_id, f"-{days}"),
        ).fetchall()
        conn.close()

        result = [{"date": str(r[0])[:10], "value": round(float(r[1]), 2)} for r in rows]
        redis.set(cache_key, json.dumps(result), ex=600)
        return result
    except Exception as e:
        logger.error("Portfolio chart error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/{full_path:path}", response_class=HTMLResponse)
async def catch_all(full_path: str):
    with open(os.path.join("frontend/build", "index.html")) as f:
        return f.read()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=os.getenv("APP_HOST", "0.0.0.0"), port=int(os.getenv("APP_PORT", 8000)))
