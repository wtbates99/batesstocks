import os
import sqlite3
import pandas as pd
import numpy as np
import ta

# Database path
db_path = os.path.expanduser("~/personal_git/stock_price_predictor/db/stock_data.db")

# Connect to the SQLite database
conn = sqlite3.connect(db_path)

# Read stock_data table into a DataFrame
df = pd.read_sql_query(
    "SELECT Date, Ticker, Open, Close, High, Low, Volume, Sector, Subsector FROM historicals_with_sector",
    conn,
)

# Ensure Date column is datetime
df["Date"] = pd.to_datetime(df["Date"])


# Function to calculate technical indicators with a prefix
def calculate_indicators(group, prefix):
    indicators = {
        f"{prefix}_SMA_10": ta.trend.sma_indicator(group["Close"], window=10),
        f"{prefix}_SMA_50": ta.trend.sma_indicator(group["Close"], window=50),
        f"{prefix}_EMA_10": ta.trend.ema_indicator(group["Close"], window=10),
        f"{prefix}_EMA_50": ta.trend.ema_indicator(group["Close"], window=50),
        f"{prefix}_RSI": ta.momentum.rsi(group["Close"], window=14),
        f"{prefix}_Stochastic_K": ta.momentum.stoch(
            group["High"], group["Low"], group["Close"], window=14, smooth_window=3
        ),
        f"{prefix}_Stochastic_D": ta.momentum.stoch_signal(
            group["High"], group["Low"], group["Close"], window=14, smooth_window=3
        ),
        f"{prefix}_MACD": ta.trend.macd(group["Close"]),
        f"{prefix}_MACD_Signal": ta.trend.macd_signal(group["Close"]),
        f"{prefix}_MACD_Diff": ta.trend.macd_diff(group["Close"]),
        f"{prefix}_TSI": ta.momentum.tsi(group["Close"]),
        f"{prefix}_UO": ta.momentum.ultimate_oscillator(
            group["High"], group["Low"], group["Close"]
        ),
        f"{prefix}_ROC": ta.momentum.roc(group["Close"], window=12),
        f"{prefix}_Williams_R": ta.momentum.williams_r(
            group["High"], group["Low"], group["Close"], lbp=14
        ),
        f"{prefix}_ATR": ta.volatility.average_true_range(
            group["High"], group["Low"], group["Close"], window=14
        ),
        f"{prefix}_Bollinger_High": ta.volatility.bollinger_hband(
            group["Close"], window=20, window_dev=2
        ),
        f"{prefix}_Bollinger_Low": ta.volatility.bollinger_lband(
            group["Close"], window=20, window_dev=2
        ),
        f"{prefix}_Bollinger_Mid": ta.volatility.bollinger_mavg(
            group["Close"], window=20
        ),
        f"{prefix}_Bollinger_PBand": ta.volatility.bollinger_pband(
            group["Close"], window=20, window_dev=2
        ),
        f"{prefix}_Bollinger_WBand": ta.volatility.bollinger_wband(
            group["Close"], window=20, window_dev=2
        ),
        f"{prefix}_On_Balance_Volume": ta.volume.on_balance_volume(
            group["Close"], group["Volume"]
        ),
        f"{prefix}_Chaikin_MF": ta.volume.chaikin_money_flow(
            group["High"], group["Low"], group["Close"], group["Volume"], window=20
        ),
        f"{prefix}_Force_Index": ta.volume.force_index(
            group["Close"], group["Volume"], window=13
        ),
        f"{prefix}_MFI": ta.volume.money_flow_index(
            group["High"], group["Low"], group["Close"], group["Volume"], window=14
        ),
        f"{prefix}_ADX": ta.trend.adx(
            group["High"], group["Low"], group["Close"], window=14
        ),
        f"{prefix}_CCI": ta.trend.cci(
            group["High"], group["Low"], group["Close"], window=20
        ),
        f"{prefix}_DPO": ta.trend.dpo(group["Close"], window=20),
        f"{prefix}_KST": ta.trend.kst(group["Close"]),
        f"{prefix}_KST_Signal": ta.trend.kst_sig(group["Close"]),
    }

    indicators_df = pd.DataFrame(indicators)

    # Replace infinite values with NaNs
    indicators_df = indicators_df.replace([np.inf, -np.inf], np.nan)
    indicators_df = indicators_df.ffill()

    return pd.concat([group, indicators_df], axis=1)


# Calculate indicators for different groupings and add prefixes
df = (
    df.sort_values(["Ticker", "Date"])
    .groupby("Ticker")
    .apply(calculate_indicators, "Ticker")
    .reset_index(drop=True)
)
df = (
    df.sort_values(["Sector", "Date"])
    .groupby("Sector")
    .apply(calculate_indicators, "Sector")
    .reset_index(drop=True)
)
df = (
    df.sort_values(["Subsector", "Date"])
    .groupby("Subsector")
    .apply(calculate_indicators, "Subsector")
    .reset_index(drop=True)
)

# Ensure the DataFrame is loaded to the SQLite database
df.to_sql("stock_data_with_indicators", conn, if_exists="replace", index=False)

conn.close()
