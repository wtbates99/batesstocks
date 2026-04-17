import { useEffect, useState } from 'react'
import { Activity, Bot, ChevronRight, DatabaseZap, Radio, RefreshCw } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import {
  useFreshnessQuery,
  useHealthQuery,
  useLivePricesQuery,
  useSyncStatusQuery,
} from '../../api/query'
import CommandBar from '../command/CommandBar'
import AiPanel from '../AiPanel'
import WorkspaceRail from './WorkspaceRail'
import { formatClock, formatTimestamp } from '../../lib/formatters'
import { useTerminalStore } from '../../state/terminalStore'

const NAV_ITEMS = [
  { label: 'DASH', path: '/' },
  { label: 'MON', path: '/monitor' },
  { label: 'WL', path: '/watchlists' },
  { label: 'COMP', path: '/compare' },
  { label: 'NEWS', path: '/news' },
  { label: 'EQS', path: '/screener' },
  { label: 'PORT', path: '/backtest' },
]

const STRIP_TICKERS = ['SPY', 'QQQ', 'IWM', '^VIX']

function ClockStrip() {
  const [clock, setClock] = useState(() => formatClock())

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatClock()), 1000)
    return () => window.clearInterval(id)
  }, [])

  return <div className="shell-clock">{clock} ET</div>
}

export default function TerminalShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { live, ready } = useHealthQuery()
  const syncStatus = useSyncStatusQuery()
  const freshness = useFreshnessQuery()
  const strip = useLivePricesQuery(STRIP_TICKERS, true, 30_000)
  const {
    aiOpen,
    closeAi,
    openAi,
    syncNotice,
    focusCommandBar,
    recentTickers,
    activeTicker,
    setLastRoute,
  } = useTerminalStore(useShallow((state) => ({
    aiOpen: state.aiOpen,
    closeAi: state.closeAi,
    openAi: state.openAi,
    syncNotice: state.syncNotice,
    focusCommandBar: state.focusCommandBar,
    recentTickers: state.recentTickers,
    activeTicker: state.activeTicker,
    setLastRoute: state.setLastRoute,
  })))

  useEffect(() => {
    setLastRoute(location.pathname)
  }, [location.pathname, setLastRoute])

  useEffect(() => {
    let gPending = false
    let gTimer: ReturnType<typeof setTimeout> | undefined

    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)

      if ((event.key === '/' || (event.key.toLowerCase() === 'l' && (event.metaKey || event.ctrlKey))) && !typing) {
        event.preventDefault()
        focusCommandBar()
        return
      }

      if (event.key === '`' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        if (aiOpen) closeAi()
        else openAi()
        return
      }

      if (!typing && (event.key === 'g' || event.key === 'G') && !event.metaKey && !event.ctrlKey && !event.altKey) {
        gPending = true
        clearTimeout(gTimer)
        gTimer = setTimeout(() => { gPending = false }, 1500)
        return
      }

      if (gPending && !typing) {
        gPending = false
        clearTimeout(gTimer)
        const dest: Record<string, string> = {
          d: '/', m: '/monitor', w: '/watchlists',
          c: '/compare', n: '/news', e: '/screener', b: '/backtest',
          s: `/security/${activeTicker}`,
        }
        const route = dest[event.key.toLowerCase()]
        if (route) {
          event.preventDefault()
          navigate(route)
        }
        return
      }

      if (event.altKey && !typing) {
        if (event.key === '1') { event.preventDefault(); navigate('/') }
        if (event.key === '2') { event.preventDefault(); navigate('/monitor') }
        if (event.key === '3') { event.preventDefault(); navigate('/watchlists') }
        if (event.key === '4') { event.preventDefault(); navigate('/compare') }
        if (event.key === '5') { event.preventDefault(); navigate('/news') }
        if (event.key === '6') { event.preventDefault(); navigate('/screener') }
        if (event.key === '7') { event.preventDefault(); navigate('/backtest') }
      }

      if (!typing && event.key === '[') {
        const previous = recentTickers.find((ticker) => ticker !== recentTickers[0])
        if (previous) {
          event.preventDefault()
          navigate(`/security/${previous}`)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => { window.removeEventListener('keydown', handler); clearTimeout(gTimer) }
  }, [aiOpen, activeTicker, closeAi, focusCommandBar, navigate, openAi, recentTickers])

  return (
    <div className="terminal-shell">
      <header className="shell-header">
        <div className="brand-strip">
          <div className="brand-mark">BATESSTOCKS</div>
          <div className="brand-path">
            <span>TERMINAL</span>
            <ChevronRight size={12} />
            <span>{location.pathname === '/' ? 'LAUNCHPAD' : location.pathname.replace(/^\//, '').toUpperCase()}</span>
            {activeTicker && (
              <>
                <ChevronRight size={12} />
                <span style={{ color: 'var(--amber-soft)' }}>{activeTicker}</span>
              </>
            )}
          </div>
        </div>
        <CommandBar />
        <div className="ticker-strip">
          {STRIP_TICKERS.map((ticker) => (
            <div key={ticker} className="strip-cell">
              <span className="strip-label">{ticker === '^VIX' ? 'VIX' : ticker}</span>
              <span className="strip-value">{strip.data?.prices[ticker]?.toFixed(2) ?? '—'}</span>
            </div>
          ))}
          <button type="button" className="terminal-button terminal-button-ghost" onClick={() => openAi()}>
            <Bot size={12} />
            AI
          </button>
          <ClockStrip />
        </div>
      </header>

      <nav className="function-strip">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => `function-key${isActive ? ' is-active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
        <div className="function-hint">`/` search · `[` prior · `g+d/m/w/c/n/e/b/s` go to · `Alt+1..7` nav</div>
      </nav>

      <main className="shell-main">
        <WorkspaceRail />
        <div className="workspace">
          <Outlet />
        </div>
        <AiPanel open={aiOpen} onClose={closeAi} />
      </main>

      <footer className="status-strip">
        <div className="status-item">
          <Radio size={11} />
          <span className={live.data?.status === 'ok' ? 'tone-positive' : 'tone-negative'}>
            {live.data?.status === 'ok' ? 'LIVE' : 'DOWN'}
          </span>
        </div>
        <div className="status-item">
          <Activity size={11} />
          <span className={ready.data?.status === 'ready' ? 'tone-cyan' : 'tone-warning'}>
            {ready.data?.status === 'ready' ? 'READY' : 'BOOTSTRAP'}
          </span>
        </div>
        <div className="status-item">
          <RefreshCw size={11} />
          <span className={syncStatus.data?.state === 'running' ? 'tone-warning' : syncStatus.data?.state === 'error' ? 'tone-negative' : 'tone-positive'}>
            {syncStatus.data?.state?.toUpperCase() ?? 'UNKNOWN'}
          </span>
          <span>{syncStatus.data?.state === 'error' && syncStatus.data?.last_error
            ? syncStatus.data.last_error.slice(0, 120)
            : syncStatus.data?.detail ?? 'Awaiting telemetry'}
          </span>
        </div>
        <div className="status-item">
          <DatabaseZap size={11} />
          <span>LAST SYNC {formatTimestamp(syncStatus.data?.last_success_at)}</span>
        </div>
        {freshness.data && (
          <div className="status-item">
            <span
              className={
                (freshness.data.stale_count ?? 0) > 0 ? 'tone-warning' : 'tone-positive'
              }
            >
              {freshness.data.latest_date ?? '—'}
            </span>
            {(freshness.data.stale_count ?? 0) > 0 && (
              <span className="tone-warning">
                {freshness.data.stale_count} STALE
              </span>
            )}
            <span style={{ color: 'var(--text-dim)' }}>
              {freshness.data.ticker_count} SYMBOLS
            </span>
          </div>
        )}
        <div className={`status-item status-notice ${syncNotice ? `tone-${syncNotice.tone}` : ''}`}>
          <span>{syncNotice?.message ?? 'WATCHLIST, RECENTS, AND SAVED WORKSPACES ARE PERSISTED LOCALLY'}</span>
        </div>
      </footer>
    </div>
  )
}
