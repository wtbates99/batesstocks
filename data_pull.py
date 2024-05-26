import yfinance as yf
import pandas as pd
import sqlite3
import os
from tqdm import tqdm


def get_sp500_tickers():
    sp500_url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    table = pd.read_html(sp500_url)[0]
    filtered_table = table[~table["Symbol"].str.contains(r"\.")]
    return filtered_table["Symbol"].tolist()


# Function to download data in batches
def download_stock_data(tickers, batch_size=10):
    all_data = []
    for i in range(0, len(tickers), batch_size):
        batch = tickers[i : i + batch_size]
        data = yf.download(batch, interval="1d", group_by="ticker", auto_adjust=True)
        all_data.append(data)
    return all_data


# Function to store stock price data in SQLite
def store_stock_data_in_sqlite(data_list, db_path):
    conn = sqlite3.connect(os.path.expanduser(db_path))
    concatenated_data = pd.concat(data_list)
    flat_data = (
        concatenated_data.stack(level=0)
        .reset_index()
        .rename(columns={"level_1": "Ticker"})
    )
    flat_data.to_sql("stock_data", conn, if_exists="replace", index=False)
    conn.close()


# Function to get comprehensive stock information in batches
def get_stock_information_in_batches(tickers, batch_size):
    stock_information = []
    for i in range(0, len(tickers), batch_size):
        batch = tickers[i : i + batch_size]
        for ticker in tqdm(batch, desc="Fetching stock information..."):
            try:
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
            except Exception as e:
                print(f"Error fetching stock information for {ticker}: {e}")
                stock_information.append(
                    {
                        "Ticker": ticker,
                        "Sector": "N/A",
                        "Subsector": "N/A",
                        "FullName": "N/A",
                        "MarketCap": "N/A",
                        "Country": "N/A",
                        "Website": "N/A",
                        "Description": "N/A",
                        "CEO": "N/A",
                        "Employees": "N/A",
                        "City": "N/A",
                        "State": "N/A",
                        "Zip": "N/A",
                        "Address": "N/A",
                        "Phone": "N/A",
                        "Exchange": "N/A",
                        "Currency": "N/A",
                        "QuoteType": "N/A",
                        "ShortName": "N/A",
                        "Price": "N/A",
                        "52WeekHigh": "N/A",
                        "52WeekLow": "N/A",
                        "DividendRate": "N/A",
                        "DividendYield": "N/A",
                        "PayoutRatio": "N/A",
                        "Beta": "N/A",
                        "PE": "N/A",
                        "EPS": "N/A",
                        "Revenue": "N/A",
                        "GrossProfit": "N/A",
                        "FreeCashFlow": "N/A",
                    }
                )
    return stock_information


# Function to store stock information in SQLite
def store_stock_information_in_sqlite(stock_information, db_path):
    conn = sqlite3.connect(os.path.expanduser(db_path))
    df = pd.DataFrame(stock_information)
    df.to_sql("stock_information", conn, if_exists="replace", index=False)
    conn.close()


# Main execution
def main():
    db_dir = os.path.expanduser("~/personal_git/stock_price_predictor/db")
    db_path = os.path.join(db_dir, "stock_data.db")

    # Check if the database directory exists, create if not
    if not os.path.exists(db_dir):
        os.makedirs(db_dir)

    # Check if the database file exists, create if not
    if not os.path.exists(db_path):
        try:
            conn = sqlite3.connect(db_path)
            conn.execute("""
            CREATE TABLE IF NOT EXISTS stock_data (
                Date TEXT,
                Ticker TEXT,
                Open REAL,
                High REAL,
                Low REAL,
                Close REAL,
                Adj_Close REAL,
                Volume INTEGER
            )
            """)
            conn.execute("""
            CREATE TABLE IF NOT EXISTS stock_information (
                Ticker TEXT,
                Sector TEXT,
                Subsector TEXT,
                FullName TEXT,
                MarketCap REAL,
                Country TEXT,
                Website TEXT,
                Description TEXT,
                CEO TEXT,
                Employees INTEGER,
                City TEXT,
                State TEXT,
                Zip TEXT,
                Address TEXT,
                Phone TEXT,
                Exchange TEXT,
                Currency TEXT,
                QuoteType TEXT,
                ShortName TEXT,
                Price REAL,
                "52WeekHigh" REAL,
                "52WeekLow" REAL,
                DividendRate REAL,
                DividendYield REAL,
                PayoutRatio REAL,
                Beta REAL,
                PE REAL,
                EPS REAL,
                Revenue REAL,
                GrossProfit REAL,
                FreeCashFlow REAL
            )
            """)

            # Create the view if it doesn't exist
            conn.execute("""
            CREATE VIEW IF NOT EXISTS historicals_with_sector AS
            SELECT
                sd.Date,
                sd.Ticker,
                sd.Open,
                sd.High,
                sd.Low,
                sd.Close,
                sd.Volume,
                si.Sector,
                si.Subsector
            FROM stock_data sd
            JOIN stock_information si ON sd.Ticker = si.Ticker
            """)
            conn.close()
        except sqlite3.Error as e:
            print(f"SQLite error while creating tables/view: {e}")
        except Exception as e:
            print(f"Error while creating tables/view: {e}")

    tickers = get_sp500_tickers()
    batch_size = 503  # Set batch size as needed

    print("Downloading stock data...")
    all_data = download_stock_data(tickers, batch_size)

    print("Storing stock data to SQLite database...")
    store_stock_data_in_sqlite(all_data, db_path)

    print("Fetching comprehensive stock information...")
    stock_information = get_stock_information_in_batches(tickers, batch_size)

    print("Storing comprehensive stock information to SQLite database...")
    store_stock_information_in_sqlite(stock_information, db_path)

    print("Data download and storage complete.")


if __name__ == "__main__":
    main()
