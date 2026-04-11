import { useState, useCallback } from 'react'
import { Plus, Trash2, RefreshCw, TrendingUp, TrendingDown, ChevronDown } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { api } from '../api/client'
import type { PortfolioOut, PositionCreate } from '../api/types'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

function fmt(n: number | null | undefined, dec = 2) {
  if (n == null) return '—'
  return n.toFixed(dec)
}

function fmtLarge(n: number | null | undefined) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (abs >= 1e9)  return `${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6)  return `${(n / 1e6).toFixed(2)}M`
  return n.toLocaleString()
}

function pnlColor(n: number | null | undefined) {
  if (n == null) return 'var(--text-muted)'
  return n >= 0 ? 'var(--green)' : 'var(--red)'
}

function fmtPnl(n: number | null | undefined) {
  if (n == null) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}`
}

function fmtPct(n: number | null | undefined) {
  if (n == null) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

interface AddPositionFormProps {
  portfolioId: number
  onAdded: () => void
}

function AddPositionForm({ portfolioId, onAdded }: AddPositionFormProps) {
  const [open, setOpen] = useState(false)
  const [ticker, setTicker] = useState('')
  const [shares, setShares] = useState('')
  const [costBasis, setCostBasis] = useState('')
  const [purchasedAt, setPurchasedAt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!ticker.trim() || !shares || !costBasis) { setError('Ticker, shares, and cost basis required'); return }
    setLoading(true)
    setError('')
    try {
      const body: PositionCreate = {
        ticker: ticker.trim().toUpperCase(),
        shares: parseFloat(shares),
        cost_basis: parseFloat(costBasis),
        purchased_at: purchasedAt || null,
      }
      await api.portfolios.addPosition(portfolioId, body)
      setTicker(''); setShares(''); setCostBasis(''); setPurchasedAt('')
      setOpen(false)
      onAdded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add position')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button className="term-btn primary" onClick={() => setOpen(true)} style={{ gap: 4 }}>
        <Plus size={11} /> Add Position
      </button>
    )
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 4,
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--orange)', marginBottom: 4 }}>
        ADD POSITION
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 2 }}>TICKER</div>
          <input
            className="term-input"
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase())}
            placeholder="AAPL"
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 2 }}>SHARES</div>
          <input
            className="term-input"
            type="number"
            value={shares}
            onChange={e => setShares(e.target.value)}
            placeholder="100"
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 2 }}>COST BASIS / SH</div>
          <input
            className="term-input"
            type="number"
            value={costBasis}
            onChange={e => setCostBasis(e.target.value)}
            placeholder="150.00"
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 2 }}>PURCHASE DATE</div>
          <input
            className="term-input"
            type="date"
            value={purchasedAt}
            onChange={e => setPurchasedAt(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: 'var(--text-xs)' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="term-btn primary" onClick={submit} disabled={loading}>
          {loading ? '…' : 'Add'}
        </button>
        <button className="term-btn" onClick={() => { setOpen(false); setError('') }}>Cancel</button>
      </div>
    </div>
  )
}

interface PortfolioPanelProps {
  portfolio: PortfolioOut
  onRefresh: () => void
}

function PortfolioPanel({ portfolio, onRefresh }: PortfolioPanelProps) {
  const [chartDays, setChartDays] = useState(90)
  const { data: chartData, loading: chartLoading } = useApi(
    () => api.portfolios.chart(portfolio.id, chartDays),
    [portfolio.id, chartDays],
  )

  const deletePosition = async (posId: number) => {
    await api.portfolios.deletePosition(portfolio.id, posId)
    onRefresh()
  }

  const pnl = portfolio.total_pnl
  const pnlPct = portfolio.total_cost > 0 ? (pnl / portfolio.total_cost) * 100 : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', minHeight: 0 }}>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[
          { label: 'MARKET VALUE', value: `$${fmtLarge(portfolio.total_value)}`, color: 'var(--text-primary)' },
          { label: 'TOTAL COST',   value: `$${fmtLarge(portfolio.total_cost)}`,  color: 'var(--text-muted)' },
          { label: 'UNREALIZED P&L', value: `$${fmtPnl(pnl)}`, color: pnlColor(pnl) },
          { label: 'RETURN %', value: fmtPct(pnlPct), color: pnlColor(pnlPct) },
        ].map(c => (
          <div key={c.label} className="metric-card">
            <div className="metric-label">{c.label}</div>
            <div className="metric-value num" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Positions + chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 8, flex: 1, minHeight: 0 }}>
        {/* Positions table */}
        <div className="panel" style={{ minHeight: 0 }}>
          <div className="panel-header">
            <span className="panel-title">POSITIONS ({portfolio.positions.length})</span>
            <AddPositionForm portfolioId={portfolio.id} onAdded={onRefresh} />
          </div>
          <div className="panel-body no-pad" style={{ overflow: 'auto' }}>
            {portfolio.positions.length === 0 ? (
              <div className="empty-state">No positions — add one above</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th style={{ textAlign: 'right' }}>Shares</th>
                    <th style={{ textAlign: 'right' }}>Cost/Sh</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                    <th style={{ textAlign: 'right' }}>Value</th>
                    <th style={{ textAlign: 'right' }}>P&L</th>
                    <th style={{ textAlign: 'right' }}>P&L %</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {portfolio.positions.map(pos => (
                    <tr key={pos.id}>
                      <td className="col-ticker">{pos.ticker}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(pos.shares, 4)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(pos.cost_basis)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(pos.current_price)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {pos.current_price != null
                          ? `$${fmtLarge(pos.shares * pos.current_price)}`
                          : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: pnlColor(pos.unrealized_pnl) }}>
                        {fmtPnl(pos.unrealized_pnl)}
                      </td>
                      <td style={{ textAlign: 'right', color: pnlColor(pos.unrealized_pnl_pct) }}>
                        {fmtPct(pos.unrealized_pnl_pct)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="term-btn"
                          style={{ padding: '2px 4px', color: 'var(--red)' }}
                          onClick={() => deletePosition(pos.id)}
                        >
                          <Trash2 size={10} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Chart */}
        <div className="panel" style={{ minHeight: 0 }}>
          <div className="panel-header">
            <span className="panel-title">EQUITY CURVE</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[30, 90, 180, 365].map(d => (
                <button
                  key={d}
                  className={`term-btn${chartDays === d ? ' primary' : ''}`}
                  style={{ padding: '1px 5px', fontSize: 'var(--text-xs)' }}
                  onClick={() => setChartDays(d)}
                >
                  {d === 365 ? '1Y' : `${d}D`}
                </button>
              ))}
            </div>
          </div>
          <div className="panel-body no-pad" style={{ height: 'calc(100% - 32px)' }}>
            {chartLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <div className="spinner" />
              </div>
            ) : chartData && chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ left: 4, right: 4, top: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 8, fill: 'var(--text-muted)' }}
                    interval="preserveStartEnd"
                    tickFormatter={d => d.slice(5)}
                  />
                  <YAxis
                    tick={{ fontSize: 8, fill: 'var(--text-muted)' }}
                    width={50}
                    domain={['auto', 'auto']}
                    tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 10 }}
                    formatter={(v: number) => [`$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, 'Value']}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--orange)"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state">No chart data</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PortfolioPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  const { data: list, loading: listLoading, refetch: refetchList } = useApi(
    () => api.portfolios.list(),
    [],
  )

  const activeId = selectedId ?? list?.[0]?.id ?? null

  const { data: portfolio, loading: portfolioLoading, refetch: refetchPortfolio } = useApi(
    () => activeId != null ? api.portfolios.get(activeId) : Promise.resolve(null),
    [activeId],
  )

  const refetchAll = useCallback(() => {
    refetchList()
    refetchPortfolio()
  }, [refetchList, refetchPortfolio])

  const createPortfolio = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const created = await api.portfolios.create(newName.trim())
      setNewName('')
      setShowCreate(false)
      await refetchList()
      setSelectedId(created.id)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, height: '100%' }}>
      {/* Left sidebar: portfolio list */}
      <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="panel" style={{ flex: 1 }}>
          <div className="panel-header">
            <span className="panel-title">PORTFOLIOS</span>
            <button
              className="term-btn"
              style={{ padding: '2px 4px' }}
              onClick={() => setShowCreate(o => !o)}
            >
              <Plus size={11} />
            </button>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            {showCreate && (
              <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-muted)', display: 'flex', gap: 4 }}>
                <input
                  className="term-input"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Portfolio name"
                  style={{ flex: 1, fontSize: 'var(--text-xs)' }}
                  onKeyDown={e => { if (e.key === 'Enter') createPortfolio() }}
                  autoFocus
                />
                <button className="term-btn primary" onClick={createPortfolio} disabled={creating} style={{ padding: '2px 6px' }}>
                  {creating ? '…' : 'Add'}
                </button>
              </div>
            )}
            {listLoading && <div style={{ padding: 8 }}><div className="spinner" /></div>}
            {list?.map(p => (
              <div
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                style={{
                  padding: '6px 10px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border-muted)',
                  background: activeId === p.id ? 'var(--bg-hover)' : 'transparent',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs)',
                  color: activeId === p.id ? 'var(--orange)' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {activeId === p.id ? <TrendingUp size={10} style={{ color: 'var(--orange)' }} /> : <ChevronDown size={10} style={{ opacity: 0.4 }} />}
                {p.name}
              </div>
            ))}
            {!listLoading && list?.length === 0 && (
              <div className="empty-state">No portfolios yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {portfolioLoading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div className="spinner" />
          </div>
        )}
        {!portfolioLoading && portfolio == null && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
            <TrendingUp size={32} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              {list?.length === 0 ? 'Create a portfolio to get started' : 'Select a portfolio'}
            </div>
          </div>
        )}
        {!portfolioLoading && portfolio && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--orange)' }}>
                PTFL — {portfolio.name.toUpperCase()}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {portfolio.positions.length} positions
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
                {portfolio.total_pnl >= 0
                  ? <TrendingUp size={12} style={{ color: 'var(--green)' }} />
                  : <TrendingDown size={12} style={{ color: 'var(--red)' }} />
                }
                <button className="term-btn" onClick={refetchAll}>
                  <RefreshCw size={11} />
                </button>
              </div>
            </div>
            <PortfolioPanel portfolio={portfolio} onRefresh={refetchAll} />
          </div>
        )}
      </div>
    </div>
  )
}
