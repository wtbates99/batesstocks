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
    Ticker_VWAP: float | None = None
    Ticker_SMA_250W: float | None = None
    Ticker_Tech_Score: float | None = None


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
    tech_score: float | None = None
    spark: list[float] = []


class TechnicalSignal(BaseModel):
    label: str
    signal: str
    value: str
    detail: str


class TechnicalSummary(BaseModel):
    ticker: str
    signals: list[TechnicalSignal]
    overall: str


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


class NewsItem(BaseModel):
    title: str
    publisher: str
    link: str
    published_at: str
    thumbnail: str | None = None


class OptionContract(BaseModel):
    contractSymbol: str
    strike: float
    lastPrice: float | None = None
    bid: float | None = None
    ask: float | None = None
    volume: int | None = None
    openInterest: int | None = None
    impliedVolatility: float | None = None
    inTheMoney: bool | None = None


class OptionsChain(BaseModel):
    expiry: str
    calls: list[OptionContract]
    puts: list[OptionContract]
    expirations: list[str]


class EarningsEvent(BaseModel):
    ticker: str
    company_name: str | None = None
    earnings_date: str
    eps_estimate: float | None = None
    eps_actual: float | None = None
    surprise_pct: float | None = None


class PeerRow(BaseModel):
    ticker: str
    name: str | None = None
    market_cap: float | None = None
    pe: float | None = None
    eps: float | None = None
    beta: float | None = None
    rsi: float | None = None
    return_52w: float | None = None
    tech_score: float | None = None


class SectorRotationRow(BaseModel):
    sector: str
    return_pct: float | None = None
    avg_rsi: float | None = None
    avg_tech_score: float | None = None


class MarketBreadth(BaseModel):
    date: str
    advancing: int
    declining: int
    unchanged: int
    new_highs_52w: int
    new_lows_52w: int
    above_sma50: int
    below_sma50: int
    avg_rsi: float | None = None
    avg_tech_score: float | None = None
    pct_advancing: float | None = None
    total: int


class CorrelationMatrix(BaseModel):
    tickers: list[str]
    matrix: list[list[float | None]]


class AlertCreate(BaseModel):
    ticker: str
    metric: str
    condition: str
    threshold: float
    notes: str | None = None


class AlertOut(BaseModel):
    id: int
    ticker: str
    metric: str
    condition: str
    threshold: float
    triggered: bool
    triggered_at: str | None = None
    created_at: str
    notes: str | None = None


class PatternSignal(BaseModel):
    id: int
    ticker: str
    detected_at: str
    pattern_type: str
    level: float | None = None
    confidence: float | None = None
    notes: str | None = None


class StrategyScreenRequest(BaseModel):
    entry_metric: str
    entry_condition: str
    entry_threshold: float = 0.0
    entry_threshold_metric: str | None = None


class BacktestRequest(BaseModel):
    ticker: str
    entry_metric: str
    entry_condition: str
    entry_threshold: float = 0.0
    entry_threshold_metric: str | None = None
    exit_metric: str
    exit_condition: str
    exit_threshold: float = 0.0
    exit_threshold_metric: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    initial_capital: float = 10000.0


class LatestMetricsRequest(BaseModel):
    tickers: list[str]
    metrics: list[str]


class BacktestTrade(BaseModel):
    entry_date: str
    entry_price: float
    exit_date: str
    exit_price: float
    return_pct: float
    pnl: float


class BacktestResult(BaseModel):
    ticker: str
    total_return_pct: float
    buy_hold_return_pct: float
    num_trades: int
    win_rate: float
    avg_return_pct: float
    max_drawdown_pct: float
    sharpe_ratio: float | None
    equity_curve: list[dict]
    trades: list[BacktestTrade]
    strategy: str


class RadarData(BaseModel):
    ticker: str
    momentum: float
    trend: float
    volume: float
    volatility: float
    value: float
    sector_momentum: float
    sector_trend: float
    sector_volume: float
    sector_volatility: float
    sector_value: float


class LivePrices(BaseModel):
    prices: dict[str, float | None]
    timestamp: str


class MarketPulseItem(BaseModel):
    type: str
    ticker: str
    headline: str
    value: str | None = None
    color: str


class MarketPulse(BaseModel):
    items: list[MarketPulseItem]
    generated_at: str
