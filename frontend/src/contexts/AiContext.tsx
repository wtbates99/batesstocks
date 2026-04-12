import { createContext, useContext, useState, useCallback, useRef } from 'react'

export interface AiContextValue {
  /** Current page-level context injected into the AI system prompt */
  context: Record<string, unknown>
  /** Set (replace) the current AI context — called by pages */
  setContext: (ctx: Record<string, unknown>) => void
  /** Merge additional keys into the current AI context */
  mergeContext: (partial: Record<string, unknown>) => void
  /** Open the AI panel, optionally with a pre-seeded message */
  openAi: (prefill?: string) => void
  /** Register a handler from TerminalShell for opening + prefilling AI */
  registerOpenHandler: (handler: ((prefill?: string) => void) | null) => void
}

const Ctx = createContext<AiContextValue>({
  context: {},
  setContext: () => {},
  mergeContext: () => {},
  openAi: () => {},
  registerOpenHandler: () => {},
})

export function AiContextProvider({ children }: { children: React.ReactNode }) {
  const [context, setContextState] = useState<Record<string, unknown>>({})
  const handlerRef = useRef<((prefill?: string) => void) | null>(null)

  const setContext = useCallback((ctx: Record<string, unknown>) => {
    setContextState(ctx)
  }, [])

  const mergeContext = useCallback((partial: Record<string, unknown>) => {
    setContextState(prev => ({ ...prev, ...partial }))
  }, [])

  const openAi = useCallback((prefill?: string) => {
    handlerRef.current?.(prefill)
  }, [])

  const registerOpenHandler = useCallback((handler: ((prefill?: string) => void) | null) => {
    handlerRef.current = handler
  }, [])

  return (
    <Ctx.Provider value={{ context, setContext, mergeContext, openAi, registerOpenHandler }}>
      {children}
    </Ctx.Provider>
  )
}

/** Hook for pages to inject their context and trigger AI open */
export function useAiContext() {
  return useContext(Ctx)
}
