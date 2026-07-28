import type {
  MarketMonitorOverview,
  SecurityBar,
  SecurityListItem,
  SecurityOverview,
  TerminalMover,
  TerminalOverview,
} from '../api/types'

export const demoItems: SecurityListItem[] = [
  { ticker: 'NVDA', name: 'NVIDIA Corp', sector: 'Technology', close: 926.8, change_pct: 2.4, return_20d: 9.3, return_63d: 21.4, return_126d: 44.2, return_252d: 91.8, rsi: 71.2, tech_score: 94, volume: 62_400_000, market_cap: 2_280_000_000_000, above_sma_200: true },
  { ticker: 'MSFT', name: 'Microsoft Corp', sector: 'Technology', close: 421.3, change_pct: 1.1, return_20d: 5.7, return_63d: 11.8, return_126d: 18.6, return_252d: 32.1, rsi: 66.9, tech_score: 86, volume: 24_100_000, market_cap: 3_130_000_000_000, above_sma_200: true },
  { ticker: 'AVGO', name: 'Broadcom Inc', sector: 'Technology', close: 1432.5, change_pct: 1.9, return_20d: 8.4, return_63d: 17.7, return_126d: 38.5, return_252d: 74.6, rsi: 68.8, tech_score: 88, volume: 5_900_000, market_cap: 666_000_000_000, above_sma_200: true },
  { ticker: 'LLY', name: 'Eli Lilly & Co', sector: 'Health Care', close: 783.2, change_pct: 0.8, return_20d: 6.1, return_63d: 12.2, return_126d: 26.3, return_252d: 59.1, rsi: 63.4, tech_score: 81, volume: 3_600_000, market_cap: 744_000_000_000, above_sma_200: true },
  { ticker: 'SPY', name: 'SPDR S&P 500 ETF', sector: 'ETF', close: 512.4, change_pct: 0.42, return_20d: 3.2, return_63d: 7.4, return_126d: 12.6, return_252d: 24.3, rsi: 58.4, tech_score: 76, volume: 71_000_000, market_cap: 520_000_000_000, above_sma_200: true },
  { ticker: 'QQQ', name: 'Invesco QQQ Trust', sector: 'ETF', close: 438.9, change_pct: 0.78, return_20d: 4.8, return_63d: 10.1, return_126d: 19.5, return_252d: 36.8, rsi: 62.1, tech_score: 82, volume: 43_000_000, market_cap: 249_000_000_000, above_sma_200: true },
  { ticker: 'AAPL', name: 'Apple Inc', sector: 'Technology', close: 189.6, change_pct: -0.18, return_20d: 1.1, return_63d: 3.5, return_126d: 6.2, return_252d: 14.8, rsi: 51.2, tech_score: 63, volume: 48_000_000, market_cap: 2_920_000_000_000, above_sma_200: true },
  { ticker: 'DIS', name: 'Walt Disney Co', sector: 'Communication Services', close: 111.7, change_pct: 0.9, return_20d: 2.8, return_63d: -1.2, return_126d: 7.9, return_252d: 12.1, rsi: 44.6, tech_score: 68, volume: 12_300_000, market_cap: 204_000_000_000, above_sma_200: true },
  { ticker: 'PYPL', name: 'PayPal Holdings', sector: 'Financials', close: 67.4, change_pct: 1.6, return_20d: 3.1, return_63d: -4.5, return_126d: -9.2, return_252d: -12.8, rsi: 38.9, tech_score: 64, volume: 18_700_000, market_cap: 70_000_000_000, above_sma_200: false },
  { ticker: 'TGT', name: 'Target Corp', sector: 'Consumer Staples', close: 146.8, change_pct: 0.7, return_20d: 1.9, return_63d: -2.4, return_126d: 4.1, return_252d: 8.7, rsi: 42.3, tech_score: 61, volume: 4_800_000, market_cap: 67_000_000_000, above_sma_200: true },
]

export const demoMovers: TerminalMover[] = demoItems.slice(0, 4).map((item) => ({
  ticker: item.ticker,
  name: item.name,
  last_price: item.close,
  change_pct: item.change_pct,
  volume: item.volume,
  tech_score: item.tech_score,
}))

export function demoOverview(focusTicker: string): TerminalOverview {
  return {
    generated_at: new Date().toISOString(),
    focus_ticker: focusTicker,
    universe_size: 505,
    stats: [
      { label: 'Advancers', value: '319', tone: 'positive' },
      { label: 'Decliners', value: '174', tone: 'negative' },
      { label: 'Above 200D', value: '62%', tone: 'positive' },
      { label: `${focusTicker} PX`, value: '512.40', change: '+0.42%', tone: 'positive' },
      { label: 'Avg RSI', value: '56.8', tone: 'neutral' },
      { label: 'Above 250D', value: '59%', change: 'Bullish MACD', tone: 'positive' },
      { label: 'Lead Sector', value: 'Technology', change: '+4.3% / 20D', tone: 'positive' },
    ],
    momentum_leaders: demoMovers,
    reversal_candidates: demoItems.slice(7, 10).map((item) => ({
      ticker: item.ticker,
      name: item.name,
      last_price: item.close,
      change_pct: item.change_pct,
      volume: item.volume,
      tech_score: item.tech_score,
    })),
    breakouts: demoMovers.slice(0, 3),
  }
}

export function demoMonitor(): MarketMonitorOverview {
  return {
    generated_at: new Date().toISOString(),
    universe_size: 505,
    breadth: [
      { label: 'Advancers', value: '319', tone: 'positive' },
      { label: 'Decliners', value: '174', tone: 'negative' },
      { label: 'Net Breadth', value: '+145', tone: 'positive' },
      { label: 'Above 200D', value: '62%', tone: 'positive' },
      { label: 'Avg RSI', value: '56.8', tone: 'neutral' },
    ],
    sectors: [
      { sector: 'Technology', members: 76, avg_change_pct: 1.08, avg_return_20d: 5.9, avg_rsi: 63.1, pct_above_200d: 72 },
      { sector: 'Health Care', members: 62, avg_change_pct: 0.44, avg_return_20d: 3.2, avg_rsi: 55.7, pct_above_200d: 64 },
      { sector: 'Financials', members: 70, avg_change_pct: -0.18, avg_return_20d: 1.1, avg_rsi: 50.2, pct_above_200d: 53 },
      { sector: 'Consumer Staples', members: 38, avg_change_pct: 0.12, avg_return_20d: 0.8, avg_rsi: 48.6, pct_above_200d: 49 },
    ],
    leaders: demoItems.slice(0, 6),
    laggards: [...demoItems].reverse().slice(0, 6),
    most_active: [...demoItems].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 6),
    volume_surge: demoItems.slice(0, 6),
    rsi_high: [...demoItems].sort((a, b) => (b.rsi ?? 0) - (a.rsi ?? 0)).slice(0, 6),
    rsi_low: [...demoItems].sort((a, b) => (a.rsi ?? 0) - (b.rsi ?? 0)).slice(0, 6),
  }
}

export function demoBars(days = 320): SecurityBar[] {
  const now = new Date()
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now)
    date.setDate(now.getDate() - (days - index))
    const trend = 435 + index * 0.24
    const wave = Math.sin(index / 13) * 9
    const close = trend + wave
    const open = close - Math.sin(index / 5) * 3
    return {
      date: date.toISOString().slice(0, 10),
      open,
      high: Math.max(open, close) + 3,
      low: Math.min(open, close) - 3,
      close,
      volume: 55_000_000 + Math.round(Math.sin(index / 7) * 8_000_000),
      sma_10: close - 1.8,
      sma_30: close - 4.4,
      sma_200: close - 22,
      sma_250: close - 27,
      ema_10: close - 1.2,
      tech_score: 76,
      rsi: 54 + Math.sin(index / 15) * 12,
      macd: 2.4,
      macd_signal: 1.8,
    }
  })
}

export function demoSecurity(ticker: string): SecurityOverview {
  const item = demoItems.find((candidate) => candidate.ticker === ticker) ?? demoItems[4]
  return {
    generated_at: new Date().toISOString(),
    snapshot: {
      ticker,
      name: item.name,
      sector: item.sector,
      subsector: item.sector === 'ETF' ? 'Index Fund' : 'Large Cap',
      close: item.close,
      change_pct: item.change_pct,
      volume: item.volume,
      market_cap: item.market_cap,
      rsi: item.rsi,
      tech_score: item.tech_score,
      macd: 2.4,
      macd_signal: 1.8,
      return_20d: item.return_20d,
      return_63d: item.return_63d,
      return_126d: item.return_126d,
      return_252d: item.return_252d,
      above_sma_10: true,
      above_sma_30: true,
      above_sma_200: item.above_sma_200,
      above_sma_250: item.above_sma_200,
    },
    signals: [
      { label: 'Tech Score', value: `${item.tech_score ?? 0}`, tone: 'positive' },
      { label: 'RSI', value: `${item.rsi?.toFixed(1) ?? '—'}`, tone: (item.rsi ?? 50) > 70 ? 'negative' : 'neutral' },
      { label: 'MACD Bias', value: 'Bullish', tone: 'positive' },
      { label: 'Trend', value: 'Above 200 / 250 DMA', tone: 'positive' },
    ],
    bars: demoBars(),
    related: demoMovers.filter((mover) => mover.ticker !== ticker),
  }
}
