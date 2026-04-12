import { useEffect, useState } from 'react'
import { RefreshCw, ScanSearch } from 'lucide-react'
import { api } from '../api/client'
import { useAiContext } from '../contexts/AiContext'
import type { StrategyDefinition, StrategyScreenResponse } from '../api/types'

const METRICS = [
  'Ticker_Tech_Score',
  'Ticker_RSI',
  'Ticker_MACD',
  'Ticker_MACD_Diff',
  'Ticker_MFI',
  'Ticker_Bollinger_PBand',
  'Close',
]

const CONDITIONS: Array<StrategyDefinition['entry']['condition']> = [
  'above',
  'below',
  'crosses_above',
  'crosses_below',
]

function defaultStrategy(): StrategyDefinition {
  return {
    name: 'Realtime Opportunity Scan',
    entry: {
      metric: 'Ticker_Tech_Score',
      condition: 'above',
      threshold: 70,
    },
    exit: {
      metric: 'Ticker_Tech_Score',
      condition: 'below',
      threshold: 45,
    },
    initial_capital: 100000,
    position_size_pct: 100,
    stop_loss_pct: 8,
    max_open_positions: 1,
  }
}

export default function ScreenerPage() {
  const { setContext } = useAiContext()
  const [strategy, setStrategy] = useState<StrategyDefinition>(defaultStrategy)
  const [result, setResult] = useState<StrategyScreenResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.strategies.screen(strategy)
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
      matches: result?.matches?.slice(0, 10) ?? [],
    })
  }, [result, setContext, strategy.entry.metric, strategy.name])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 8, height: '100%', minHeight: 0 }}>
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
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Entry Metric</label>
            <select className="term-select" value={strategy.entry.metric} onChange={(e) => setStrategy((prev) => ({ ...prev, entry: { ...prev.entry, metric: e.target.value } }))}>
              {METRICS.map((metric) => <option key={metric} value={metric}>{metric}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Condition</label>
            <select className="term-select" value={strategy.entry.condition} onChange={(e) => setStrategy((prev) => ({ ...prev, entry: { ...prev.entry, condition: e.target.value as StrategyDefinition['entry']['condition'] } }))}>
              {CONDITIONS.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Threshold</label>
            <input className="term-input" type="number" value={strategy.entry.threshold ?? ''} onChange={(e) => setStrategy((prev) => ({ ...prev, entry: { ...prev.entry, threshold: e.target.value === '' ? null : parseFloat(e.target.value) } }))} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="term-btn primary" style={{ flex: 1, justifyContent: 'center' }} onClick={run} disabled={loading}>
              <ScanSearch size={11} />
              {loading ? 'Scanning…' : 'Run Scan'}
            </button>
            <button className="term-btn" onClick={() => { setStrategy(defaultStrategy()); setResult(null); setError(null) }}>
              <RefreshCw size={11} />
              Reset
            </button>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 'var(--text-xs)' }}>{error}</div>}
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            The screener uses the same strategy definition model as the backtest engine.
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
