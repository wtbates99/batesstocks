from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from sqlalchemy import select
from typing import List, Optional, Union
import datetime
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import os
import sqlite3
from backend.data_pull import fetch_write_financial_data, get_sp500_table
from backend.data_manipulation import process_stock_data
from backend.models import StockData, CompanyInfo, StockGroupings, SearchResult
from backend.database import database, CombinedStockData
import re
from collections import defaultdict
import json
import fakeredis
import httpx
from pydantic import BaseModel


def safe_convert(value: Union[str, int, float], target_type: type):
    if value == "N/A" or value is None:
        return None
    try:
        return target_type(value)
    except (ValueError, TypeError):
        return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis
    await database.connect()
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


app = FastAPI(lifespan=lifespan)

app.mount("/static", StaticFiles(directory="frontend/build/static"), name="static")

redis = None
prefix_index = defaultdict(set)

# Tickers loaded in phase 1 — fast startup so the default view works immediately.
# Must include the defaultTickers from HomePage.js.
PRIORITY_TICKERS = [
    'AAPL', 'GOOGL', 'AMZN', 'MSFT', 'TSLA', 'NKE', 'NVDA', 'NFLX', 'JPM',
    'META', 'AVGO', 'LLY', 'V',    'UNH',  'XOM',  'MA',   'COST', 'HD',
    'BAC',  'WMT',  'PG',  'AMD',  'ORCL', 'QCOM', 'TXN',  'CVX',  'MRK',
]

pipeline_status = {
    "running": False,
    "phase": "idle",   # idle | fast_load | full_load | complete
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
        conn = sqlite3.connect("stock_data.db")
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
        print(f"Search index build failed: {e}")


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

        pipeline_status.update({"running": True, "phase": "fast_load",
                                 "loaded": 0, "total": len(all_tickers)})

        conn = sqlite3.connect("stock_data.db")
        _run_phase(conn, table, priority, append=False)
        conn.close()
        pipeline_status["loaded"] = len(priority)

        pipeline_status["phase"] = "full_load"
        conn = sqlite3.connect("stock_data.db")
        _run_phase(conn, table, remaining, append=True)
        conn.close()
        pipeline_status["loaded"] = len(all_tickers)

        pipeline_status["phase"] = "complete"
    except Exception as e:
        print(f"Pipeline error: {e}")
        pipeline_status["phase"] = "error"
    finally:
        pipeline_status["running"] = False


def _db_has_data() -> bool:
    try:
        conn = sqlite3.connect("stock_data.db")
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM combined_stock_data LIMIT 1")
        count = cursor.fetchone()[0]
        conn.close()
        return count > 0
    except Exception:
        return False


def _get_bullish_groupings_from_db() -> dict:
    try:
        conn = sqlite3.connect("stock_data.db")
        cursor = conn.cursor()

        momentum = [r[0] for r in cursor.execute("""
            SELECT Ticker FROM combined_stock_data
            WHERE Date = (SELECT MAX(Date) FROM combined_stock_data)
            AND Ticker_Close > Ticker_SMA_10 AND Ticker_SMA_10 > Ticker_SMA_30
            AND Ticker_RSI > 50 AND Ticker_MACD > Ticker_MACD_Signal
            ORDER BY (Ticker_Close / Ticker_SMA_10) DESC LIMIT 9
        """).fetchall()]

        breakout = [r[0] for r in cursor.execute("""
            SELECT Ticker FROM combined_stock_data
            WHERE Date = (SELECT MAX(Date) FROM combined_stock_data)
            AND Ticker_Close > Ticker_Bollinger_High
            AND Ticker_Volume > Ticker_SMA_30 * 1.5
            AND Ticker_Williams_R > -20
            ORDER BY (Ticker_Close / Ticker_Bollinger_High) DESC LIMIT 9
        """).fetchall()]

        trend_strength = [r[0] for r in cursor.execute("""
            SELECT Ticker FROM combined_stock_data
            WHERE Date = (SELECT MAX(Date) FROM combined_stock_data)
            AND Ticker_TSI > 0 AND Ticker_UO > 50
            AND Ticker_MFI > 50 AND Ticker_Chaikin_MF > 0
            ORDER BY (Ticker_TSI + Ticker_UO + Ticker_MFI) DESC LIMIT 9
        """).fetchall()]

        conn.close()
        return {"momentum": momentum, "breakout": breakout, "trend_strength": trend_strength}
    except Exception:
        return {"momentum": [], "breakout": [], "trend_strength": []}


# ── AI chat ────────────────────────────────────────────────────────────────────

class AiChatRequest(BaseModel):
    provider: str
    model: str
    api_key: Optional[str] = None
    message: str
    context: Optional[dict] = None


def build_system_prompt(context: dict) -> str:
    tickers = context.get("tickers", [])
    date_range = context.get("dateRange", "recent period")
    metrics = context.get("metrics", [])
    data_summary = context.get("dataSummary", "")

    readable_metrics = ", ".join(
        m.replace("Ticker_", "").replace("_", " ") for m in metrics
    )

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


@app.post("/ai/chat")
async def ai_chat(request: AiChatRequest):
    system_prompt = build_system_prompt(request.context or {})

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            if request.provider == "ollama":
                resp = await client.post(
                    "http://localhost:11434/api/chat",
                    json={
                        "model": request.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": request.message},
                        ],
                        "stream": False,
                    },
                )
                resp.raise_for_status()
                return {"response": resp.json()["message"]["content"]}

            elif request.provider == "anthropic":
                if not request.api_key:
                    raise HTTPException(status_code=400, detail="API key required for Anthropic")
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": request.api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": request.model,
                        "max_tokens": 1024,
                        "system": system_prompt,
                        "messages": [{"role": "user", "content": request.message}],
                    },
                )
                if resp.status_code != 200:
                    raise HTTPException(status_code=resp.status_code, detail=resp.text)
                return {"response": resp.json()["content"][0]["text"]}

            elif request.provider == "openai":
                if not request.api_key:
                    raise HTTPException(status_code=400, detail="API key required for OpenAI")
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {request.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": request.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": request.message},
                        ],
                    },
                )
                if resp.status_code != 200:
                    raise HTTPException(status_code=resp.status_code, detail=resp.text)
                return {"response": resp.json()["choices"][0]["message"]["content"]}

            else:
                raise HTTPException(status_code=400, detail=f"Unknown provider: {request.provider}")

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


origins = [
    "http://localhost:8000",
    "http://localhost:3000",
    "https://batesstocks.com",
    "https://www.batesstocks.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def build_search_index():
    _build_search_index_sync()


# ── API routes ─────────────────────────────────────────────────────────────────

@app.post("/refresh_data")
async def refresh_data(background_tasks: BackgroundTasks):
    if pipeline_status["running"]:
        return {"status": "already_running", "message": "Data refresh already in progress"}
    background_tasks.add_task(run_full_pipeline)
    return {"status": "started", "message": "Data refresh started in background"}


@app.get("/refresh_status")
async def refresh_status():
    return pipeline_status


@app.get("/stock/{ticker}", response_model=List[StockData])
async def get_stock_data(
    ticker: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    metrics: Optional[List[str]] = Query(None),
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
async def get_company_info(ticker: str):
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
async def get_stock_groupings():
    return _get_bullish_groupings_from_db()


@app.get("/search", response_model=List[SearchResult])
async def search_companies(query: str):
    cache_key = f"search:{query}"
    cached_data = redis.get(cache_key)

    if cached_data:
        return json.loads(cached_data)

    term = query.lower().strip()
    # O(1) prefix index lookup — index already maps every prefix to matching items
    results = set(prefix_index.get(term, set()))

    sorted_results = sorted(
        results,
        key=lambda x: (
            not x[0].lower().startswith(term),   # exact ticker prefix first
            not x[1].lower().startswith(term),   # then company name prefix
            len(x[0]),                            # shorter tickers first
            x[0].lower(),
        ),
    )[:5]

    search_results = [
        SearchResult(ticker=ticker, name=full_name)
        for ticker, full_name in sorted_results
    ]

    redis.set(cache_key, json.dumps([sr.model_dump() for sr in search_results]), ex=3600)

    return search_results


@app.get("/{full_path:path}", response_class=HTMLResponse)
async def catch_all(full_path: str):
    with open(os.path.join("frontend/build", "index.html")) as f:
        return f.read()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
