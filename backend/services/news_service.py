from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import yfinance as yf

from backend.core.duckdb import duckdb_connection
from backend.models import NewsItem, NewsResponse

NEWS_TTL_MINUTES = 15
MAX_PER_TICKER_FETCH = 12


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _to_iso(value: int | float | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=UTC).isoformat()
    text = str(value)
    return text if text else None


def _normalize_item(raw: dict[str, object], ticker: str | None = None) -> NewsItem | None:
    link = str(raw.get("link") or "").strip()
    title = str(raw.get("title") or "").strip()
    if not link or not title:
        return None

    related = raw.get("relatedTickers") or raw.get("related_tickers") or []
    if not isinstance(related, list):
        related = []
    related_tickers = [str(value).upper() for value in related if str(value).strip()]
    article_ticker = str(raw.get("ticker") or ticker or "").upper() or None
    article_id = str(raw.get("uuid") or raw.get("id") or link)
    summary = str(raw.get("summary") or raw.get("snippet") or "").strip() or None
    publisher = str(raw.get("publisher") or raw.get("provider") or "").strip() or None

    return NewsItem(
        id=article_id,
        ticker=article_ticker,
        title=title,
        summary=summary,
        publisher=publisher,
        link=link,
        published_at=_to_iso(raw.get("providerPublishTime") or raw.get("published_at")),
        related_tickers=related_tickers,
    )


def _read_cached_news(tickers: list[str], limit: int) -> list[NewsItem]:
    if not tickers:
        return []

    placeholders = ", ".join(["?"] * len(tickers))
    cutoff = _utc_now() - timedelta(minutes=NEWS_TTL_MINUTES)
    with duckdb_connection(read_only=True) as conn:
        rows = conn.execute(
            f"""
            SELECT id, ticker, title, summary, publisher, link, published_at, related_tickers
            FROM news_cache
            WHERE fetched_at >= ?
              AND (ticker IN ({placeholders}) OR ticker IS NULL)
            ORDER BY published_at DESC NULLS LAST, fetched_at DESC
            LIMIT ?
            """,
            [cutoff, *tickers, limit],
        ).fetchall()

    items: list[NewsItem] = []
    for row in rows:
        related = json.loads(row[7]) if row[7] else []
        items.append(
            NewsItem(
                id=str(row[0]),
                ticker=row[1],
                title=str(row[2]),
                summary=row[3],
                publisher=row[4],
                link=str(row[5]),
                published_at=None if row[6] is None else str(row[6]).replace(" ", "T"),
                related_tickers=related if isinstance(related, list) else [],
            )
        )
    return items


def _write_news_cache(items: list[NewsItem]) -> None:
    if not items:
        return

    fetched_at = _utc_now()
    with duckdb_connection() as conn:
        conn.executemany(
            """
            INSERT OR REPLACE INTO news_cache
            (id, ticker, title, summary, publisher, link, published_at, related_tickers, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    item.id,
                    item.ticker,
                    item.title,
                    item.summary,
                    item.publisher,
                    item.link,
                    item.published_at,
                    json.dumps(item.related_tickers),
                    fetched_at,
                )
                for item in items
            ],
        )


def _fetch_ticker_news(ticker: str) -> list[NewsItem]:
    try:
        raw_items = getattr(yf.Ticker(ticker), "news", None) or []
    except Exception:
        return []

    items: list[NewsItem] = []
    for raw in raw_items[:MAX_PER_TICKER_FETCH]:
        if not isinstance(raw, dict):
            continue
        item = _normalize_item(raw, ticker=ticker)
        if item is not None:
            items.append(item)
    return items


def get_news(scope: str, tickers: list[str] | None = None, limit: int = 12) -> NewsResponse:
    clean_tickers = sorted({ticker.upper() for ticker in (tickers or []) if ticker.strip()})
    cached = _read_cached_news(clean_tickers, limit) if clean_tickers else []

    if len(cached) < limit and clean_tickers:
        fetched: dict[str, NewsItem] = {item.id: item for item in cached}
        for ticker in clean_tickers[:6]:
            for item in _fetch_ticker_news(ticker):
                fetched[item.id] = item
        items = list(fetched.values())
        items.sort(key=lambda item: item.published_at or "", reverse=True)
        _write_news_cache(items[: limit * 2])
        cached = items[:limit]

    return NewsResponse(
        generated_at=_utc_now().isoformat(),
        scope=scope,
        items=cached[:limit],
    )
