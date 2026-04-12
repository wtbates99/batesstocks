from backend.services.data_sync_service import MIN_INDICATOR_LOOKBACK_YEARS, _normalize_years
from backend.services.market_universe import normalize_universe


def test_normalize_years_enforces_indicator_lookback_minimum():
    assert _normalize_years(0) == MIN_INDICATOR_LOOKBACK_YEARS
    assert _normalize_years(1) == MIN_INDICATOR_LOOKBACK_YEARS
    assert _normalize_years(2) == 2
    assert _normalize_years(5) == 5


def test_default_universe_includes_sp500_and_etfs():
    universe = normalize_universe()

    assert len(universe) > 500
    assert "AAPL" in universe
    assert "SPY" in universe
    assert "XLK" in universe
