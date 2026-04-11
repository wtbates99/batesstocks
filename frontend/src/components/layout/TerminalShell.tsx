import { useState, useEffect } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { Bot, Activity, ChevronRight } from 'lucide-react'
import SearchBar from '../SearchBar'
import AiPanel from '../AiPanel'
import { usePoll } from '../../hooks/useApi'
import { api } from '../../api/client'

const NAV = [
  { key: 'F1', label: 'DASH',   path: '/' },
  { key: 'F2', label: 'SCRN',   path: '/screener' },
  { key: 'F3', label: 'BKTS',   path: '/backtest' },
  { key: 'F4', label: 'HEAT',   path: '/heatmap' },
  { key: 'F5', label: 'MRKT',   path: '/market' },
  { key: 'F6', label: 'WTCH',   path: '/watchlist' },
  { key: 'F7', label: 'CALS',   path: '/calendar' },
  { key: 'F8', label: 'PTFL',   path: '/portfolio' },
  { key: 'F9', label: 'ALRT',   path: '/alerts' },
]

const INDEX_TICKERS = ['SPY', 'QQQ', 'IWM', '^VIX']

interface Props {
  children: React.ReactNode
}

function Clock() {
  const [time, setTime] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const et = time.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false })
  const dateStr = time.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return (
    <div className="topbar-clock">
      <span>{dateStr}</span>
      <span style={{ color: 'var(--orange)', marginLeft: 6 }}>{et} ET</span>
    </div>
  )
}

function IndexBar() {
  const { data } = usePoll(
    () => api.market.livePrices(INDEX_TICKERS),
    30000,
  )

  const LABELS: Record<string, string> = { SPY: 'SPY', QQQ: 'QQQ', IWM: 'IWM', '^VIX': 'VIX' }

  if (!data) return null

  return (
    <div className="topbar-indices">
      {INDEX_TICKERS.map(t => {
        const price = data.prices[t]
        return (
          <div key={t} className="idx-item">
            <span className="idx-label">{LABELS[t]}</span>
            <span className="idx-value num">
              {price != null ? price.toFixed(2) : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function TerminalShell({ children }: Props) {
  const location = useLocation()
  const navigate = useNavigate()
  const [aiOpen, setAiOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setCmdOpen(o => !o)
        return
      }
      if (e.key === '`' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setAiOpen(o => !o)
        return
      }
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+1-9 → NAV[0-8]; Ctrl+0 → AI panel
        if (e.key === '0') {
          e.preventDefault()
          setAiOpen(o => !o)
          return
        }
        const idx = parseInt(e.key, 10) - 1
        if (idx >= 0 && idx < NAV.length) {
          e.preventDefault()
          navigate(NAV[idx].path)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  return (
    <div className="terminal-shell">
      {/* Top bar */}
      <div className="topbar">
        <div className="topbar-brand">BATESSTOCKS</div>
        <div className="topbar-search">
          <SearchBar />
        </div>
        <IndexBar />
        <button
          className="term-btn"
          onClick={() => setAiOpen(o => !o)}
          style={{ marginLeft: 'auto' }}
          data-tooltip="AI Assistant (Ctrl+`)"
        >
          <Bot size={12} />
          <span>AI</span>
        </button>
        <Clock />
      </div>

      {/* Function key bar */}
      <div className="fnbar">
        {NAV.map((n) => (
          <Link
            key={n.path}
            to={n.path}
            className={`fn-key${location.pathname === n.path ? ' active' : ''}`}
          >
            <span className="fn-num">{n.key}</span>
            <span className="fn-label">{n.label}</span>
          </Link>
        ))}
        <div className="fn-spacer" />
        <div
          className="fn-key"
          onClick={() => setAiOpen(o => !o)}
          style={{ cursor: 'pointer' }}
        >
          <span className="fn-num" style={{ color: 'var(--blue)' }}>F0</span>
          <span className="fn-label">AI</span>
        </div>
      </div>

      {/* Content */}
      <div className="terminal-content">
        <div className="page-area">
          {children}
        </div>
        <AiPanel open={aiOpen} onClose={() => setAiOpen(false)} />
      </div>

      {/* Status bar */}
      <div className="statusbar">
        <div className="statusbar-item">
          <div className="status-dot live" />
          <span>LIVE</span>
        </div>
        <div className="statusbar-item">
          <Activity size={9} />
          <span>S&amp;P 500</span>
        </div>
        <div className="statusbar-item" style={{ marginLeft: 'auto' }}>
          <span>Ctrl+K — command palette</span>
          <ChevronRight size={9} />
          <span>Ctrl+` — AI</span>
        </div>
      </div>

      {/* Command palette */}
      {cmdOpen && (
        <CommandPalette onClose={() => setCmdOpen(false)} />
      )}
    </div>
  )
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const [active, setActive] = useState(0)

  const items = [
    ...NAV.map((n, i) => ({ label: n.label, action: () => navigate(n.path), shortcut: `Ctrl+${i + 1}` })),
    { label: 'AI Assistant', action: () => { /* handled via parent */ onClose() }, shortcut: 'Ctrl+0' },
    { label: 'Pipeline → Trigger refresh', action: () => { api.pipeline.trigger(); onClose() }, shortcut: '' },
  ].filter(item => !q || item.label.toLowerCase().includes(q.toLowerCase()))

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown') setActive(a => Math.min(a + 1, items.length - 1))
      if (e.key === 'ArrowUp') setActive(a => Math.max(a - 1, 0))
      if (e.key === 'Enter') { items[active]?.action(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [items, active, onClose])

  return (
    <div className="cmd-backdrop" onClick={onClose}>
      <div className="cmd-box" onClick={e => e.stopPropagation()}>
        <input
          className="cmd-input"
          placeholder="Type a command or navigate…"
          value={q}
          onChange={e => { setQ(e.target.value); setActive(0) }}
          autoFocus
        />
        <div className="cmd-results">
          <div className="cmd-section">
            <div className="cmd-section-label">Navigation</div>
            {items.map((item, i) => (
              <div
                key={item.label}
                className={`cmd-item${i === active ? ' active' : ''}`}
                onClick={() => { item.action(); onClose() }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="cmd-item-label">{item.label}</span>
                {item.shortcut && <span className="cmd-item-shortcut">{item.shortcut}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

