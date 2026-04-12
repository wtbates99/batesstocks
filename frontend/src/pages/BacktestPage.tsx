import { useEffect, useMemo, useState } from 'react'
import { Play, ScanSearch } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../api/client'
import { useAiContext } from '../contexts/AiContext'
import type { StrategyBacktestResponse, StrategyDefinition } from '../api/types'

const METRICS = [
  'Close',
  'Ticker_RSI',
  'Ticker_MACD',
  'Ticker_MACD_Signal',
  'Ticker_MACD_Diff',
  'Ticker_SMA_10',
  'Ticker_SMA_30',
  'Ticker_EMA_10',
  'Ticker_EMA_30',
  'Ticker_Tech_Score',
  'Ticker_Bollinger_PBand',
  'Ticker_MFI',
  'Ticker_VWAP',
]

const CONDITIONS: Array<StrategyDefinition['entry']['condition']> = [
  'above',
  'below',
  'crosses_above',
  'crosses_below',
]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function StatCard({ label, value, tone = 'var(--text-primary)' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={{ color: tone }}>{value}</div>
    </div>
  )
}

function buildDefaultStrategy(): StrategyDefinition {
  return {
    name: 'Terminal Momentum Stack',
    entry: {
      metric: 'Ticker_Tech_Score',
      condition: 'crosses_above',
      threshold: 65,
    },
    exit: {
      metric: 'Ticker_Tech_Score',
      condition: 'crosses_below',
      threshold: 45,
    },
    initial_capital: 100000,
    position_size_pct: 100,
    stop_loss_pct: 8,
    max_open_positions: 1,
  }
}

export default function BacktestPage() {
  const { setContext } = useAiContext()
  const [ticker, setTicker] = useState('SPY')
  const [strategy, setStrategy] = useState<StrategyDefinition>(buildDefaultStrategy)
  const [result, setResult] = useState<StrategyBacktestResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [screening, setScreening] = useState(false)

  const runBacktest = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.strategies.backtest({
        ticker: ticker.toUpperCase(),
        strategy,
      })
      setResult(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const runScreen = async () => {
    setScreening(true)
    setError(null)
    try {
      const response = await api.strategies.screen(strategy)
      setResult((current) => current ? { ...current, current_matches: response.matches } : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setScreening(false)
    }
  }

  const chartData = useMemo(
    () => result?.equity_curve.map((point) => ({
      date: point.date.slice(5),
      equity: point.equity,
      benchmark: point.benchmark,
    })) ?? [],
    [result],
  )

  useEffect(() => {
    setContext({
      page: 'backtest',
      ticker,
      strategy: strategy.name,
      summary: result?.summary ?? null,
      currentMatches: result?.current_matches?.slice(0, 10) ?? [],
    })
  }, [result, setContext, strategy.name, ticker])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 8, height: '100%', minHeight: 0 }}>
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Strategy Builder</span>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Ticker">
            <input className="term-input" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} />
          </Field>
          <Field label="Strategy Name">
            <input
              className="term-input"
              value={strategy.name}
              onChange={(e) => setStrategy((prev) => ({ ...prev, name: e.target.value }))}
            />
          </Field>

          <div style={{ height: 1, background: 'var(--border)' }} />

          <div style={{ color: 'var(--green)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Entry Leg
          </div>
          <Field label="Metric">
            <select className="term-select" value={strategy.entry.metric} onChange={(e) => setStrategy((prev) => ({ ...prev, entry: { ...prev.entry, metric: e.target.value } }))}>
              {METRICS.map((metric) => <option key={metric} value={metric}>{metric}</option>)}
            </select>
          </Field>
          <Field label="Condition">
            <select className="term-select" value={strategy.entry.condition} onChange={(e) => setStrategy((prev) => ({ ...prev, entry: { ...prev.entry, condition: e.target.value as StrategyDefinition['entry']['condition'] } }))}>
              {CONDITIONS.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
            </select>
          </Field>
          <Field label="Threshold">
            <input
              className="term-input"
              type="number"
              value={strategy.entry.threshold ?? ''}
              onChange={(e) => setStrategy((prev) => ({ ...prev, entry: { ...prev.entry, threshold: e.target.value === '' ? null : parseFloat(e.target.value) } }))}
            />
          </Field>

          <div style={{ color: 'var(--red)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Exit Leg
          </div>
          <Field label="Metric">
            <select className="term-select" value={strategy.exit.metric} onChange={(e) => setStrategy((prev) => ({ ...prev, exit: { ...prev.exit, metric: e.target.value } }))}>
              {METRICS.map((metric) => <option key={metric} value={metric}>{metric}</option>)}
            </select>
          </Field>
          <Field label="Condition">
            <select className="term-select" value={strategy.exit.condition} onChange={(e) => setStrategy((prev) => ({ ...prev, exit: { ...prev.exit, condition: e.target.value as StrategyDefinition['exit']['condition'] } }))}>
              {CONDITIONS.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
            </select>
          </Field>
          <Field label="Threshold">
            <input
              className="term-input"
              type="number"
              value={strategy.exit.threshold ?? ''}
              onChange={(e) => setStrategy((prev) => ({ ...prev, exit: { ...prev.exit, threshold: e.target.value === '' ? null : parseFloat(e.target.value) } }))}
            />
          </Field>

          <div className="grid-2">
            <Field label="Capital">
              <input
                className="term-input"
                type="number"
                value={strategy.initial_capital}
                onChange={(e) => setStrategy((prev) => ({ ...prev, initial_capital: parseFloat(e.target.value) || 0 }))}
              />
            </Field>
            <Field label="Stop Loss %">
              <input
                className="term-input"
                type="number"
                value={strategy.stop_loss_pct ?? ''}
                onChange={(e) => setStrategy((prev) => ({ ...prev, stop_loss_pct: e.target.value === '' ? null : parseFloat(e.target.value) }))}
              />
            </Field>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button className="term-btn primary" style={{ flex: 1, justifyContent: 'center' }} onClick={runBacktest} disabled={loading}>
              <Play size={11} />
              {loading ? 'Running…' : 'Backtest'}
            </button>
            <button className="term-btn" onClick={runScreen} disabled={screening}>
              <ScanSearch size={11} />
              {screening ? 'Scanning…' : 'Screen'}
            </button>
          </div>

          {error && <div style={{ color: 'var(--red)', fontSize: 'var(--text-xs)' }}>{error}</div>}
        </div>
      </div>

      <div className="col" style={{ minWidth: 0 }}>
        <div className="metric-grid">
          <StatCard label="Strategy" value={result?.strategy_name ?? 'Awaiting run'} tone="var(--orange)" />
          <StatCard label="Return" value={result ? `${result.summary.total_return_pct.toFixed(2)}%` : '—'} tone={result && result.summary.total_return_pct >= 0 ? 'var(--green)' : 'var(--red)'} />
          <StatCard label="Buy/Hold" value={result ? `${result.summary.buy_hold_return_pct.toFixed(2)}%` : '—'} />
          <StatCard label="Drawdown" value={result ? `${result.summary.max_drawdown_pct.toFixed(2)}%` : '—'} tone="var(--red)" />
          <StatCard label="Win Rate" value={result ? `${result.summary.win_rate.toFixed(1)}%` : '—'} />
          <StatCard label="Sharpe" value={result?.summary.sharpe_ratio?.toFixed(2) ?? '—'} />
        </div>

        <div className="panel" style={{ flex: 1, minHeight: 260 }}>
          <div className="panel-header">
            <span className="panel-title">Equity Curve</span>
          </div>
          <div className="panel-body">
            {chartData.length === 0 ? (
              <div className="empty-state">Run a backtest to populate the equity curve.</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData}>
                  <CartesianGrid stroke="var(--border)" />
                  <XAxis dataKey="date" stroke="var(--text-muted)" minTickGap={24} />
                  <YAxis stroke="var(--text-muted)" width={72} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 2,
                    }}
                  />
                  <Line type="monotone" dataKey="benchmark" stroke="var(--blue)" dot={false} strokeWidth={1.4} />
                  <Line type="monotone" dataKey="equity" stroke="var(--orange)" dot={false} strokeWidth={1.8} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="grid-2" style={{ minHeight: 0 }}>
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Current Matches</span>
            </div>
            <div className="panel-body no-pad">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Sector</th>
                    <th style={{ textAlign: 'right' }}>Px</th>
                    <th style={{ textAlign: 'right' }}>RSI</th>
                    <th style={{ textAlign: 'right' }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {(result?.current_matches ?? []).map((match) => (
                    <tr key={match.ticker}>
                      <td className="col-ticker">{match.ticker}</td>
                      <td>{match.sector ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}>{match.last_price?.toFixed(2) ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}>{match.rsi?.toFixed(1) ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}>{match.tech_score?.toFixed(0) ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Trades</span>
            </div>
            <div className="panel-body no-pad">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th style={{ textAlign: 'right' }}>Ret</th>
                    <th style={{ textAlign: 'right' }}>PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {(result?.trades ?? []).map((trade, index) => (
                    <tr key={`${trade.entry_date}-${index}`}>
                      <td>{trade.entry_date}</td>
                      <td>{trade.exit_date}</td>
                      <td style={{ textAlign: 'right' }} className={trade.return_pct >= 0 ? 'up' : 'down'}>
                        {trade.return_pct.toFixed(2)}%
                      </td>
                      <td style={{ textAlign: 'right' }} className={trade.pnl >= 0 ? 'up' : 'down'}>
                        {trade.pnl.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
