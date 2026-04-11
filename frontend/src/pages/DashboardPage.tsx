import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'
import { useApi, usePoll } from '../hooks/useApi'
import { api } from '../api/client'
import type { MarketPulseItem, WatchlistOut } from '../api/types'

function fmt(n: number | null | undefined, dec = 2) {
  if (n == null) return '—'
  return n.toFixed(dec)
}

function fmtPct(n: number | null | undefined) {
  if (n == null) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function fmtLarge(n: number | null | undefined) {
  if (n == null) return '—'
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (Math.abs(n) >= 1e9)  return `${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6)  return `${(n / 1e6).toFixed(2)}M`
  return n.toLocaleString()
}

function PulseItem({ item }: { item: MarketPulseItem }) {
  const colorMap: Record<string, string> = {
    green: 'var(--green)',
    red: 'var(--red)',
    yellow: 'var(--yellow)',
    blue: 'var(--blue)',
    orange: 'var(--orange)',
  }
  const color = (colorMap as Record<string, string | undefined>)[item.color] ?? 'var(--text-secondary)'

  return (
    <div style={{
      padding: '4px 8px',
      borderBottom: '1px solid var(--border-muted)',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-muted)',
        minWidth: 30,
        textTransform: 'uppercase',
      }}>
        {item.type.slice(0, 4)}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
        color: 'var(--blue)',
        minWidth: 36,
      }}>
        {item.ticker}
      </span>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', flex: 1, lineHeight: 1.4 }}>
        {item.headline}
      </span>
      {item.value && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color, whiteSpace: 'nowrap' }}>
          {item.value}
        </span>
      )}
    </div>
  )
}

function WatchlistPanel() {
  const navigate = useNavigate()
  const { data: watchlists } = useApi(() => api.watchlists.list(), [])
  const [selected, setSelected] = useState(0)

  const wl: WatchlistOut | null = watchlists?.[selected] ?? null

  const tickers = wl?.tickers ?? []
  const { data: prices, loading: pricesLoading } = usePoll(
    () => tickers.length > 0 ? api.market.livePrices(tickers) : Promise.resolve({ prices: {} as Record<string, number | null>, timestamp: '' }),
    15000,
    [tickers.join(',')],
  )

  return (
    <div className="panel" style={{ flex: 1 }}>
      <div className="panel-header">
        <span className="panel-title">Watchlist</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {watchlists?.map((w, i) => (
            <button
              key={w.id}
              className={`term-btn${i === selected ? ' primary' : ''}`}
              style={{ padding: '1px 6px', fontSize: 'var(--text-xs)' }}
              onClick={() => setSelected(i)}
            >
              {w.name}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-body no-pad" style={{ overflow: 'auto' }}>
        {tickers.length === 0 ? (
          <div className="empty-state">No tickers in watchlist</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th style={{ textAlign: 'right' }}>Price</th>
              </tr>
            </thead>
            <tbody>
              {tickers.map(t => {
                const price = prices?.prices[t]
                return (
                  <tr key={t}>
                    <td className="col-ticker" onClick={() => navigate(`/spotlight/${t}`)}>{t}</td>
                    <td style={{ textAlign: 'right' }}>
                      {pricesLoading
                        ? <span style={{ color: 'var(--text-muted)' }}>…</span>
                        : <span className="num">{price != null ? price.toFixed(2) : '—'}</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function BreadthPanel() {
  const { data } = useApi(() => api.market.breadth(), [])
  if (!data) return <div className="panel"><div className="panel-body"><div className="spinner" /></div></div>

  const items = [
    { label: 'Advancing', value: data.advancing, color: 'var(--green)' },
    { label: 'Declining', value: data.declining, color: 'var(--red)' },
    { label: 'Unchanged', value: data.unchanged, color: 'var(--text-muted)' },
    { label: 'New 52W Hi', value: data.new_highs_52w, color: 'var(--green)' },
    { label: 'New 52W Lo', value: data.new_lows_52w, color: 'var(--red)' },
    { label: '> SMA50',   value: data.above_sma50, color: 'var(--blue)' },
    { label: 'Avg RSI',   value: data.avg_rsi?.toFixed(1) ?? '—', color: 'var(--text-primary)' },
    { label: 'Avg Score', value: data.avg_tech_score?.toFixed(1) ?? '—', color: 'var(--orange)' },
  ]

  const advRatio = data.total > 0 ? data.advancing / data.total : 0

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Market Breadth — S&amp;P 500</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {data.date?.slice(0, 10)}
        </span>
      </div>
      <div className="panel-body">
        <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, marginBottom: 8, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${advRatio * 100}%`, background: 'var(--green)', transition: 'width 0.5s' }} />
        </div>
        <div className="metric-grid">
          {items.map(item => (
            <div key={item.label} className="metric-card">
              <div className="metric-label">{item.label}</div>
              <div className="metric-value" style={{ color: item.color }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SectorPanel() {
  const { data } = useApi(() => api.market.sectorRotation(), [])
  if (!data) return null

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Sector Performance</span>
      </div>
      <div className="panel-body no-pad" style={{ overflow: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Sector</th>
              <th style={{ textAlign: 'right' }}>Ret%</th>
              <th style={{ textAlign: 'right' }}>RSI</th>
              <th style={{ textAlign: 'right' }}>Score</th>
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.sector}>
                <td style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-sans)' }}>{row.sector}</td>
                <td style={{ textAlign: 'right' }}>
                  <span className={row.return_pct != null ? (row.return_pct >= 0 ? 'up' : 'down') : ''}>
                    {fmtPct(row.return_pct)}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>{fmt(row.avg_rsi, 1)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(row.avg_tech_score, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { data: pulse, loading: pulseLoading, refetch } = useApi(() => api.market.pulse(), [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          DASHBOARD — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </span>
        <button className="term-btn" onClick={refetch}>
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 280px', gap: 8, flex: 1, minHeight: 0 }}>
        {/* Left: watchlist + breadth */}
        <div className="col" style={{ minHeight: 0 }}>
          <WatchlistPanel />
        </div>

        {/* Center: market pulse */}
        <div className="panel" style={{ minHeight: 0 }}>
          <div className="panel-header">
            <span className="panel-title">Market Pulse</span>
            {pulseLoading && <div className="spinner" style={{ width: 12, height: 12 }} />}
          </div>
          <div className="panel-body no-pad" style={{ overflow: 'auto' }}>
            {pulse?.items.map((item, i) => (
              <PulseItem key={i} item={item} />
            ))}
          </div>
        </div>

        {/* Right: breadth + sectors */}
        <div className="col" style={{ minHeight: 0, overflow: 'auto' }}>
          <BreadthPanel />
          <SectorPanel />
        </div>
      </div>
    </div>
  )
}
