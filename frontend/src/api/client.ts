import type {
  AiChatRequest,
  BackupCreateRequest,
  BackupCreateResponse,
  BackupStatus,
  LivePrices,
  MarketMonitorOverview,
  NewsResponse,
  SearchResult,
  SectorOverview,
  SecurityOverview,
  SecuritySnapshotResponse,
  StrategyBacktestRequest,
  StrategyBacktestResponse,
  StrategyDefinition,
  StrategyScreenResponse,
  SyncRequest,
  SyncResponse,
  SyncStatus,
  TerminalOverview,
} from './types'

const BASE = import.meta.env.DEV ? '/api' : ''

type QueryParams = Record<string, string | number | boolean | null | undefined>

async function request<T>(path: string, init?: RequestInit, params?: QueryParams): Promise<T> {
  const url = new URL(`${BASE}${path}`, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        url.searchParams.set(key, String(value))
      }
    })
  }

  const response = await fetch(url.toString(), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`${response.status}: ${detail || response.statusText}`)
  }

  return response.json() as Promise<T>
}

function get<T>(path: string, params?: QueryParams) {
  return request<T>(path, undefined, params)
}

function post<T>(path: string, body: unknown) {
  return request<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export const api = {
  search: (query: string, limit = 8) =>
    get<SearchResult[]>('/search', { query, limit }),

  market: {
    livePrices: (tickers: string[]) => post<LivePrices>('/live-prices', { tickers }),
  },

  terminal: {
    workspace: (ticker: string) => get<TerminalOverview>('/terminal/workspace', { ticker }),
    monitor: () => get<MarketMonitorOverview>('/terminal/monitor'),
    sector: (sector: string) => get<SectorOverview>(`/terminal/sector/${encodeURIComponent(sector)}`),
    security: (ticker: string, limit = 260) =>
      get<SecurityOverview>(`/terminal/security/${ticker}`, { limit }),
    snapshots: (tickers: string[]) =>
      get<SecuritySnapshotResponse>('/terminal/snapshots', { tickers: tickers.join(',') }),
    news: (tickers: string[], scope: string, limit = 12) =>
      get<NewsResponse>('/news', { tickers: tickers.join(','), scope, limit }),
  },

  strategies: {
    screen: (strategy: StrategyDefinition) =>
      post<StrategyScreenResponse>('/strategies/screen', strategy),
    backtest: (payload: StrategyBacktestRequest) =>
      post<StrategyBacktestResponse>('/strategies/backtest', payload),
  },

  system: {
    syncStatus: () => get<SyncStatus>('/system/sync/status'),
    freshness: () =>
      get<{ latest_date: string | null; oldest_date: string | null; ticker_count: number; stale_count: number }>('/system/freshness'),
    sync: (body: SyncRequest) => post<SyncResponse>('/system/sync', body),
    backups: (retentionCount = 7) =>
      get<BackupStatus>('/system/backups', { retention_count: retentionCount }),
    createBackup: (body: BackupCreateRequest) =>
      post<BackupCreateResponse>('/system/backups/create', body),
    liveHealth: () => get<{ status: string }>('/health/live'),
    readyHealth: () => get<{ status: string }>('/health/ready'),
  },

  chat: (body: AiChatRequest) =>
    post<{ content: string }>('/ai/chat', {
      provider: body.model?.includes('claude')
        ? 'anthropic'
        : body.model?.includes('gpt')
          ? 'openai'
          : 'ollama',
      model: body.model,
      api_key: body.api_key,
      messages: body.messages,
      context: body.context,
    }),
}
