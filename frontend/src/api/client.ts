import type {
  AiChatRequest,
  BackupCreateRequest,
  BackupCreateResponse,
  BackupStatus,
  LivePrices,
  SearchResult,
  SyncRequest,
  SyncStatus,
  SyncResponse,
  SecurityOverview,
  StrategyBacktestRequest,
  StrategyBacktestResponse,
  StrategyDefinition,
  StrategyScreenResponse,
  TerminalOverview,
} from './types'

const BASE = import.meta.env.DEV ? '/api' : ''

async function get<T>(path: string, params?: Record<string, string | number | boolean | null | undefined>): Promise<T> {
  const url = new URL(`${BASE}${path}`, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        url.searchParams.set(key, String(value))
      }
    })
  }
  const response = await fetch(url.toString())
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`)
  return response.json()
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`)
  return response.json()
}

export const api = {
  search: (query: string, limit = 10) =>
    get<SearchResult[]>('/search', { query, limit }),

  market: {
    livePrices: (tickers: string[]) =>
      post<LivePrices>('/live-prices', { tickers }),
  },

  terminal: {
    workspace: (ticker: string) =>
      get<TerminalOverview>('/terminal/workspace', { ticker }),
    security: (ticker: string, limit = 180) =>
      get<SecurityOverview>(`/terminal/security/${ticker}`, { limit }),
  },

  strategies: {
    backtest: (body: StrategyBacktestRequest) =>
      post<StrategyBacktestResponse>('/strategies/backtest', body),
    screen: (body: StrategyDefinition) =>
      post<StrategyScreenResponse>('/strategies/screen', body),
  },

  system: {
    backups: (retentionCount = 7) =>
      get<BackupStatus>('/system/backups', { retention_count: retentionCount }),
    createBackup: (body: BackupCreateRequest) =>
      post<BackupCreateResponse>('/system/backups/create', body),
    syncStatus: () =>
      get<SyncStatus>('/system/sync/status'),
    sync: (body: SyncRequest) =>
      post<SyncResponse>('/system/sync', body),
  },

  chat: (body: AiChatRequest) =>
    post<{ content: string }>('/ai/chat', {
      provider: body.model?.includes('claude') ? 'anthropic'
        : body.model?.includes('gpt') ? 'openai'
        : 'ollama',
      model: body.model,
      api_key: body.api_key,
      messages: body.messages,
      context: body.context,
    }),
}
