import type { StrategyDefinition } from '../../api/types'

export interface StrategyMetricOption {
  value: string
  label: string
}

export const STRATEGY_METRICS: StrategyMetricOption[] = [
  { value: 'Close', label: 'Price (Close)' },
  { value: 'Volume', label: 'Volume' },
  { value: 'Ticker_Avg_Volume_20D', label: '20D Avg Volume' },
  { value: 'Ticker_RSI', label: 'RSI (14)' },
  { value: 'Ticker_MACD', label: 'MACD' },
  { value: 'Ticker_MACD_Signal', label: 'MACD Signal' },
  { value: 'Ticker_MACD_Diff', label: 'MACD Diff' },
  { value: 'Ticker_Tech_Score', label: 'Tech Score' },
  { value: 'Ticker_Bollinger_PBand', label: 'Bollinger %B' },
  { value: 'Ticker_MFI', label: 'Money Flow Index' },
  { value: 'Ticker_VWAP', label: 'VWAP (14)' },
  { value: 'Ticker_SMA_10', label: 'SMA 10' },
  { value: 'Ticker_SMA_30', label: 'SMA 30' },
  { value: 'Ticker_SMA_50', label: 'SMA 50' },
  { value: 'Ticker_SMA_100', label: 'SMA 100' },
  { value: 'Ticker_SMA_200', label: 'SMA 200' },
  { value: 'Ticker_SMA_250', label: 'SMA 250' },
  { value: 'Ticker_EMA_10', label: 'EMA 10' },
  { value: 'Ticker_EMA_30', label: 'EMA 30' },
  { value: 'Ticker_EMA_50', label: 'EMA 50' },
  { value: 'Ticker_EMA_100', label: 'EMA 100' },
  { value: 'Ticker_EMA_200', label: 'EMA 200' },
  { value: 'Ticker_Return_20D', label: 'Return 20D %' },
  { value: 'Ticker_Return_63D', label: 'Return 63D %' },
  { value: 'Ticker_Return_126D', label: 'Return 126D %' },
  { value: 'Ticker_Return_252D', label: 'Return 252D %' },
  { value: 'Ticker_52W_High', label: '52W High' },
  { value: 'Ticker_52W_Low', label: '52W Low' },
  { value: 'Ticker_52W_Range_Pct', label: '52W Range %' },
]

export const STRATEGY_CONDITIONS: Array<StrategyDefinition['entry']['condition']> = [
  'above',
  'below',
  'crosses_above',
  'crosses_below',
]
