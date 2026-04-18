import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type {
  AiChatRequest,
  StrategyBacktestRequest,
  StrategyDefinition,
  SyncRequest,
} from './types'

export const terminalKeys = {
  workspace: (ticker: string) => ['workspace', ticker] as const,
  monitor: () => ['monitor'] as const,
  sector: (sector: string) => ['sector', sector] as const,
  security: (ticker: string, limit: number) => ['security', ticker, limit] as const,
  intraday: (ticker: string, interval: string, period: string) => ['intraday', ticker, interval, period] as const,
  fundamentals: (ticker: string) => ['fundamentals', ticker] as const,
  snapshots: (tickers: string[]) => ['snapshots', ...tickers] as const,
  news: (scope: string, tickers: string[]) => ['news', scope, ...tickers] as const,
  earnings: (tickers: string[]) => ['earnings', ...tickers] as const,
  livePrices: (tickers: string[]) => ['live-prices', ...tickers] as const,
  search: (query: string) => ['search', query] as const,
  syncStatus: () => ['sync-status'] as const,
  freshness: () => ['freshness'] as const,
  healthLive: () => ['health-live'] as const,
  healthReady: () => ['health-ready'] as const,
}

export function useWorkspaceQuery(ticker: string) {
  return useQuery({
    queryKey: terminalKeys.workspace(ticker),
    queryFn: () => api.terminal.workspace(ticker),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function useMonitorQuery() {
  return useQuery({
    queryKey: terminalKeys.monitor(),
    queryFn: api.terminal.monitor,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function useSectorQuery(sector: string, enabled = true) {
  return useQuery({
    queryKey: terminalKeys.sector(sector),
    queryFn: () => api.terminal.sector(sector),
    enabled: enabled && sector.trim().length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function useSecurityQuery(ticker: string, limit = 1000) {
  return useQuery({
    queryKey: terminalKeys.security(ticker, limit),
    queryFn: () => api.terminal.security(ticker, limit),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useIntradayQuery(ticker: string, interval: string, period: string, enabled = true) {
  return useQuery({
    queryKey: terminalKeys.intraday(ticker, interval, period),
    queryFn: () => api.terminal.intraday(ticker, interval, period),
    enabled: enabled && ticker.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  })
}

export function useFundamentalsQuery(ticker: string, enabled = true) {
  return useQuery({
    queryKey: terminalKeys.fundamentals(ticker),
    queryFn: () => api.terminal.fundamentals(ticker),
    enabled: enabled && ticker.length > 0,
    staleTime: 4 * 60 * 60_000,   // fundamentals are slow-moving; refresh every 4h
    refetchOnWindowFocus: false,
  })
}

export function useSnapshotsQuery(tickers: string[], enabled = true) {
  const clean = Array.from(new Set(tickers.filter(Boolean).map((ticker) => ticker.toUpperCase())))
  return useQuery({
    queryKey: terminalKeys.snapshots(clean),
    queryFn: () => api.terminal.snapshots(clean),
    enabled: enabled && clean.length > 0,
    staleTime: 20_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useNewsQuery(tickers: string[], scope: string, limit = 12, enabled = true) {
  const clean = Array.from(new Set(tickers.filter(Boolean).map((ticker) => ticker.toUpperCase())))
  return useQuery({
    queryKey: terminalKeys.news(scope, clean),
    queryFn: () => api.terminal.news(clean, scope, limit),
    enabled: enabled && clean.length > 0,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
}

export function useEarningsQuery(tickers: string[], enabled = true) {
  const clean = Array.from(new Set(tickers.filter(Boolean).map((t) => t.toUpperCase())))
  return useQuery({
    queryKey: terminalKeys.earnings(clean),
    queryFn: () => api.terminal.earnings(clean),
    enabled: enabled && clean.length > 0,
    staleTime: 6 * 60 * 60_000,
    refetchInterval: 6 * 60 * 60_000,
    refetchOnWindowFocus: false,
  })
}

export function useLivePricesQuery(tickers: string[], enabled = true, intervalMs = 20_000) {
  const clean = Array.from(new Set(tickers.filter(Boolean).map((ticker) => ticker.toUpperCase())))
  return useQuery({
    queryKey: terminalKeys.livePrices(clean),
    queryFn: () => api.market.livePrices(clean),
    enabled: enabled && clean.length > 0,
    staleTime: 10_000,
    refetchInterval: intervalMs,
    refetchOnWindowFocus: false,
  })
}

export function useSearchQuery(query: string, enabled = true) {
  return useQuery({
    queryKey: terminalKeys.search(query),
    queryFn: () => api.search(query, 8),
    enabled: enabled && query.trim().length > 0,
    staleTime: 60_000,
  })
}

export function useSyncStatusQuery() {
  return useQuery({
    queryKey: terminalKeys.syncStatus(),
    queryFn: api.system.syncStatus,
    staleTime: 1_000,
    refetchInterval: (query) => (query.state.data?.state === 'running' ? 2_500 : 10_000),
    refetchOnWindowFocus: false,
  })
}

export function useFreshnessQuery() {
  return useQuery({
    queryKey: terminalKeys.freshness(),
    queryFn: api.system.freshness,
    staleTime: 60_000,
    refetchInterval: 300_000,
    refetchOnWindowFocus: false,
  })
}

export function useHealthQuery() {
  return {
    live: useQuery({
      queryKey: terminalKeys.healthLive(),
      queryFn: api.system.liveHealth,
      staleTime: 10_000,
      refetchInterval: 15_000,
      refetchOnWindowFocus: false,
    }),
    ready: useQuery({
      queryKey: terminalKeys.healthReady(),
      queryFn: api.system.readyHealth,
      staleTime: 10_000,
      refetchInterval: 20_000,
      refetchOnWindowFocus: false,
    }),
  }
}

export function useSyncMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: SyncRequest) => api.system.sync(request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: terminalKeys.syncStatus() })
      await queryClient.invalidateQueries({ queryKey: ['workspace'] })
      await queryClient.invalidateQueries({ queryKey: ['security'] })
      await queryClient.invalidateQueries({ queryKey: ['live-prices'] })
    },
  })
}

export function useScreenMutation() {
  return useMutation({
    mutationFn: (strategy: StrategyDefinition) => api.strategies.screen(strategy),
  })
}

export function useBacktestMutation() {
  return useMutation({
    mutationFn: (request: StrategyBacktestRequest) => api.strategies.backtest(request),
  })
}

export function useChatMutation() {
  return useMutation({
    mutationFn: (request: AiChatRequest) => api.chat(request),
  })
}
