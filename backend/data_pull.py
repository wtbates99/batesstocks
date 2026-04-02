import concurrent.futures
import datetime as dt
import logging
import sqlite3

import pandas as pd
import yfinance as yf

logger = logging.getLogger("batesstocks.data_pull")


def get_sp500_table():
    table = pd.read_html(
        "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
        storage_options={"User-Agent": "Mozilla/5.0"},
    )[0]
    return table[~table["Symbol"].str.contains(r"\.")].copy()


def fetch_write_financial_data(conn, table, tickers, append=False):
    if_exists = "append" if append else "replace"
    filtered = table[table["Symbol"].isin(set(tickers))].copy()

    def quant_data():
        start_date = (dt.date.today() - dt.timedelta(days=7 * 365)).isoformat()
        data = yf.download(
            tickers,
            start=start_date,
            interval="1d",
            group_by="ticker",
            auto_adjust=True,
            progress=False,
        )
        result = data.stack(level=0, future_stack=True).reset_index()
        result.to_sql("stock_data", conn, if_exists=if_exists, index=False)

    def qual_data():
        wiki = filtered[
            ["Symbol", "Security", "GICS Sector", "GICS Sub-Industry", "Headquarters Location"]
        ].rename(
            columns={
                "Symbol": "Ticker",
                "Security": "FullName",
                "GICS Sector": "Sector",
                "GICS Sub-Industry": "Subsector",
                "Headquarters Location": "_HQ",
            }
        )
        wiki = wiki.copy()
        wiki["City"] = wiki["_HQ"].str.split(",").str[0].str.strip()
        wiki["State"] = wiki["_HQ"].str.split(",").str[-1].str.strip()
        wiki["Country"] = "United States"
        wiki = wiki.drop(columns=["_HQ"])

        def fetch_financials(ticker):
            row = {"Ticker": ticker}
            t = yf.Ticker(ticker)
            try:
                fi = t.fast_info
                row.update(
                    {
                        "MarketCap": getattr(fi, "market_cap", None),
                        "Price": getattr(fi, "last_price", None),
                        "52WeekHigh": getattr(fi, "year_high", None),
                        "52WeekLow": getattr(fi, "year_low", None),
                        "Exchange": getattr(fi, "exchange", None),
                        "Currency": getattr(fi, "currency", None),
                        "QuoteType": getattr(fi, "quote_type", None),
                    }
                )
            except Exception as e:
                logger.warning("Failed to fetch fast_info for %s: %s", ticker, e)
            try:
                info = t.info
                row.update(
                    {
                        "ShortName": info.get("shortName"),
                        "Website": info.get("website"),
                        "Description": info.get("longBusinessSummary"),
                        "CEO": info.get("ceo"),
                        "Employees": info.get("fullTimeEmployees"),
                        "Zip": info.get("zip"),
                        "Address": info.get("address1"),
                        "Phone": info.get("phone"),
                        "DividendRate": info.get("dividendRate"),
                        "DividendYield": info.get("dividendYield"),
                        "PayoutRatio": info.get("payoutRatio"),
                        "Beta": info.get("beta"),
                        "PE": info.get("trailingPE"),
                        "EPS": info.get("trailingEps"),
                        "Revenue": info.get("totalRevenue"),
                        "GrossProfit": info.get("grossProfits"),
                        "FreeCashFlow": info.get("freeCashflow"),
                    }
                )
            except Exception as e:
                logger.warning("Failed to fetch info for %s: %s", ticker, e)
            return row

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            results = list(executor.map(fetch_financials, tickers))

        financials = pd.DataFrame(results)
        qual = wiki.merge(financials, on="Ticker", how="left")
        qual.to_sql("stock_information", conn, if_exists=if_exists, index=False)

    qual_data()
    quant_data()


def backfill_historical_data(
    conn: sqlite3.Connection, tickers: list[str], target_years: int = 7
) -> int:
    """Fetch OHLCV history older than what's currently in stock_data.

    Detects the earliest date already stored and downloads everything from
    ``target_years`` ago up to (but not including) that date.  Returns the
    number of rows appended, or 0 if no backfill was needed.
    """
    try:
        min_date_str = conn.execute("SELECT MIN(Date) FROM stock_data").fetchone()[0]
    except Exception as e:
        logger.warning("backfill: could not query min date: %s", e)
        return 0

    if not min_date_str:
        return 0

    min_date = dt.date.fromisoformat(str(min_date_str)[:10])
    target_start = dt.date.today() - dt.timedelta(days=target_years * 365)

    if min_date <= target_start:
        logger.info(
            "backfill: data already starts at %s (target %s) — nothing to do",
            min_date,
            target_start,
        )
        return 0

    start = target_start.isoformat()
    end = (min_date - dt.timedelta(days=1)).isoformat()

    logger.info("backfill: fetching %s → %s for %d tickers", start, end, len(tickers))
    data = yf.download(
        tickers,
        start=start,
        end=end,
        interval="1d",
        group_by="ticker",
        auto_adjust=True,
        progress=False,
    )

    if data is None or data.empty:
        logger.info("backfill: no data returned for %s → %s", start, end)
        return 0

    result = data.stack(level=0, future_stack=True).reset_index()
    if result.empty:
        return 0

    # Keep only columns that exist in the current stock_data table
    existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(stock_data)").fetchall()]
    keep = [c for c in existing_cols if c in result.columns]
    result = result[keep]

    result.to_sql("stock_data", conn, if_exists="append", index=False)
    conn.commit()
    logger.info("backfill: appended %d historical rows", len(result))
    return len(result)


def fetch_incremental_ohlcv(conn: sqlite3.Connection, tickers: list[str]) -> int:
    """Download only new OHLCV rows since the latest date already in stock_data.

    Returns the number of new rows appended (0 if already up-to-date).
    """
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT MAX(Date) FROM stock_data")
        latest_str = cursor.fetchone()[0]
    except Exception as e:
        logger.warning("Could not query latest date from stock_data: %s", e)
        return 0

    if not latest_str:
        logger.info("stock_data is empty — skipping incremental update")
        return 0

    latest_date = dt.date.fromisoformat(str(latest_str)[:10])
    start = (latest_date + dt.timedelta(days=1)).isoformat()
    end = dt.date.today().isoformat()

    if start > end:
        logger.info("Data already up to date (latest: %s)", latest_date)
        return 0

    logger.info("Fetching incremental OHLCV %s → %s for %d tickers", start, end, len(tickers))
    data = yf.download(
        tickers,
        start=start,
        end=end,
        interval="1d",
        group_by="ticker",
        auto_adjust=True,
        progress=False,
    )

    if data is None or data.empty:
        logger.info("No new data available for %s → %s", start, end)
        return 0

    result = data.stack(level=0, future_stack=True).reset_index()
    if result.empty:
        return 0

    result.to_sql("stock_data", conn, if_exists="append", index=False)
    logger.info("Appended %d new rows to stock_data", len(result))
    return len(result)
