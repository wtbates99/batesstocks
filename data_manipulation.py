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
    "SELECT Date, Ticker, Open, Close, High, Low, Volume FROM stock_data", conn
)

# Ensure Date column is datetime
df["Date"] = pd.to_datetime(df["Date"])

# Sort by Date and Ticker
df = df.sort_values(["Ticker", "Date"])


# Define a function to calculate technical indicators and impute missing values
def calculate_indicators(group):
    # Calculate technical indicators
    group["SMA_10"] = ta.trend.sma_indicator(group["Close"], window=10)
    group["SMA_50"] = ta.trend.sma_indicator(group["Close"], window=50)
    group["EMA_10"] = ta.trend.ema_indicator(group["Close"], window=10)
    group["EMA_50"] = ta.trend.ema_indicator(group["Close"], window=50)

    group["RSI"] = ta.momentum.rsi(group["Close"], window=14)
    group["Stochastic_K"] = ta.momentum.stoch(
        group["High"], group["Low"], group["Close"], window=14, smooth_window=3
    )
    group["Stochastic_D"] = ta.momentum.stoch_signal(
        group["High"], group["Low"], group["Close"], window=14, smooth_window=3
    )
    group["MACD"] = ta.trend.macd(group["Close"])
    group["MACD_Signal"] = ta.trend.macd_signal(group["Close"])
    group["MACD_Diff"] = ta.trend.macd_diff(group["Close"])
    group["TSI"] = ta.momentum.tsi(group["Close"])
    group["UO"] = ta.momentum.ultimate_oscillator(
        group["High"], group["Low"], group["Close"]
    )
    group["ROC"] = ta.momentum.roc(group["Close"], window=12)
    group["Williams_R"] = ta.momentum.williams_r(
        group["High"], group["Low"], group["Close"], lbp=14
    )

    group["ATR"] = ta.volatility.average_true_range(
        group["High"], group["Low"], group["Close"], window=14
    )
    group["Bollinger_High"] = ta.volatility.bollinger_hband(
        group["Close"], window=20, window_dev=2
    )
    group["Bollinger_Low"] = ta.volatility.bollinger_lband(
        group["Close"], window=20, window_dev=2
    )
    group["Bollinger_Mid"] = ta.volatility.bollinger_mavg(group["Close"], window=20)
    group["Bollinger_PBand"] = ta.volatility.bollinger_pband(
        group["Close"], window=20, window_dev=2
    )
    group["Bollinger_WBand"] = ta.volatility.bollinger_wband(
        group["Close"], window=20, window_dev=2
    )

    group["On_Balance_Volume"] = ta.volume.on_balance_volume(
        group["Close"], group["Volume"]
    )
    group["Chaikin_MF"] = ta.volume.chaikin_money_flow(
        group["High"], group["Low"], group["Close"], group["Volume"], window=20
    )
    group["Force_Index"] = ta.volume.force_index(
        group["Close"], group["Volume"], window=13
    )
    group["MFI"] = ta.volume.money_flow_index(
        group["High"], group["Low"], group["Close"], group["Volume"], window=14
    )

    group["ADX"] = ta.trend.adx(group["High"], group["Low"], group["Close"], window=14)
    group["CCI"] = ta.trend.cci(group["High"], group["Low"], group["Close"], window=20)

    group["DPO"] = ta.trend.dpo(group["Close"], window=20)
    group["KST"] = ta.trend.kst(group["Close"])
    group["KST_Signal"] = ta.trend.kst_sig(group["Close"])

    # Replace infinite values with NaNs
    group = group.replace([np.inf, -np.inf], np.nan)

    group = group.ffill()

    return group


# Apply the function to each group (ticker) and calculate indicators
df = df.groupby("Ticker").apply(calculate_indicators).reset_index(drop=True)

# Save the enhanced and cleaned data back to the database
df.to_sql("enhanced_stock_data", conn, if_exists="replace", index=False)
print("Data enhanced, cleaned, and saved to 'enhanced_stock_data' table.")

# Close the connection
conn.close()
