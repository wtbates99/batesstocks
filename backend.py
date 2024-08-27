from fastapi import FastAPI, HTTPException, Query
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Float,
    DateTime,
    func,
    select,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from pydantic import BaseModel
from typing import List, Optional
from databases import Database
import datetime

from fastapi.middleware.cors import CORSMiddleware


# Database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./stock_data.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Async database
database = Database(SQLALCHEMY_DATABASE_URL)


# Define SQLAlchemy model
class CombinedStockData(Base):
    __tablename__ = "combined_stock_data"

    id = Column(Integer, primary_key=True, index=True)
    Date = Column(DateTime, index=True)
    Ticker = Column(String, index=True)
    Ticker_Open = Column(Float)
    Ticker_Close = Column(Float)
    Ticker_High = Column(Float)
    Ticker_Low = Column(Float)
    Ticker_Volume = Column(Float)
    Ticker_SMA_10 = Column(Float)
    Ticker_EMA_10 = Column(Float)
    Ticker_RSI = Column(Float)
    Ticker_Stochastic_K = Column(Float)
    Ticker_Stochastic_D = Column(Float)
    Ticker_MACD = Column(Float)
    Ticker_MACD_Signal = Column(Float)
    Ticker_MACD_Diff = Column(Float)
    Ticker_TSI = Column(Float)
    Ticker_UO = Column(Float)
    Ticker_ROC = Column(Float)
    Ticker_Williams_R = Column(Float)
    Ticker_Bollinger_High = Column(Float)
    Ticker_Bollinger_Low = Column(Float)
    Ticker_Bollinger_Mid = Column(Float)
    Ticker_Bollinger_PBand = Column(Float)
    Ticker_Bollinger_WBand = Column(Float)
    Ticker_On_Balance_Volume = Column(Float)
    Ticker_Chaikin_MF = Column(Float)
    Ticker_Force_Index = Column(Float)
    Ticker_MFI = Column(Float)
    Sector = Column(String, index=True)
    Subsector = Column(String, index=True)
    FullName = Column(String)
    MarketCap = Column(String)
    Country = Column(String)
    Website = Column(String)
    Description = Column(String)
    CEO = Column(String)
    Employees = Column(String)
    City = Column(String)
    State = Column(String)
    Zip = Column(String)
    Address = Column(String)
    Phone = Column(String)
    Exchange = Column(String)
    Currency = Column(String)
    QuoteType = Column(String)
    ShortName = Column(String)
    Price = Column(String)
    DividendRate = Column(String)
    DividendYield = Column(String)
    PayoutRatio = Column(String)
    Beta = Column(String)
    PE = Column(String)
    EPS = Column(String)
    Revenue = Column(String)
    GrossProfit = Column(String)
    FreeCashFlow = Column(String)


# Pydantic models for request/response
class StockData(BaseModel):
    Date: str
    Ticker: str
    Ticker_Open: float
    Ticker_Close: float
    Ticker_High: float
    Ticker_Low: float
    Ticker_Volume: float
    Ticker_SMA_10: Optional[float] = None
    Ticker_EMA_10: Optional[float] = None
    Ticker_RSI: Optional[float] = None
    Ticker_Stochastic_K: Optional[float] = None
    Ticker_Stochastic_D: Optional[float] = None
    Ticker_MACD: Optional[float] = None
    Ticker_MACD_Signal: Optional[float] = None
    Ticker_MACD_Diff: Optional[float] = None
    Ticker_TSI: Optional[float] = None
    Ticker_UO: Optional[float] = None
    Ticker_ROC: Optional[float] = None
    Ticker_Williams_R: Optional[float] = None
    Ticker_Bollinger_High: Optional[float] = None
    Ticker_Bollinger_Low: Optional[float] = None
    Ticker_Bollinger_Mid: Optional[float] = None
    Ticker_Bollinger_PBand: Optional[float] = None
    Ticker_Bollinger_WBand: Optional[float] = None
    Ticker_On_Balance_Volume: Optional[float] = None
    Ticker_Chaikin_MF: Optional[float] = None
    Ticker_Force_Index: Optional[float] = None
    Ticker_MFI: Optional[float] = None


class CompanyInfo(BaseModel):
    Ticker: str
    FullName: Optional[str] = None
    Sector: Optional[str] = None
    Subsector: Optional[str] = None
    MarketCap: Optional[str] = None
    Country: Optional[str] = None
    Website: Optional[str] = None
    Description: Optional[str] = None
    CEO: Optional[str] = None
    Employees: Optional[str] = None
    City: Optional[str] = None
    State: Optional[str] = None
    Zip: Optional[str] = None
    Address: Optional[str] = None
    Phone: Optional[str] = None
    Exchange: Optional[str] = None
    Currency: Optional[str] = None
    QuoteType: Optional[str] = None
    ShortName: Optional[str] = None
    Price: Optional[str] = None
    DividendRate: Optional[str] = None
    DividendYield: Optional[str] = None
    PayoutRatio: Optional[str] = None
    Beta: Optional[str] = None
    PE: Optional[str] = None
    EPS: Optional[str] = None
    Revenue: Optional[str] = None
    GrossProfit: Optional[str] = None
    FreeCashFlow: Optional[str] = None


app = FastAPI()
# Add this near the top of your FastAPI app file, after creating the FastAPI app instance
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Allow requests from React app
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)


# Startup and shutdown events
@app.on_event("startup")
async def startup():
    await database.connect()


@app.on_event("shutdown")
async def shutdown():
    await database.disconnect()


# Helper function for pagination
async def paginate(query, page: int, page_size: int):
    total = await database.fetch_val(select(func.count()).select_from(query.alias()))
    items = await database.fetch_all(
        query.offset((page - 1) * page_size).limit(page_size)
    )
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
    }


# Routes


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
    ]

    if metrics:
        selected_metrics.extend(
            [getattr(CombinedStockData, metric) for metric in metrics]
        )

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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
