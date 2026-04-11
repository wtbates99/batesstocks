import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ExternalLink, ChevronLeft, TrendingUp, TrendingDown } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { api } from '../api/client'
import CandleChart from '../components/charts/CandleChart'
import type { TechnicalSignal } from '../api/types'

function fmt(n: number | null | undefined, dec = 2): string {
  if (n == null) return '—'
  return n.toFixed(dec)
}

function fmtLarge(n: number | null | undefined): string {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (abs >= 1e9)  return `${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6)  return `${(n / 1e6).toFixed(2)}M`
  return n.toLocaleString()
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function SignalRow({ s }: { s: TechnicalSignal }) {
  const color = s.signal === 'bullish' ? 'var(--green)'
              : s.signal === 'bearish' ? 'var(--red)'
              : 'var(--yellow)'
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 60px 70px',
      gap: 8,
      padding: '3px 8px',
      borderBottom: '1px solid var(--border-muted)',
      alignItems: 'center',
    }}>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{s.label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{s.value}</span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
        color,
        textTransform: 'uppercase',
        textAlign: 'right',
      }}>
        {s.signal}
      </span>
    </div>
  )
}

export default function CompanyPage() {
  const { ticker } = useParams<{ ticker: string }>()
  const navigate = useNavigate()
  const t = ticker?.toUpperCase() ?? ''
  const [tab, setTab] = useState<'overview' | 'news' | 'options' | 'insider'>('overview')

  const { data: stockData, loading: chartLoading } = useApi(() => api.stock.data(t, 365), [t])
  const { data: info, loading: infoLoading } = useApi(() => api.stock.info(t), [t])
  const { data: technical } = useApi(() => api.stock.technical(t), [t])
  const { data: news } = useApi(() => api.stock.news(t), [t])
  const { data: peers } = useApi(() => api.stock.peers(t), [t])

  const latest = stockData?.[stockData.length - 1]
  const prev    = stockData?.[stockData.length - 2]
  const dayChg  = latest && prev ? latest.Ticker_Close - prev.Ticker_Close : null
  const dayPct  = dayChg && prev ? (dayChg / prev.Ticker_Close) * 100 : null
  const isUp    = (dayChg ?? 0) >= 0

  const overallColor = technical?.overall === 'bullish' ? 'var(--green)'
                     : technical?.overall === 'bearish' ? 'var(--red)'
                     : 'var(--yellow)'

  if (infoLoading) {
    return (
      <div style={{ padding: 16, display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-muted)' }}>
        <div className="spinner" /> Loading…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="term-btn" onClick={() => navigate(-1)}>
          <ChevronLeft size={12} />
        </button>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--orange)' }}>
              {t}
            </span>
            <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-secondary)' }}>
              {info?.FullName ?? info?.ShortName}
            </span>
            {info?.Exchange && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '1px 4px', border: '1px solid var(--border)', borderRadius: 2 }}>
                {info.Exchange}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 2 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xl)', fontWeight: 600, color: 'var(--text-primary)' }}>
              {fmt(latest?.Ticker_Close)}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-md)', color: isUp ? 'var(--green)' : 'var(--red)' }}>
              {dayChg != null ? `${isUp ? '+' : ''}${fmt(dayChg)}` : '—'}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-md)', color: isUp ? 'var(--green)' : 'var(--red)' }}>
              ({fmtPct(dayPct)})
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{latest?.Date?.slice(0, 10)}</span>
          </div>
        </div>

        {/* Key stats */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {[
            { label: 'Mkt Cap', value: fmtLarge(info?.MarketCap) },
            { label: 'P/E',     value: fmt(info?.PE, 1) },
            { label: 'EPS',     value: fmt(info?.EPS) },
            { label: 'Beta',    value: fmt(info?.Beta) },
            { label: 'Div Yld', value: info?.DividendYield != null ? `${(info.DividendYield * 100).toFixed(2)}%` : '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>{value}</div>
            </div>
          ))}

          {technical && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Signal</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: overallColor, fontWeight: 600, textTransform: 'uppercase' }}>
                {technical.overall}
              </div>
            </div>
          )}

          {info?.Website && (
            <a href={info.Website} target="_blank" rel="noopener noreferrer" className="term-btn" style={{ textDecoration: 'none' }}>
              <ExternalLink size={11} /> IR
            </a>
          )}
        </div>
      </div>

      {/* Main layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 8, flex: 1, minHeight: 0 }}>
        {/* Left: chart + tabs */}
        <div className="col" style={{ minHeight: 0, overflow: 'auto' }}>
          {/* Chart */}
          <div className="panel">
            <div className="panel-body no-pad">
              {chartLoading
                ? <div style={{ height: 460, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
                : stockData && stockData.length > 0
                  ? <CandleChart data={stockData} height={360} />
                  : <div className="empty-state">No chart data</div>
              }
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 1, borderBottom: '1px solid var(--border)' }}>
            {(['overview', 'news', 'options', 'insider'] as const).map(t => (
              <button
                key={t}
                className={`fn-key${tab === t ? ' active' : ''}`}
                style={{ border: 'none' }}
                onClick={() => setTab(t)}
              >
                <span className="fn-label">{t.toUpperCase()}</span>
              </button>
            ))}
          </div>

          {tab === 'overview' && info?.Description && (
            <div className="panel">
              <div className="panel-body">
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, userSelect: 'text' }}>
                  {info.Description}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
                  {[
                    { label: 'CEO',       value: info.CEO ?? '—' },
                    { label: 'Employees', value: info.Employees?.toLocaleString() ?? '—' },
                    { label: 'Sector',    value: info.Sector ?? '—' },
                    { label: 'Revenue',   value: fmtLarge(info.Revenue) },
                    { label: 'Gross Profit', value: fmtLarge(info.GrossProfit) },
                    { label: 'Free CF',   value: fmtLarge(info.FreeCashFlow) },
                  ].map(({ label, value }) => (
                    <div key={label} className="metric-card">
                      <div className="metric-label">{label}</div>
                      <div className="metric-value" style={{ fontSize: 'var(--text-sm)' }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'news' && (
            <div className="panel">
              <div className="panel-body no-pad">
                {news?.map((n, i) => (
                  <a
                    key={i}
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'flex', gap: 10, padding: '8px 10px', borderBottom: '1px solid var(--border-muted)', textDecoration: 'none', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    {n.thumbnail && (
                      <img src={n.thumbnail} alt="" style={{ width: 48, height: 36, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />
                    )}
                    <div>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', lineHeight: 1.3, marginBottom: 3 }}>{n.title}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                        {n.publisher} · {new Date(n.published_at).toLocaleDateString()}
                      </div>
                    </div>
                  </a>
                ))}
                {(!news || news.length === 0) && <div className="empty-state">No news</div>}
              </div>
            </div>
          )}
        </div>

        {/* Right: technicals + peers */}
        <div className="col" style={{ minHeight: 0, overflow: 'auto' }}>
          {/* RSI / score indicators */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Indicators</span>
            </div>
            <div className="panel-body">
              <div className="metric-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {[
                  { label: 'RSI',     value: fmt(latest?.Ticker_RSI, 1), color: latest?.Ticker_RSI != null ? (latest.Ticker_RSI > 70 ? 'var(--red)' : latest.Ticker_RSI < 30 ? 'var(--green)' : 'var(--text-primary)') : undefined },
                  { label: 'MACD',    value: fmt(latest?.Ticker_MACD) },
                  { label: 'Tech',    value: fmt(latest?.Ticker_Tech_Score, 1), color: 'var(--orange)' },
                  { label: 'MFI',     value: fmt(latest?.Ticker_MFI, 1) },
                  { label: 'SMA10',   value: fmt(latest?.Ticker_SMA_10) },
                  { label: 'SMA30',   value: fmt(latest?.Ticker_SMA_30) },
                  { label: 'Vol OBV', value: latest?.Ticker_On_Balance_Volume != null ? fmtLarge(latest.Ticker_On_Balance_Volume) : '—' },
                  { label: 'Williams', value: fmt(latest?.Ticker_Williams_R, 1) },
                ].map(({ label, value, color }) => (
                  <div key={label} className="metric-card">
                    <div className="metric-label">{label}</div>
                    <div className="metric-value" style={{ color }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Technical signals */}
          {technical && (
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Technical Signals</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: overallColor, fontWeight: 600, textTransform: 'uppercase' }}>
                  {technical.overall}
                </span>
              </div>
              <div className="panel-body no-pad">
                {technical.signals.map((s, i) => <SignalRow key={i} s={s} />)}
              </div>
            </div>
          )}

          {/* Peers */}
          {peers && peers.length > 0 && (
            <div className="panel">
              <div className="panel-header"><span className="panel-title">Peers</span></div>
              <div className="panel-body no-pad" style={{ overflow: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th style={{ textAlign: 'right' }}>Mkt Cap</th>
                      <th style={{ textAlign: 'right' }}>P/E</th>
                      <th style={{ textAlign: 'right' }}>RSI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {peers.map(p => (
                      <tr key={p.ticker}>
                        <td className="col-ticker" onClick={() => navigate(`/spotlight/${p.ticker}`)}>{p.ticker}</td>
                        <td style={{ textAlign: 'right' }}>{fmtLarge(p.market_cap)}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(p.pe, 1)}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(p.rsi, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
