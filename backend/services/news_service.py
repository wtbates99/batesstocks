from __future__ import annotations

import json
import re
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
    text = str(value).strip()
    return text if text else None


def _normalize_item(raw: dict[str, object], ticker: str | None = None) -> NewsItem | None:
    # New yfinance format (>=0.2.37): top-level keys are 'id' and 'content' (nested dict)
    content_block = raw.get("content")
    if isinstance(content_block, dict):
        title = str(content_block.get("title") or "").strip()
        canonical = content_block.get("canonicalUrl") or content_block.get("clickThroughUrl") or {}
        link = str(canonical.get("url") if isinstance(canonical, dict) else canonical or "").strip()
        if not link or not title:
            return None
        summary = (
            str(content_block.get("summary") or content_block.get("description") or "").strip()
            or None
        )
        provider_obj = content_block.get("provider") or {}
        publisher = (
            str(
                provider_obj.get("displayName")
                if isinstance(provider_obj, dict)
                else provider_obj or ""
            ).strip()
            or None
        )
        article_id = str(raw.get("id") or content_block.get("id") or link)
        published_at = _to_iso(content_block.get("pubDate") or content_block.get("displayTime"))
        article_ticker = str(ticker or "").upper() or None
        return NewsItem(
            id=article_id,
            ticker=article_ticker,
            title=title,
            summary=summary,
            publisher=publisher,
            link=link,
            published_at=published_at,
            related_tickers=[],
        )

    # Legacy yfinance format: flat structure with top-level 'link', 'title', etc.
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


def _score_and_annotate(item: NewsItem, request_tickers: set[str]) -> NewsItem:
    """Compute relevance_score, matched_tickers, and why for a news item against the request context."""
    if not request_tickers:
        return item

    matched: set[str] = set()
    score = 0.0

    # Direct ticker field match (strongest signal — fetched specifically for this ticker)
    if item.ticker and item.ticker.upper() in request_tickers:
        matched.add(item.ticker.upper())
        score += 50.0

    # Related tickers match (yfinance-provided association)
    for t in item.related_tickers:
        t_upper = t.upper()
        if t_upper in request_tickers:
            if t_upper not in matched:
                matched.add(t_upper)
            score += 25.0

    # Title word mentions (ticker token appears as a word boundary in title)
    title_upper = (item.title or "").upper()
    for ticker in request_tickers:
        if ticker not in matched and re.search(r"\b" + re.escape(ticker) + r"\b", title_upper):
            matched.add(ticker)
            score += 10.0

    # Recency bonus/penalty
    try:
        if item.published_at:
            pub_dt = datetime.fromisoformat(item.published_at.replace("Z", "+00:00"))
            age_hours = (_utc_now() - pub_dt).total_seconds() / 3600
            if age_hours <= 2:
                score += 20.0
            elif age_hours <= 8:
                score += 12.0
            elif age_hours <= 24:
                score += 6.0
            elif age_hours > 168:
                score -= 15.0
    except (ValueError, TypeError, OverflowError):
        pass

    # Build the why string
    matched_list = sorted(matched)
    why: str | None = None
    if matched_list:
        direct = (
            item.ticker.upper() if item.ticker and item.ticker.upper() in request_tickers else None
        )
        others = [t for t in matched_list if t != direct]
        if direct:
            why = f"Direct {direct} coverage"
            if others:
                why += f" · also mentions {', '.join(others[:2])}"
        else:
            why = f"Mentions {', '.join(matched_list[:3])}"

    return item.model_copy(
        update={
            "matched_tickers": matched_list,
            "relevance_score": round(max(0.0, score), 1),
            "why": why,
        }
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
    ticker_set = set(clean_tickers)

    cached = _read_cached_news(clean_tickers, limit * 2) if clean_tickers else []

    if len(cached) < limit and clean_tickers:
        fetched: dict[str, NewsItem] = {item.id: item for item in cached}
        for ticker in clean_tickers[:6]:
            for item in _fetch_ticker_news(ticker):
                fetched[item.id] = item
        raw_items = list(fetched.values())
        raw_items.sort(key=lambda i: i.published_at or "", reverse=True)
        _write_news_cache(raw_items[: limit * 2])
        cached = raw_items

    # Score and rank by context relevance
    scored = [_score_and_annotate(item, ticker_set) for item in cached]
    scored.sort(
        key=lambda i: (i.relevance_score or 0.0, i.published_at or ""),
        reverse=True,
    )

    return NewsResponse(
        generated_at=_utc_now().isoformat(),
        scope=scope,
        items=scored[:limit],
    )
