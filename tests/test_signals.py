"""Tests for signal SQL views created by create_signal_views()."""

import os
import sys
from datetime import date, timedelta

import duckdb
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import create_signal_views

SCHEMA = """
CREATE TABLE IF NOT EXISTS combined_stock_data (
    Date TEXT,
    Ticker TEXT,
    Ticker_Close DOUBLE,
    Ticker_MACD DOUBLE,
    Ticker_MACD_Signal DOUBLE,
    Ticker_MACD_Diff DOUBLE,
    Ticker_RSI DOUBLE,
    Ticker_Stochastic_K DOUBLE,
    Ticker_Stochastic_D DOUBLE,
    Ticker_Bollinger_High DOUBLE,
    Ticker_Bollinger_Low DOUBLE,
    Ticker_SMA_10 DOUBLE,
    Ticker_EMA_10 DOUBLE,
    Ticker_SMA_30 DOUBLE,
    Ticker_Volume DOUBLE,
    Ticker_TSI DOUBLE,
    Ticker_UO DOUBLE,
    Ticker_MFI DOUBLE,
    Ticker_Chaikin_MF DOUBLE,
    Ticker_Williams_R DOUBLE,
    FullName TEXT
);
"""


@pytest.fixture
def conn():
    c = duckdb.connect(":memory:")
    c.execute(SCHEMA)
    create_signal_views(c)
    yield c
    c.close()


def insert_row(
    conn, date, ticker, close, macd, macd_signal, rsi, stoch_k, stoch_d, bb_high=None, bb_low=None
):
    conn.execute(
        """
        INSERT INTO combined_stock_data
        (Date, Ticker, Ticker_Close, Ticker_MACD, Ticker_MACD_Signal, Ticker_MACD_Diff,
         Ticker_RSI, Ticker_Stochastic_K, Ticker_Stochastic_D,
         Ticker_Bollinger_High, Ticker_Bollinger_Low,
         Ticker_SMA_10, Ticker_EMA_10, Ticker_SMA_30, Ticker_Volume,
         Ticker_TSI, Ticker_UO, Ticker_MFI, Ticker_Chaikin_MF, Ticker_Williams_R, FullName)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
        [
            date,
            ticker,
            close,
            macd,
            macd_signal,
            macd - macd_signal,
            rsi,
            stoch_k,
            stoch_d,
            bb_high,
            bb_low,
            close * 0.98,
            close * 0.99,
            close * 0.95,
            1_000_000,
            0.5,
            55,
            55,
            0.1,
            -30,
            f"{ticker} Corp",
        ],
    )


def test_bullish_signal_detected(conn):
    # MACD > Signal + 0.01, RSI < 30, Stoch_K > Stoch_D
    insert_row(
        conn, "2024-01-01", "TEST", 100, macd=1.5, macd_signal=1.0, rsi=25, stoch_k=60, stoch_d=40
    )
    rows = conn.execute("SELECT Signal FROM signals_view WHERE Ticker='TEST'").fetchall()
    signals = [r[0] for r in rows]
    assert "Bullish" in signals, "Expected Bullish signal"


def test_bearish_signal_detected(conn):
    # MACD < Signal - 0.01, RSI > 70, Stoch_K < Stoch_D
    insert_row(
        conn, "2024-01-02", "BEAR", 100, macd=1.0, macd_signal=1.5, rsi=75, stoch_k=30, stoch_d=60
    )
    rows = conn.execute("SELECT Signal FROM signals_view WHERE Ticker='BEAR'").fetchall()
    signals = [r[0] for r in rows]
    assert "Bearish" in signals, "Expected Bearish signal"


def test_neutral_row_no_signal(conn):
    # RSI=50, MACD ≈ signal — neither bullish nor bearish
    insert_row(
        conn,
        "2024-01-03",
        "NEUTRAL",
        100,
        macd=1.0,
        macd_signal=1.0,
        rsi=50,
        stoch_k=50,
        stoch_d=50,
    )
    rows = conn.execute("SELECT Signal FROM signals_view WHERE Ticker='NEUTRAL'").fetchall()
    assert len(rows) == 0, "Neutral row should produce no signal"


def test_bollinger_breakout_above(conn):
    # Close above Bollinger High
    insert_row(
        conn,
        "2024-01-04",
        "BOLL",
        120,
        macd=0,
        macd_signal=0,
        rsi=50,
        stoch_k=50,
        stoch_d=50,
        bb_high=110,
        bb_low=90,
    )
    rows = conn.execute(
        "SELECT BollingerSignal FROM bollinger_breakouts_view WHERE Ticker='BOLL'"
    ).fetchall()
    signals = [r[0] for r in rows]
    assert any("Breakout Above" in s for s in signals), "Expected breakout above signal"


def test_bollinger_breakout_below(conn):
    # Close below Bollinger Low
    insert_row(
        conn,
        "2024-01-05",
        "BOLL2",
        80,
        macd=0,
        macd_signal=0,
        rsi=50,
        stoch_k=50,
        stoch_d=50,
        bb_high=110,
        bb_low=90,
    )
    rows = conn.execute(
        "SELECT BollingerSignal FROM bollinger_breakouts_view WHERE Ticker='BOLL2'"
    ).fetchall()
    signals = [r[0] for r in rows]
    assert any("Breakout Below" in s for s in signals), "Expected breakout below signal"


def test_golden_cross_detected(conn):
    """SMA_10 crosses above EMA_10: should appear in golden_death_cross_view as Golden Cross."""
    # Row 1: SMA_10 < EMA_10 (before the cross)
    conn.execute("""
        INSERT INTO combined_stock_data
        (Date, Ticker, Ticker_Close, Ticker_MACD, Ticker_MACD_Signal, Ticker_MACD_Diff,
         Ticker_RSI, Ticker_Stochastic_K, Ticker_Stochastic_D,
         Ticker_Bollinger_High, Ticker_Bollinger_Low,
         Ticker_SMA_10, Ticker_EMA_10, Ticker_SMA_30, Ticker_Volume,
         Ticker_TSI, Ticker_UO, Ticker_MFI, Ticker_Chaikin_MF, Ticker_Williams_R, FullName)
        VALUES ('2024-02-01','GOLD',100,0,0,0,50,50,50,110,90, 98,100,95,1000000,0.5,55,55,0.1,-30,'Gold Corp')
    """)
    # Row 2: SMA_10 > EMA_10 (the cross day — LAG picks up previous row)
    conn.execute("""
        INSERT INTO combined_stock_data
        (Date, Ticker, Ticker_Close, Ticker_MACD, Ticker_MACD_Signal, Ticker_MACD_Diff,
         Ticker_RSI, Ticker_Stochastic_K, Ticker_Stochastic_D,
         Ticker_Bollinger_High, Ticker_Bollinger_Low,
         Ticker_SMA_10, Ticker_EMA_10, Ticker_SMA_30, Ticker_Volume,
         Ticker_TSI, Ticker_UO, Ticker_MFI, Ticker_Chaikin_MF, Ticker_Williams_R, FullName)
        VALUES ('2024-02-02','GOLD',102,0,0,0,50,50,50,110,90, 102,100,96,1000000,0.5,55,55,0.1,-30,'Gold Corp')
    """)
    rows = conn.execute(
        "SELECT CrossSignal FROM golden_death_cross_view WHERE Ticker='GOLD'"
    ).fetchall()
    cross_signals = [r[0] for r in rows]
    assert any("Golden" in cs for cs in cross_signals), "Expected Golden Cross signal"


def test_volume_breakout_detected(conn):
    """Volume 3× the ticker average should appear in volume_breakout_view."""
    # Insert 30 low-volume rows to establish a baseline
    base_date = date(2024, 3, 1)
    for i in range(30):
        date_str = (base_date + timedelta(days=i)).isoformat()
        conn.execute(
            """
            INSERT INTO combined_stock_data
            (Date, Ticker, Ticker_Close, Ticker_MACD, Ticker_MACD_Signal, Ticker_MACD_Diff,
             Ticker_RSI, Ticker_Stochastic_K, Ticker_Stochastic_D,
             Ticker_Bollinger_High, Ticker_Bollinger_Low,
             Ticker_SMA_10, Ticker_EMA_10, Ticker_SMA_30, Ticker_Volume,
             Ticker_TSI, Ticker_UO, Ticker_MFI, Ticker_Chaikin_MF, Ticker_Williams_R, FullName)
            VALUES (?, 'VOLBK', 100, 0, 0, 0, 50, 50, 50,
                    110, 90, 98, 99, 95, 500000, 0.5, 55, 55, 0.1, -30, 'VolBk Corp')
        """,
            [date_str],
        )
    # Insert high-volume spike row
    conn.execute("""
        INSERT INTO combined_stock_data
        (Date, Ticker, Ticker_Close, Ticker_MACD, Ticker_MACD_Signal, Ticker_MACD_Diff,
         Ticker_RSI, Ticker_Stochastic_K, Ticker_Stochastic_D,
         Ticker_Bollinger_High, Ticker_Bollinger_Low,
         Ticker_SMA_10, Ticker_EMA_10, Ticker_SMA_30, Ticker_Volume,
         Ticker_TSI, Ticker_UO, Ticker_MFI, Ticker_Chaikin_MF, Ticker_Williams_R, FullName)
        VALUES ('2024-05-01','VOLBK',105,0,0,0,50,50,50,110,90,103,102,98,5000000,0.5,55,55,0.1,-30,'VolBk Corp')
    """)
    rows = conn.execute("SELECT Ticker FROM volume_breakout_view WHERE Ticker='VOLBK'").fetchall()
    assert len(rows) > 0, "Expected a volume breakout row for VOLBK"
