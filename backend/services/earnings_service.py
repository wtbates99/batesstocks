from __future__ import annotations

from datetime import UTC, datetime, timedelta
from threading import Lock

import yfinance as yf

from backend.models import EarningsItem, EarningsResponse

_CACHE: dict[str, tuple[EarningsItem, datetime]] = {}
_LOCK = Lock()
_TTL = timedelta(hours=6)


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _fetch_one(ticker: str) -> EarningsItem:
    try:
        cal = yf.Ticker(ticker).calendar
        if not cal or not isinstance(cal, dict):
            return EarningsItem(ticker=ticker)
        dates = cal.get("Earnings Date")
        if not dates:
            return EarningsItem(ticker=ticker)
        first = dates[0] if isinstance(dates, list) else dates
        earnings_date = (
            first.strftime("%Y-%m-%d") if hasattr(first, "strftime") else str(first)[:10]
        )
        raw_eps = cal.get("Earnings Average")
        raw_rev = cal.get("Revenue Average")
        return EarningsItem(
            ticker=ticker,
            earnings_date=earnings_date,
            eps_estimate=float(raw_eps) if raw_eps is not None else None,
            revenue_estimate=float(raw_rev) if raw_rev is not None else None,
        )
    except Exception:
        return EarningsItem(ticker=ticker)


def get_earnings(tickers: list[str]) -> EarningsResponse:
    now = _utc_now()
    items: list[EarningsItem] = []
    for ticker in tickers:
        with _LOCK:
            cached = _CACHE.get(ticker)
        if cached and (now - cached[1]) < _TTL:
            items.append(cached[0])
        else:
            item = _fetch_one(ticker)
            with _LOCK:
                _CACHE[ticker] = (item, now)
            items.append(item)
    return EarningsResponse(generated_at=now.isoformat(), items=items)
