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
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import select

from backend.data_manipulation import process_stock_data
from backend.data_pull import fetch_write_financial_data, get_sp500_table
from backend.database import CombinedStockData, database
from backend.models import (
    CompanyInfo,
    HeatmapNode,
    PortfolioCreate,
    PortfolioOut,
    PositionCreate,
    PositionOut,
    ScreenerRow,
    SearchResult,
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
    """)
    conn.commit()
    conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis
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
    yield
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
    row = conn.execute(
        "SELECT requests_used FROM ip_requests WHERE ip = ?", (ip,)
    ).fetchone()
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
                END AS return_52w
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
