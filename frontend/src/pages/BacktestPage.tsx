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
import { STRATEGY_CONDITIONS, STRATEGY_METRICS } from '../features/strategies/config'
import type { StrategyBacktestResponse, StrategyDefinition, StrategyLeg } from '../api/types'

type ThresholdMode = 'value' | 'metric'

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
    name: 'Terminal Long-Term Trend',
    entry: {
      metric: 'Close',
      condition: 'above',
      compare_to_metric: 'Ticker_SMA_250',
    },
    exit: {
      metric: 'Close',
      condition: 'below',
      compare_to_metric: 'Ticker_SMA_100',
    },
    initial_capital: 100000,
    position_size_pct: 100,
    stop_loss_pct: 8,
    max_open_positions: 1,
  }
}

function legMode(leg: StrategyLeg): ThresholdMode {
  return leg.compare_to_metric ? 'metric' : 'value'
}

function LegEditor({
  label,
  tone,
  leg,
  onChange,
}: {
  label: string
  tone: string
  leg: StrategyLeg
  onChange: (nextLeg: StrategyLeg) => void
}) {
  const mode = legMode(leg)

  return (
    <>
      <div style={{ color: tone, fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <Field label="Metric">
        <select className="term-select" value={leg.metric} onChange={(e) => onChange({ ...leg, metric: e.target.value })}>
          {STRATEGY_METRICS.map((metric) => <option key={metric.value} value={metric.value}>{metric.label}</option>)}
        </select>
      </Field>
      <Field label="Condition">
        <select className="term-select" value={leg.condition} onChange={(e) => onChange({ ...leg, condition: e.target.value as StrategyDefinition['entry']['condition'] })}>
          {STRATEGY_CONDITIONS.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
        </select>
      </Field>
      <Field label="Threshold Type">
        <select
          className="term-select"
          value={mode}
          onChange={(e) => {
            const nextMode = e.target.value as ThresholdMode
            if (nextMode === 'metric') {
              onChange({
                ...leg,
                threshold: null,
                compare_to_metric: leg.compare_to_metric ?? 'Ticker_SMA_250',
              })
            } else {
              onChange({
                ...leg,
                compare_to_metric: null,
                threshold: leg.threshold ?? 0,
              })
            }
          }}
        >
          <option value="metric">Metric</option>
          <option value="value">Numeric value</option>
        </select>
      </Field>
      {mode === 'metric' ? (
        <Field label="Compare To Metric">
          <select className="term-select" value={leg.compare_to_metric ?? 'Ticker_SMA_250'} onChange={(e) => onChange({ ...leg, compare_to_metric: e.target.value, threshold: null })}>
            {STRATEGY_METRICS.map((metric) => <option key={metric.value} value={metric.value}>{metric.label}</option>)}
          </select>
        </Field>
      ) : (
        <Field label="Threshold Value">
          <input
            className="term-input"
            type="number"
            value={leg.threshold ?? ''}
            onChange={(e) => onChange({ ...leg, threshold: e.target.value === '' ? null : parseFloat(e.target.value), compare_to_metric: null })}
          />
        </Field>
      )}
    </>
  )
}

export default function BacktestPage() {
  const { setContext } = useAiContext()
  const [ticker, setTicker] = useState('SPY')
  const [universeInput, setUniverseInput] = useState('')
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
        strategy: {
          ...strategy,
          universe: universeInput
            ? universeInput.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean)
            : null,
        },
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
      const response = await api.strategies.screen({
        ...strategy,
        universe: universeInput
          ? universeInput.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean)
          : null,
      })
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
      universe: universeInput || 'SP500 + major ETFs',
      summary: result?.summary ?? null,
      currentMatches: result?.current_matches?.slice(0, 10) ?? [],
    })
  }, [result, setContext, strategy.name, ticker, universeInput])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 8, height: '100%', minHeight: 0 }}>
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
          <Field label="Universe Override">
            <input
              className="term-input"
              value={universeInput}
              onChange={(e) => setUniverseInput(e.target.value)}
              placeholder="Leave blank for S&P 500 + major index/sector ETFs"
            />
          </Field>

          <div style={{ height: 1, background: 'var(--border)' }} />

          <LegEditor
            label="Entry Leg"
            tone="var(--green)"
            leg={strategy.entry}
            onChange={(nextLeg) => setStrategy((prev) => ({ ...prev, entry: nextLeg }))}
          />

          <LegEditor
            label="Exit Leg"
            tone="var(--red)"
            leg={strategy.exit}
            onChange={(nextLeg) => setStrategy((prev) => ({ ...prev, exit: nextLeg }))}
          />

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
