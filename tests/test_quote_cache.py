from backend.services import quote_cache


def test_failed_live_quote_is_cached(monkeypatch):
    calls = 0

    class FakeTicker:
        @property
        def fast_info(self):
            nonlocal calls
            calls += 1
            raise RuntimeError("provider unavailable")

    monkeypatch.setattr(quote_cache, "_live_price_cache", quote_cache._TTLCache(30))
    monkeypatch.setattr(quote_cache, "_live_price_miss_cache", quote_cache._TTLCache(300))
    monkeypatch.setattr(quote_cache.yf, "Ticker", lambda _: FakeTicker())

    assert quote_cache._fetch_one_live_price("MISSING") is None
    assert quote_cache._fetch_one_live_price("MISSING") is None
    assert calls == 1
