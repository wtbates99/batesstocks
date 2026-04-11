import { useState } from 'react'
import { Play, Zap, TrendingUp, TrendingDown, Award } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useApi } from '../hooks/useApi'
import { api } from '../api/client'
import type { BacktestRequest, BacktestResult } from '../api/types'

const METRICS = [
  'Ticker_RSI', 'Ticker_MACD', 'Ticker_MACD_Diff', 'Ticker_MACD_Signal',
  'Ticker_Close', 'Ticker_SMA_10', 'Ticker_SMA_30', 'Ticker_EMA_10', 'Ticker_EMA_30',
  'Ticker_SMA_200W', 'Ticker_SMA_250W', 'Ticker_Bollinger_PBand', 'Ticker_Bollinger_WBand',
  'Ticker_MFI', 'Ticker_Tech_Score', 'Ticker_Stochastic_K', 'Ticker_Stochastic_D',
  'Ticker_Williams_R', 'Ticker_ROC', 'Ticker_VWAP',
]

const CONDITIONS = ['above', 'below', 'crosses_above', 'crosses_below']

const PRESETS: { label: string; config: Partial<BacktestRequest> }[] = [
  {
    label: 'RSI Reversal',
    config: { entry_metric: 'Ticker_RSI', entry_condition: 'crosses_above', entry_threshold: 30, exit_metric: 'Ticker_RSI', exit_condition: 'crosses_above', exit_threshold: 70 },
  },
  {
    label: 'MACD Crossover',
    config: { entry_metric: 'Ticker_MACD', entry_condition: 'crosses_above', entry_threshold_metric: 'Ticker_MACD_Signal', exit_metric: 'Ticker_MACD', exit_condition: 'crosses_below', exit_threshold_metric: 'Ticker_MACD_Signal' },
  },
  {
    label: 'SMA 10/30',
    config: { entry_metric: 'Ticker_SMA_10', entry_condition: 'crosses_above', entry_threshold_metric: 'Ticker_SMA_30', exit_metric: 'Ticker_SMA_10', exit_condition: 'crosses_below', exit_threshold_metric: 'Ticker_SMA_30' },
  },
  {
    label: 'Tech Score Momentum',
    config: { entry_metric: 'Ticker_Tech_Score', entry_condition: 'crosses_above', entry_threshold: 65, exit_metric: 'Ticker_Tech_Score', exit_condition: 'crosses_below', exit_threshold: 40 },
  },
  {
    label: 'Oversold Bounce',
    config: { entry_metric: 'Ticker_RSI', entry_condition: 'crosses_above', entry_threshold: 25, exit_metric: 'Ticker_RSI', exit_condition: 'above', exit_threshold: 60 },
  },
]

function StatCard({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="metric-card" style={{ minWidth: 90 }}>
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={{ color, fontSize: 'var(--text-md)' }}>{value}</div>
      {sub && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export default function BacktestPage() {
  const [form, setForm] = useState<BacktestRequest>({
    ticker: 'SPY',
    entry_metric: 'Ticker_RSI',
    entry_condition: 'crosses_above',
    entry_threshold: 30,
    exit_metric: 'Ticker_RSI',
    exit_condition: 'crosses_above',
    exit_threshold: 70,
    initial_capital: 10000,
    position_size_pct: 100,
  })
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [screenResult, setScreenResult] = useState<string[] | null>(null)
  const [screening, setScreening] = useState(false)

  const set = (k: keyof BacktestRequest, v: unknown) =>
    setForm(f => ({ ...f, [k]: v }))

  const applyPreset = (preset: typeof PRESETS[0]) =>
    setForm(f => ({ ...f, ...preset.config }))

  const run = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.backtest({ ...form })
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const runScreen = async () => {
    setScreening(true)
    try {
      const tickers = await api.strategyScreen({
        entry_metric: form.entry_metric,
        entry_condition: form.entry_condition,
        entry_threshold: form.entry_threshold,
        entry_threshold_metric: form.entry_threshold_metric ?? null,
      })
      setScreenResult(tickers)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setScreening(false)
    }
  }

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      {children}
    </div>
  )

  return (
    <div style={{ display: 'flex', gap: 8, height: '100%', minHeight: 0 }}>
      {/* Left: builder */}
      <div className="panel" style={{ width: 300, flexShrink: 0 }}>
        <div className="panel-header">
          <span className="panel-title">Strategy Builder</span>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
          {/* Presets */}
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Presets</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {PRESETS.map(p => (
                <button key={p.label} className="term-btn" style={{ fontSize: 'var(--text-xs)', padding: '2px 6px' }} onClick={() => applyPreset(p)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border)' }} />

          <Field label="Ticker">
            <input
              className="term-input"
              value={form.ticker}
              onChange={e => set('ticker', e.target.value.toUpperCase())}
              placeholder="SPY"
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <Field label="Start Date">
              <input className="term-input" type="date" value={form.start_date ?? ''} onChange={e => set('start_date', e.target.value || null)} />
            </Field>
            <Field label="End Date">
              <input className="term-input" type="date" value={form.end_date ?? ''} onChange={e => set('end_date', e.target.value || null)} />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <Field label="Capital ($)">
              <input className="term-input" type="number" value={form.initial_capital} onChange={e => set('initial_capital', parseFloat(e.target.value))} />
            </Field>
            <Field label="Size (%)">
              <input className="term-input" type="number" value={form.position_size_pct} onChange={e => set('position_size_pct', parseFloat(e.target.value))} min={1} max={100} />
            </Field>
          </div>

          <div style={{ height: 1, background: 'var(--border)' }} />

          {/* Entry */}
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--green)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Entry Condition
          </div>

          <Field label="Entry Metric">
            <select className="term-select" value={form.entry_metric} onChange={e => set('entry_metric', e.target.value)}>
              {METRICS.map(m => <option key={m} value={m}>{m.replace('Ticker_', '')}</option>)}
            </select>
          </Field>

          <Field label="Condition">
            <select className="term-select" value={form.entry_condition} onChange={e => set('entry_condition', e.target.value)}>
              {CONDITIONS.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <Field label="Threshold">
              <input className="term-input" type="number" step="0.1" value={form.entry_threshold ?? 0} onChange={e => set('entry_threshold', parseFloat(e.target.value))} />
            </Field>
            <Field label="vs. Metric">
              <select className="term-select" value={form.entry_threshold_metric ?? ''} onChange={e => set('entry_threshold_metric', e.target.value || null)}>
                <option value="">None</option>
                {METRICS.map(m => <option key={m} value={m}>{m.replace('Ticker_', '')}</option>)}
              </select>
            </Field>
          </div>

          <div style={{ height: 1, background: 'var(--border)' }} />

          {/* Exit */}
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--red)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Exit Condition
          </div>

          <Field label="Exit Metric">
            <select className="term-select" value={form.exit_metric} onChange={e => set('exit_metric', e.target.value)}>
              {METRICS.map(m => <option key={m} value={m}>{m.replace('Ticker_', '')}</option>)}
            </select>
          </Field>

          <Field label="Condition">
            <select className="term-select" value={form.exit_condition} onChange={e => set('exit_condition', e.target.value)}>
              {CONDITIONS.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <Field label="Threshold">
              <input className="term-input" type="number" step="0.1" value={form.exit_threshold ?? 0} onChange={e => set('exit_threshold', parseFloat(e.target.value))} />
            </Field>
            <Field label="vs. Metric">
              <select className="term-select" value={form.exit_threshold_metric ?? ''} onChange={e => set('exit_threshold_metric', e.target.value || null)}>
                <option value="">None</option>
                {METRICS.map(m => <option key={m} value={m}>{m.replace('Ticker_', '')}</option>)}
              </select>
            </Field>
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button className="term-btn primary" onClick={run} disabled={loading} style={{ flex: 1, justifyContent: 'center' }}>
              <Play size={11} /> {loading ? 'Running…' : 'Backtest'}
            </button>
            <button className="term-btn" onClick={runScreen} disabled={screening} data-tooltip="Find current matches in S&P 500">
              <Zap size={11} /> {screening ? '…' : 'Screen'}
            </button>
          </div>

          {error && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--red)', padding: '6px 8px', background: 'var(--red-bg)', border: '1px solid var(--red-dim)', borderRadius: 'var(--radius)' }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Right: results */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {screenResult && (
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">
                <Zap size={11} style={{ color: 'var(--orange)', marginRight: 4 }} />
                Strategy Matches — {screenResult.length} tickers
              </span>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {screenResult.map(t => (
                <a key={t} href={`/spotlight/${t}`} style={{ textDecoration: 'none' }}>
                  <span className="badge badge-orange">{t}</span>
                </a>
              ))}
              {screenResult.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>No matches</span>}
            </div>
          </div>
        )}

        {loading && (
          <div className="panel" style={{ flex: 1 }}>
            <div className="panel-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <div className="spinner" />
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Running backtest…</span>
            </div>
          </div>
        )}

        {result && !loading && (
          <>
            {/* Stats */}
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">{result.ticker} — {result.strategy}</span>
              </div>
              <div className="panel-body">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <StatCard label="Total Return" value={`${result.total_return_pct >= 0 ? '+' : ''}${result.total_return_pct.toFixed(2)}%`} color={result.total_return_pct >= 0 ? 'var(--green)' : 'var(--red)'} />
                  <StatCard label="Buy & Hold" value={`${result.buy_hold_return_pct >= 0 ? '+' : ''}${result.buy_hold_return_pct.toFixed(2)}%`} color={result.buy_hold_return_pct >= 0 ? 'var(--green)' : 'var(--red)'} />
                  <StatCard label="Win Rate" value={`${result.win_rate.toFixed(1)}%`} color={result.win_rate >= 50 ? 'var(--green)' : 'var(--red)'} />
                  <StatCard label="# Trades" value={String(result.num_trades)} />
                  <StatCard label="Avg Ret" value={`${result.avg_return_pct.toFixed(2)}%`} color={result.avg_return_pct >= 0 ? 'var(--green)' : 'var(--red)'} />
                  <StatCard label="Max DD" value={`-${result.max_drawdown_pct.toFixed(2)}%`} color="var(--red)" />
                  <StatCard label="Sharpe" value={result.sharpe_ratio?.toFixed(2) ?? '—'} />
                  {result.sortino_ratio != null && <StatCard label="Sortino" value={result.sortino_ratio.toFixed(2)} />}
                  {result.calmar_ratio != null && <StatCard label="Calmar" value={result.calmar_ratio.toFixed(2)} />}
                  {result.profit_factor != null && <StatCard label="PF" value={result.profit_factor.toFixed(2)} />}
                  {result.annualized_return_pct != null && <StatCard label="Ann. Ret" value={`${result.annualized_return_pct.toFixed(2)}%`} color={result.annualized_return_pct >= 0 ? 'var(--green)' : 'var(--red)'} />}
                </div>
              </div>
            </div>

            {/* Equity curve */}
            <div className="panel" style={{ flex: 1, minHeight: 200 }}>
              <div className="panel-header"><span className="panel-title">Equity Curve</span></div>
              <div className="panel-body no-pad" style={{ padding: '8px 0 0 0' }}>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={result.equity_curve} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9, fill: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}
                      tickFormatter={d => d.slice(5)}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}
                      tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                      width={44}
                    />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                      formatter={(v: number) => [`$${v.toFixed(2)}`, 'Portfolio']}
                    />
                    <ReferenceLine y={result.equity_curve[0]?.value ?? 10000} stroke="var(--border-bright)" strokeDasharray="4 4" />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={result.total_return_pct >= 0 ? 'var(--green)' : 'var(--red)'}
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Trades */}
            <div className="panel">
              <div className="panel-header"><span className="panel-title">Trades ({result.trades.length})</span></div>
              <div className="panel-body no-pad" style={{ maxHeight: 200, overflow: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Entry</th>
                      <th style={{ textAlign: 'right' }}>Entry $</th>
                      <th>Exit</th>
                      <th style={{ textAlign: 'right' }}>Exit $</th>
                      <th style={{ textAlign: 'right' }}>Return</th>
                      <th style={{ textAlign: 'right' }}>P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.map((t, i) => (
                      <tr key={i}>
                        <td>{t.entry_date}</td>
                        <td style={{ textAlign: 'right' }}>{t.entry_price.toFixed(2)}</td>
                        <td>{t.exit_date}</td>
                        <td style={{ textAlign: 'right' }}>{t.exit_price.toFixed(2)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span className={t.return_pct >= 0 ? 'up' : 'down'}>
                            {t.return_pct >= 0 ? '+' : ''}{t.return_pct.toFixed(2)}%
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className={t.pnl >= 0 ? 'up' : 'down'}>
                            {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {!result && !loading && !screenResult && (
          <div className="panel" style={{ flex: 1 }}>
            <div className="empty-state" style={{ height: '100%' }}>
              <Award size={32} style={{ color: 'var(--text-dim)' }} />
              <span>Configure a strategy and click Backtest</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
