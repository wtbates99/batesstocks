import type {
  StockData, CompanyInfo, SearchResult, ScreenerRow, HeatmapNode,
  TechnicalSummary, RadarData, WatchlistCreate, WatchlistOut,
  PositionCreate, PositionOut, PortfolioOut, NewsItem, EarningsEvent,
  OptionsChain, BacktestRequest, BacktestResult, StrategyScreenRequest,
  LivePrices, MarketPulse, MacroSeries, SectorRotationRow, MarketBreadth,
  PeerRow, InsiderTransaction, ShortInterest, PatternSignal, AlertCreate,
  AlertOut, CorrelationMatrix, LatestMetricsRequest, AiChatRequest,
} from './types'

const BASE = import.meta.env.DEV ? '/api' : ''

async function get<T>(path: string, params?: Record<string, string | number | boolean | null | undefined>): Promise<T> {
  const url = new URL(`${BASE}${path}`, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== null && v !== undefined) url.searchParams.set(k, String(v))
    })
  }
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json()
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json()
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json()
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json()
}

// ── Stock data ─────────────────────────────────────────────────────────────────
export const api = {
  stock: {
    data: (ticker: string, days?: number) =>
      get<StockData[]>(`/stock/${ticker}`, { days }),
    info: (ticker: string) =>
      get<CompanyInfo>(`/company/${ticker}`),
    news: (ticker: string) =>
      get<NewsItem[]>(`/news/${ticker}`),
    options: (ticker: string, expiry?: string) =>
      get<OptionsChain>(`/options/${ticker}`, { expiry }),
    technical: (ticker: string) =>
      get<TechnicalSummary>(`/technical-summary/${ticker}`),
    radar: (ticker: string) =>
      get<RadarData>(`/radar/${ticker}`),
    peers: (ticker: string) =>
      get<PeerRow[]>(`/peers/${ticker}`),
    insider: (ticker: string) =>
      get<InsiderTransaction[]>(`/insider/${ticker}`),
    shortInterest: (ticker: string) =>
      get<ShortInterest>(`/short-interest/${ticker}`),
    patterns: (ticker: string, days?: number) =>
      get<PatternSignal[]>(`/patterns/${ticker}`, { days }),
  },

  search: (query: string, limit = 10) =>
    get<SearchResult[]>('/search', { query, limit }),

  screener: () => get<ScreenerRow[]>('/screener'),

  heatmap: (level: string, sector?: string, subsector?: string) =>
    get<HeatmapNode[]>('/heatmap', { level, sector, subsector }),

  // ── Watchlists ───────────────────────────────────────────────────────────────
  watchlists: {
    list: () => get<WatchlistOut[]>('/watchlists'),
    get: (id: number) => get<WatchlistOut>(`/watchlists/${id}`),
    create: (body: WatchlistCreate) => post<WatchlistOut>('/watchlists', body),
    update: (id: number, body: WatchlistCreate) => put<WatchlistOut>(`/watchlists/${id}`, body),
    delete: (id: number) => del<{ ok: boolean }>(`/watchlists/${id}`),
  },

  // ── Portfolios ───────────────────────────────────────────────────────────────
  portfolios: {
    list: () => get<Array<{ id: number; name: string; created_at: string }>>('/portfolios'),
    get: (id: number) => get<PortfolioOut>(`/portfolios/${id}`),
    create: (name: string) => post<PortfolioOut>('/portfolios', { name }),
    chart: (id: number, days?: number) =>
      get<Array<{ date: string; value: number }>>(`/portfolios/${id}/chart`, { days }),
    addPosition: (id: number, body: PositionCreate) =>
      post<PositionOut>(`/portfolios/${id}/positions`, body),
    updatePosition: (portfolioId: number, posId: number, body: PositionCreate) =>
      put<PositionOut>(`/portfolios/${portfolioId}/positions/${posId}`, body),
    deletePosition: (portfolioId: number, posId: number) =>
      del<{ ok: boolean }>(`/portfolios/${portfolioId}/positions/${posId}`),
  },

  // ── Alerts ───────────────────────────────────────────────────────────────────
  alerts: {
    list: () => get<AlertOut[]>('/alerts'),
    create: (body: AlertCreate) => post<AlertOut>('/alerts', body),
    delete: (id: number) => del<{ ok: boolean }>(`/alerts/${id}`),
  },

  // ── Backtest & screen ─────────────────────────────────────────────────────────
  backtest: (body: BacktestRequest) => post<BacktestResult>('/backtest', body),
  strategyScreen: (body: StrategyScreenRequest) => post<string[]>('/strategy-screen', body),
  latestMetrics: (body: LatestMetricsRequest) =>
    post<Array<Record<string, number | null>>>('/metrics/latest', body),

  // ── Market data ───────────────────────────────────────────────────────────────
  market: {
    livePrices: (tickers: string[]) =>
      post<LivePrices>('/live-prices', { tickers }),
    pulse: () => get<MarketPulse>('/market-pulse'),
    breadth: () => get<MarketBreadth>('/market-breadth'),
    sectorRotation: () => get<SectorRotationRow[]>('/sector-rotation'),
    macro: (series: string) => get<MacroSeries>(`/macro/${series}`),
    correlations: (tickers: string[], days?: number) =>
      post<CorrelationMatrix>('/correlations', { tickers, days: days ?? 90 }),
  },

  // ── Calendar ───────────────────────────────────────────────────────────────────
  calendar: {
    earnings: (days?: number) => get<EarningsEvent[]>('/earnings', { days_ahead: days ?? 14 }),
  },

  // ── Patterns ──────────────────────────────────────────────────────────────────
  recentPatterns: (pattern_type?: string, days?: number) =>
    get<PatternSignal[]>('/patterns', { pattern_type, days }),

  // ── AI ─────────────────────────────────────────────────────────────────────────
  chat: (body: AiChatRequest) => post<{ content: string }>('/ai/chat', {
    provider: body.model?.includes('claude') ? 'anthropic'
            : body.model?.includes('gpt') ? 'openai'
            : 'ollama',
    model: body.model ?? 'gemini-3-flash-preview',
    api_key: (body as AiChatRequest & { api_key?: string }).api_key,
    messages: body.messages,
    context: body.context,
  }),

  // ── Pipeline ──────────────────────────────────────────────────────────────────
  pipeline: {
    status: () => get<Record<string, unknown>>('/pipeline/status'),
    trigger: () => post<{ ok: boolean }>('/pipeline/trigger', {}),
  },
}
