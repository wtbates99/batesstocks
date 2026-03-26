import os

from databases import Database
from dotenv import load_dotenv
from sqlalchemy import Column, DateTime, Float, Integer, String, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

_db_path = os.getenv("DB_PATH", "stock_data.db")
SQLALCHEMY_DATABASE_URL = f"sqlite:///./{_db_path}"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

database = Database(SQLALCHEMY_DATABASE_URL)


class CombinedStockData(Base):
    __tablename__ = "combined_stock_data"

    id = Column(Integer, primary_key=True, index=True)
    Date = Column(DateTime, index=True)
    Ticker = Column(String, index=True)

    # OHLCV
    Ticker_Open = Column(Float)
    Ticker_Close = Column(Float)
    Ticker_High = Column(Float)
    Ticker_Low = Column(Float)
    Ticker_Volume = Column(Float)

    # Trend
    Ticker_SMA_10 = Column(Float)
    Ticker_EMA_10 = Column(Float)
    Ticker_SMA_30 = Column(Float)
    Ticker_EMA_30 = Column(Float)

    # Momentum
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

    # Volatility
    Ticker_Bollinger_High = Column(Float)
    Ticker_Bollinger_Low = Column(Float)
    Ticker_Bollinger_Mid = Column(Float)
    Ticker_Bollinger_PBand = Column(Float)
    Ticker_Bollinger_WBand = Column(Float)

    # Volume
    Ticker_On_Balance_Volume = Column(Float)
    Ticker_Chaikin_MF = Column(Float)
    Ticker_Force_Index = Column(Float)
    Ticker_MFI = Column(Float)
    Ticker_VWAP = Column(Float)
    Ticker_Tech_Score = Column(Float)

    # Company info
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

    # Financials (stored as strings from yfinance, cast at API layer)
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
