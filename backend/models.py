from pydantic import BaseModel


class StockData(BaseModel):
    Date: str
    Ticker: str
    Ticker_Open: float
    Ticker_Close: float
    Ticker_High: float
    Ticker_Low: float
    Ticker_Volume: float
    Ticker_SMA_10: float | None = None
    Ticker_EMA_10: float | None = None
    Ticker_SMA_30: float | None = None
    Ticker_EMA_30: float | None = None
    Ticker_RSI: float | None = None
    Ticker_Stochastic_K: float | None = None
    Ticker_Stochastic_D: float | None = None
    Ticker_MACD: float | None = None
    Ticker_MACD_Signal: float | None = None
    Ticker_MACD_Diff: float | None = None
    Ticker_TSI: float | None = None
    Ticker_UO: float | None = None
    Ticker_ROC: float | None = None
    Ticker_Williams_R: float | None = None
    Ticker_Bollinger_High: float | None = None
    Ticker_Bollinger_Low: float | None = None
    Ticker_Bollinger_Mid: float | None = None
    Ticker_Bollinger_PBand: float | None = None
    Ticker_Bollinger_WBand: float | None = None
    Ticker_On_Balance_Volume: float | None = None
    Ticker_Chaikin_MF: float | None = None
    Ticker_Force_Index: float | None = None
    Ticker_MFI: float | None = None


class CompanyInfo(BaseModel):
    Ticker: str
    FullName: str | None = None
    Sector: str | None = None
    Subsector: str | None = None
    MarketCap: int | None = None
    Country: str | None = None
    Website: str | None = None
    Description: str | None = None
    CEO: str | None = None
    Employees: int | None = None
    City: str | None = None
    State: str | None = None
    Zip: str | None = None
    Address: str | None = None
    Phone: str | None = None
    Exchange: str | None = None
    Currency: str | None = None
    QuoteType: str | None = None
    ShortName: str | None = None
    Price: float | None = None
    DividendRate: float | None = None
    DividendYield: float | None = None
    PayoutRatio: float | None = None
    Beta: float | None = None
    PE: float | None = None
    EPS: float | None = None
    Revenue: int | None = None
    GrossProfit: int | None = None
    FreeCashFlow: int | None = None


class StockGroupings(BaseModel):
    momentum: list[str]
    breakout: list[str]
    trend_strength: list[str]


class SearchResult(BaseModel):
    ticker: str
    name: str


class HeatmapNode(BaseModel):
    name: str
    market_cap: float | None = None
    pct_change: float | None = None
    ticker: str | None = None


class ScreenerRow(BaseModel):
    ticker: str
    name: str | None = None
    sector: str | None = None
    subsector: str | None = None
    market_cap: float | None = None
    pe: float | None = None
    eps: float | None = None
    beta: float | None = None
    rsi: float | None = None
    latest_close: float | None = None
    return_52w: float | None = None


class WatchlistCreate(BaseModel):
    name: str
    tickers: list[str]


class WatchlistOut(BaseModel):
    id: int
    name: str
    tickers: list[str]
    created_at: str
    updated_at: str


class PositionCreate(BaseModel):
    ticker: str
    shares: float
    cost_basis: float
    purchased_at: str | None = None
    notes: str | None = None


class PositionOut(BaseModel):
    id: int
    portfolio_id: int
    ticker: str
    shares: float
    cost_basis: float
    purchased_at: str | None = None
    notes: str | None = None
    current_price: float | None = None
    unrealized_pnl: float | None = None
    unrealized_pnl_pct: float | None = None


class PortfolioCreate(BaseModel):
    name: str


class PortfolioOut(BaseModel):
    id: int
    name: str
    positions: list[PositionOut]
    total_cost: float
    total_value: float
    total_pnl: float
