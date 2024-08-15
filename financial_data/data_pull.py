import pandas as pd
import yfinance as yf
import numpy as np
import ta


def fetch_write_financial_data(conn):
    table = pd.read_html("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies")[0]
    tickers = table[~table["Symbol"].str.contains(r"\.")]["Symbol"].tolist()
    batch_size = 503

    def quant_data(tickers) -> pd.DataFrame:
        all_data = []
        for i in range(0, len(tickers), batch_size):
            batch = tickers[i : i + batch_size]
            data = yf.download(
                batch, interval="1d", group_by="ticker", auto_adjust=True
            )
            all_data.append(data)
        concatenated_data = pd.concat(all_data)
        quant_data = (
            concatenated_data.stack(level=0)
            .reset_index()
            .rename(columns={"level_1": "Ticker"})
        )

        quant_data.to_sql("stock_data", conn, if_exists="replace", index=False)

    def qual_data(tickers) -> pd.DataFrame:
        stock_information = []
        for i in range(0, len(tickers), batch_size):
            batch = tickers[i : i + batch_size]
            for ticker in batch:
                stock_info = yf.Ticker(ticker).info
                stock_data = {
                    "Ticker": ticker,
                    "Sector": stock_info.get("sector", "N/A"),
                    "Subsector": stock_info.get("industry", "N/A"),
                    "FullName": stock_info.get("longName", "N/A"),
                    "MarketCap": stock_info.get("marketCap", "N/A"),
                    "Country": stock_info.get("country", "N/A"),
                    "Website": stock_info.get("website", "N/A"),
                    "Description": stock_info.get("longBusinessSummary", "N/A"),
                    "CEO": stock_info.get("ceo", "N/A"),
                    "Employees": stock_info.get("fullTimeEmployees", "N/A"),
                    "City": stock_info.get("city", "N/A"),
                    "State": stock_info.get("state", "N/A"),
                    "Zip": stock_info.get("zip", "N/A"),
                    "Address": stock_info.get("address1", "N/A"),
                    "Phone": stock_info.get("phone", "N/A"),
                    "Exchange": stock_info.get("exchange", "N/A"),
                    "Currency": stock_info.get("currency", "N/A"),
                    "QuoteType": stock_info.get("quoteType", "N/A"),
                    "ShortName": stock_info.get("shortName", "N/A"),
                    "Price": stock_info.get("regularMarketPrice", "N/A"),
                    "52WeekHigh": stock_info.get("fiftyTwoWeekHigh", "N/A"),
                    "52WeekLow": stock_info.get("fiftyTwoWeekLow", "N/A"),
                    "DividendRate": stock_info.get("dividendRate", "N/A"),
                    "DividendYield": stock_info.get("dividendYield", "N/A"),
                    "PayoutRatio": stock_info.get("payoutRatio", "N/A"),
                    "Beta": stock_info.get("beta", "N/A"),
                    "PE": stock_info.get("trailingPE", "N/A"),
                    "EPS": stock_info.get("trailingEps", "N/A"),
                    "Revenue": stock_info.get("totalRevenue", "N/A"),
                    "GrossProfit": stock_info.get("grossProfits", "N/A"),
                    "FreeCashFlow": stock_info.get("freeCashflow", "N/A"),
                }
                stock_information.append(stock_data)
        qual_data = pd.DataFrame(stock_information)
        qual_data.to_sql("stock_information", conn, if_exists="replace", index=False)

    qual_data = qual_data(tickers)
    quant_data = quant_data(tickers)


def calculate_indicators(df: pd.DataFrame, prefix: str) -> pd.DataFrame:
    df = df.rename(
        columns={
            "Close": f"{prefix}_Close",
            "High": f"{prefix}_High",
            "Low": f"{prefix}_Low",
            "Volume": f"{prefix}_Volume",
        }
    )

    close = df[f"{prefix}_Close"]
    high = df[f"{prefix}_High"]
    low = df[f"{prefix}_Low"]
    volume = df[f"{prefix}_Volume"]

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


def process_data(conn, query: str, table_name: str, prefix: str):
    df = pd.read_sql_query(query, conn)
    df["Date"] = pd.to_datetime(df["Date"])
    indicators_df = calculate_indicators(df, prefix)
    result_df = pd.concat([df, indicators_df], axis=1)
    result_df.to_sql(table_name, conn, if_exists="replace", index=False)
    print(f"Processed and stored data in {table_name}")


def create_combined_view(conn):
    view_query = """
    CREATE VIEW IF NOT EXISTS combined_stock_data AS
    SELECT
        t.Date,
        t.Ticker,
        t.* EXCEPT (Date),
        s.* EXCEPT (Date),
        ss.* EXCEPT (Date),
        si.* EXCEPT (Ticker, Sector, Subsector)
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


def process_stock_data(conn):
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
