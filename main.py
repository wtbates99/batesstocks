from fastapi import FastAPI, HTTPException, Query
from sqlalchemy import select
from typing import List, Optional
import datetime
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import os
import sqlite3
from backend.data_pull import fetch_write_financial_data
from backend.data_manipulation import process_stock_data
from backend.models import StockData, CompanyInfo
from backend.database import database, CombinedStockData

app = FastAPI()

app.mount("/static", StaticFiles(directory="frontend/build/static"), name="static")


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
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await database.connect()


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

    return CompanyInfo(**dict(result))


# LAST!
@app.get("/{full_path:path}", response_class=HTMLResponse)
async def catch_all(full_path: str):
    with open(os.path.join("frontend/build", "index.html")) as f:
        return f.read()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
