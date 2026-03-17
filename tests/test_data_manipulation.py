"""Tests for backend/data_manipulation.py — indicator calculations."""

import math
import os
import sys

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.data_manipulation import process_stock_data


def make_ohlcv(n=60, seed=42):
    """Generate synthetic deterministic OHLCV data."""
    rng = np.random.default_rng(seed)
    base = 100.0
    prices = base + np.cumsum(rng.normal(0, 1, n))
    prices = np.clip(prices, 1, None)
    df = pd.DataFrame(
        {
            "Date": pd.date_range("2023-01-01", periods=n, freq="B"),
            "Ticker": "TEST",
            "Close": prices,
            "Open": prices * (1 - rng.uniform(0, 0.01, n)),
            "High": prices * (1 + rng.uniform(0, 0.02, n)),
            "Low": prices * (1 - rng.uniform(0, 0.02, n)),
            "Volume": rng.integers(1_000_000, 10_000_000, n).astype(float),
        }
    )
    return df


def get_indicators_df(n=60):
    """Run process_stock_data on an in-memory DB and return the result."""
    import sqlite3

    conn = sqlite3.connect(":memory:")

    ohlcv = make_ohlcv(n)
    # Write stock_data and stock_information tables expected by process_stock_data
    ohlcv.rename(columns={"Date": "Date", "Ticker": "Ticker"}).to_sql(
        "stock_data", conn, if_exists="replace", index=False
    )
    info = pd.DataFrame(
        [
            {
                "Ticker": "TEST",
                "FullName": "Test Corp",
                "Sector": "Tech",
                "Subsector": "Software",
                "City": "NYC",
                "State": "NY",
                "Country": "US",
                "MarketCap": None,
                "Price": None,
                "52WeekHigh": None,
                "52WeekLow": None,
                "Exchange": None,
                "Currency": "USD",
                "QuoteType": None,
                "ShortName": None,
                "Website": None,
                "Description": None,
                "CEO": None,
                "Employees": None,
                "Zip": None,
                "Address": None,
                "Phone": None,
                "DividendRate": None,
                "DividendYield": None,
                "PayoutRatio": None,
                "Beta": None,
                "PE": None,
                "EPS": None,
                "Revenue": None,
                "GrossProfit": None,
                "FreeCashFlow": None,
            }
        ]
    )
    info.to_sql("stock_information", conn, if_exists="replace", index=False)

    process_stock_data(conn)

    result = pd.read_sql("SELECT * FROM combined_stock_data WHERE Ticker = 'TEST'", conn)
    conn.close()
    return result


@pytest.fixture(scope="module")
def indicators():
    return get_indicators_df(n=60)


def test_expected_columns_present(indicators):
    expected = [
        "Ticker_SMA_10",
        "Ticker_SMA_30",
        "Ticker_EMA_10",
        "Ticker_EMA_30",
        "Ticker_RSI",
        "Ticker_MACD",
        "Ticker_MACD_Signal",
        "Ticker_MACD_Diff",
        "Ticker_Stochastic_K",
        "Ticker_Stochastic_D",
        "Ticker_Bollinger_High",
        "Ticker_Bollinger_Low",
        "Ticker_Bollinger_Mid",
        "Ticker_On_Balance_Volume",
        "Ticker_Chaikin_MF",
        "Ticker_MFI",
        "Ticker_Williams_R",
        "Ticker_TSI",
        "Ticker_UO",
        "Ticker_ROC",
    ]
    for col in expected:
        assert col in indicators.columns, f"Missing column: {col}"


def test_rsi_in_valid_range(indicators):
    rsi = indicators["Ticker_RSI"].dropna()
    assert len(rsi) > 0, "RSI has no non-null values"
    assert (rsi >= 0).all() and (rsi <= 100).all(), "RSI out of [0, 100] range"


def test_sma10_is_rolling_mean(indicators):
    """SMA_10 should equal the 10-period simple moving average of Close."""
    close = indicators["Ticker_Close"].reset_index(drop=True)
    sma10 = indicators["Ticker_SMA_10"].reset_index(drop=True)
    # Check a window starting at index 9 (first valid SMA_10)
    for i in range(9, min(20, len(close))):
        expected = close[i - 9 : i + 1].mean()
        actual = sma10[i]
        if not math.isnan(actual):
            assert abs(actual - expected) < 1e-6, f"SMA_10 mismatch at index {i}"


def test_bollinger_high_above_mid(indicators):
    bb_high = indicators["Ticker_Bollinger_High"].dropna()
    bb_mid = indicators["Ticker_Bollinger_Mid"].dropna()
    common_idx = bb_high.index.intersection(bb_mid.index)
    assert (bb_high[common_idx] >= bb_mid[common_idx]).all(), "Bollinger High must be >= Mid"


def test_no_inf_values(indicators):
    numeric_cols = indicators.select_dtypes(include=[float]).columns
    for col in numeric_cols:
        assert not indicators[col].isin([float("inf"), float("-inf")]).any(), (
            f"Infinity found in {col}"
        )


def test_row_count_matches_input(indicators):
    assert len(indicators) == 60, f"Expected 60 rows, got {len(indicators)}"
