from backend.services import response_cache


def test_response_cache_is_lru_bounded(monkeypatch):
    monkeypatch.setattr(response_cache, "_MAX_ENTRIES", 2)
    response_cache.clear_response_cache()
    calls: list[str] = []

    def compute(key: str) -> str:
        calls.append(key)
        return key

    assert response_cache.get_or_compute("a", 60, lambda: compute("a")) == "a"
    assert response_cache.get_or_compute("b", 60, lambda: compute("b")) == "b"
    assert response_cache.get_or_compute("a", 60, lambda: compute("a")) == "a"
    assert response_cache.get_or_compute("c", 60, lambda: compute("c")) == "c"
    assert response_cache.get_or_compute("b", 60, lambda: compute("b")) == "b"

    assert calls == ["a", "b", "c", "b"]
    assert len(response_cache._CACHE) == 2
    response_cache.clear_response_cache()
