import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { StrategyDraft, SavedWorkspaceDraft } from '../lib/strategy'

interface SyncNotice {
  message: string
  tone: 'neutral' | 'positive' | 'negative'
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

interface TerminalStore {
  activeTicker: string
  commandValue: string
  commandFocusNonce: number
  aiOpen: boolean
  aiDraft?: string
  aiContext: Record<string, unknown>
  syncNotice?: SyncNotice
  watchlist: string[]
  recentTickers: string[]
  compareTickers: string[]
  recentCommands: string[]
  savedScreens: SavedWorkspaceDraft<StrategyDraft>[]
  savedBacktests: SavedWorkspaceDraft<StrategyDraft>[]
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
  toggleWatchlist: (ticker: string) => void
  setCompareTickers: (tickers: string[]) => void
  toggleCompareTicker: (ticker: string) => void
  removeCompareTicker: (ticker: string) => void
  saveScreenDraft: (name: string, draft: StrategyDraft) => void
  deleteScreenDraft: (id: string) => void
  saveBacktestDraft: (name: string, draft: StrategyDraft) => void
  deleteBacktestDraft: (id: string) => void
  setLastRoute: (route: string) => void
}

export const useTerminalStore = create<TerminalStore>()(
  persist(
    (set) => ({
      activeTicker: 'SPY',
      commandValue: '',
      commandFocusNonce: 0,
      aiOpen: false,
      aiDraft: undefined,
      aiContext: {},
      syncNotice: undefined,
      watchlist: ['SPY', 'QQQ', 'AAPL', 'MSFT'],
      recentTickers: ['SPY'],
      compareTickers: ['SPY'],
      recentCommands: [],
      savedScreens: [],
      savedBacktests: [],
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
      toggleWatchlist: (ticker) =>
        set((state) => {
          const symbol = ticker.toUpperCase()
          return {
            watchlist: state.watchlist.includes(symbol)
              ? state.watchlist.filter((item) => item !== symbol)
              : uniqHead([symbol, ...state.watchlist], 24),
          }
        }),
      setCompareTickers: (tickers) => set({ compareTickers: uniqHead(tickers, 6) }),
      toggleCompareTicker: (ticker) =>
        set((state) => {
          const symbol = ticker.toUpperCase()
          return {
            compareTickers: state.compareTickers.includes(symbol)
              ? state.compareTickers.filter((item) => item !== symbol)
              : uniqHead([symbol, ...state.compareTickers], 6),
          }
        }),
      removeCompareTicker: (ticker) =>
        set((state) => ({
          compareTickers: state.compareTickers.filter((item) => item !== ticker.toUpperCase()),
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
      setLastRoute: (lastRoute) => set({ lastRoute }),
    }),
    {
      name: 'batesstocks-terminal',
      partialize: (state) => ({
        activeTicker: state.activeTicker,
        watchlist: state.watchlist,
        recentTickers: state.recentTickers,
        compareTickers: state.compareTickers,
        recentCommands: state.recentCommands,
        savedScreens: state.savedScreens,
        savedBacktests: state.savedBacktests,
        lastRoute: state.lastRoute,
      }),
    },
  ),
)
