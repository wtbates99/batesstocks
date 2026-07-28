"""Small in-process TTL cache for hot read responses."""

from __future__ import annotations

from collections.abc import Callable, Hashable
from threading import RLock
from time import monotonic
from typing import TypeVar

T = TypeVar("T")

_LOCK = RLock()
_CACHE: dict[Hashable, tuple[float, object]] = {}


def get_or_compute(key: Hashable, ttl_seconds: float, compute: Callable[[], T]) -> T:
    now = monotonic()
    with _LOCK:
        cached = _CACHE.get(key)
        if cached is not None:
            expires_at, value = cached
            if expires_at > now:
                return value  # type: ignore[return-value]
            _CACHE.pop(key, None)

    value = compute()
    with _LOCK:
        _CACHE[key] = (now + ttl_seconds, value)
    return value


def clear_response_cache() -> None:
    with _LOCK:
        _CACHE.clear()
