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
  tone: 'positive' | 'negative' | 'warning' | 'neutral'
}

export interface TerminalMover {
  ticker: string
  name?: string | null
  last_price?: number | null
  change_pct?: number | null
  volume?: number | null
  tech_score?: number | null
}

export interface TerminalHeadline {
  ticker: string
  headline: string
  detail: string
  tone: 'positive' | 'negative' | 'warning' | 'neutral'
}

export interface TerminalOverview {
  generated_at: string
  focus_ticker: string
  universe_size: number
  stats: TerminalStat[]
  momentum_leaders: TerminalMover[]
  reversal_candidates: TerminalMover[]
  breakouts: TerminalMover[]
  headlines: TerminalHeadline[]
}

export interface SecurityBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  sma_10?: number | null
  sma_50?: number | null
  sma_100?: number | null
  sma_200?: number | null
  sma_250?: number | null
  sma_30?: number | null
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
  tone: 'positive' | 'negative' | 'warning' | 'neutral'
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
  condition: 'above' | 'below' | 'crosses_above' | 'crosses_below'
  threshold?: number | null
  compare_to_metric?: string | null
}

export interface StrategyDefinition {
  name: string
  entry: StrategyLeg
  exit: StrategyLeg
  universe?: string[] | null
  start_date?: string | null
  end_date?: string | null
  initial_capital: number
  position_size_pct: number
  stop_loss_pct?: number | null
  max_open_positions: number
}

export interface StrategyBacktestRequest {
  ticker: string
  strategy: StrategyDefinition
}

export interface StrategyBacktestSummary {
  total_return_pct: number
  buy_hold_return_pct: number
  max_drawdown_pct: number
  win_rate: number
  num_trades: number
  avg_return_pct: number
  annualized_return_pct?: number | null
  sharpe_ratio?: number | null
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
