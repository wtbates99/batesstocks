import pandas as pd
import numpy as np

# Price-Based Metrics
def calculate_daily_returns(df):
    df["Daily Returns"] = df["Close"].pct_change()
    return df


def calculate_log_returns(df):
    df["Log Returns"] = np.log(1 + df["Daily Returns"])
    return df


def calculate_sma(df, window=10):
    df[f"SMA_{window}"] = df["Close"].rolling(window=window).mean()
    return df


def calculate_ema(df, span=10):
    df[f"EMA_{span}"] = df["Close"].ewm(span=span, adjust=False).mean()
    return df


# Volume-Based Metrics
def calculate_volume_change_rate(df):
    df["Volume Change Rate"] = df["Volume"].pct_change()
    return df


# Volatility Metrics
def calculate_volatility(df, window=10):
    df[f"Volatility_{window}"] = df["Daily Returns"].rolling(window=window).std()
    return df


# Momentum Indicators
def calculate_rsi(df, window=14):
    delta = df["Close"].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=window).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=window).mean()
    rs = gain / loss
    df["RSI"] = 100 - (100 / (1 + rs))
    return df


# Ichimoku
def calculate_ichimoku_cloud(df):
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
    return df


# Dividends and Splits Indicators
def calculate_dividend_split_indicators(df, windows=[7, 30, 90]):
    print(df.columns)
    for window in windows:
        df[f"Dividend_{window}d"] = (
            df["Dividends"]
            .rolling(window=window, min_periods=1)
            .apply(lambda x: 1 if x.sum() > 0 else 0)
        )
        df[f"Split_{window}d"] = (
            df["Stock Splits"]
            .rolling(window=window, min_periods=1)
            .apply(lambda x: 1 if x.sum() > 0 else 0)
        )
    # Fill NaN values with 0
    indicators = [f"Dividend_{window}d" for window in windows] + [
        f"Split_{window}d" for window in windows
    ]
    df[indicators].fillna(0, inplace=True)
    return df


def clean_up_columns(df):
    # Drop the original Dividends and Stock Splits columns
    df.drop(["Dividends", "Stock Splits"], axis=1, inplace=True)
    return df


def calculate_metrics(df):
    # Ensure the DataFrame is sorted by date
    df = df.sort_values(by="Date")

    # Call each metrics calculation function
    df = calculate_daily_returns(df)
    df = calculate_log_returns(df)
    df = calculate_sma(df)
    df = calculate_ema(df)
    df = calculate_volume_change_rate(df)
    df = calculate_volatility(df)
    df = calculate_rsi(df)
    df = calculate_ichimoku_cloud(df)
    df = calculate_dividend_split_indicators(df)
    df = clean_up_columns(df)

    return df
