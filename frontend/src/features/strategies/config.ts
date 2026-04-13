import type { StrategyCondition } from '../../api/types'

export interface StrategyMetricOption {
  value: string
  label: string
  category: 'price' | 'trend' | 'momentum' | 'volume'
}

export const STRATEGY_METRICS: StrategyMetricOption[] = [
  { value: 'Close', label: 'Close', category: 'price' },
  { value: 'Volume', label: 'Volume', category: 'volume' },
  { value: 'Ticker_Avg_Volume_20D', label: '20D Avg Volume', category: 'volume' },
  { value: 'Ticker_RSI', label: 'RSI 14', category: 'momentum' },
  { value: 'Ticker_MACD', label: 'MACD', category: 'momentum' },
  { value: 'Ticker_MACD_Signal', label: 'MACD Signal', category: 'momentum' },
  { value: 'Ticker_MACD_Diff', label: 'MACD Diff', category: 'momentum' },
  { value: 'Ticker_Tech_Score', label: 'Tech Score', category: 'momentum' },
  { value: 'Ticker_Bollinger_PBand', label: 'Bollinger %B', category: 'momentum' },
  { value: 'Ticker_MFI', label: 'Money Flow Index', category: 'momentum' },
  { value: 'Ticker_VWAP', label: 'VWAP 14', category: 'price' },
  { value: 'Ticker_SMA_10', label: 'SMA 10', category: 'trend' },
  { value: 'Ticker_SMA_30', label: 'SMA 30', category: 'trend' },
  { value: 'Ticker_SMA_50', label: 'SMA 50', category: 'trend' },
  { value: 'Ticker_SMA_100', label: 'SMA 100', category: 'trend' },
  { value: 'Ticker_SMA_200', label: 'SMA 200', category: 'trend' },
  { value: 'Ticker_SMA_250', label: 'SMA 250', category: 'trend' },
  { value: 'Ticker_EMA_10', label: 'EMA 10', category: 'trend' },
  { value: 'Ticker_EMA_30', label: 'EMA 30', category: 'trend' },
  { value: 'Ticker_EMA_50', label: 'EMA 50', category: 'trend' },
  { value: 'Ticker_EMA_100', label: 'EMA 100', category: 'trend' },
  { value: 'Ticker_EMA_200', label: 'EMA 200', category: 'trend' },
  { value: 'Ticker_Return_20D', label: 'Return 20D %', category: 'momentum' },
  { value: 'Ticker_Return_63D', label: 'Return 63D %', category: 'momentum' },
  { value: 'Ticker_Return_126D', label: 'Return 126D %', category: 'momentum' },
  { value: 'Ticker_Return_252D', label: 'Return 252D %', category: 'momentum' },
  { value: 'Ticker_52W_High', label: '52W High', category: 'trend' },
  { value: 'Ticker_52W_Low', label: '52W Low', category: 'trend' },
  { value: 'Ticker_52W_Range_Pct', label: '52W Range %', category: 'momentum' },
]

export const STRATEGY_CONDITIONS: StrategyCondition[] = [
  'above',
  'below',
  'crosses_above',
  'crosses_below',
]
