// ── Core market data ───────────────────────────────────────────────────────────

export interface StockData {
  Date: string
  Ticker: string
  Ticker_Open: number
  Ticker_Close: number
  Ticker_High: number
  Ticker_Low: number
  Ticker_Volume: number
  Ticker_SMA_10?: number | null
  Ticker_EMA_10?: number | null
  Ticker_SMA_30?: number | null
  Ticker_EMA_30?: number | null
  Ticker_RSI?: number | null
  Ticker_Stochastic_K?: number | null
  Ticker_Stochastic_D?: number | null
  Ticker_MACD?: number | null
  Ticker_MACD_Signal?: number | null
  Ticker_MACD_Diff?: number | null
  Ticker_TSI?: number | null
  Ticker_UO?: number | null
  Ticker_ROC?: number | null
  Ticker_Williams_R?: number | null
  Ticker_Bollinger_High?: number | null
  Ticker_Bollinger_Low?: number | null
  Ticker_Bollinger_Mid?: number | null
  Ticker_Bollinger_PBand?: number | null
  Ticker_Bollinger_WBand?: number | null
  Ticker_On_Balance_Volume?: number | null
  Ticker_Chaikin_MF?: number | null
  Ticker_Force_Index?: number | null
  Ticker_MFI?: number | null
  Ticker_VWAP?: number | null
  Ticker_SMA_200W?: number | null
  Ticker_SMA_250W?: number | null
  Ticker_Tech_Score?: number | null
}

export interface CompanyInfo {
  Ticker: string
  FullName?: string | null
  Sector?: string | null
  Subsector?: string | null
  MarketCap?: number | null
  Country?: string | null
  Website?: string | null
  Description?: string | null
  CEO?: string | null
  Employees?: number | null
  City?: string | null
  State?: string | null
  Zip?: string | null
  Address?: string | null
  Phone?: string | null
  Exchange?: string | null
  Currency?: string | null
  QuoteType?: string | null
  ShortName?: string | null
  Price?: number | null
  DividendRate?: number | null
  DividendYield?: number | null
  PayoutRatio?: number | null
  Beta?: number | null
  PE?: number | null
  EPS?: number | null
  Revenue?: number | null
  GrossProfit?: number | null
  FreeCashFlow?: number | null
}

export interface SearchResult {
  ticker: string
  name: string
}

// ── Screener & Heatmap ─────────────────────────────────────────────────────────

export interface ScreenerRow {
  ticker: string
  name?: string | null
  sector?: string | null
  subsector?: string | null
  market_cap?: number | null
  pe?: number | null
  eps?: number | null
  beta?: number | null
  rsi?: number | null
  latest_close?: number | null
  return_52w?: number | null
  tech_score?: number | null
  spark: number[]
}

export interface HeatmapNode {
  name: string
  market_cap?: number | null
  pct_change?: number | null
  ticker?: string | null
}

// ── Technicals ─────────────────────────────────────────────────────────────────

export interface TechnicalSignal {
  label: string
  signal: string
  value: string
  detail: string
}

export interface TechnicalSummary {
  ticker: string
  signals: TechnicalSignal[]
  overall: string
}

export interface RadarData {
  ticker: string
  momentum: number
  trend: number
  volume: number
  volatility: number
  value: number
  sector_momentum: number
  sector_trend: number
  sector_volume: number
  sector_volatility: number
  sector_value: number
}

// ── Watchlist ──────────────────────────────────────────────────────────────────

export interface WatchlistCreate {
  name: string
  tickers: string[]
}

export interface WatchlistOut {
  id: number
  name: string
  tickers: string[]
  created_at: string
  updated_at: string
}

// ── Portfolio ──────────────────────────────────────────────────────────────────

export interface PositionCreate {
  ticker: string
  shares: number
  cost_basis: number
  purchased_at?: string | null
  notes?: string | null
}

export interface PositionOut {
  id: number
  portfolio_id: number
  ticker: string
  shares: number
  cost_basis: number
  purchased_at?: string | null
  notes?: string | null
  current_price?: number | null
  unrealized_pnl?: number | null
  unrealized_pnl_pct?: number | null
}

export interface PortfolioOut {
  id: number
  name: string
  positions: PositionOut[]
  total_cost: number
  total_value: number
  total_pnl: number
}

// ── News & Calendar ────────────────────────────────────────────────────────────

export interface NewsItem {
  title: string
  publisher: string
  link: string
  published_at: string
  thumbnail?: string | null
}

export interface EarningsEvent {
  ticker: string
  company_name?: string | null
  earnings_date: string
  eps_estimate?: number | null
  eps_actual?: number | null
  surprise_pct?: number | null
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface OptionContract {
  contractSymbol: string
  strike: number
  lastPrice?: number | null
  bid?: number | null
  ask?: number | null
  volume?: number | null
  openInterest?: number | null
  impliedVolatility?: number | null
  inTheMoney?: boolean | null
}

export interface OptionsChain {
  expiry: string
  calls: OptionContract[]
  puts: OptionContract[]
  expirations: string[]
}

// ── Backtest ───────────────────────────────────────────────────────────────────

export interface BacktestRequest {
  ticker: string
  entry_metric: string
  entry_condition: string
  entry_threshold?: number
  entry_threshold_metric?: string | null
  exit_metric: string
  exit_condition: string
  exit_threshold?: number
  exit_threshold_metric?: string | null
  start_date?: string | null
  end_date?: string | null
  initial_capital?: number
  position_size_pct?: number
  stop_loss_pct?: number | null
  max_open_positions?: number
}

export interface BacktestTrade {
  entry_date: string
  entry_price: number
  exit_date: string
  exit_price: number
  return_pct: number
  pnl: number
}

export interface BacktestResult {
  ticker: string
  total_return_pct: number
  buy_hold_return_pct: number
  num_trades: number
  win_rate: number
  avg_return_pct: number
  max_drawdown_pct: number
  sharpe_ratio?: number | null
  sortino_ratio?: number | null
  calmar_ratio?: number | null
  profit_factor?: number | null
  max_consecutive_losses: number
  annualized_return_pct?: number | null
  avg_holding_days?: number | null
  equity_curve: Array<{ date: string; value: number }>
  trades: BacktestTrade[]
  strategy: string
}

export interface StrategyScreenRequest {
  entry_metric: string
  entry_condition: string
  entry_threshold?: number
  entry_threshold_metric?: string | null
}

// ── Market data ────────────────────────────────────────────────────────────────

export interface LivePrices {
  prices: Record<string, number | null>
  timestamp: string
}

export interface MarketPulseItem {
  type: string
  ticker: string
  headline: string
  value?: string | null
  color: string
}

export interface MarketPulse {
  items: MarketPulseItem[]
  generated_at: string
}

export interface MacroSeries {
  ticker: string
  name: string
  dates: string[]
  values: Array<number | null>
}

export interface SectorRotationRow {
  sector: string
  return_pct?: number | null
  avg_rsi?: number | null
  avg_tech_score?: number | null
}

export interface MarketBreadth {
  date: string
  advancing: number
  declining: number
  unchanged: number
  new_highs_52w: number
  new_lows_52w: number
  above_sma50: number
  below_sma50: number
  avg_rsi?: number | null
  avg_tech_score?: number | null
  pct_advancing?: number | null
  total: number
}

export interface PeerRow {
  ticker: string
  name?: string | null
  market_cap?: number | null
  pe?: number | null
  eps?: number | null
  beta?: number | null
  rsi?: number | null
  return_52w?: number | null
  tech_score?: number | null
}

export interface InsiderTransaction {
  filer_name?: string | null
  ticker: string
  transaction_date?: string | null
  transaction_type?: string | null
  shares?: number | null
  price_per_share?: number | null
  total_value?: number | null
  form_url?: string | null
}

export interface ShortInterest {
  ticker: string
  settlement_date?: string | null
  short_interest?: number | null
  avg_daily_volume?: number | null
  days_to_cover?: number | null
}

export interface PatternSignal {
  id: number
  ticker: string
  detected_at: string
  pattern_type: string
  level?: number | null
  confidence?: number | null
  notes?: string | null
}

export interface AlertCreate {
  ticker: string
  metric: string
  condition: string
  threshold: number
  notes?: string | null
}

export interface AlertOut {
  id: number
  ticker: string
  metric: string
  condition: string
  threshold: number
  triggered: boolean
  triggered_at?: string | null
  created_at: string
  notes?: string | null
}

export interface CorrelationMatrix {
  tickers: string[]
  matrix: Array<Array<number | null>>
}

export interface LatestMetricsRequest {
  tickers: string[]
  metrics: string[]
}

// ── AI ─────────────────────────────────────────────────────────────────────────

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiChatRequest {
  messages: AiMessage[]
  model?: string
  api_key?: string
  context?: Record<string, unknown>
}
