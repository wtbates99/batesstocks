"""Small in-process TTL cache for hot read responses."""

from __future__ import annotations

import os
from collections import OrderedDict
from collections.abc import Callable, Hashable
from threading import RLock
from time import monotonic
from typing import TypeVar

T = TypeVar("T")

_LOCK = RLock()
_MAX_ENTRIES = max(1, int(os.getenv("RESPONSE_CACHE_MAX_ENTRIES", "128")))
_CACHE: OrderedDict[Hashable, tuple[float, object]] = OrderedDict()


def _prune(now: float) -> None:
    expired = [key for key, (expires_at, _) in _CACHE.items() if expires_at <= now]
    for key in expired:
        _CACHE.pop(key, None)
    while len(_CACHE) >= _MAX_ENTRIES:
        _CACHE.popitem(last=False)


def get_or_compute(key: Hashable, ttl_seconds: float, compute: Callable[[], T]) -> T:
    now = monotonic()
    with _LOCK:
        cached = _CACHE.get(key)
        if cached is not None:
            expires_at, value = cached
            if expires_at > now:
                _CACHE.move_to_end(key)
                return value  # type: ignore[return-value]
            _CACHE.pop(key, None)

    value = compute()
    with _LOCK:
        stored_at = monotonic()
        _prune(stored_at)
        _CACHE[key] = (stored_at + ttl_seconds, value)
        _CACHE.move_to_end(key)
    return value


def clear_response_cache() -> None:
    with _LOCK:
        _CACHE.clear()
