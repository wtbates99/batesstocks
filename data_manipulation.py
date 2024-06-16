import sqlite3
import pandas as pd
import numpy as np
import ta

conn = sqlite3.connect("_stock_data.db")

t_query = """
SELECT Date, Ticker,
       SUM(Open) as Open,
       SUM(Close) as Close,
       SUM(High) as High,
       SUM(Low) as Low,
       SUM(Volume) as Volume
FROM historicals_with_sector
GROUP BY Ticker, Date
ORDER BY Ticker, Date
"""

s_query = """
SELECT Date, Sector,
       SUM(Open) as Open,
       SUM(Close) as Close,
       SUM(High) as High,
       SUM(Low) as Low,
       SUM(Volume) as Volume
FROM historicals_with_sector
GROUP BY Sector, Date
ORDER BY Sector, Date
"""

ss_query = """
SELECT Subsector, Date,
       SUM(Open) as Open,
       SUM(Close) as Close,
       SUM(High) as High,
       SUM(Low) as Low,
       SUM(Volume) as Volume
FROM historicals_with_sector
GROUP BY Subsector, Date
ORDER BY Subsector, Date
"""


def calculate_indicators(df: pd.DataFrame, prefix: str) -> pd.DataFrame:
    close = df["Close"]
    high = df["High"]
    low = df["Low"]
    volume = df["Volume"]

    indicators = {
        f"{prefix}": prefix,
        f"{prefix}_SMA_10": ta.trend.sma_indicator(close, window=10),
        f"{prefix}_EMA_10": ta.trend.ema_indicator(close, window=10),
        f"{prefix}_RSI": ta.momentum.rsi(close, window=14),
        f"{prefix}_Stochastic_K": ta.momentum.stoch(
            high, low, close, window=14, smooth_window=3
        ),
        f"{prefix}_Stochastic_D": ta.momentum.stoch_signal(
            high, low, close, window=14, smooth_window=3
        ),
        f"{prefix}_MACD": ta.trend.macd(close),
        f"{prefix}_MACD_Signal": ta.trend.macd_signal(close),
        f"{prefix}_MACD_Diff": ta.trend.macd_diff(close),
        f"{prefix}_TSI": ta.momentum.tsi(close),
        f"{prefix}_UO": ta.momentum.ultimate_oscillator(high, low, close),
        f"{prefix}_ROC": ta.momentum.roc(close, window=12),
        f"{prefix}_Williams_R": ta.momentum.williams_r(high, low, close, lbp=14),
        f"{prefix}_Bollinger_High": ta.volatility.bollinger_hband(
            close, window=20, window_dev=2
        ),
        f"{prefix}_Bollinger_Low": ta.volatility.bollinger_lband(
            close, window=20, window_dev=2
        ),
        f"{prefix}_Bollinger_Mid": ta.volatility.bollinger_mavg(close, window=20),
        f"{prefix}_Bollinger_PBand": ta.volatility.bollinger_pband(
            close, window=20, window_dev=2
        ),
        f"{prefix}_Bollinger_WBand": ta.volatility.bollinger_wband(
            close, window=20, window_dev=2
        ),
        f"{prefix}_On_Balance_Volume": ta.volume.on_balance_volume(close, volume),
        f"{prefix}_Chaikin_MF": ta.volume.chaikin_money_flow(
            high, low, close, volume, window=20
        ),
        f"{prefix}_Force_Index": ta.volume.force_index(close, volume, window=13),
        f"{prefix}_MFI": ta.volume.money_flow_index(
            high, low, close, volume, window=14
        ),
    }

    indicators_df = pd.DataFrame(indicators)
    indicators_df = indicators_df.replace([np.inf, -np.inf], np.nan).ffill()

    return pd.concat([prefix, indicators_df], axis=1)


t_df = pd.read_sql_query(t_query, conn)
s_df = pd.read_sql_query(s_query, conn)
ss_df = pd.read_sql_query(ss_query, conn)


t_df["Date"] = pd.to_datetime(t_df["Date"])
s_df["Date"] = pd.to_datetime(s_df["Date"])
ss_df["Date"] = pd.to_datetime(ss_df["Date"])

t_df = calculate_indicators(t_df, "Ticker")
print("t")
s_df = calculate_indicators(s_df, "Sector")
print("s")
ss_df = calculate_indicators(ss_df, "Subsector")
print("ss")

t_df.to_sql("stock_data_with_indicators", conn, if_exists="replace", index=False)
s_df.to_sql("stock_data_with_indicators", conn, if_exists="replace", index=False)
ss_df.to_sql("stock_data_with_indicators", conn, if_exists="replace", index=False)

conn.close()
