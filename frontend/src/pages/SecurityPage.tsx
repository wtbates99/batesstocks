import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Bot, Radar, ScanSearch, TestTubeDiagonal } from 'lucide-react'
import { api } from '../api/client'
import TerminalChart from '../components/charts/TerminalChart'
import { useAiContext } from '../contexts/AiContext'
import { useApi } from '../hooks/useApi'

function fmt(value: number | null | undefined, digits = 2) {
  if (value == null) return '—'
  return value.toFixed(digits)
}

function fmtPct(value: number | null | undefined) {
  if (value == null) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function fmtLarge(value: number | null | undefined) {
  if (value == null) return '—'
  if (Math.abs(value) >= 1e12) return `${(value / 1e12).toFixed(2)}T`
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  return value.toFixed(0)
}

function signalToneColor(tone: string) {
  if (tone === 'positive') return 'var(--green)'
  if (tone === 'negative') return 'var(--red)'
  if (tone === 'warning') return 'var(--orange)'
  return 'var(--text-primary)'
}

function priceToneClass(value: number | null | undefined) {
  if (value == null) return 'flat'
  return value >= 0 ? 'up' : 'down'
}

export default function SecurityPage() {
  const navigate = useNavigate()
  const params = useParams<{ ticker: string }>()
  const ticker = (params.ticker ?? 'SPY').toUpperCase()
  const { setContext, openAi } = useAiContext()
  const { data, loading, error } = useApi(() => api.terminal.security(ticker, 220), [ticker])

  useEffect(() => {
    if (!data) return
    setContext({
      page: 'security',
      ticker,
      name: data.snapshot.name,
      sector: data.snapshot.sector,
      techScore: data.snapshot.tech_score,
      rsi: data.snapshot.rsi,
      latestClose: data.snapshot.close,
    })
  }, [data, setContext, ticker])

  if (loading) {
    return <div className="panel"><div className="panel-body"><div className="loading-bar" style={{ width: '100%' }} /></div></div>
  }

  if (error || !data) {
    return <div className="panel"><div className="panel-body"><div className="empty-state">{error ?? 'Security not available'}</div></div></div>
  }

  return (
    <div className="col" style={{ height: '100%', minHeight: 0 }}>
      <div className="security-header">
        <div>
          <div className="security-kicker">{data.snapshot.sector ?? 'Market'} / {data.snapshot.subsector ?? 'Security'}</div>
          <div className="security-title-row">
            <div className="security-ticker">{data.snapshot.ticker}</div>
            <div className="security-name">{data.snapshot.name ?? 'Unknown Instrument'}</div>
          </div>
        </div>
        <div className="security-actions">
          <button className="term-btn" onClick={() => navigate('/screener')}>
            <ScanSearch size={11} />
            Screen
          </button>
          <button className="term-btn" onClick={() => navigate('/backtest')}>
            <TestTubeDiagonal size={11} />
            Backtest
          </button>
          <button
            className="term-btn primary"
            onClick={() => openAi(`Analyze ${ticker} using its current trend, RSI, MACD, and related names.`)}
          >
            <Bot size={11} />
            Ask AI
          </button>
        </div>
      </div>

      <div className="security-grid">
        <div className="security-main">
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Price / Trend</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {data.generated_at.slice(0, 19).replace('T', ' ')} UTC
              </span>
            </div>
            <div className="panel-body no-pad">
              <TerminalChart bars={data.bars} height={392} />
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Daily Bars</span>
            </div>
            <div className="panel-body no-pad security-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th style={{ textAlign: 'right' }}>Open</th>
                    <th style={{ textAlign: 'right' }}>High</th>
                    <th style={{ textAlign: 'right' }}>Low</th>
                    <th style={{ textAlign: 'right' }}>Close</th>
                    <th style={{ textAlign: 'right' }}>RSI</th>
                    <th style={{ textAlign: 'right' }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bars.slice(-20).reverse().map((bar) => (
                    <tr key={bar.date}>
                      <td>{bar.date}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(bar.open)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(bar.high)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(bar.low)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(bar.close)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(bar.rsi, 1)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(bar.tech_score, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="security-side">
          <div className="metric-grid">
            <div className="metric-card">
              <div className="metric-label">Last</div>
              <div className="metric-value">{fmt(data.snapshot.close)}</div>
              <div className={priceToneClass(data.snapshot.change_pct)}>
                {fmtPct(data.snapshot.change_pct)}
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Tech Score</div>
              <div className="metric-value">{fmt(data.snapshot.tech_score, 0)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">RSI</div>
              <div className="metric-value">{fmt(data.snapshot.rsi, 1)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Market Cap</div>
              <div className="metric-value">{fmtLarge(data.snapshot.market_cap)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Volume</div>
              <div className="metric-value">{fmtLarge(data.snapshot.volume)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Trend</div>
              <div className="metric-value" style={{ fontSize: 'var(--text-sm)' }}>
                {data.snapshot.above_sma_200 && data.snapshot.above_sma_250 ? '200/250 Up' : 'Mixed'}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Signal Stack</span>
            </div>
            <div className="panel-body">
              <div className="security-signal-list">
                {data.signals.map((signal) => (
                  <div key={signal.label} className="security-signal-item">
                    <div className="security-signal-label">{signal.label}</div>
                    <div className="security-signal-value" style={{ color: signalToneColor(signal.tone) }}>
                      {signal.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Related Names</span>
            </div>
            <div className="panel-body no-pad">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Name</th>
                    <th style={{ textAlign: 'right' }}>Px</th>
                    <th style={{ textAlign: 'right' }}>Chg</th>
                  </tr>
                </thead>
                <tbody>
                  {data.related.map((row) => (
                    <tr key={row.ticker} onClick={() => navigate(`/security/${row.ticker}`)} style={{ cursor: 'pointer' }}>
                      <td className="col-ticker">{row.ticker}</td>
                      <td className="col-name">{row.name ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(row.last_price)}</td>
                      <td style={{ textAlign: 'right' }} className={priceToneClass(row.change_pct)}>
                        {fmtPct(row.change_pct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Command Shortcuts</span>
            </div>
            <div className="panel-body">
              <div className="security-command-list">
                <button className="term-btn" onClick={() => openAi(`Summarize ${ticker}'s current technical posture.`)}>
                  <Radar size={10} />
                  Technical Summary
                </button>
                <button className="term-btn" onClick={() => openAi(`Generate a breakout strategy idea for ${ticker}.`)}>
                  <Bot size={10} />
                  Strategy Idea
                </button>
                <button className="term-btn" onClick={() => openAi(`Explain the recent behavior of ${ticker} versus peers.`)}>
                  <Bot size={10} />
                  Relative Strength
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
