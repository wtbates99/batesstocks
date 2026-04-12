from pydantic import BaseModel


class SearchResult(BaseModel):
    ticker: str
    name: str


class LivePrices(BaseModel):
    prices: dict[str, float | None]
    timestamp: str


class BacktestTrade(BaseModel):
    entry_date: str
    entry_price: float
    exit_date: str
    exit_price: float
    return_pct: float
    pnl: float


class TerminalStat(BaseModel):
    label: str
    value: str
    change: str | None = None
    tone: str = "neutral"


class TerminalMover(BaseModel):
    ticker: str
    name: str | None = None
    last_price: float | None = None
    change_pct: float | None = None
    volume: float | None = None
    tech_score: float | None = None


class TerminalHeadline(BaseModel):
    ticker: str
    headline: str
    detail: str
    tone: str = "neutral"


class TerminalOverview(BaseModel):
    generated_at: str
    focus_ticker: str
    universe_size: int = 0
    stats: list[TerminalStat]
    momentum_leaders: list[TerminalMover]
    reversal_candidates: list[TerminalMover]
    breakouts: list[TerminalMover]
    headlines: list[TerminalHeadline]


class StrategyLeg(BaseModel):
    metric: str
    condition: str
    threshold: float | None = None
    compare_to_metric: str | None = None


class StrategyDefinition(BaseModel):
    name: str = "Custom Strategy"
    entry: StrategyLeg
    exit: StrategyLeg
    universe: list[str] | None = None
    start_date: str | None = None
    end_date: str | None = None
    initial_capital: float = 100000.0
    position_size_pct: float = 100.0
    stop_loss_pct: float | None = None
    max_open_positions: int = 1


class StrategyBacktestRequest(BaseModel):
    ticker: str
    strategy: StrategyDefinition


class StrategyBacktestSummary(BaseModel):
    total_return_pct: float
    buy_hold_return_pct: float
    max_drawdown_pct: float
    win_rate: float
    num_trades: int
    avg_return_pct: float
    annualized_return_pct: float | None = None
    sharpe_ratio: float | None = None


class StrategyBacktestPoint(BaseModel):
    date: str
    equity: float
    benchmark: float | None = None
    exposure: float


class StrategyMatch(BaseModel):
    ticker: str
    name: str | None = None
    sector: str | None = None
    last_price: float | None = None
    rsi: float | None = None
    tech_score: float | None = None
    signal_state: str


class StrategyBacktestResponse(BaseModel):
    ticker: str
    strategy_name: str
    summary: StrategyBacktestSummary
    equity_curve: list[StrategyBacktestPoint]
    trades: list[BacktestTrade]
    current_matches: list[StrategyMatch]


class SecurityBar(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    sma_10: float | None = None
    sma_50: float | None = None
    sma_100: float | None = None
    sma_200: float | None = None
    sma_250: float | None = None
    sma_30: float | None = None
    ema_10: float | None = None
    ema_50: float | None = None
    ema_100: float | None = None
    ema_200: float | None = None
    tech_score: float | None = None
    rsi: float | None = None
    macd: float | None = None
    macd_signal: float | None = None


class SecuritySignal(BaseModel):
    label: str
    value: str
    tone: str = "neutral"


class SecuritySnapshot(BaseModel):
    ticker: str
    name: str | None = None
    sector: str | None = None
    subsector: str | None = None
    close: float | None = None
    change_pct: float | None = None
    volume: float | None = None
    market_cap: float | None = None
    rsi: float | None = None
    tech_score: float | None = None
    macd: float | None = None
    macd_signal: float | None = None
    above_sma_10: bool = False
    above_sma_30: bool = False
    above_sma_200: bool = False
    above_sma_250: bool = False


class SecurityOverview(BaseModel):
    generated_at: str
    snapshot: SecuritySnapshot
    signals: list[SecuritySignal]
    bars: list[SecurityBar]
    related: list[TerminalMover]


class StrategyScreenResponse(BaseModel):
    generated_at: str
    strategy_name: str
    matches: list[StrategyMatch]


class BackupManifest(BaseModel):
    filename: str
    created_at: str
    size_bytes: int
    compressed: bool


class BackupStatus(BaseModel):
    database_path: str
    backup_directory: str
    retention_count: int
    available_backups: list[BackupManifest]


class BackupCreateRequest(BaseModel):
    compress: bool = True
    retention_count: int = 7


class BackupCreateResponse(BaseModel):
    created: BackupManifest
    pruned: list[str]


class SyncRequest(BaseModel):
    tickers: list[str] | None = None
    years: int = 5


class SyncResponse(BaseModel):
    started_at: str
    finished_at: str
    tickers: list[str]
    rows_written: int
    metadata_rows: int
