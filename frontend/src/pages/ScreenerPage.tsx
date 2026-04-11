import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpDown, Filter, Search, Zap } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { api } from '../api/client'
import type { ScreenerRow } from '../api/types'

type SortKey = keyof ScreenerRow
type SortDir = 'asc' | 'desc'

function ScoreBar({ score }: { score: number | null | undefined }) {
  if (score == null) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  const pct = Math.min(100, Math.max(0, score))
  const color = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--yellow)' : 'var(--red)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div className="score-bar">
        <div className="score-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color, minWidth: 28, textAlign: 'right' }}>
        {pct.toFixed(0)}
      </span>
    </div>
  )
}

function Spark({ data }: { data: number[] }) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 64, h = 22
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x},${y}`
  }).join(' ')
  const isUp = data[data.length - 1] >= data[0]
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline
        points={pts}
        fill="none"
        stroke={isUp ? 'var(--green)' : 'var(--red)'}
        strokeWidth={1.2}
      />
    </svg>
  )
}

function fmt(n: number | null | undefined, dec = 2): string {
  if (n == null) return '—'
  return n.toFixed(dec)
}

function fmtLarge(n: number | null | undefined): string {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e12) return `${(n / 1e12).toFixed(1)}T`
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  return n.toFixed(0)
}

const COLUMNS: { key: SortKey; label: string; align?: 'right'; render?: (row: ScreenerRow) => React.ReactNode }[] = [
  { key: 'ticker',       label: 'Ticker' },
  { key: 'name',         label: 'Company' },
  { key: 'sector',       label: 'Sector' },
  { key: 'market_cap',   label: 'Mkt Cap',   align: 'right', render: r => fmtLarge(r.market_cap) },
  { key: 'latest_close', label: 'Price',     align: 'right', render: r => fmt(r.latest_close) },
  { key: 'return_52w',   label: '52W Ret',   align: 'right', render: r => r.return_52w != null ? <span className={r.return_52w >= 0 ? 'up' : 'down'}>{r.return_52w >= 0 ? '+' : ''}{r.return_52w.toFixed(2)}%</span> : <span>—</span> },
  { key: 'rsi',          label: 'RSI',       align: 'right', render: r => r.rsi != null ? <span style={{ color: r.rsi > 70 ? 'var(--red)' : r.rsi < 30 ? 'var(--green)' : 'var(--text-primary)' }}>{r.rsi.toFixed(1)}</span> : <span>—</span> },
  { key: 'pe',           label: 'P/E',       align: 'right', render: r => fmt(r.pe, 1) },
  { key: 'beta',         label: 'Beta',      align: 'right', render: r => fmt(r.beta) },
  { key: 'tech_score',   label: 'Score',     render: r => <ScoreBar score={r.tech_score} /> },
  { key: 'spark',        label: '30D',       render: r => <Spark data={r.spark} /> },
]

export default function ScreenerPage() {
  const navigate = useNavigate()
  const { data: rows, loading } = useApi(() => api.screener(), [])
  const [sort, setSort] = useState<SortKey>('market_cap')
  const [dir, setDir] = useState<SortDir>('desc')
  const [q, setQ] = useState('')
  const [sector, setSector] = useState('')
  const [minScore, setMinScore] = useState('')
  const [screenResult, setScreenResult] = useState<string[] | null>(null)

  const sectors = useMemo(
    () => [...new Set((rows ?? []).map(r => r.sector).filter(Boolean) as string[])].sort(),
    [rows],
  )

  const filtered = useMemo(() => {
    let data = rows ?? []
    if (q) {
      const lq = q.toLowerCase()
      data = data.filter(r => r.ticker.toLowerCase().includes(lq) || (r.name ?? '').toLowerCase().includes(lq))
    }
    if (sector) data = data.filter(r => r.sector === sector)
    if (minScore) data = data.filter(r => (r.tech_score ?? 0) >= parseFloat(minScore))
    if (screenResult) data = data.filter(r => screenResult.includes(r.ticker))

    return [...data].sort((a, b) => {
      const av = a[sort] as number | string | null
      const bv = b[sort] as number | string | null
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') {
        return dir === 'asc' ? av - bv : bv - av
      }
      return dir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })
  }, [rows, sort, dir, q, sector, minScore, screenResult])

  const handleSort = (key: SortKey) => {
    if (key === sort) setDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
  }

  const clearFilters = () => {
    setQ(''); setSector(''); setMinScore(''); setScreenResult(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <Filter size={12} style={{ color: 'var(--text-muted)' }} />

        <div className="search-wrap" style={{ width: 180 }}>
          <Search size={11} className="search-icon" />
          <input
            className="search-input"
            placeholder="Filter by ticker/name…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>

        <select className="term-select" value={sector} onChange={e => setSector(e.target.value)}>
          <option value="">All Sectors</option>
          {sectors.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Min Score</span>
          <input
            className="term-input"
            style={{ width: 54 }}
            placeholder="0"
            value={minScore}
            onChange={e => setMinScore(e.target.value)}
            type="number"
            min={0} max={100}
          />
        </div>

        {(q || sector || minScore || screenResult) && (
          <button className="term-btn danger" onClick={clearFilters}>Clear</button>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {screenResult && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--orange)' }}>
              <Zap size={10} style={{ display: 'inline', marginRight: 3 }} />
              Strategy: {screenResult.length} matches
            </span>
          )}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {filtered.length} of {rows?.length ?? 0}
          </span>
          <button
            className="term-btn"
            onClick={() => navigate('/backtest')}
            style={{ color: 'var(--orange)' }}
          >
            <Zap size={11} /> Run Strategy
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="panel" style={{ flex: 1, minHeight: 0 }}>
        <div className="panel-body no-pad" style={{ overflow: 'auto', height: '100%' }}>
          {loading ? (
            <div style={{ padding: 16 }}>
              <div className="loading-bar" style={{ width: '100%' }} />
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  {COLUMNS.map(col => (
                    <th
                      key={col.key}
                      style={{ textAlign: col.align ?? 'left' }}
                      onClick={() => handleSort(col.key)}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        {col.label}
                        {sort === col.key && (
                          <ArrowUpDown size={9} style={{ color: 'var(--orange)' }} />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr
                    key={row.ticker}
                    onClick={() => navigate(`/spotlight/${row.ticker}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    {COLUMNS.map(col => (
                      <td key={col.key} style={{ textAlign: col.align ?? 'left' }}>
                        {col.render ? col.render(row) : (
                          col.key === 'ticker'
                            ? <span className="col-ticker">{row.ticker}</span>
                            : col.key === 'name'
                              ? <span className="col-name" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{row.name ?? '—'}</span>
                              : col.key === 'sector'
                                ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{row.sector ?? '—'}</span>
                                : String(row[col.key] ?? '—')
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
