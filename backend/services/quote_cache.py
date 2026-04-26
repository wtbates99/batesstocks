"""Thin TTL cache + yfinance live-quote helper.

Used to:
  - Serve real-time prices on /live-prices instead of yesterday's daily close.
  - Cache yfinance intraday and fundamentals lookups so repeated views don't
    hammer the upstream API.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from typing import Any

import yfinance as yf

_LIVE_PRICE_TTL_SECONDS = 30.0
_INTRADAY_TTL_SECONDS = 60.0
_FUNDAMENTALS_TTL_SECONDS = 3600.0


class _TTLCache:
    """Minimal monotonic-clock TTL cache. Thread-safe."""

    def __init__(self, ttl: float) -> None:
        self._ttl = ttl
        self._lock = Lock()
        self._store: dict[Any, tuple[Any, float]] = {}

    def get(self, key: Any) -> Any | None:
        now = time.monotonic()
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            value, deadline = entry
            if deadline < now:
                self._store.pop(key, None)
                return None
            return value

    def set(self, key: Any, value: Any) -> None:
        deadline = time.monotonic() + self._ttl
        with self._lock:
            self._store[key] = (value, deadline)

    def get_or_compute(self, key: Any, compute: Callable[[], Any]) -> Any:
        cached = self.get(key)
        if cached is not None:
            return cached
        value = compute()
        if value is not None:
            self.set(key, value)
        return value


_live_price_cache = _TTLCache(_LIVE_PRICE_TTL_SECONDS)
intraday_cache = _TTLCache(_INTRADAY_TTL_SECONDS)
fundamentals_cache = _TTLCache(_FUNDAMENTALS_TTL_SECONDS)


def _fetch_one_live_price(ticker: str) -> float | None:
    cached = _live_price_cache.get(ticker)
    if cached is not None:
        # Sentinel for "we tried, it failed" — re-cache as None to avoid hammering.
        return None if cached == "__miss__" else cached  # type: ignore[return-value]
    try:
        info = yf.Ticker(ticker).fast_info
        # fast_info exposes last_price as an attribute or mapping key depending on version.
        price = getattr(info, "last_price", None)
        if price is None and hasattr(info, "get"):
            price = info.get("last_price") or info.get("lastPrice")
        if price is None:
            _live_price_cache.set(ticker, "__miss__")
            return None
        value = float(price)
    except Exception:
        _live_price_cache.set(ticker, "__miss__")
        return None
    _live_price_cache.set(ticker, value)
    return value


def fetch_live_prices(tickers: list[str]) -> dict[str, float | None]:
    """Fetch (cached) real-time prices for `tickers`. Missing/failing tickers map to None."""
    if not tickers:
        return {}
    workers = min(8, max(1, len(tickers)))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        results = list(executor.map(_fetch_one_live_price, tickers))
    return dict(zip(tickers, results, strict=False))
