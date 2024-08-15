import sqlite3
import pandas as pd
import numpy as np
import ta


def create_connection(db_name: str) -> sqlite3.Connection:
    return sqlite3.connect(db_name)


def execute_query(conn: sqlite3.Connection, query: str) -> pd.DataFrame:
    return pd.read_sql_query(query, conn)


def calculate_indicators(df: pd.DataFrame, prefix: str) -> pd.DataFrame:
    close = df["Close"]
    high = df["High"]
    low = df["Low"]
    volume = df["Volume"]

    indicators = {
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
    return indicators_df.replace([np.inf, -np.inf], np.nan).ffill()


def process_data(conn: sqlite3.Connection, query: str, table_name: str, prefix: str):
    df = execute_query(conn, query)
    df["Date"] = pd.to_datetime(df["Date"])
    indicators_df = calculate_indicators(df, prefix)
    result_df = pd.concat([df, indicators_df], axis=1)
    result_df.to_sql(table_name, conn, if_exists="replace", index=False)
    print(f"Processed and stored data in {table_name}")


def create_combined_view(conn: sqlite3.Connection):
    view_query = """
    CREATE VIEW IF NOT EXISTS combined_stock_data AS
    SELECT
        t.Date,
        t.Ticker,
        t.Open as Ticker_Open,
        t.Close as Ticker_Close,
        t.High as Ticker_High,
        t.Low as Ticker_Low,
        t.Volume as Ticker_Volume,
        t.Ticker_SMA_10,
        t.Ticker_EMA_10,
        t.Ticker_RSI,
        t.Ticker_Stochastic_K,
        t.Ticker_Stochastic_D,
        t.Ticker_MACD,
        t.Ticker_MACD_Signal,
        t.Ticker_MACD_Diff,
        t.Ticker_TSI,
        t.Ticker_UO,
        t.Ticker_ROC,
        t.Ticker_Williams_R,
        t.Ticker_Bollinger_High,
        t.Ticker_Bollinger_Low,
        t.Ticker_Bollinger_Mid,
        t.Ticker_Bollinger_PBand,
        t.Ticker_Bollinger_WBand,
        t.Ticker_On_Balance_Volume,
        t.Ticker_Chaikin_MF,
        t.Ticker_Force_Index,
        t.Ticker_MFI,
        s.Open as Sector_Open,
        s.Close as Sector_Close,
        s.High as Sector_High,
        s.Low as Sector_Low,
        s.Volume as Sector_Volume,
        s.Sector_SMA_10,
        s.Sector_EMA_10,
        s.Sector_RSI,
        s.Sector_Stochastic_K,
        s.Sector_Stochastic_D,
        s.Sector_MACD,
        s.Sector_MACD_Signal,
        s.Sector_MACD_Diff,
        s.Sector_TSI,
        s.Sector_UO,
        s.Sector_ROC,
        s.Sector_Williams_R,
        s.Sector_Bollinger_High,
        s.Sector_Bollinger_Low,
        s.Sector_Bollinger_Mid,
        s.Sector_Bollinger_PBand,
        s.Sector_Bollinger_WBand,
        s.Sector_On_Balance_Volume,
        s.Sector_Chaikin_MF,
        s.Sector_Force_Index,
        s.Sector_MFI,
        ss.Open as Subsector_Open,
        ss.Close as Subsector_Close,
        ss.High as Subsector_High,
        ss.Low as Subsector_Low,
        ss.Volume as Subsector_Volume,
        ss.Subsector_SMA_10,
        ss.Subsector_EMA_10,
        ss.Subsector_RSI,
        ss.Subsector_Stochastic_K,
        ss.Subsector_Stochastic_D,
        ss.Subsector_MACD,
        ss.Subsector_MACD_Signal,
        ss.Subsector_MACD_Diff,
        ss.Subsector_TSI,
        ss.Subsector_UO,
        ss.Subsector_ROC,
        ss.Subsector_Williams_R,
        ss.Subsector_Bollinger_High,
        ss.Subsector_Bollinger_Low,
        ss.Subsector_Bollinger_Mid,
        ss.Subsector_Bollinger_PBand,
        ss.Subsector_Bollinger_WBand,
        ss.Subsector_On_Balance_Volume,
        ss.Subsector_Chaikin_MF,
        ss.Subsector_Force_Index,
        ss.Subsector_MFI,
        si.Sector,
        si.Subsector,
        si.FullName,
        si.MarketCap,
        si.Country,
        si.Website,
        si.Description,
        si.CEO,
        si.Employees,
        si.City,
        si.State,
        si.Zip,
        si.Address,
        si.Phone,
        si.Exchange,
        si.Currency,
        si.QuoteType,
        si.ShortName,
        si.Price,
        si."52WeekHigh",
        si."52WeekLow",
        si.DividendRate,
        si.DividendYield,
        si.PayoutRatio,
        si.Beta,
        si.PE,
        si.EPS,
        si.Revenue,
        si.GrossProfit,
        si.FreeCashFlow
    FROM
        ticker_data t
    JOIN
        stock_information si ON t.Ticker = si.Ticker
    JOIN
        sector_data s ON t.Date = s.Date AND si.Sector = s.Sector
    JOIN
        subsector_data ss ON t.Date = ss.Date AND si.Subsector = ss.Subsector
        """
    conn.execute(view_query)
    conn.commit()
    print("Created combined view: combined_stock_data")


def main():
    conn = create_connection("_stock_data.db")

    ticker_query = """
    SELECT
        sd.Date,
        sd.Ticker,
        SUM(sd.Open) as Open,
        SUM(sd.Close) as Close,
        SUM(sd.High) as High,
        SUM(sd.Low) as Low,
        SUM(sd.Volume) as Volume
    FROM
        stock_data sd
    GROUP BY
        sd.Ticker, sd.Date
    ORDER BY
        sd.Ticker, sd.Date
    """

    sector_query = """
    SELECT
        sd.Date,
        si.Sector,
        SUM(sd.Open) as Open,
        SUM(sd.Close) as Close,
        SUM(sd.High) as High,
        SUM(sd.Low) as Low,
        SUM(sd.Volume) as Volume
    FROM
        stock_data sd
    JOIN
        stock_information si ON sd.Ticker = si.Ticker
    GROUP BY
        si.Sector, sd.Date
    ORDER BY
        si.Sector, sd.Date
    """

    subsector_query = """
    SELECT
        sd.Date,
        si.Subsector,
        SUM(sd.Open) as Open,
        SUM(sd.Close) as Close,
        SUM(sd.High) as High,
        SUM(sd.Low) as Low,
        SUM(sd.Volume) as Volume
    FROM
        stock_data sd
    JOIN
        stock_information si ON sd.Ticker = si.Ticker
    GROUP BY
        si.Subsector, sd.Date
    ORDER BY
        si.Subsector, sd.Date
    """

    process_data(conn, ticker_query, "ticker_data", "Ticker")
    process_data(conn, sector_query, "sector_data", "Sector")
    process_data(conn, subsector_query, "subsector_data", "Subsector")

    create_combined_view(conn)

    conn.close()


if __name__ == "__main__":
    main()
