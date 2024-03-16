import pandas as pd
import numpy as np


def calculate_metrics(df):
    # Ensure the DataFrame is sorted by date
    df = df.sort_values(by="Date")

    # Price-Based Metrics
    df["Daily Returns"] = df["Close"].pct_change()
    df["Log Returns"] = np.log(1 + df["Daily Returns"])
    df["SMA_10"] = df["Close"].rolling(window=10).mean()
    df["EMA_10"] = df["Close"].ewm(span=10, adjust=False).mean()

    # Volume-Based Metrics
    df["Volume Change Rate"] = df["Volume"].pct_change()

    # Volatility Metrics
    df["Volatility_10"] = df["Daily Returns"].rolling(window=10).std()

    # Momentum Indicators (Example: RSI)
    delta = df["Close"].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / loss
    df["RSI"] = 100 - (100 / (1 + rs))

    # Ichimoku Cloud calculations with filling
    high_9 = df["High"].rolling(window=9).max().fillna(method="bfill")  # Backward fill
    low_9 = df["Low"].rolling(window=9).min().fillna(method="bfill")  # Backward fill
    df["Tenkan-sen"] = (high_9 + low_9) / 2

    high_26 = (
        df["High"].rolling(window=26).max().fillna(method="bfill")
    )  # Backward fill
    low_26 = df["Low"].rolling(window=26).min().fillna(method="bfill")  # Backward fill
    df["Kijun-sen"] = (high_26 + low_26) / 2

    df["Senkou Span A"] = ((df["Tenkan-sen"] + df["Kijun-sen"]) / 2).shift(26)
    df["Senkou Span B"] = (
        (
            df["High"].rolling(window=52).max().fillna(method="bfill")
            + df["Low"].rolling(window=52).min().fillna(method="bfill")
        )
        / 2
    ).shift(26)
    df["Chikou Span"] = df["Close"].shift(-26)

    # Fill NaN values for Senkou Span A, Senkou Span B, and Chikou Span without distorting their intended shifts
    df["Senkou Span A"].fillna(
        method="bfill", inplace=True
    )  # Backward fill for future projection
    df["Senkou Span B"].fillna(
        method="bfill", inplace=True
    )  # Backward fill for future projection
    df["Chikou Span"].fillna(
        method="ffill", inplace=True
    )  # Forward fill for past shift

    # Indicators for Dividends within 7, 30, and 90 days
    df["Dividend_7d"] = (
        df["Dividends"]
        .rolling(window=7, min_periods=1)
        .apply(lambda x: 1 if x.sum() > 0 else 0)
    )
    df["Dividend_30d"] = (
        df["Dividends"]
        .rolling(window=30, min_periods=1)
        .apply(lambda x: 1 if x.sum() > 0 else 0)
    )
    df["Dividend_90d"] = (
        df["Dividends"]
        .rolling(window=90, min_periods=1)
        .apply(lambda x: 1 if x.sum() > 0 else 0)
    )

    # Indicators for Stock Splits within 7, 30, and 90 days
    df["Split_7d"] = (
        df["Stock Splits"]
        .rolling(window=7, min_periods=1)
        .apply(lambda x: 1 if x.sum() > 0 else 0)
    )
    df["Split_30d"] = (
        df["Stock Splits"]
        .rolling(window=30, min_periods=1)
        .apply(lambda x: 1 if x.sum() > 0 else 0)
    )
    df["Split_90d"] = (
        df["Stock Splits"]
        .rolling(window=90, min_periods=1)
        .apply(lambda x: 1 if x.sum() > 0 else 0)
    )

    # Fill NaN values with 0 for these indicators
    df[
        [
            "Dividend_7d",
            "Dividend_30d",
            "Dividend_90d",
            "Split_7d",
            "Split_30d",
            "Split_90d",
        ]
    ].fillna(0, inplace=True)

    # Drop the original Dividends and Stock Splits columns
    df.drop(["Dividends", "Stock Splits"], axis=1, inplace=True)

    return df
