from __future__ import annotations

import json
import logging
import os
import re
from asyncio import Lock, to_thread
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.api.terminal import router as terminal_router
from backend.core.duckdb import duckdb_connection, ensure_schema
from backend.models import LivePrices, SearchResult
from backend.services.data_sync_service import ensure_market_data, has_market_data, sync_market_data
from backend.services.sync_scheduler import MarketSyncScheduler

load_dotenv()

logger = logging.getLogger("batesstocks")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)

CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:8000,http://localhost:3000,https://batesstocks.com,https://www.batesstocks.com",
).split(",")
_SYNC_LOCK = Lock()


class PriceRequest(BaseModel):
    tickers: list[str] = Field(default_factory=list)


class AiMessage(BaseModel):
    role: str
    content: str


class AiChatRequest(BaseModel):
    provider: str | None = None
    model: str | None = None
    api_key: str | None = None
    messages: list[AiMessage]
    context: dict[str, object] | None = None


def _frontend_build_dir() -> Path:
    return Path("frontend/build")


def _frontend_index_html() -> Path:
    return _frontend_build_dir() / "index.html"


async def _run_scheduled_market_sync() -> None:
    async with _SYNC_LOCK:
        years = int(os.getenv("SCHEDULED_SYNC_YEARS", "2"))
        await to_thread(sync_market_data, None, years, "scheduled")


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_schema()
    scheduler: MarketSyncScheduler | None = None
    should_auto_sync = os.getenv("AUTO_SYNC_ON_START", "true").lower() == "true"
    if should_auto_sync:
        try:
            if not has_market_data():
                ensure_market_data(years=5, source="startup")
        except Exception as exc:  # pragma: no cover - startup/network dependent
            logger.warning("AUTO_SYNC_ON_START failed: %s", exc)
    should_schedule = os.getenv("AUTO_SYNC_SCHEDULED", "true").lower() == "true"
    if should_schedule:
        scheduler = MarketSyncScheduler(
            sync_callback=_run_scheduled_market_sync,
            poll_interval_seconds=float(os.getenv("SCHEDULED_SYNC_POLL_SECONDS", "300")),
        )
        scheduler.start()
    yield
    if scheduler is not None:
        await scheduler.stop()


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(terminal_router)

if (_frontend_build_dir() / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=_frontend_build_dir() / "assets"), name="assets")


@app.get("/search", response_model=list[SearchResult])
def search(
    query: str = Query(..., min_length=1), limit: int = Query(10, ge=1, le=25)
) -> list[SearchResult]:
    if not has_market_data():
        try:
            ensure_market_data(source="search")
        except Exception as exc:  # pragma: no cover - network/provider dependent
            logger.warning("Search bootstrap sync failed: %s", exc)
    pattern = f"%{query.strip().upper()}%"
    with duckdb_connection(read_only=True) as conn:
        rows = conn.execute(
            """
            SELECT
                Ticker AS ticker,
                COALESCE(FullName, ShortName, Ticker) AS name
            FROM stock_information
            WHERE UPPER(Ticker) LIKE ?
               OR UPPER(COALESCE(FullName, ShortName, '')) LIKE ?
            ORDER BY
                CASE WHEN UPPER(Ticker) = ? THEN 0 ELSE 1 END,
                CASE WHEN UPPER(Ticker) LIKE ? THEN 0 ELSE 1 END,
                Ticker
            LIMIT ?
            """,
            [pattern, pattern, query.strip().upper(), f"{query.strip().upper()}%", limit],
        ).fetchall()
    return [SearchResult(ticker=row[0], name=row[1]) for row in rows]


def _read_latest_prices(tickers: list[str]) -> LivePrices:
    cleaned = [ticker.strip().upper() for ticker in tickers if ticker.strip()]
    if not cleaned:
        return LivePrices(prices={}, timestamp="")
    try:
        ensure_market_data(cleaned, source="live_prices")
    except Exception as exc:  # pragma: no cover - network/provider dependent
        logger.warning("Live price bootstrap sync failed: %s", exc)
    placeholders = ", ".join(["?"] * len(cleaned))
    with duckdb_connection(read_only=True) as conn:
        rows = conn.execute(
            f"""
            WITH ranked AS (
                SELECT
                    Ticker,
                    Close,
                    Date,
                    ROW_NUMBER() OVER (PARTITION BY Ticker ORDER BY Date DESC) AS rn
                FROM ticker_data
                WHERE Ticker IN ({placeholders})
            )
            SELECT Ticker, Close, Date
            FROM ranked
            WHERE rn = 1
            """,
            cleaned,
        ).fetchall()
    timestamp = ""
    prices: dict[str, float | None] = {ticker: None for ticker in cleaned}
    for ticker, close, date in rows:
        prices[str(ticker)] = None if close is None else float(close)
        timestamp = max(timestamp, str(date))
    return LivePrices(prices=prices, timestamp=timestamp)


@app.get("/live-prices", response_model=LivePrices)
def get_live_prices(tickers: str = Query(..., min_length=1)) -> LivePrices:
    return _read_latest_prices(tickers.split(","))


@app.post("/live-prices", response_model=LivePrices)
def post_live_prices(request: PriceRequest) -> LivePrices:
    return _read_latest_prices(request.tickers)


@app.get("/health/live")
def health_live() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready")
def health_ready() -> dict[str, str]:
    ensure_schema()
    with duckdb_connection() as conn:
        conn.execute("SELECT 1").fetchone()
    return {"status": "ready"}


async def _call_openai(payload: AiChatRequest) -> str:
    key = payload.api_key or os.getenv("OPENAI_API_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured")
    model = payload.model or os.getenv("OPENAI_MODEL", "gpt-5-mini")
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={
                "model": model,
                "messages": [message.model_dump() for message in payload.messages],
            },
        )
        response.raise_for_status()
        data = response.json()
    return data["choices"][0]["message"]["content"]


async def _call_anthropic(payload: AiChatRequest) -> str:
    key = payload.api_key or os.getenv("ANTHROPIC_API_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is not configured")
    model = payload.model or os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-latest")
    system = "You are the integrated BATESSTOCKS terminal analyst. Use the supplied context."
    messages = [message.model_dump() for message in payload.messages]
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 1200,
                "system": system,
                "messages": messages,
            },
        )
        response.raise_for_status()
        data = response.json()
    return "".join(block["text"] for block in data["content"] if block["type"] == "text")


async def _call_ollama(payload: AiChatRequest) -> str:
    host = os.getenv("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
    if host.endswith("/api"):
        host = host[:-4]
    model = payload.model or os.getenv("OLLAMA_MODEL", "llama3.1")
    api_key = payload.api_key or os.getenv("OLLAMA_API_KEY", "")
    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    async with httpx.AsyncClient(timeout=120.0) as client:
        parts: list[str] = []
        async with client.stream(
            "POST",
            f"{host}/api/chat",
            headers=headers,
            json={
                "model": model,
                "stream": True,
                "think": False,
                "messages": [message.model_dump() for message in payload.messages],
            },
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue
                parts.append(chunk.get("message", {}).get("content", ""))
                if chunk.get("done"):
                    break

    raw = "".join(parts).strip()
    if "</think>" in raw:
        content = raw.split("</think>")[-1].strip()
    else:
        content = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    if not content:
        raise HTTPException(status_code=502, detail="Ollama returned empty response")
    return content


def _fallback_ai_response(payload: AiChatRequest) -> str:
    context = payload.context or {}
    context_json = json.dumps(context, default=str)[:600]
    user_prompt = payload.messages[-1].content if payload.messages else ""
    return (
        "AI provider unavailable.\n\n"
        f"Last prompt: {user_prompt}\n"
        f"Context snapshot: {context_json}\n\n"
        "Configure `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or a reachable `OLLAMA_HOST` "
        "to enable the integrated analyst."
    )


@app.post("/ai/chat")
async def ai_chat(payload: AiChatRequest) -> dict[str, str]:
    provider = (payload.provider or os.getenv("AI_PROVIDER", "ollama")).lower()
    try:
        if provider == "openai":
            content = await _call_openai(payload)
        elif provider == "anthropic":
            content = await _call_anthropic(payload)
        else:
            content = await _call_ollama(payload)
        return {"content": content}
    except Exception as exc:  # pragma: no cover - network/provider dependent
        logger.warning("AI provider failure: %s", exc)
        return {"content": _fallback_ai_response(payload)}


@app.get("/", response_class=HTMLResponse)
@app.get("/{full_path:path}", response_class=HTMLResponse)
def serve_frontend(full_path: str = "") -> HTMLResponse:
    index_html = _frontend_index_html()
    if index_html.is_file():
        return HTMLResponse(index_html.read_text(encoding="utf-8"))
    return HTMLResponse(
        "<html><body><h1>BATESSTOCKS</h1><p>Frontend build not found.</p></body></html>",
        status_code=503,
    )
