from datetime import UTC, datetime

import pandas as pd
import pytest
from fastapi import Response

from backend.api.terminal import _fetch_intraday, terminal_security
from backend.models import SecurityOverview, SecuritySnapshot


@pytest.mark.parametrize("price_level", [0, 1])
def test_fetch_intraday_accepts_yfinance_multiindex_orders(monkeypatch, price_level):
    prices = ["Open", "High", "Low", "Close", "Volume"]
    ticker = ["AAPL"] * len(prices)
    levels = [prices, ticker] if price_level == 0 else [ticker, prices]
    frame = pd.DataFrame(
        [[100.0, 102.0, 99.0, 101.0, 1_000_000.0]],
        index=[datetime(2026, 7, 27, 14, 30, tzinfo=UTC)],
        columns=pd.MultiIndex.from_arrays(levels),
    )
    monkeypatch.setattr("backend.api.terminal.yf.download", lambda **_: frame)

    response = _fetch_intraday("AAPL", "5m", "1d")

    assert response.ticker == "AAPL"
    assert len(response.bars) == 1
    assert response.bars[0].open == 100.0
    assert response.bars[0].close == 101.0


def test_security_read_never_triggers_market_sync(monkeypatch):
    expected = SecurityOverview(
        generated_at="2026-08-10T12:00:00Z",
        snapshot=SecuritySnapshot(ticker="AAPL"),
        signals=[],
        bars=[],
        related=[],
    )
    monkeypatch.setattr("backend.api.terminal.ensure_schema", lambda: None)
    monkeypatch.setattr(
        "backend.api.terminal.ensure_market_data",
        lambda *args, **kwargs: pytest.fail("chart reads must not fetch provider data"),
    )
    monkeypatch.setattr(
        "backend.api.terminal.get_or_compute",
        lambda _key, _ttl, compute: compute(),
    )
    monkeypatch.setattr(
        "backend.api.terminal.get_security_overview", lambda *_args, **_kwargs: expected
    )
    response = Response()

    actual = terminal_security("aapl", response=response, limit=22)

    assert actual is expected
    assert response.headers["cache-control"] == "public, max-age=60, stale-while-revalidate=300"
