export type Tone = 'positive' | 'negative' | 'warning' | 'neutral'
export type StrategyCondition = 'above' | 'below' | 'crosses_above' | 'crosses_below'
export type StrategyOperator = 'and' | 'or'

export interface SearchResult {
  ticker: string
  name: string
}

export interface LivePrices {
  prices: Record<string, number | null>
  timestamp: string
}

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

export interface BacktestTrade {
  entry_date: string
  entry_price: number
  exit_date: string
  exit_price: number
  return_pct: number
  pnl: number
}

export interface TerminalStat {
  label: string
  value: string
  change?: string | null
  tone: Tone
}

export interface TerminalMover {
  ticker: string
  name?: string | null
  last_price?: number | null
  change_pct?: number | null
  volume?: number | null
  tech_score?: number | null
}

export interface NewsItem {
  id: string
  ticker?: string | null
  title: string
  summary?: string | null
  publisher?: string | null
  link: string
  published_at?: string | null
  related_tickers: string[]
  matched_tickers: string[]
  why?: string | null
  relevance_score?: number | null
}

export interface NewsResponse {
  generated_at: string
  scope: string
  items: NewsItem[]
}

export interface TerminalOverview {
  generated_at: string
  focus_ticker: string
  universe_size: number
  stats: TerminalStat[]
  momentum_leaders: TerminalMover[]
  reversal_candidates: TerminalMover[]
  breakouts: TerminalMover[]
}

export interface SecurityBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  sma_10?: number | null
  sma_30?: number | null
  sma_50?: number | null
  sma_100?: number | null
  sma_200?: number | null
  sma_250?: number | null
  ema_10?: number | null
  ema_50?: number | null
  ema_100?: number | null
  ema_200?: number | null
  tech_score?: number | null
  rsi?: number | null
  macd?: number | null
  macd_signal?: number | null
}

export interface SecuritySignal {
  label: string
  value: string
  tone: Tone
}

export interface SecuritySnapshot {
  ticker: string
  name?: string | null
  sector?: string | null
  subsector?: string | null
  close?: number | null
  change_pct?: number | null
  volume?: number | null
  market_cap?: number | null
  rsi?: number | null
  tech_score?: number | null
  macd?: number | null
  macd_signal?: number | null
  return_20d?: number | null
  return_63d?: number | null
  return_126d?: number | null
  return_252d?: number | null
  above_sma_10: boolean
  above_sma_30: boolean
  above_sma_200: boolean
  above_sma_250: boolean
}

export interface SecurityOverview {
  generated_at: string
  snapshot: SecuritySnapshot
  signals: SecuritySignal[]
  bars: SecurityBar[]
  related: TerminalMover[]
}

export interface StrategyLeg {
  metric: string
  condition: StrategyCondition
  threshold?: number | null
  compare_to_metric?: string | null
}

export interface StrategyDefinition {
  name: string
  entry: StrategyLeg
  exit: StrategyLeg
  entry_filters?: StrategyLeg[]
  exit_filters?: StrategyLeg[]
  entry_operator?: StrategyOperator
  exit_operator?: StrategyOperator
  universe?: string[] | null
  start_date?: string | null
  end_date?: string | null
  initial_capital: number
  position_size_pct: number
  stop_loss_pct?: number | null
  fee_bps?: number
  slippage_bps?: number
  max_open_positions: number
}

export interface StrategyBacktestRequest {
  ticker: string
  strategy: StrategyDefinition
}

export interface StrategyBacktestSummary {
  total_return_pct: number
  gross_return_pct: number
  cost_drag_pct: number
  buy_hold_return_pct: number
  max_drawdown_pct: number
  win_rate: number
  num_trades: number
  avg_return_pct: number
  annualized_return_pct?: number | null
  sharpe_ratio?: number | null
  sortino_ratio?: number | null
  beta?: number | null
  total_fees_paid: number
}

export interface StrategyBacktestPoint {
  date: string
  equity: number
  benchmark?: number | null
  exposure: number
}

export interface StrategyMatch {
  ticker: string
  name?: string | null
  sector?: string | null
  last_price?: number | null
  rsi?: number | null
  tech_score?: number | null
  signal_state: string
}

export interface StrategyBacktestResponse {
  ticker: string
  strategy_name: string
  summary: StrategyBacktestSummary
  equity_curve: StrategyBacktestPoint[]
  trades: BacktestTrade[]
  current_matches: StrategyMatch[]
}

export interface StrategyScreenResponse {
  generated_at: string
  strategy_name: string
  matches: StrategyMatch[]
}

export interface SecurityListItem {
  ticker: string
  name?: string | null
  sector?: string | null
  close?: number | null
  change_pct?: number | null
  volume?: number | null
  avg_volume_20d?: number | null
  rsi?: number | null
  tech_score?: number | null
  return_20d?: number | null
  return_63d?: number | null
  return_126d?: number | null
  return_252d?: number | null
  market_cap?: number | null
  above_sma_200: boolean
}

export interface SecuritySnapshotResponse {
  generated_at: string
  items: SecurityListItem[]
}

export interface MonitorSector {
  sector: string
  members: number
  avg_change_pct?: number | null
  avg_return_20d?: number | null
  avg_rsi?: number | null
  pct_above_200d?: number | null
}

export interface MarketMonitorOverview {
  generated_at: string
  universe_size: number
  breadth: TerminalStat[]
  sectors: MonitorSector[]
  leaders: SecurityListItem[]
  laggards: SecurityListItem[]
  most_active: SecurityListItem[]
  volume_surge: SecurityListItem[]
  rsi_high: SecurityListItem[]
  rsi_low: SecurityListItem[]
}

export interface SectorOverview {
  generated_at: string
  sector: string
  summary: TerminalStat[]
  leaders: SecurityListItem[]
  laggards: SecurityListItem[]
  members: SecurityListItem[]
}

export interface BackupManifest {
  filename: string
  created_at: string
  size_bytes: number
  compressed: boolean
}

export interface BackupStatus {
  database_path: string
  backup_directory: string
  retention_count: number
  available_backups: BackupManifest[]
}

export interface BackupCreateRequest {
  compress: boolean
  retention_count: number
}

export interface BackupCreateResponse {
  created: BackupManifest
  pruned: string[]
}

export interface SyncRequest {
  tickers?: string[] | null
  years: number
}

export interface SyncResponse {
  started_at: string
  finished_at: string
  tickers: string[]
  rows_written: number
  metadata_rows: number
}

export interface EarningsItem {
  ticker: string
  earnings_date?: string | null
  eps_estimate?: number | null
  revenue_estimate?: number | null
}

export interface EarningsResponse {
  generated_at: string
  items: EarningsItem[]
}

export interface SyncStatus {
  state: string
  source: string
  phase: string
  detail: string
  started_at?: string | null
  updated_at?: string | null
  finished_at?: string | null
  target_tickers: number
  completed_tickers: number
  rows_written: number
  metadata_rows: number
  last_success_at?: string | null
  last_error?: string | null
}

export interface IntradayBar {
  time: number // Unix timestamp (seconds)
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface IntradayResponse {
  ticker: string
  interval: string
  period: string
  bars: IntradayBar[]
}

export interface Fundamentals {
  ticker: string
  generated_at: string
  pe_ratio?: number | null
  forward_pe?: number | null
  peg_ratio?: number | null
  ev_ebitda?: number | null
  price_to_book?: number | null
  price_to_sales?: number | null
  enterprise_value?: number | null
  gross_margin?: number | null
  operating_margin?: number | null
  profit_margin?: number | null
  roe?: number | null
  roa?: number | null
  eps_ttm?: number | null
  eps_forward?: number | null
  revenue_per_share?: number | null
  book_value?: number | null
  revenue_growth?: number | null
  earnings_growth?: number | null
  total_cash?: number | null
  total_debt?: number | null
  debt_to_equity?: number | null
  current_ratio?: number | null
  free_cash_flow?: number | null
  dividend_yield?: number | null
  payout_ratio?: number | null
  beta?: number | null
  shares_outstanding?: number | null
  short_ratio?: number | null
  total_revenue?: number | null
  ebitda?: number | null
}
