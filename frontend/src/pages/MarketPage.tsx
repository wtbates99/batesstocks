import { useApi } from '../hooks/useApi'
import { api } from '../api/client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const MACRO_SERIES = [
  { key: 'TNX',   label: '10Y Treasury Yield', color: '#58a6ff' },
  { key: 'DX-Y.NYB', label: 'US Dollar Index', color: '#f0883e' },
  { key: 'GC=F',  label: 'Gold Futures',       color: '#d29922' },
  { key: 'CL=F',  label: 'WTI Crude',          color: '#3fb950' },
]

function MacroChart({ ticker, label, color }: { ticker: string; label: string; color: string }) {
  const { data, loading } = useApi(() => api.market.macro(ticker), [ticker])
  if (loading) return <div className="panel"><div className="panel-body"><div className="spinner" /></div></div>
  if (!data || data.dates.length === 0) return null

  const chartData = data.dates.slice(-90).map((d, i) => ({
    date: d.slice(5), // MM-DD
    value: data.values[data.dates.length - 90 + i],
  })).filter(p => p.value != null)

  const latest = chartData[chartData.length - 1]?.value ?? null
  const prev   = chartData[chartData.length - 2]?.value ?? null
  const chg    = latest != null && prev != null ? latest - prev : null
  const pct    = chg != null && prev != null ? (chg / prev) * 100 : null

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">{label}</span>
        {latest != null && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
              {latest.toFixed(2)}
            </span>
            {pct != null && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: pct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
              </span>
            )}
          </div>
        )}
      </div>
      <div className="panel-body no-pad">
        <ResponsiveContainer width="100%" height={100}>
          <LineChart data={chartData} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 8, fill: 'var(--text-muted)' }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 8, fill: 'var(--text-muted)' }} width={36} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 10 }}
              formatter={(v: number) => [v.toFixed(3), label]}
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function MarketPage() {
  const { data: breadth } = useApi(() => api.market.breadth(), [])
  const { data: sectors } = useApi(() => api.market.sectorRotation(), [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      {/* Macro row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {MACRO_SERIES.map(s => (
          <MacroChart key={s.key} ticker={s.key} label={s.label} color={s.color} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flex: 1 }}>
        {/* Market breadth */}
        {breadth && (
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Market Breadth — {breadth.date?.slice(0, 10)}</span>
            </div>
            <div className="panel-body">
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>
                  <span>Advancing: {breadth.advancing}</span>
                  <span>Declining: {breadth.declining}</span>
                  <span>Unchanged: {breadth.unchanged}</span>
                </div>
                <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                  <div style={{ height: '100%', flex: breadth.advancing, background: 'var(--green)' }} />
                  <div style={{ height: '100%', flex: breadth.unchanged, background: 'var(--text-muted)' }} />
                  <div style={{ height: '100%', flex: breadth.declining, background: 'var(--red)' }} />
                </div>
              </div>
              <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {[
                  { label: '52W New Hi', value: breadth.new_highs_52w, color: 'var(--green)' },
                  { label: '52W New Lo', value: breadth.new_lows_52w,  color: 'var(--red)' },
                  { label: 'Above SMA50', value: breadth.above_sma50,  color: 'var(--blue)' },
                  { label: 'Avg RSI',     value: breadth.avg_rsi?.toFixed(1) ?? '—',      color: 'var(--text-primary)' },
                  { label: 'Avg Score',   value: breadth.avg_tech_score?.toFixed(1) ?? '—', color: 'var(--orange)' },
                  { label: 'Adv %',       value: `${breadth.pct_advancing?.toFixed(1)}%`,  color: (breadth.pct_advancing ?? 0) > 50 ? 'var(--green)' : 'var(--red)' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="metric-card">
                    <div className="metric-label">{label}</div>
                    <div className="metric-value" style={{ color }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Sector rotation */}
        {sectors && (
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Sector Rotation</span>
            </div>
            <div className="panel-body no-pad" style={{ overflow: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Sector</th>
                    <th style={{ textAlign: 'right' }}>Ret %</th>
                    <th style={{ textAlign: 'right' }}>Avg RSI</th>
                    <th style={{ textAlign: 'right' }}>Score</th>
                    <th>Momentum</th>
                  </tr>
                </thead>
                <tbody>
                  {[...sectors].sort((a, b) => (b.return_pct ?? -999) - (a.return_pct ?? -999)).map(row => (
                    <tr key={row.sector}>
                      <td style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)' }}>{row.sector}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={row.return_pct != null ? (row.return_pct >= 0 ? 'up' : 'down') : ''}>
                          {row.return_pct != null ? `${row.return_pct >= 0 ? '+' : ''}${row.return_pct.toFixed(2)}%` : '—'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>{row.avg_rsi?.toFixed(1) ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}>{row.avg_tech_score?.toFixed(1) ?? '—'}</td>
                      <td>
                        <div className="score-bar" style={{ minWidth: 60 }}>
                          <div className="score-bar-fill" style={{
                            width: `${Math.min(100, Math.max(0, row.avg_tech_score ?? 0))}%`,
                            background: (row.avg_tech_score ?? 0) >= 60 ? 'var(--green)' : (row.avg_tech_score ?? 0) >= 40 ? 'var(--yellow)' : 'var(--red)',
                          }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
