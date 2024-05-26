import os
import sqlite3
import pandas as pd
import ta
from sklearn.impute import KNNImputer

# Database path
db_path = os.path.expanduser("~/personal_git/stock_price_predictor/db/stock_data.db")

# Connect to the SQLite database
conn = sqlite3.connect(db_path)

# Read stock_data table into a DataFrame
df = pd.read_sql_query("SELECT * FROM stock_data", conn)

# Ensure Date column is datetime
df["Date"] = pd.to_datetime(df["Date"])

# Sort by Date and Ticker
df = df.sort_values(["Ticker", "Date"])

# List to store processed data for each ticker
processed_data = []

# Process data for each ticker
tickers = df["Ticker"].unique()

for ticker in tickers:
    df_ticker = df[df["Ticker"] == ticker].copy()

    # Check if there's enough data for the indicators
    min_periods = 50

    if len(df_ticker) >= min_periods:
        # Calculate technical indicators
        df_ticker["SMA_10"] = ta.trend.sma_indicator(df_ticker["Close"], window=10)
        df_ticker["SMA_50"] = ta.trend.sma_indicator(df_ticker["Close"], window=50)
        df_ticker["EMA_10"] = ta.trend.ema_indicator(df_ticker["Close"], window=10)
        df_ticker["EMA_50"] = ta.trend.ema_indicator(df_ticker["Close"], window=50)

        df_ticker["RSI"] = ta.momentum.rsi(df_ticker["Close"], window=14)
        df_ticker["Stochastic_K"] = ta.momentum.stoch(
            df_ticker["High"],
            df_ticker["Low"],
            df_ticker["Close"],
            window=14,
            smooth_window=3,
        )
        df_ticker["Stochastic_D"] = ta.momentum.stoch_signal(
            df_ticker["High"],
            df_ticker["Low"],
            df_ticker["Close"],
            window=14,
            smooth_window=3,
        )
        df_ticker["MACD"] = ta.trend.macd(df_ticker["Close"])
        df_ticker["MACD_Signal"] = ta.trend.macd_signal(df_ticker["Close"])
        df_ticker["MACD_Diff"] = ta.trend.macd_diff(df_ticker["Close"])
        df_ticker["TSI"] = ta.momentum.tsi(df_ticker["Close"])
        df_ticker["UO"] = ta.momentum.ultimate_oscillator(
            df_ticker["High"], df_ticker["Low"], df_ticker["Close"]
        )
        df_ticker["ROC"] = ta.momentum.roc(df_ticker["Close"], window=12)
        df_ticker["Williams_R"] = ta.momentum.williams_r(
            df_ticker["High"], df_ticker["Low"], df_ticker["Close"], lbp=14
        )

        df_ticker["ATR"] = ta.volatility.average_true_range(
            df_ticker["High"], df_ticker["Low"], df_ticker["Close"], window=14
        )
        df_ticker["Bollinger_High"] = ta.volatility.bollinger_hband(
            df_ticker["Close"], window=20, window_dev=2
        )
        df_ticker["Bollinger_Low"] = ta.volatility.bollinger_lband(
            df_ticker["Close"], window=20, window_dev=2
        )
        df_ticker["Bollinger_Mid"] = ta.volatility.bollinger_mavg(
            df_ticker["Close"], window=20
        )
        df_ticker["Bollinger_PBand"] = ta.volatility.bollinger_pband(
            df_ticker["Close"], window=20, window_dev=2
        )
        df_ticker["Bollinger_WBand"] = ta.volatility.bollinger_wband(
            df_ticker["Close"], window=20, window_dev=2
        )

        df_ticker["On_Balance_Volume"] = ta.volume.on_balance_volume(
            df_ticker["Close"], df_ticker["Volume"]
        )
        df_ticker["Chaikin_MF"] = ta.volume.chaikin_money_flow(
            df_ticker["High"],
            df_ticker["Low"],
            df_ticker["Close"],
            df_ticker["Volume"],
            window=20,
        )
        df_ticker["Force_Index"] = ta.volume.force_index(
            df_ticker["Close"], df_ticker["Volume"], window=13
        )
        df_ticker["MFI"] = ta.volume.money_flow_index(
            df_ticker["High"],
            df_ticker["Low"],
            df_ticker["Close"],
            df_ticker["Volume"],
            window=14,
        )

        df_ticker["ADX"] = ta.trend.adx(
            df_ticker["High"], df_ticker["Low"], df_ticker["Close"], window=14
        )
        df_ticker["CCI"] = ta.trend.cci(
            df_ticker["High"], df_ticker["Low"], df_ticker["Close"], window=20
        )
        df_ticker["Aroon_Up"] = ta.trend.aroon_up(df_ticker["Close"], window=25)
        df_ticker["Aroon_Down"] = ta.trend.aroon_down(df_ticker["Close"], window=25)

        df_ticker["DPO"] = ta.trend.dpo(df_ticker["Close"], window=20)
        df_ticker["KST"] = ta.trend.kst(df_ticker["Close"])
        df_ticker["KST_Signal"] = ta.trend.kst_sig(df_ticker["Close"])
        df_ticker["PSAR"] = ta.trend.psar(
            df_ticker["High"], df_ticker["Low"], df_ticker["Close"]
        )

        # Clean data: Impute missing values with the average of the closest 3 points
        imputer = KNNImputer(n_neighbors=3)
        df_ticker_imputed = pd.DataFrame(
            imputer.fit_transform(df_ticker.iloc[:, 2:]), columns=df_ticker.columns[2:]
        )
        df_ticker = pd.concat(
            [df_ticker[["Date", "Ticker"]], df_ticker_imputed], axis=1
        )

        # Append the processed data for the current ticker to the list
        processed_data.append(df_ticker)
    else:
        print(
            f"Not enough data to calculate indicators for ticker {ticker}. Need at least {min_periods} rows."
        )

# Check if there's any processed data to save
if processed_data:
    # Combine all processed data into a single DataFrame
    df_processed = pd.concat(processed_data, ignore_index=True)

    # Save the enhanced and cleaned data back to the database
    df_processed.to_sql("enhanced_stock_data", conn, if_exists="replace", index=False)
    print("Data enhanced, cleaned, and saved to 'enhanced_stock_data' table.")
else:
    print(
        "No data was processed. The table 'enhanced_stock_data' was not created or updated."
    )

# Close the connection
conn.close()
