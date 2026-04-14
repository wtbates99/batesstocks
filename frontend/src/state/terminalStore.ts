import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { StrategyDraft, SavedWorkspaceDraft } from '../lib/strategy'

interface SyncNotice {
  message: string
  tone: 'neutral' | 'positive' | 'negative'
}

export interface TerminalWatchlist {
  id: string
  name: string
  symbols: string[]
}

export interface WatchlistAnnotation {
  note?: string
  triggerPrice?: number
  riskTag?: 'H' | 'M' | 'L'
  reviewDate?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function uniqHead(items: string[], limit: number) {
  return Array.from(new Set(items.map((item) => item.toUpperCase()))).slice(0, limit)
}

function uniqCommands(items: string[], limit: number) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of items) {
    const key = item.trim().toUpperCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(item.trim())
    if (result.length >= limit) break
  }
  return result
}

function defaultWatchlists(): TerminalWatchlist[] {
  return [
    { id: 'core', name: 'Core', symbols: ['SPY', 'QQQ', 'AAPL', 'MSFT'] },
    { id: 'macro', name: 'Macro', symbols: ['TLT', 'GLD', 'XLF', 'IWM'] },
  ]
}

function sanitizeStringArray(value: unknown, limit: number, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback
  return uniqHead(
    value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean),
    limit,
  )
}

function sanitizeWatchlists(value: unknown): TerminalWatchlist[] {
  if (!Array.isArray(value)) return defaultWatchlists()

  const watchlists = value
    .filter(isRecord)
    .map((item, index) => {
      const id = typeof item.id === 'string' && item.id.trim() ? item.id : `watchlist-${index + 1}`
      const name = typeof item.name === 'string' && item.name.trim() ? item.name : `Watchlist ${index + 1}`
      const symbols = sanitizeStringArray(item.symbols, 40)
      return { id, name, symbols }
    })
    .filter((item) => item.symbols.length > 0)

  return watchlists.length > 0 ? watchlists : defaultWatchlists()
}

function sanitizeSavedCompareSets(value: unknown): TerminalStore['savedCompareSets'] {
  if (!Array.isArray(value)) return []

  return value
    .filter(isRecord)
    .map((item, index) => ({
      id: typeof item.id === 'string' && item.id.trim() ? item.id : `compare-${index + 1}`,
      name: typeof item.name === 'string' && item.name.trim() ? item.name : 'Saved Compare',
      tickers: sanitizeStringArray(item.tickers, 8),
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date(0).toISOString(),
    }))
    .filter((item) => item.tickers.length > 0)
    .slice(0, 12)
}

function sanitizeSavedDrafts<T>(value: unknown): SavedWorkspaceDraft<T>[] {
  if (!Array.isArray(value)) return []

  return value
    .filter(isRecord)
    .map((item, index) => ({
      id: typeof item.id === 'string' && item.id.trim() ? item.id : `draft-${index + 1}`,
      name: typeof item.name === 'string' && item.name.trim() ? item.name : 'Saved Draft',
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date(0).toISOString(),
      draft: item.draft as T,
    }))
    .filter((item) => item.draft != null)
    .slice(0, 12)
}

interface TerminalStore {
  activeTicker: string
  commandValue: string
  commandFocusNonce: number
  aiOpen: boolean
  aiDraft?: string
  aiContext: Record<string, unknown>
  syncNotice?: SyncNotice
  watchlists: TerminalWatchlist[]
  activeWatchlistId: string
  recentTickers: string[]
  compareTickers: string[]
  savedCompareSets: Array<{ id: string; name: string; tickers: string[]; createdAt: string }>
  recentCommands: string[]
  savedScreens: SavedWorkspaceDraft<StrategyDraft>[]
  savedBacktests: SavedWorkspaceDraft<StrategyDraft>[]
  watchlistAnnotations: Record<string, WatchlistAnnotation>
  lastRoute: string
  setActiveTicker: (ticker: string) => void
  addRecentTicker: (ticker: string) => void
  setCommandValue: (value: string) => void
  focusCommandBar: () => void
  addRecentCommand: (value: string) => void
  openAi: (draft?: string) => void
  closeAi: () => void
  setAiContext: (context: Record<string, unknown>) => void
  mergeAiContext: (context: Record<string, unknown>) => void
  setSyncNotice: (notice?: SyncNotice) => void
  setActiveWatchlist: (id: string) => void
  createWatchlist: (name: string) => void
  renameWatchlist: (id: string, name: string) => void
  deleteWatchlist: (id: string) => void
  toggleWatchlist: (ticker: string, watchlistId?: string) => void
  setCompareTickers: (tickers: string[]) => void
  toggleCompareTicker: (ticker: string) => void
  removeCompareTicker: (ticker: string) => void
  saveCompareSet: (name: string, tickers: string[]) => void
  deleteCompareSet: (id: string) => void
  saveScreenDraft: (name: string, draft: StrategyDraft) => void
  deleteScreenDraft: (id: string) => void
  saveBacktestDraft: (name: string, draft: StrategyDraft) => void
  deleteBacktestDraft: (id: string) => void
  setAnnotation: (key: string, ann: WatchlistAnnotation) => void
  clearAnnotation: (key: string) => void
  setLastRoute: (route: string) => void
}

export const useTerminalStore = create<TerminalStore>()(
  persist(
    (set, get) => ({
      activeTicker: 'SPY',
      commandValue: '',
      commandFocusNonce: 0,
      aiOpen: false,
      aiDraft: undefined,
      aiContext: {},
      syncNotice: undefined,
      watchlists: defaultWatchlists(),
      activeWatchlistId: 'core',
      recentTickers: ['SPY'],
      compareTickers: ['SPY', 'QQQ'],
      savedCompareSets: [],
      recentCommands: [],
      savedScreens: [],
      savedBacktests: [],
      watchlistAnnotations: {},
      lastRoute: '/',
      setActiveTicker: (ticker) => set({ activeTicker: ticker.toUpperCase() }),
      addRecentTicker: (ticker) =>
        set((state) => ({
          recentTickers: uniqHead([ticker, ...state.recentTickers], 12),
        })),
      setCommandValue: (commandValue) => set({ commandValue }),
      focusCommandBar: () =>
        set((state) => ({ commandFocusNonce: state.commandFocusNonce + 1 })),
      addRecentCommand: (value) =>
        set((state) => ({
          recentCommands: uniqCommands([value, ...state.recentCommands], 12),
        })),
      openAi: (aiDraft) => set({ aiOpen: true, aiDraft }),
      closeAi: () => set({ aiOpen: false, aiDraft: undefined }),
      setAiContext: (aiContext) => set({ aiContext }),
      mergeAiContext: (context) =>
        set((state) => ({ aiContext: { ...state.aiContext, ...context } })),
      setSyncNotice: (syncNotice) => set({ syncNotice }),
      setActiveWatchlist: (activeWatchlistId) => set({ activeWatchlistId }),
      createWatchlist: (name) =>
        set((state) => {
          const id = crypto.randomUUID()
          return {
            watchlists: [
              ...state.watchlists,
              { id, name: name.trim() || `Watchlist ${state.watchlists.length + 1}`, symbols: [] },
            ],
            activeWatchlistId: id,
          }
        }),
      renameWatchlist: (id, name) =>
        set((state) => ({
          watchlists: state.watchlists.map((watchlist) =>
            watchlist.id === id ? { ...watchlist, name: name.trim() || watchlist.name } : watchlist,
          ),
        })),
      deleteWatchlist: (id) =>
        set((state) => {
          const remaining = state.watchlists.filter((watchlist) => watchlist.id !== id)
          const next = remaining.length > 0 ? remaining : defaultWatchlists().slice(0, 1)
          return {
            watchlists: next,
            activeWatchlistId: next.some((watchlist) => watchlist.id === state.activeWatchlistId)
              ? state.activeWatchlistId
              : next[0].id,
          }
        }),
      toggleWatchlist: (ticker, watchlistId) =>
        set((state) => {
          const symbol = ticker.toUpperCase()
          const targetId = watchlistId ?? state.activeWatchlistId
          return {
            watchlists: state.watchlists.map((watchlist) => {
              if (watchlist.id !== targetId) return watchlist
              return {
                ...watchlist,
                symbols: watchlist.symbols.includes(symbol)
                  ? watchlist.symbols.filter((item) => item !== symbol)
                  : uniqHead([symbol, ...watchlist.symbols], 40),
              }
            }),
          }
        }),
      setCompareTickers: (tickers) => set({ compareTickers: uniqHead(tickers, 8) }),
      toggleCompareTicker: (ticker) =>
        set((state) => {
          const symbol = ticker.toUpperCase()
          return {
            compareTickers: state.compareTickers.includes(symbol)
              ? state.compareTickers.filter((item) => item !== symbol)
              : uniqHead([symbol, ...state.compareTickers], 8),
          }
        }),
      removeCompareTicker: (ticker) =>
        set((state) => ({
          compareTickers: state.compareTickers.filter((item) => item !== ticker.toUpperCase()),
        })),
      saveCompareSet: (name, tickers) =>
        set((state) => ({
          savedCompareSets: [
            {
              id: crypto.randomUUID(),
              name: name.trim() || `Compare ${tickers.join(' / ')}`,
              tickers: uniqHead(tickers, 8),
              createdAt: new Date().toISOString(),
            },
            ...state.savedCompareSets,
          ].slice(0, 12),
        })),
      deleteCompareSet: (id) =>
        set((state) => ({
          savedCompareSets: state.savedCompareSets.filter((item) => item.id !== id),
        })),
      saveScreenDraft: (name, draft) =>
        set((state) => ({
          savedScreens: [
            {
              id: crypto.randomUUID(),
              name: name.trim() || draft.name || 'Saved Screen',
              createdAt: new Date().toISOString(),
              draft,
            },
            ...state.savedScreens,
          ].slice(0, 12),
        })),
      deleteScreenDraft: (id) =>
        set((state) => ({
          savedScreens: state.savedScreens.filter((item) => item.id !== id),
        })),
      saveBacktestDraft: (name, draft) =>
        set((state) => ({
          savedBacktests: [
            {
              id: crypto.randomUUID(),
              name: name.trim() || draft.name || 'Saved Backtest',
              createdAt: new Date().toISOString(),
              draft,
            },
            ...state.savedBacktests,
          ].slice(0, 12),
        })),
      deleteBacktestDraft: (id) =>
        set((state) => ({
          savedBacktests: state.savedBacktests.filter((item) => item.id !== id),
        })),
      setAnnotation: (key, ann) =>
        set((state) => ({
          watchlistAnnotations: { ...state.watchlistAnnotations, [key]: ann },
        })),
      clearAnnotation: (key) =>
        set((state) => {
          const next = { ...state.watchlistAnnotations }
          delete next[key]
          return { watchlistAnnotations: next }
        }),
      setLastRoute: (lastRoute) => set({ lastRoute }),
    }),
    {
      name: 'batesstocks-terminal',
      partialize: (state) => ({
        activeTicker: state.activeTicker,
        watchlists: state.watchlists,
        activeWatchlistId: state.activeWatchlistId,
        recentTickers: state.recentTickers,
        compareTickers: state.compareTickers,
        savedCompareSets: state.savedCompareSets,
        recentCommands: state.recentCommands,
        savedScreens: state.savedScreens,
        savedBacktests: state.savedBacktests,
        watchlistAnnotations: state.watchlistAnnotations,
        lastRoute: state.lastRoute,
      }),
      merge: (persisted, current) => {
        const source = isRecord(persisted) ? persisted : {}
        const watchlists = sanitizeWatchlists(source.watchlists)
        const activeWatchlistId = typeof source.activeWatchlistId === 'string' ? source.activeWatchlistId : ''

        const next = {
          ...current,
          activeTicker: typeof source.activeTicker === 'string' && source.activeTicker.trim()
            ? source.activeTicker.toUpperCase()
            : current.activeTicker,
          watchlists,
          activeWatchlistId: watchlists.some((watchlist) => watchlist.id === activeWatchlistId)
            ? activeWatchlistId
            : watchlists[0].id,
          recentTickers: sanitizeStringArray(source.recentTickers, 12, current.recentTickers),
          compareTickers: sanitizeStringArray(source.compareTickers, 8, current.compareTickers),
          savedCompareSets: sanitizeSavedCompareSets(source.savedCompareSets),
          recentCommands: Array.isArray(source.recentCommands)
            ? uniqCommands(
              source.recentCommands.filter((item): item is string => typeof item === 'string'),
              12,
            )
            : current.recentCommands,
          savedScreens: sanitizeSavedDrafts<StrategyDraft>(source.savedScreens),
          savedBacktests: sanitizeSavedDrafts<StrategyDraft>(source.savedBacktests),
          watchlistAnnotations: isRecord(source.watchlistAnnotations) ? source.watchlistAnnotations as Record<string, WatchlistAnnotation> : {},
          lastRoute: typeof source.lastRoute === 'string' && source.lastRoute.startsWith('/')
            ? source.lastRoute
            : current.lastRoute,
        } satisfies TerminalStore

        return next
      },
    },
  ),
)

export function getActiveWatchlist(state: TerminalStore) {
  return state.watchlists.find((watchlist) => watchlist.id === state.activeWatchlistId) ?? state.watchlists[0]
}
