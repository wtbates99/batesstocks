import { useEffect, useState } from 'react'
import { RefreshCw, ScanSearch } from 'lucide-react'
import { api } from '../api/client'
import { useAiContext } from '../contexts/AiContext'
import { STRATEGY_CONDITIONS, STRATEGY_METRICS } from '../features/strategies/config'
import type { StrategyDefinition, StrategyLeg, StrategyScreenResponse } from '../api/types'

type ThresholdMode = 'value' | 'metric'

function defaultStrategy(): StrategyDefinition {
  return {
    name: 'SP500 Trend Leadership Scan',
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

function updateLeg(
  strategy: StrategyDefinition,
  legKey: 'entry' | 'exit',
  updater: (leg: StrategyLeg) => StrategyLeg,
) {
  return {
    ...strategy,
    [legKey]: updater(strategy[legKey]),
  }
}

function LegEditor({
  title,
  leg,
  onChange,
}: {
  title: string
  leg: StrategyLeg
  onChange: (nextLeg: StrategyLeg) => void
}) {
  const mode = legMode(leg)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ color: 'var(--orange)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {title}
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Metric</label>
        <select className="term-select" value={leg.metric} onChange={(e) => onChange({ ...leg, metric: e.target.value })}>
          {STRATEGY_METRICS.map((metric) => <option key={metric.value} value={metric.value}>{metric.label}</option>)}
        </select>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Condition</label>
        <select className="term-select" value={leg.condition} onChange={(e) => onChange({ ...leg, condition: e.target.value as StrategyDefinition['entry']['condition'] })}>
          {STRATEGY_CONDITIONS.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
        </select>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Threshold Type</label>
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
      </div>
      {mode === 'metric' ? (
        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Compare To Metric</label>
          <select className="term-select" value={leg.compare_to_metric ?? 'Ticker_SMA_250'} onChange={(e) => onChange({ ...leg, compare_to_metric: e.target.value, threshold: null })}>
            {STRATEGY_METRICS.map((metric) => <option key={metric.value} value={metric.value}>{metric.label}</option>)}
          </select>
        </div>
      ) : (
        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Threshold Value</label>
          <input className="term-input" type="number" value={leg.threshold ?? ''} onChange={(e) => onChange({ ...leg, threshold: e.target.value === '' ? null : parseFloat(e.target.value), compare_to_metric: null })} />
        </div>
      )}
    </div>
  )
}

export default function ScreenerPage() {
  const { setContext } = useAiContext()
  const [strategy, setStrategy] = useState<StrategyDefinition>(defaultStrategy)
  const [universeInput, setUniverseInput] = useState('')
  const [result, setResult] = useState<StrategyScreenResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.strategies.screen({
        ...strategy,
        universe: universeInput
          ? universeInput.split(',').map((ticker) => ticker.trim().toUpperCase()).filter(Boolean)
          : null,
      })
      setResult(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setContext({
      page: 'screener',
      strategy: strategy.name,
      entryMetric: strategy.entry.metric,
      exitMetric: strategy.exit.metric,
      universe: universeInput || 'SP500 + major ETFs',
      matches: result?.matches?.slice(0, 10) ?? [],
    })
  }, [result, setContext, strategy.entry.metric, strategy.exit.metric, strategy.name, universeInput])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 8, height: '100%', minHeight: 0 }}>
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Screener</span>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Strategy Name</label>
            <input className="term-input" value={strategy.name} onChange={(e) => setStrategy((prev) => ({ ...prev, name: e.target.value }))} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Universe Override</label>
            <input
              className="term-input"
              value={universeInput}
              onChange={(e) => setUniverseInput(e.target.value)}
              placeholder="Leave blank for S&P 500 + major index/sector ETFs"
            />
          </div>

          <LegEditor
            title="Entry"
            leg={strategy.entry}
            onChange={(nextLeg) => setStrategy((prev) => updateLeg(prev, 'entry', () => nextLeg))}
          />

          <div style={{ height: 1, background: 'var(--border)' }} />

          <LegEditor
            title="Exit"
            leg={strategy.exit}
            onChange={(nextLeg) => setStrategy((prev) => updateLeg(prev, 'exit', () => nextLeg))}
          />

          <div style={{ display: 'flex', gap: 6 }}>
            <button className="term-btn primary" style={{ flex: 1, justifyContent: 'center' }} onClick={run} disabled={loading}>
              <ScanSearch size={11} />
              {loading ? 'Scanning…' : 'Run Scan'}
            </button>
            <button className="term-btn" onClick={() => { setStrategy(defaultStrategy()); setUniverseInput(''); setResult(null); setError(null) }}>
              <RefreshCw size={11} />
              Reset
            </button>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 'var(--text-xs)' }}>{error}</div>}
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Default scan universe is the S&amp;P 500 plus major broad-market, sector, and macro ETFs.
          </div>
        </div>
      </div>

      <div className="panel" style={{ minHeight: 0 }}>
        <div className="panel-header">
          <span className="panel-title">Live Matches</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {result?.generated_at ? result.generated_at.slice(0, 19).replace('T', ' ') : 'Awaiting scan'}
          </span>
        </div>
        <div className="panel-body no-pad">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Company</th>
                <th>Sector</th>
                <th style={{ textAlign: 'right' }}>Px</th>
                <th style={{ textAlign: 'right' }}>RSI</th>
                <th style={{ textAlign: 'right' }}>Score</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {(result?.matches ?? []).map((match) => (
                <tr key={match.ticker}>
                  <td className="col-ticker">{match.ticker}</td>
                  <td className="col-name">{match.name ?? '—'}</td>
                  <td>{match.sector ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{match.last_price?.toFixed(2) ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{match.rsi?.toFixed(1) ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{match.tech_score?.toFixed(0) ?? '—'}</td>
                  <td><span className="badge badge-orange">{match.signal_state}</span></td>
                </tr>
              ))}
              {result && result.matches.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state" style={{ padding: 18 }}>No current matches for this strategy.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
