from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import numpy as np
import pandas as pd

from backend.core import duckdb as duckdb_module
from backend.core.duckdb import duckdb_connection, ensure_schema
from backend.services.data_sync_service import (
    MIN_INDICATOR_LOOKBACK_YEARS,
    _normalize_years,
    ensure_market_data,
    get_data_staleness_days,
    get_missing_tickers,
    get_ticker_latest_dates,
    get_tracked_ticker_count,
    has_market_data,
    rebuild_indicator_cache,
    sync_market_data,
)
from backend.services.market_universe import normalize_universe
from backend.services.sync_status import SyncStatusTracker

# ── helpers ─────────────────────────────────────────────────────────────────


def _reset_schema(monkeypatch, tmp_path):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "sync.duckdb"))
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "backups"))
    duckdb_module._SCHEMA_READY = False
    ensure_schema()


def _make_ohlcv(ticker: str, dates: list[str]) -> pd.DataFrame:
    rows = []
    price = 100.0
    for d in dates:
        price *= 1 + (np.random.default_rng(abs(hash(d))).uniform(-0.02, 0.02))
        rows.append(
            {
                "Date": pd.Timestamp(d),
                "Ticker": ticker,
                "Open": price * 0.99,
                "High": price * 1.01,
                "Low": price * 0.98,
                "Close": price,
                "AdjClose": price,
                "Volume": 1_000_000.0,
            }
        )
    return pd.DataFrame(rows)


def _make_yf_download(tickers: list[str], dates: list[str]):
    """Return a mock that yf.download returns for the given tickers/dates."""
    frames = {ticker: _make_ohlcv(ticker, dates) for ticker in tickers}
    combined = pd.concat(frames.values(), ignore_index=True)
    return combined


# ── utility queries ──────────────────────────────────────────────────────────


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


def test_has_market_data_false_on_empty_db(monkeypatch, tmp_path):
    _reset_schema(monkeypatch, tmp_path)
    assert has_market_data() is False


def test_has_market_data_true_after_insert(monkeypatch, tmp_path):
    _reset_schema(monkeypatch, tmp_path)
    with duckdb_connection() as conn:
        conn.execute(
            "INSERT INTO ticker_data (Date, Ticker, Open, High, Low, Close, Volume) "
            "VALUES ('2026-04-10', 'SPY', 500, 505, 498, 502, 1000000)"
        )
    assert has_market_data() is True


def test_get_data_staleness_days_none_on_empty_db(monkeypatch, tmp_path):
    _reset_schema(monkeypatch, tmp_path)
    assert get_data_staleness_days() is None


def test_get_data_staleness_days_accurate(monkeypatch, tmp_path):
    _reset_schema(monkeypatch, tmp_path)
    ten_days_ago = (datetime.now(UTC) - timedelta(days=10)).date().isoformat()
    with duckdb_connection() as conn:
        conn.execute(
            f"INSERT INTO ticker_data (Date, Ticker, Open, High, Low, Close, Volume) "
            f"VALUES ('{ten_days_ago}', 'SPY', 500, 505, 498, 502, 1000000)"
        )
    staleness = get_data_staleness_days()
    assert staleness is not None
    assert 9 <= staleness <= 11  # allow 1-day clock skew


def test_get_tracked_ticker_count(monkeypatch, tmp_path):
    _reset_schema(monkeypatch, tmp_path)
    assert get_tracked_ticker_count() == 0
    with duckdb_connection() as conn:
        conn.execute(
            "INSERT INTO ticker_data (Date, Ticker, Open, High, Low, Close, Volume) VALUES "
            "('2026-04-10', 'AAPL', 190, 193, 189, 191, 1000000),"
            "('2026-04-10', 'MSFT', 400, 402, 398, 401, 900000)"
        )
    assert get_tracked_ticker_count() == 2


def test_get_missing_tickers_returns_absent_ones(monkeypatch, tmp_path):
    _reset_schema(monkeypatch, tmp_path)
    with duckdb_connection() as conn:
        conn.execute(
            "INSERT INTO ticker_data (Date, Ticker, Open, High, Low, Close, Volume) "
            "VALUES ('2026-04-10', 'AAPL', 190, 193, 189, 191, 1000000)"
        )
    missing = get_missing_tickers(["AAPL", "MSFT", "NVDA"])
    assert "AAPL" not in missing
    assert "MSFT" in missing
    assert "NVDA" in missing


def test_get_missing_tickers_empty_when_all_present(monkeypatch, tmp_path):
    _reset_schema(monkeypatch, tmp_path)
    with duckdb_connection() as conn:
        conn.execute(
            "INSERT INTO ticker_data (Date, Ticker, Open, High, Low, Close, Volume) VALUES "
            "('2026-04-10', 'AAPL', 190, 193, 189, 191, 1000000),"
            "('2026-04-10', 'MSFT', 400, 402, 398, 401, 900000)"
        )
    missing = get_missing_tickers(["AAPL", "MSFT"])
    assert missing == []


def test_get_ticker_latest_dates(monkeypatch, tmp_path):
    _reset_schema(monkeypatch, tmp_path)
    with duckdb_connection() as conn:
        conn.execute(
            "INSERT INTO ticker_data (Date, Ticker, Open, High, Low, Close, Volume) VALUES "
            "('2026-04-09', 'AAPL', 190, 193, 189, 191, 1000000),"
            "('2026-04-10', 'AAPL', 192, 195, 191, 194, 1100000),"
            "('2026-04-10', 'MSFT', 400, 402, 398, 401, 900000)"
        )
    dates = get_ticker_latest_dates(["AAPL", "MSFT"])
    assert "AAPL" in dates
    assert dates["AAPL"].startswith("2026-04-10")
    assert dates["MSFT"].startswith("2026-04-10")


# ── sync_market_data ─────────────────────────────────────────────────────────


def _minimal_ohlcv_df(ticker: str, n_days: int = 300) -> pd.DataFrame:
    """Generate enough rows for SMA_250 to be computable."""
    start = datetime(2025, 1, 1)
    dates = [(start + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(n_days)]
    return _make_ohlcv(ticker, dates)


@patch("backend.services.data_sync_service._fetch_company_metadata")
@patch("backend.services.data_sync_service._download_ohlcv")
def test_sync_market_data_writes_rows_and_metadata(mock_download, mock_meta, monkeypatch, tmp_path):
    _reset_schema(monkeypatch, tmp_path)

    ohlcv = _minimal_ohlcv_df("AAPL")
    mock_download.return_value = ohlcv
    mock_meta.return_value = pd.DataFrame(
        [
            {
                "Ticker": "AAPL",
                "FullName": "Apple Inc.",
                "ShortName": "Apple",
                "Sector": "Technology",
                "Subsector": "Consumer Electronics",
                "MarketCap": 3_000_000_000_000,
                "Exchange": "NASDAQ",
                "Currency": "USD",
                "Website": "https://apple.com",
                "QuoteType": "EQUITY",
            }
        ]
    )

    response = sync_market_data(["AAPL"], years=2, source="manual")

    assert response.rows_written > 0
    assert response.metadata_rows == 1
    assert "AAPL" in response.tickers

    with duckdb_connection() as conn:
        count = conn.execute("SELECT COUNT(*) FROM ticker_data WHERE Ticker = 'AAPL'").fetchone()[0]
        raw_count = conn.execute("SELECT COUNT(*) FROM ohlcv_daily WHERE Ticker = 'AAPL'").fetchone()[0]
        meta = conn.execute("SELECT Sector FROM stock_information WHERE Ticker = 'AAPL'").fetchone()

    assert count == len(ohlcv)
    assert raw_count == len(ohlcv)
    assert meta is not None
    assert meta[0] == "Technology"


@patch("backend.services.data_sync_service._fetch_company_metadata")
@patch("backend.services.data_sync_service._download_ohlcv")
def test_sync_market_data_returns_empty_response_when_download_yields_nothing(
    mock_download, mock_meta, monkeypatch, tmp_path
):
    _reset_schema(monkeypatch, tmp_path)
    mock_download.return_value = pd.DataFrame()

    response = sync_market_data(["FAKE"], years=2, source="manual")

    assert response.rows_written == 0
    mock_meta.assert_not_called()


@patch("backend.services.data_sync_service._fetch_company_metadata")
@patch("backend.services.data_sync_service._download_ohlcv")
def test_sync_market_data_incremental_skips_fresh_tickers(
    mock_download, mock_meta, monkeypatch, tmp_path
):
    _reset_schema(monkeypatch, tmp_path)

    # Seed AAPL with today's data so it's "fresh"
    today = datetime.now(UTC).date().isoformat()
    with duckdb_connection() as conn:
        conn.execute(
            f"INSERT INTO ticker_data (Date, Ticker, Open, High, Low, Close, Volume) "
            f"VALUES ('{today}', 'AAPL', 190, 193, 189, 191, 1000000)"
        )

    response = sync_market_data(["AAPL"], years=2, source="scheduled")

    # Fresh tickers are skipped — no download, no rows written
    assert response.rows_written == 0
    assert response.tickers == []
    mock_download.assert_not_called()


@patch("backend.services.data_sync_service._fetch_company_metadata")
@patch("backend.services.data_sync_service._download_ohlcv")
def test_sync_market_data_incremental_syncs_stale_tickers(
    mock_download, mock_meta, monkeypatch, tmp_path
):
    _reset_schema(monkeypatch, tmp_path)

    stale_date = (datetime.now(UTC) - timedelta(days=5)).date().isoformat()
    with duckdb_connection() as conn:
        conn.execute(
            f"INSERT INTO ticker_data (Date, Ticker, Open, High, Low, Close, Volume) "
            f"VALUES ('{stale_date}', 'AAPL', 190, 193, 189, 191, 1000000)"
        )

    ohlcv = _minimal_ohlcv_df("AAPL")
    mock_download.return_value = ohlcv
    mock_meta.return_value = pd.DataFrame(
        [
            {
                "Ticker": "AAPL",
                "FullName": "Apple Inc.",
                "ShortName": "Apple",
                "Sector": "Technology",
                "Subsector": None,
                "MarketCap": None,
                "Exchange": None,
                "Currency": None,
                "Website": None,
                "QuoteType": None,
            }
        ]
    )

    response = sync_market_data(["AAPL"], years=2, source="scheduled")

    assert response.rows_written > 0
    mock_download.assert_called_once()


@patch("backend.services.data_sync_service._fetch_company_metadata")
@patch("backend.services.data_sync_service._download_ohlcv")
def test_sync_market_data_preserves_history_outside_download_window(
    mock_download, mock_meta, monkeypatch, tmp_path
):
    _reset_schema(monkeypatch, tmp_path)

    from backend.services.data_sync_service import _compute_indicator_frame, _prepare_ticker_data_frame

    full_history = _minimal_ohlcv_df("AAPL", n_days=400)
    seeded_indicators = _prepare_ticker_data_frame(_compute_indicator_frame(full_history))
    with duckdb_connection() as conn:
        conn.register("seed_ohlcv", full_history)
        conn.execute("""
            INSERT INTO ohlcv_daily (Date, Ticker, Open, High, Low, Close, AdjClose, Volume)
            SELECT Date, Ticker, Open, High, Low, Close, AdjClose, Volume
            FROM seed_ohlcv
        """)
        conn.unregister("seed_ohlcv")
        conn.register("seed_ticker_data", seeded_indicators)
        conn.execute(
            """
            INSERT INTO ticker_data (Date, Ticker, Open, High, Low, Close, Volume,
                                     Ticker_SMA_10, Ticker_EMA_10, Ticker_SMA_30, Ticker_EMA_30,
                                     Ticker_RSI, Ticker_MACD, Ticker_MACD_Signal, Ticker_MACD_Diff,
                                     Ticker_Bollinger_PBand, Ticker_MFI, Ticker_VWAP, Ticker_Tech_Score,
                                     Ticker_SMA_50, Ticker_SMA_100, Ticker_SMA_200, Ticker_SMA_250,
                                     Ticker_EMA_50, Ticker_EMA_100, Ticker_EMA_200, Ticker_Return_20D,
                                     Ticker_Return_63D, Ticker_Return_126D, Ticker_Return_252D,
                                     Ticker_52W_High, Ticker_52W_Low, Ticker_52W_Range_Pct,
                                     Ticker_Avg_Volume_20D)
            SELECT Date, Ticker, Open, High, Low, Close, Volume,
                   Ticker_SMA_10, Ticker_EMA_10, Ticker_SMA_30, Ticker_EMA_30,
                   Ticker_RSI, Ticker_MACD, Ticker_MACD_Signal, Ticker_MACD_Diff,
                   Ticker_Bollinger_PBand, Ticker_MFI, Ticker_VWAP, Ticker_Tech_Score,
                   Ticker_SMA_50, Ticker_SMA_100, Ticker_SMA_200, Ticker_SMA_250,
                   Ticker_EMA_50, Ticker_EMA_100, Ticker_EMA_200, Ticker_Return_20D,
                   Ticker_Return_63D, Ticker_Return_126D, Ticker_Return_252D,
                   Ticker_52W_High, Ticker_52W_Low, Ticker_52W_Range_Pct,
                   Ticker_Avg_Volume_20D
            FROM seed_ticker_data
            """
        )
        conn.unregister("seed_ticker_data")

    partial_refresh = full_history.iloc[-300:].copy()
    partial_refresh.loc[partial_refresh.index[-1], "Close"] += 5
    partial_refresh.loc[partial_refresh.index[-1], "AdjClose"] += 5
    mock_download.return_value = partial_refresh
    mock_meta.return_value = pd.DataFrame(
        [
            {
                "Ticker": "AAPL",
                "FullName": "Apple Inc.",
                "ShortName": "Apple",
                "Sector": "Technology",
                "Subsector": None,
                "MarketCap": None,
                "Exchange": None,
                "Currency": None,
                "Website": None,
                "QuoteType": None,
            }
        ]
    )

    response = sync_market_data(["AAPL"], years=2, source="manual")

    with duckdb_connection() as conn:
        ticker_count = conn.execute(
            "SELECT COUNT(*) FROM ticker_data WHERE Ticker = 'AAPL'"
        ).fetchone()[0]
        raw_count = conn.execute(
            "SELECT COUNT(*) FROM ohlcv_daily WHERE Ticker = 'AAPL'"
        ).fetchone()[0]
        oldest = conn.execute(
            "SELECT MIN(Date)::TEXT FROM ticker_data WHERE Ticker = 'AAPL'"
        ).fetchone()[0]
        latest_close = conn.execute(
            "SELECT Close FROM ticker_data WHERE Ticker = 'AAPL' ORDER BY Date DESC LIMIT 1"
        ).fetchone()[0]

    assert response.rows_written == len(partial_refresh)
    assert ticker_count == len(full_history)
    assert raw_count == len(full_history)
    assert oldest.startswith(str(full_history["Date"].min().date()))
    assert latest_close == partial_refresh.iloc[-1]["Close"]


# ── rebuild_indicator_cache ──────────────────────────────────────────────────


@patch("backend.services.data_sync_service._fetch_company_metadata")
@patch("backend.services.data_sync_service._download_ohlcv")
def test_rebuild_indicator_cache_recomputes_from_ohlcv(
    mock_download, mock_meta, monkeypatch, tmp_path
):
    _reset_schema(monkeypatch, tmp_path)

    ohlcv = _minimal_ohlcv_df("SPY")
    mock_download.return_value = ohlcv
    mock_meta.return_value = pd.DataFrame(
        [
            {
                "Ticker": "SPY",
                "FullName": "SPDR S&P 500",
                "ShortName": "SPY",
                "Sector": "ETF",
                "Subsector": None,
                "MarketCap": None,
                "Exchange": None,
                "Currency": None,
                "Website": None,
                "QuoteType": None,
            }
        ]
    )

    # Sync to populate ohlcv_daily and ticker_data
    sync_market_data(["SPY"], years=2, source="manual")

    # Corrupt the RSI column
    with duckdb_connection() as conn:
        conn.execute("UPDATE ticker_data SET Ticker_RSI = -999 WHERE Ticker = 'SPY'")
        corrupted = conn.execute(
            "SELECT AVG(Ticker_RSI) FROM ticker_data WHERE Ticker = 'SPY'"
        ).fetchone()[0]
    assert corrupted == -999.0

    # Rebuild should restore correct values
    rows = rebuild_indicator_cache(["SPY"])
    assert rows > 0

    with duckdb_connection() as conn:
        avg_rsi = conn.execute(
            "SELECT AVG(Ticker_RSI) FROM ticker_data WHERE Ticker = 'SPY' AND Ticker_RSI IS NOT NULL"
        ).fetchone()[0]
    assert avg_rsi is None or (0 <= avg_rsi <= 100), f"RSI out of range: {avg_rsi}"


def test_rebuild_indicator_cache_returns_zero_on_empty_db(monkeypatch, tmp_path):
    _reset_schema(monkeypatch, tmp_path)
    assert rebuild_indicator_cache() == 0


# ── ensure_market_data ───────────────────────────────────────────────────────


@patch("backend.services.data_sync_service._fetch_company_metadata")
@patch("backend.services.data_sync_service._download_ohlcv")
def test_ensure_market_data_triggers_sync_for_missing(
    mock_download, mock_meta, monkeypatch, tmp_path
):
    _reset_schema(monkeypatch, tmp_path)

    ohlcv = _minimal_ohlcv_df("AAPL")
    mock_download.return_value = ohlcv
    mock_meta.return_value = pd.DataFrame(
        [
            {
                "Ticker": "AAPL",
                "FullName": "Apple Inc.",
                "ShortName": "Apple",
                "Sector": "Technology",
                "Subsector": None,
                "MarketCap": None,
                "Exchange": None,
                "Currency": None,
                "Website": None,
                "QuoteType": None,
            }
        ]
    )

    result = ensure_market_data(["AAPL"], years=2)

    assert result is not None
    assert result.rows_written > 0
    mock_download.assert_called_once()


@patch("backend.services.data_sync_service._fetch_company_metadata")
@patch("backend.services.data_sync_service._download_ohlcv")
def test_ensure_market_data_skips_sync_when_already_present(
    mock_download, mock_meta, monkeypatch, tmp_path
):
    _reset_schema(monkeypatch, tmp_path)
    with duckdb_connection() as conn:
        conn.execute(
            "INSERT INTO ticker_data (Date, Ticker, Open, High, Low, Close, Volume) "
            "VALUES ('2026-04-10', 'AAPL', 190, 193, 189, 191, 1000000)"
        )

    result = ensure_market_data(["AAPL"], years=2)

    assert result is None
    mock_download.assert_not_called()


# ── SyncStatusTracker ────────────────────────────────────────────────────────


def test_sync_status_tracker_lifecycle():
    tracker = SyncStatusTracker()

    # Initial state
    snap = tracker.get()
    assert snap.state == "idle"
    assert snap.last_success_at is None

    # Begin a sync
    tracker.begin(source="manual", target_tickers=3, detail="Loading 3 tickers")
    snap = tracker.get()
    assert snap.state == "running"
    assert snap.source == "manual"
    assert snap.target_tickers == 3
    assert snap.started_at is not None

    # Mid-sync update
    tracker.update(phase="writing", detail="Writing AAPL", completed_tickers=1, rows_written=50)
    snap = tracker.get()
    assert snap.phase == "writing"
    assert snap.completed_tickers == 1
    assert snap.rows_written == 50

    # Successful completion
    tracker.succeed(rows_written=150, metadata_rows=3, detail="Done.")
    snap = tracker.get()
    assert snap.state == "idle"
    assert snap.phase == "complete"
    assert snap.rows_written == 150
    assert snap.last_success_at is not None
    assert snap.last_error is None


def test_sync_status_tracker_records_failure():
    tracker = SyncStatusTracker()
    tracker.begin(source="manual", target_tickers=1, detail="Starting")
    tracker.fail("Connection refused")

    snap = tracker.get()
    assert snap.state == "error"
    assert snap.phase == "failed"
    assert snap.last_error == "Connection refused"


def test_sync_status_tracker_preserves_last_success_across_runs():
    tracker = SyncStatusTracker()

    tracker.begin(source="manual", target_tickers=1, detail="Run 1")
    tracker.succeed(rows_written=100, metadata_rows=1, detail="Done.")
    first_success = tracker.get().last_success_at

    tracker.begin(source="manual", target_tickers=1, detail="Run 2")
    # last_success_at should be preserved during the second run
    snap = tracker.get()
    assert snap.last_success_at == first_success


# ── indicator computation sanity checks ─────────────────────────────────────


def test_indicator_rsi_bounded(monkeypatch, tmp_path):
    """RSI must be in [0, 100] for any real OHLCV sequence."""
    from backend.services.data_sync_service import _compute_indicator_frame

    ohlcv = _minimal_ohlcv_df("TEST", n_days=300)
    result = _compute_indicator_frame(ohlcv)
    rsi = result["Ticker_RSI"].dropna()
    assert (rsi >= 0).all() and (rsi <= 100).all(), "RSI out of [0, 100] range"


def test_indicator_sma_250_requires_enough_history(monkeypatch, tmp_path):
    """SMA_250 should be NaN for the first 249 rows of a ticker."""
    from backend.services.data_sync_service import _compute_indicator_frame

    ohlcv = _minimal_ohlcv_df("TEST", n_days=300)
    result = _compute_indicator_frame(ohlcv)
    sma = result["Ticker_SMA_250"]
    # First 249 rows must be NaN
    assert sma.iloc[:249].isna().all()
    # Row 250 onward must have a value
    assert sma.iloc[249:].notna().any()


def test_indicator_tech_score_bounded():
    """Tech score should always be a reasonable positive float."""
    from backend.services.data_sync_service import _compute_indicator_frame

    ohlcv = _minimal_ohlcv_df("TEST", n_days=300)
    result = _compute_indicator_frame(ohlcv)
    score = result["Ticker_Tech_Score"].dropna()
    assert len(score) > 0
    # Should be positive (it's a weighted composite of bounded indicators)
    assert (score > 0).all()
