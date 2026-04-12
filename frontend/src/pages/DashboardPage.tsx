import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Radar, RefreshCw, ScanSearch, TestTubeDiagonal } from 'lucide-react'
import { api } from '../api/client'
import { useAiContext } from '../contexts/AiContext'
import type { SyncStatus, TerminalMover } from '../api/types'
import { useApi, usePoll } from '../hooks/useApi'

function fmtPct(value: number | null | undefined) {
  if (value == null) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function fmtNumber(value: number | null | undefined, digits = 2) {
  if (value == null) return '—'
  return value.toFixed(digits)
}

function fmtVolume(value: number | null | undefined) {
  if (value == null) return '—'
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  return value.toFixed(0)
}

function toneColor(tone: string) {
  if (tone === 'positive') return 'var(--green)'
  if (tone === 'negative') return 'var(--red)'
  if (tone === 'warning') return 'var(--orange)'
  return 'var(--text-primary)'
}

function formatSyncTime(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function formatSyncSource(source: string) {
  return source.split('_').join(' ').toUpperCase()
}

function syncAccent(status: SyncStatus | null) {
  if (!status) return 'var(--text-muted)'
  if (status.state === 'error') return 'var(--red)'
  if (status.state === 'running') return 'var(--orange)'
  return 'var(--green)'
}

function SyncTelemetry({ status }: { status: SyncStatus | null }) {
  const progress = status && status.target_tickers > 0
    ? Math.min(100, Math.round((status.completed_tickers / status.target_tickers) * 100))
    : 0

  return (
    <div className="sync-telemetry">
      <div className="sync-telemetry-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`status-dot ${status?.state === 'running' ? 'live' : status?.state === 'error' ? 'error' : ''}`} />
          <span className="sync-telemetry-state" style={{ color: syncAccent(status) }}>
            {status?.state === 'running' ? 'SYNC RUNNING' : status?.state === 'error' ? 'SYNC ERROR' : 'SYNC STANDBY'}
          </span>
        </div>
        <span className="sync-telemetry-source">{formatSyncSource(status?.source ?? 'system')}</span>
      </div>

      <div className="sync-telemetry-detail">
        {status?.detail ?? 'Waiting for the next refresh window.'}
      </div>

      <div className="sync-telemetry-grid">
        <div className="sync-telemetry-cell">
          <span className="sync-telemetry-label">Phase</span>
          <span className="sync-telemetry-value">{(status?.phase ?? 'waiting').toUpperCase()}</span>
        </div>
        <div className="sync-telemetry-cell">
          <span className="sync-telemetry-label">Coverage</span>
          <span className="sync-telemetry-value">
            {status ? `${status.completed_tickers}/${status.target_tickers || 0}` : '0/0'}
          </span>
        </div>
        <div className="sync-telemetry-cell">
          <span className="sync-telemetry-label">Rows</span>
          <span className="sync-telemetry-value">{status?.rows_written.toLocaleString() ?? '0'}</span>
        </div>
        <div className="sync-telemetry-cell">
          <span className="sync-telemetry-label">Last Good</span>
          <span className="sync-telemetry-value">{formatSyncTime(status?.last_success_at)}</span>
        </div>
      </div>

      <div className="sync-telemetry-progress" aria-hidden="true">
        <div className="sync-telemetry-progress-bar" style={{ width: `${progress}%` }} />
      </div>

      {status?.last_error && (
        <div className="sync-telemetry-error">{status.last_error}</div>
      )}
    </div>
  )
}

function MoverTable({
  title,
  rows,
  onOpen,
}: {
  title: string
  rows: TerminalMover[]
  onOpen: (ticker: string) => void
}) {
  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">{title}</span>
      </div>
      <div className="panel-body no-pad">
        <table className="data-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Name</th>
              <th style={{ textAlign: 'right' }}>Px</th>
              <th style={{ textAlign: 'right' }}>Chg</th>
              <th style={{ textAlign: 'right' }}>Score</th>
              <th style={{ textAlign: 'right' }}>Vol</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${title}-${row.ticker}`} onClick={() => onOpen(row.ticker)} style={{ cursor: 'pointer' }}>
                <td className="col-ticker">{row.ticker}</td>
                <td className="col-name" style={{ maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>{fmtNumber(row.last_price)}</td>
                <td style={{ textAlign: 'right' }}>
                  <span className={row.change_pct != null ? (row.change_pct >= 0 ? 'up' : 'down') : 'flat'}>
                    {fmtPct(row.change_pct)}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>{fmtNumber(row.tech_score, 0)}</td>
                <td style={{ textAlign: 'right' }}>{fmtVolume(row.volume)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { setContext } = useAiContext()
  const [tickerInput, setTickerInput] = useState('SPY')
  const focusTicker = useDeferredValue(tickerInput.trim().toUpperCase() || 'SPY')
  const { data, loading, error, refetch } = useApi(() => api.terminal.workspace(focusTicker), [focusTicker])
  const { data: syncStatus } = usePoll(() => api.system.syncStatus(), 5000, [])
  const [syncInfo, setSyncInfo] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const syncMarket = async () => {
    setSyncing(true)
    try {
      const result = await api.system.sync({ years: 5 })
      setSyncInfo(`${result.rows_written.toLocaleString()} rows across ${result.tickers.length} tickers`)
      refetch()
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    setContext({
      page: 'dashboard',
      ticker: focusTicker,
      headlines: data?.headlines?.slice(0, 6) ?? [],
      leaders: data?.momentum_leaders?.slice(0, 6) ?? [],
    })
  }, [data, focusTicker, setContext])

  return (
    <div className="col" style={{ height: '100%', minHeight: 0 }}>
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Terminal Overview</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Terminal Workspace
            </span>
            <button className="term-btn" onClick={refetch}>
              <RefreshCw size={11} />
              Refresh
            </button>
          </div>
        </div>
        <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 8 }}>
          <div className="col">
            <div className="metric-card" style={{ padding: 10 }}>
              <div className="metric-label">Focus Ticker</div>
              <input
                className="term-input"
                value={tickerInput}
                onChange={(e) => startTransition(() => setTickerInput(e.target.value.toUpperCase()))}
                placeholder="SPY"
              />
              <div style={{ marginTop: 8, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Live market workspace. Enter a symbol and jump straight into the security monitor.
              </div>
            </div>

            <div className="metric-card" style={{ padding: 10 }}>
              <div className="metric-label">Terminal Actions</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
                <button className="term-btn" onClick={() => navigate('/screener')}>
                  <ScanSearch size={11} />
                  Screener
                </button>
                <button className="term-btn" onClick={() => navigate('/backtest')}>
                  <TestTubeDiagonal size={11} />
                  Backtest
                </button>
                <button className="term-btn" onClick={() => navigate(`/security/${focusTicker}`)}>
                  <Radar size={11} />
                  Security
                </button>
                <button className="term-btn" onClick={syncMarket} disabled={syncing}>
                  <RefreshCw size={11} />
                  {syncing ? 'Syncing…' : 'Sync'}
                </button>
              </div>
            </div>

            <div className="panel" style={{ minHeight: 0 }}>
              <div className="panel-header">
                <span className="panel-title">Market Sync</span>
              </div>
              <div className="panel-body">
                <SyncTelemetry status={syncStatus} />
                <div className="metric-grid">
                  <div className="metric-card">
                    <div className="metric-label">Default Focus</div>
                    <div className="metric-value">SPY</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">Universe</div>
                    <div className="metric-value" style={{ fontSize: 'var(--text-sm)' }}>
                      {data ? `${data.universe_size} tracked` : 'SP500 + ETFs'}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Price history, breadth, and screener inputs are populated from the tracked S&amp;P 500 universe plus major index and sector ETFs. The tape above is informational only and follows startup, scheduled, and manual refresh activity.
                </div>
                {syncInfo && (
                  <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--blue)' }}>
                    {syncInfo}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="col" style={{ minWidth: 0 }}>
            {loading ? (
              <div className="panel">
                <div className="panel-body">
                  <div className="loading-bar" style={{ width: '100%' }} />
                </div>
              </div>
            ) : error || !data ? (
              <div className="panel">
                <div className="panel-body">
                  <div className="empty-state">{error ?? 'Terminal workspace unavailable'}</div>
                </div>
              </div>
            ) : (
              <>
                <div className="metric-grid">
                  {data.stats.map((stat) => (
                    <div key={stat.label} className="metric-card">
                      <div className="metric-label">{stat.label}</div>
                      <div className="metric-value" style={{ color: toneColor(stat.tone) }}>{stat.value}</div>
                      {stat.change && (
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                          {stat.change}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="grid-3" style={{ minHeight: 0 }}>
                  <MoverTable title="Momentum Leaders" rows={data.momentum_leaders} onOpen={(ticker) => navigate(`/security/${ticker}`)} />
                  <MoverTable title="Reversal Candidates" rows={data.reversal_candidates} onOpen={(ticker) => navigate(`/security/${ticker}`)} />
                  <MoverTable title="Breakouts" rows={data.breakouts} onOpen={(ticker) => navigate(`/security/${ticker}`)} />
                </div>

                <div className="panel" style={{ minHeight: 0 }}>
                  <div className="panel-header">
                    <span className="panel-title">Workflow Headlines</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      {data.generated_at.slice(0, 19).replace('T', ' ')} UTC
                    </span>
                  </div>
                  <div className="panel-body no-pad">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Key</th>
                          <th>Headline</th>
                          <th>Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.headlines.map((item) => (
                          <tr key={`${item.ticker}-${item.headline}`}>
                            <td>
                              <span className="badge badge-orange">{item.ticker}</span>
                            </td>
                            <td style={{ color: toneColor(item.tone), fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)' }}>
                              {item.headline}
                            </td>
                            <td style={{ whiteSpace: 'normal', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>
                              {item.detail}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
