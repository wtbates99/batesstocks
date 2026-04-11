"""Tests for backend/data_pull.py — data fetching and writing."""

import os
import sys
from unittest.mock import MagicMock, patch

import duckdb
import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.data_pull import fetch_write_financial_data


def make_sp500_table(tickers):
    return pd.DataFrame(
        {
            "Symbol": tickers,
            "Security": [f"{t} Corp" for t in tickers],
            "GICS Sector": ["Technology"] * len(tickers),
            "GICS Sub-Industry": ["Software"] * len(tickers),
            "Headquarters Location": ["San Francisco, CA"] * len(tickers),
        }
    )


def make_price_df(tickers, n=10):
    """Simulate yfinance multi-ticker download output (stacked format)."""
    dates = pd.date_range("2024-01-01", periods=n, freq="B")
    rows = []
    for t in tickers:
        for d in dates:
            rows.append(
                {
                    "Date": d,
                    "Ticker": t,
                    "Open": 100.0,
                    "Close": 101.0,
                    "High": 102.0,
                    "Low": 99.0,
                    "Volume": 1_000_000.0,
                }
            )
    df = pd.DataFrame(rows)
    # Simulate the stacked multi-index output
    mock = MagicMock()
    mock.stack.return_value = MagicMock()
    mock.stack.return_value.reset_index.return_value = df
    return mock, df


def make_mock_ticker():
    """Return a Ticker mock whose fast_info attrs are plain None (not MagicMock).

    getattr(MagicMock(), 'x', None) returns a MagicMock because MagicMock
    has every attribute — the fallback default is never used. Setting each
    attribute to None explicitly avoids inserting un-serialisable objects
    into the DuckDB-bound DataFrame.
    """
    fi = MagicMock()
    fi.market_cap = None
    fi.last_price = None
    fi.year_high = None
    fi.year_low = None
    fi.exchange = None
    fi.currency = None
    fi.quote_type = None
    ticker = MagicMock()
    ticker.fast_info = fi
    ticker.info = {}
    return ticker


@pytest.fixture
def conn():
    c = duckdb.connect(":memory:")
    yield c
    c.close()


def test_fetch_write_creates_tables(conn):
    tickers = ["AAPL", "MSFT"]
    table = make_sp500_table(tickers)
    price_mock, price_df = make_price_df(tickers)

    mock_ticker = MagicMock()
    mock_ticker.fast_info.market_cap = 1_000_000_000
    mock_ticker.fast_info.last_price = 100.0
    mock_ticker.fast_info.year_high = 120.0
    mock_ticker.fast_info.year_low = 80.0
    mock_ticker.fast_info.exchange = "NASDAQ"
    mock_ticker.fast_info.currency = "USD"
    mock_ticker.fast_info.quote_type = "EQUITY"
    mock_ticker.info = {
        "shortName": "Apple Inc",
        "website": "https://apple.com",
        "longBusinessSummary": "Makes iPhones.",
        "ceo": None,
        "fullTimeEmployees": 150000,
        "zip": "95014",
        "address1": "1 Apple Park Way",
        "phone": "408-996-1010",
        "dividendRate": None,
        "dividendYield": None,
        "payoutRatio": None,
        "beta": 1.2,
        "trailingPE": 30.0,
        "trailingEps": 6.0,
        "totalRevenue": 400_000_000_000,
        "grossProfits": 170_000_000_000,
        "freeCashflow": 90_000_000_000,
    }

    with (
        patch("yfinance.download", return_value=price_mock),
        patch("yfinance.Ticker", return_value=mock_ticker),
    ):
        fetch_write_financial_data(conn, table, tickers, append=False)

    tables = {r[0] for r in conn.execute("SHOW TABLES").fetchall()}
    assert "stock_data" in tables, "stock_data table not created"
    assert "stock_information" in tables, "stock_information table not created"


def test_stock_data_has_expected_columns(conn):
    tickers = ["GOOG"]
    table = make_sp500_table(tickers)
    price_mock, _ = make_price_df(tickers)

    with (
        patch("yfinance.download", return_value=price_mock),
        patch("yfinance.Ticker", return_value=make_mock_ticker()),
    ):
        fetch_write_financial_data(conn, table, tickers, append=False)

    df = conn.execute("SELECT * FROM stock_data LIMIT 1").df()
    for col in ["Date", "Ticker", "Open", "Close", "High", "Low", "Volume"]:
        assert col in df.columns, f"Missing column in stock_data: {col}"


def test_stock_information_has_ticker_column(conn):
    tickers = ["TSLA"]
    table = make_sp500_table(tickers)
    price_mock, _ = make_price_df(tickers)

    with (
        patch("yfinance.download", return_value=price_mock),
        patch("yfinance.Ticker", return_value=make_mock_ticker()),
    ):
        fetch_write_financial_data(conn, table, tickers, append=False)

    df = conn.execute("SELECT * FROM stock_information LIMIT 5").df()
    assert "Ticker" in df.columns
    assert "TSLA" in df["Ticker"].values
