import { useState } from 'react'
import { Plus, Trash2, Bell, BellOff, RefreshCw, CheckCircle } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { api } from '../api/client'
import type { AlertOut, AlertCreate } from '../api/types'

// Available metrics for alert triggers
const ALERT_METRICS = [
  { value: 'Ticker_Close',       label: 'Price (Close)' },
  { value: 'Ticker_RSI',         label: 'RSI' },
  { value: 'Ticker_MACD',        label: 'MACD' },
  { value: 'Ticker_MACD_Signal', label: 'MACD Signal' },
  { value: 'Ticker_SMA_10',      label: 'SMA 10' },
  { value: 'Ticker_SMA_30',      label: 'SMA 30' },
  { value: 'Ticker_EMA_10',      label: 'EMA 10' },
  { value: 'Ticker_Bollinger_High', label: 'Bollinger High' },
  { value: 'Ticker_Bollinger_Low',  label: 'Bollinger Low' },
  { value: 'Ticker_Stochastic_K',   label: 'Stochastic K' },
  { value: 'Ticker_Tech_Score',     label: 'Tech Score' },
  { value: 'Ticker_Volume',         label: 'Volume' },
  { value: 'Ticker_MFI',            label: 'Money Flow Index' },
  { value: 'Ticker_Williams_R',     label: 'Williams %R' },
]

const CONDITIONS = [
  { value: 'above', label: 'Crosses Above (≥)' },
  { value: 'below', label: 'Crosses Below (≤)' },
]

function conditionLabel(c: string) {
  return c === 'above' ? '≥' : c === 'below' ? '≤' : c
}

function metricLabel(m: string) {
  return ALERT_METRICS.find(a => a.value === m)?.label ?? m.replace('Ticker_', '').replace(/_/g, ' ')
}

interface AddAlertFormProps {
  onAdded: () => void
}

function AddAlertForm({ onAdded }: AddAlertFormProps) {
  const [ticker, setTicker] = useState('')
  const [metric, setMetric] = useState('Ticker_Close')
  const [condition, setCondition] = useState('above')
  const [threshold, setThreshold] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!ticker.trim() || !threshold) { setError('Ticker and threshold required'); return }
    setLoading(true)
    setError('')
    try {
      const body: AlertCreate = {
        ticker: ticker.trim().toUpperCase(),
        metric,
        condition,
        threshold: parseFloat(threshold),
        notes: notes || null,
      }
      await api.alerts.create(body)
      setTicker(''); setThreshold(''); setNotes('')
      onAdded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create alert')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">CREATE ALERT</span>
        <Bell size={12} style={{ color: 'var(--orange)' }} />
      </div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 3 }}>TICKER</div>
            <input
              className="term-input"
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              placeholder="AAPL"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 3 }}>METRIC</div>
            <select
              className="term-select"
              value={metric}
              onChange={e => setMetric(e.target.value)}
              style={{ width: '100%' }}
            >
              {ALERT_METRICS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 3 }}>CONDITION</div>
            <select
              className="term-select"
              value={condition}
              onChange={e => setCondition(e.target.value)}
              style={{ width: '100%' }}
            >
              {CONDITIONS.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 3 }}>THRESHOLD</div>
            <input
              className="term-input"
              type="number"
              value={threshold}
              onChange={e => setThreshold(e.target.value)}
              placeholder="150.00"
              style={{ width: '100%' }}
            />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 3 }}>NOTES (optional)</div>
          <input
            className="term-input"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional note about this alert"
            style={{ width: '100%' }}
          />
        </div>

        {/* Preview */}
        {ticker && threshold && (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: 'var(--blue)',
            padding: '4px 8px',
            background: 'rgba(88,166,255,0.08)',
            borderRadius: 3,
          }}>
            Alert when {ticker} {metricLabel(metric)} {conditionLabel(condition)} {threshold}
          </div>
        )}

        {error && <div style={{ color: 'var(--red)', fontSize: 'var(--text-xs)' }}>{error}</div>}

        <button className="term-btn primary" onClick={submit} disabled={loading} style={{ alignSelf: 'flex-start' }}>
          <Bell size={11} />
          {loading ? 'Creating…' : 'Create Alert'}
        </button>
      </div>
    </div>
  )
}

function AlertRow({ alert, onDelete }: { alert: AlertOut; onDelete: () => void }) {
  const isTriggered = alert.triggered

  return (
    <tr style={{ opacity: isTriggered ? 0.6 : 1 }}>
      <td className="col-ticker">{alert.ticker}</td>
      <td style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)' }}>
        {metricLabel(alert.metric)}
      </td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        {conditionLabel(alert.condition)}
      </td>
      <td style={{ textAlign: 'right' }}>
        <span className="num">{alert.threshold.toFixed(2)}</span>
      </td>
      <td>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          color: isTriggered ? 'var(--green)' : 'var(--orange)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}>
          {isTriggered
            ? <><CheckCircle size={10} /> TRIGGERED</>
            : <><Bell size={10} /> ACTIVE</>
          }
        </span>
      </td>
      <td style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        {isTriggered && alert.triggered_at ? alert.triggered_at.slice(0, 10) : '—'}
      </td>
      <td style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {alert.notes ?? '—'}
      </td>
      <td style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {alert.created_at.slice(0, 10)}
        </span>
      </td>
      <td>
        <button
          className="term-btn"
          style={{ padding: '2px 4px', color: 'var(--red)' }}
          onClick={onDelete}
        >
          <Trash2 size={10} />
        </button>
      </td>
    </tr>
  )
}

export default function AlertsPage() {
  const { data: alerts, loading, refetch } = useApi(() => api.alerts.list(), [])

  const deleteAlert = async (id: number) => {
    await api.alerts.delete(id)
    refetch()
  }

  const active    = alerts?.filter(a => !a.triggered) ?? []
  const triggered = alerts?.filter(a => a.triggered)  ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--orange)' }}>
          ALRT — PRICE &amp; INDICATOR ALERTS
        </span>
        <button className="term-btn" onClick={refetch}>
          <RefreshCw size={11} />
        </button>
        {loading && <div className="spinner" style={{ width: 12, height: 12 }} />}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[
          { label: 'TOTAL ALERTS',  value: alerts?.length ?? 0,  color: 'var(--text-primary)' },
          { label: 'ACTIVE',        value: active.length,         color: 'var(--orange)' },
          { label: 'TRIGGERED',     value: triggered.length,      color: 'var(--green)' },
          { label: 'TICKERS',       value: new Set(alerts?.map(a => a.ticker)).size, color: 'var(--blue)' },
        ].map(c => (
          <div key={c.label} className="metric-card">
            <div className="metric-label">{c.label}</div>
            <div className="metric-value num" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 8, flex: 1, minHeight: 0 }}>
        {/* Create form */}
        <AddAlertForm onAdded={refetch} />

        {/* Alerts table */}
        <div className="panel" style={{ minHeight: 0 }}>
          <div className="panel-header">
            <span className="panel-title">ALL ALERTS</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--orange)' }}>
                <Bell size={9} style={{ verticalAlign: 'middle' }} /> {active.length} active
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--green)' }}>
                <CheckCircle size={9} style={{ verticalAlign: 'middle' }} /> {triggered.length} triggered
              </span>
            </div>
          </div>
          <div className="panel-body no-pad" style={{ overflow: 'auto' }}>
            {!loading && (alerts?.length ?? 0) === 0 ? (
              <div className="empty-state">
                <BellOff size={20} style={{ opacity: 0.3, marginBottom: 8 }} />
                No alerts yet — create one on the left
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Metric</th>
                    <th>Cond</th>
                    <th style={{ textAlign: 'right' }}>Threshold</th>
                    <th>Status</th>
                    <th>Triggered</th>
                    <th>Notes</th>
                    <th style={{ textAlign: 'right' }}>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {/* Active alerts first */}
                  {active.map(a => (
                    <AlertRow key={a.id} alert={a} onDelete={() => deleteAlert(a.id)} />
                  ))}
                  {/* Then triggered */}
                  {triggered.length > 0 && (
                    <tr>
                      <td colSpan={9} style={{
                        background: 'var(--bg-panel)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-muted)',
                        padding: '4px 10px',
                        borderBottom: '1px solid var(--border)',
                      }}>
                        ─── TRIGGERED ───
                      </td>
                    </tr>
                  )}
                  {triggered.map(a => (
                    <AlertRow key={a.id} alert={a} onDelete={() => deleteAlert(a.id)} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
