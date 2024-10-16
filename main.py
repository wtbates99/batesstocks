from fastapi import FastAPI, HTTPException, Query
from sqlalchemy import select
from typing import List, Optional, Union
import datetime
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import os
import sqlite3
from backend.data_pull import fetch_write_financial_data
from backend.data_manipulation import process_stock_data
from backend.models import StockData, CompanyInfo, StockGroupings, SearchResult
from backend.database import database, CombinedStockData
from queries import load_bullish_groups
from cachetools import TTLCache
import re
from collections import defaultdict


def safe_convert(value: Union[str, int, float], target_type: type):
    if value == "N/A" or value is None:
        return None
    try:
        return target_type(value)
    except (ValueError, TypeError):
        return None


app = FastAPI()

app.mount("/static", StaticFiles(directory="frontend/build/static"), name="static")

# Initialize cache
search_cache = TTLCache(maxsize=1000, ttl=3600)  # Cache for 1 hour

# Prefix-based search index
prefix_index = defaultdict(set)


@app.get("/refresh_data")
def refresh_data():
    conn = sqlite3.connect("stock_data.db")
    fetch_write_financial_data(conn)
    process_stock_data(conn)


@app.get("/", response_class=HTMLResponse)
async def serve_react_app():
    with open(os.path.join("frontend/build", "index.html")) as f:
        return f.read()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await database.connect()
    await build_search_index()


async def build_search_index():
    query = select(CombinedStockData.Ticker, CombinedStockData.FullName)
    results = await database.fetch_all(query)

    for result in results:
        ticker = result["Ticker"]
        full_name = result["FullName"]

        # Index ticker
        for i in range(1, len(ticker) + 1):
            prefix = ticker[:i].lower()
            prefix_index[prefix].add((ticker, full_name))

        # Index company name
        words = re.findall(r"\w+", full_name.lower())
        for word in words:
            for i in range(1, len(word) + 1):
                prefix = word[:i]
                prefix_index[prefix].add((ticker, full_name))


@app.on_event("shutdown")
async def shutdown():
    await database.disconnect()


@app.get("/stock/{ticker}", response_model=List[StockData])
async def get_stock_data(
    ticker: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    metrics: Optional[List[str]] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=1000),
):
    selected_metrics = [
        CombinedStockData.Date,
        CombinedStockData.Ticker,
        CombinedStockData.Ticker_Open,
        CombinedStockData.Ticker_Close,
        CombinedStockData.Ticker_High,
        CombinedStockData.Ticker_Low,
        CombinedStockData.Ticker_Volume,
        CombinedStockData.Ticker_SMA_10,
        CombinedStockData.Ticker_EMA_10,
        CombinedStockData.Ticker_SMA_30,
        CombinedStockData.Ticker_EMA_30,
        CombinedStockData.Ticker_RSI,
        CombinedStockData.Ticker_Stochastic_K,
        CombinedStockData.Ticker_Stochastic_D,
        CombinedStockData.Ticker_MACD,
        CombinedStockData.Ticker_MACD_Signal,
        CombinedStockData.Ticker_MACD_Diff,
        CombinedStockData.Ticker_TSI,
        CombinedStockData.Ticker_UO,
        CombinedStockData.Ticker_ROC,
        CombinedStockData.Ticker_Williams_R,
        CombinedStockData.Ticker_Bollinger_High,
        CombinedStockData.Ticker_Bollinger_Low,
        CombinedStockData.Ticker_Bollinger_Mid,
        CombinedStockData.Ticker_Bollinger_PBand,
        CombinedStockData.Ticker_Bollinger_WBand,
        CombinedStockData.Ticker_On_Balance_Volume,
        CombinedStockData.Ticker_Chaikin_MF,
        CombinedStockData.Ticker_Force_Index,
        CombinedStockData.Ticker_MFI,
    ]

    query = select(*selected_metrics).where(CombinedStockData.Ticker == ticker)

    if start_date:
        start_date_obj = datetime.datetime.strptime(start_date, "%Y-%m-%d")
        query = query.where(CombinedStockData.Date >= start_date_obj)
    if end_date:
        end_date_obj = datetime.datetime.strptime(end_date, "%Y-%m-%d")
        query = query.where(CombinedStockData.Date <= end_date_obj)

    query = query.order_by(CombinedStockData.Date.desc())
    result = await database.fetch_all(query)

    return [
        StockData(
            Date=record["Date"].strftime("%Y-%m-%d"),
            **{k: record[k] for k in record.keys() if k != "Date"},
        )
        for record in result
    ]


@app.get("/company/{ticker}", response_model=CompanyInfo)
async def get_company_info(ticker: str):
    query = select(
        CombinedStockData.Ticker,
        CombinedStockData.FullName,
        CombinedStockData.Sector,
        CombinedStockData.Subsector,
        CombinedStockData.MarketCap,
        CombinedStockData.Country,
        CombinedStockData.Website,
        CombinedStockData.Description,
        CombinedStockData.CEO,
        CombinedStockData.Employees,
        CombinedStockData.City,
        CombinedStockData.State,
        CombinedStockData.Zip,
        CombinedStockData.Address,
        CombinedStockData.Phone,
        CombinedStockData.Exchange,
        CombinedStockData.Currency,
        CombinedStockData.QuoteType,
        CombinedStockData.ShortName,
        CombinedStockData.Price,
        CombinedStockData.DividendRate,
        CombinedStockData.DividendYield,
        CombinedStockData.PayoutRatio,
        CombinedStockData.Beta,
        CombinedStockData.PE,
        CombinedStockData.EPS,
        CombinedStockData.Revenue,
        CombinedStockData.GrossProfit,
        CombinedStockData.FreeCashFlow,
    ).where(CombinedStockData.Ticker == ticker)

    result = await database.fetch_one(query)
    if not result:
        raise HTTPException(status_code=404, detail="Company not found")

    company_data = dict(result)
    for key, value in company_data.items():
        if key in ["MarketCap", "Employees", "Revenue", "GrossProfit", "FreeCashFlow"]:
            company_data[key] = safe_convert(value, int)
        elif key in [
            "Price",
            "DividendRate",
            "DividendYield",
            "PayoutRatio",
            "Beta",
            "PE",
            "EPS",
        ]:
            company_data[key] = safe_convert(value, float)

    return CompanyInfo(**company_data)


@app.get("/groupings", response_model=StockGroupings)
async def get_stock_groupings():
    return load_bullish_groups()


@app.get("/search", response_model=List[SearchResult])
async def search_companies(query: str):
    if query in search_cache:
        return search_cache[query]

    query = query.lower()
    results = set()

    # Search in prefix index
    for prefix, items in prefix_index.items():
        if prefix.startswith(query):
            results.update(items)

    # Additional filtering based on the full query
    filtered_results = [
        (ticker, full_name)
        for ticker, full_name in results
        if query in ticker.lower() or query in full_name.lower()
    ]

    # Sort and limit results
    sorted_results = sorted(
        filtered_results,
        key=lambda x: (
            x[0].lower().startswith(query),
            x[1].lower().startswith(query),
            len(x[0]),
            x[0].lower(),
            x[1].lower(),
        ),
    )[:5]

    search_results = [
        SearchResult(ticker=ticker, name=full_name)
        for ticker, full_name in sorted_results
    ]

    search_cache[query] = search_results
    return search_results


@app.get("/{full_path:path}", response_class=HTMLResponse)
async def catch_all(full_path: str):
    with open(os.path.join("frontend/build", "index.html")) as f:
        return f.read()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
