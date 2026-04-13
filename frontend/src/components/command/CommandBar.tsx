import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, History, Terminal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { useSearchQuery, useSyncMutation } from '../../api/query'
import { executeTerminalCommand, parseTerminalCommand } from '../../lib/commands'
import { cn } from '../../lib/formatters'
import { getActiveWatchlist, useTerminalStore } from '../../state/terminalStore'

const COMMAND_HINTS = [
  'SPY DES',
  'MON',
  'WL',
  'COMP',
  'NEWS',
  'EQS',
  'PORT',
  'SYNC NVDA',
  'WL ADD AAPL',
  'COMP MSFT SPY QQQ',
  'LAST',
]

function useDebouncedValue(value: string, delay = 180) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(id)
  }, [value, delay])

  return debounced
}

export default function CommandBar() {
  const navigate = useNavigate()
  const syncMutation = useSyncMutation()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const {
    commandValue,
    commandFocusNonce,
    setCommandValue,
    openAi,
    setActiveTicker,
    setSyncNotice,
    compareTickers,
    recentTickers,
    recentCommands,
    toggleWatchlist,
    setCompareTickers,
    addRecentCommand,
  } = useTerminalStore(useShallow((state) => ({
    commandValue: state.commandValue,
    commandFocusNonce: state.commandFocusNonce,
    setCommandValue: state.setCommandValue,
    openAi: state.openAi,
    setActiveTicker: state.setActiveTicker,
    setSyncNotice: state.setSyncNotice,
    compareTickers: state.compareTickers,
    recentTickers: state.recentTickers,
    recentCommands: state.recentCommands,
    toggleWatchlist: state.toggleWatchlist,
    setCompareTickers: state.setCompareTickers,
    addRecentCommand: state.addRecentCommand,
  })))
  const debounced = useDebouncedValue(commandValue)
  const parsed = useMemo(() => parseTerminalCommand(commandValue), [commandValue])
  const firstToken = debounced.trim().split(/\s+/)[0]?.toUpperCase() ?? ''
  const searchEnabled = firstToken.length > 0 && parsed.kind === 'invalid'
  const searchQuery = useSearchQuery(firstToken, searchEnabled)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (commandFocusNonce > 0) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [commandFocusNonce])

  useEffect(() => {
    setActiveIndex(0)
  }, [debounced])

  const searchResults = searchQuery.data ?? []
  const commandResults = commandValue.trim()
    ? searchResults.map((result) => ({
      key: result.ticker,
      primary: result.ticker,
      secondary: result.name,
      action: `${result.ticker} DES`,
      icon: <ChevronRight size={12} />,
    }))
    : recentCommands.map((command) => ({
      key: command,
      primary: command,
      secondary: 'Recent command',
      action: command,
      icon: <History size={12} />,
    }))

  async function submit(value: string) {
    const command = parseTerminalCommand(value)
    if (command.kind === 'security') {
      setActiveTicker(command.ticker)
    }
    const ok = await executeTerminalCommand({
      command,
      navigate,
      syncMutation,
      openAi,
      onNotice: (message, tone = 'neutral') => setSyncNotice({ message, tone }),
      getPreviousTicker: () => recentTickers.find((ticker) => ticker !== recentTickers[0]),
      onWatchlist: (action, ticker) => {
        if (action === 'show') {
          const active = getActiveWatchlist(useTerminalStore.getState())
          setSyncNotice({ message: `${active?.name?.toUpperCase() ?? 'WATCHLIST'} ${active?.symbols.join(' ') || 'EMPTY'}`, tone: 'neutral' })
          return
        }
        if (!ticker) return
        toggleWatchlist(ticker)
        setSyncNotice({
          message: `${action === 'add' ? 'WATCH +' : 'WATCH -'} ${ticker}`,
          tone: action === 'add' ? 'positive' : 'neutral',
        })
      },
      onCompare: (tickers) => {
        setCompareTickers([...tickers, ...compareTickers])
      },
    })
    if (ok) {
      addRecentCommand(value)
      setCommandValue('')
    }
  }

  const helperText = parsed.kind === 'invalid'
    ? commandValue
      ? parsed.reason
      : 'TYPE A FUNCTION OR SYMBOL'
    : parsed.kind === 'compare'
      ? `COMPARE SET ${parsed.tickers.join(' / ')}`
      : parsed.kind === 'watchlist'
        ? parsed.action === 'show'
          ? 'SHOW PERSISTED WATCHLIST'
          : `${parsed.action.toUpperCase()} ${parsed.ticker}`
        : parsed.kind === 'history'
          ? 'JUMP TO PREVIOUS SYMBOL'
          : parsed.kind === 'help'
            ? 'SHOW TERMINAL HELP'
            : parsed.kind === 'route'
              ? `OPEN ${parsed.route === '/' ? 'DASH' : parsed.route.slice(1).toUpperCase()}`
              : parsed.kind === 'security'
                ? `${parsed.ticker} ${parsed.functionCode}`
                : parsed.kind === 'sync'
                  ? `SYNC ${parsed.tickers.join(', ') || 'UNIVERSE'}`
                  : 'OPEN AI'

  return (
    <div className="commandbar">
      <div className="commandbar-prefix">
        <Terminal size={13} />
        <span>CMD</span>
      </div>

      <div className="commandbar-input-wrap">
        <input
          ref={inputRef}
          className="commandbar-input"
          value={commandValue}
          onChange={(event) => setCommandValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (commandResults[activeIndex]) {
                void submit(commandResults[activeIndex].action)
                return
              }
              void submit(commandValue)
            }
            if (event.key === 'ArrowDown' && commandResults.length > 0) {
              event.preventDefault()
              setActiveIndex((current) => Math.min(current + 1, commandResults.length - 1))
            }
            if (event.key === 'ArrowUp' && commandResults.length > 0) {
              event.preventDefault()
              setActiveIndex((current) => Math.max(current - 1, 0))
            }
            if (event.key === 'Escape') {
              setCommandValue('')
            }
          }}
          spellCheck={false}
          placeholder="SPY DES | EQS | PORT | SYNC AAPL | WL ADD NVDA | COMP MSFT SPY"
        />

        <div className={cn('commandbar-status', parsed.kind === 'invalid' && commandValue ? 'tone-warning' : 'tone-cyan')}>
          {helperText}
        </div>

        <div className="commandbar-hints">
          {COMMAND_HINTS.map((hint) => (
            <button key={hint} type="button" className="hint-chip" onClick={() => void submit(hint)}>
              {hint}
            </button>
          ))}
        </div>

        {commandResults.length > 0 && (
          <div className="command-results">
            {commandResults.map((result, index) => (
              <button
                key={result.key}
                type="button"
                className={cn('command-result', index === activeIndex && 'is-active')}
                onMouseDown={() => void submit(result.action)}
              >
                <span className="ticker">{result.primary}</span>
                <span className="company">{result.secondary}</span>
                {result.icon}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
