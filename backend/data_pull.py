import concurrent.futures
import pandas as pd
import yfinance as yf


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
        data = yf.download(
            tickers, interval="1d", group_by="ticker", auto_adjust=True, progress=False
        )
        result = data.stack(level=0, future_stack=True).reset_index()
        result.to_sql("stock_data", conn, if_exists=if_exists, index=False)

    def qual_data():
        wiki = (
            filtered[["Symbol", "Security", "GICS Sector", "GICS Sub-Industry", "Headquarters Location"]]
            .rename(columns={
                "Symbol": "Ticker",
                "Security": "FullName",
                "GICS Sector": "Sector",
                "GICS Sub-Industry": "Subsector",
                "Headquarters Location": "_HQ",
            })
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
                row.update({
                    "MarketCap":  getattr(fi, "market_cap", None),
                    "Price":      getattr(fi, "last_price", None),
                    "52WeekHigh": getattr(fi, "year_high", None),
                    "52WeekLow":  getattr(fi, "year_low", None),
                    "Exchange":   getattr(fi, "exchange", None),
                    "Currency":   getattr(fi, "currency", None),
                    "QuoteType":  getattr(fi, "quote_type", None),
                })
            except Exception:
                pass
            try:
                info = t.info
                row.update({
                    "ShortName":    info.get("shortName"),
                    "Website":      info.get("website"),
                    "Description":  info.get("longBusinessSummary"),
                    "CEO":          info.get("ceo"),
                    "Employees":    info.get("fullTimeEmployees"),
                    "Zip":          info.get("zip"),
                    "Address":      info.get("address1"),
                    "Phone":        info.get("phone"),
                    "DividendRate": info.get("dividendRate"),
                    "DividendYield": info.get("dividendYield"),
                    "PayoutRatio":  info.get("payoutRatio"),
                    "Beta":         info.get("beta"),
                    "PE":           info.get("trailingPE"),
                    "EPS":          info.get("trailingEps"),
                    "Revenue":      info.get("totalRevenue"),
                    "GrossProfit":  info.get("grossProfits"),
                    "FreeCashFlow": info.get("freeCashflow"),
                })
            except Exception:
                pass
            return row

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            results = list(executor.map(fetch_financials, tickers))

        financials = pd.DataFrame(results)
        qual = wiki.merge(financials, on="Ticker", how="left")
        qual.to_sql("stock_information", conn, if_exists=if_exists, index=False)

    qual_data()
    quant_data()
