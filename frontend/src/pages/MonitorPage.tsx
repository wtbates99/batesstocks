import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import NewsPanel from '../components/news/NewsPanel'
import BreadthStrip from '../components/app/BreadthStrip'
import { useMonitorQuery, useNewsQuery } from '../api/query'
import type { MonitorSector, SecurityListItem } from '../api/types'
import {
  formatCompactNumber,
  formatNumber,
  formatPercent,
  formatTimestamp,
  toneClass,
} from '../lib/formatters'
import { useTerminalStore } from '../state/terminalStore'

function heatColor(value: number | null | undefined, max = 12): string {
  if (value == null) return 'transparent'
  const intensity = Math.min(Math.abs(value) / max, 1)
  if (value > 0) return `rgba(80,200,90,${(intensity * 0.55).toFixed(2)})`
  return `rgba(220,60,60,${(intensity * 0.55).toFixed(2)})`
}

function SectorHeatmap({ sectors }: { sectors: MonitorSector[] }) {
  const cols = [
    { key: 'avg_change_pct' as const, label: '1D', max: 3 },
    { key: 'avg_return_20d' as const, label: '20D', max: 12 },
    { key: 'avg_rsi' as const, label: 'RSI', max: 0 },
    { key: 'pct_above_200d' as const, label: '>200D', max: 0 },
  ]
  return (
    <section className="terminal-panel panel-span-2">
      <div className="panel-header">
        <div className="panel-title">Sector Rotation</div>
        <div className="panel-meta">heat by return</div>
      </div>
      <div className="panel-table-wrap">
        <table className="terminal-table compact">
          <thead>
            <tr>
              <th>Sector</th>
              <th className="align-right">N</th>
              {cols.map((c) => <th key={c.key} className="align-right">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {sectors.map((s) => (
              <tr key={s.sector}>
                <td>
                  <Link to={`/sector/${encodeURIComponent(s.sector)}`} className="ticker-link">
                    {s.sector}
                  </Link>
                </td>
                <td className="align-right" style={{ color: 'var(--text-dim)' }}>{s.members}</td>
                <td className="align-right" style={{ background: heatColor(s.avg_change_pct, 3) }}>
                  <span className={toneClass(s.avg_change_pct)}>{formatPercent(s.avg_change_pct)}</span>
                </td>
                <td className="align-right" style={{ background: heatColor(s.avg_return_20d, 12) }}>
                  <span className={toneClass(s.avg_return_20d)}>{formatPercent(s.avg_return_20d)}</span>
                </td>
                <td className="align-right" style={{ background: s.avg_rsi != null ? heatColor((s.avg_rsi ?? 50) - 50, 20) : 'transparent' }}>
                  {formatNumber(s.avg_rsi, 1)}
                </td>
                <td className="align-right" style={{ background: s.pct_above_200d != null ? heatColor((s.pct_above_200d ?? 50) - 50, 50) : 'transparent' }}>
                  <span className={(s.pct_above_200d ?? 50) >= 60 ? 'tone-positive' : (s.pct_above_200d ?? 50) <= 40 ? 'tone-negative' : ''}>
                    {formatPercent(s.pct_above_200d, 0)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

type RankedView = 'leaders' | 'laggards' | 'active' | 'surge' | 'rsi_hi' | 'rsi_lo'

const VIEW_LABELS: Record<RankedView, string> = {
  leaders: 'Leaders',
  laggards: 'Laggards',
  active: 'Most Active',
  surge: 'Volume Surge',
  rsi_hi: 'RSI Overbought',
  rsi_lo: 'RSI Oversold',
}

function RankedTable({
  title,
  rows,
  meta,
}: {
  title: string
  rows: SecurityListItem[]
  meta?: string
}) {
  return (
    <section className="terminal-panel">
      <div className="panel-header">
        <div className="panel-title">{title}</div>
        {meta && <div className="panel-meta">{meta}</div>}
      </div>
      <div className="panel-table-wrap">
        <table className="terminal-table compact">
          <thead>
            <tr>
              <th>#</th>
              <th>Ticker</th>
              <th>Name</th>
              <th className="align-right">Day</th>
              <th className="align-right">20D</th>
              <th className="align-right">RSI</th>
              <th className="align-right">Score</th>
              <th className="align-right">Vol</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${title}-${row.ticker}`}>
                <td style={{ color: 'var(--text-dim)', width: 24 }}>{i + 1}</td>
                <td>
                  <Link to={`/security/${row.ticker}`} className="ticker-link">
                    {row.ticker}
                  </Link>
                </td>
                <td
                  style={{
                    color: 'var(--text-muted)',
                    maxWidth: 130,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.name ?? '—'}
                </td>
                <td className={`align-right ${toneClass(row.change_pct)}`}>
                  {formatPercent(row.change_pct)}
                </td>
                <td className={`align-right ${toneClass(row.return_20d)}`}>
                  {formatPercent(row.return_20d)}
                </td>
                <td
                  className={`align-right ${
                    (row.rsi ?? 50) >= 70
                      ? 'tone-negative'
                      : (row.rsi ?? 50) <= 30
                        ? 'tone-positive'
                        : ''
                  }`}
                >
                  {formatNumber(row.rsi, 1)}
                </td>
                <td
                  className={`align-right ${(row.tech_score ?? 0) >= 65 ? 'tone-positive' : ''}`}
                >
                  {formatNumber(row.tech_score, 0)}
                </td>
                <td className="align-right">{formatCompactNumber(row.volume)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function MonitorPage() {
  const monitor = useMonitorQuery()
  const news = useNewsQuery(['SPY', 'QQQ', 'IWM', 'TLT', 'GLD'], 'monitor', 12)
  const [activeView, setActiveView] = useState<RankedView>('leaders')
  const navigate = useNavigate()
  const { setCompareTickers, toggleWatchlist } = useTerminalStore(
    useShallow((state) => ({
      setCompareTickers: state.setCompareTickers,
      toggleWatchlist: state.toggleWatchlist,
    })),
  )

  if (monitor.isPending) {
    return <div className="state-panel loading-state">Loading market monitor…</div>
  }

  if (monitor.isError || !monitor.data) {
    return (
      <div className="state-panel error-state">
        {monitor.error instanceof Error ? monitor.error.message : 'Monitor unavailable.'}
      </div>
    )
  }

  const data = monitor.data

  const activeRows: Record<RankedView, SecurityListItem[]> = {
    leaders: data.leaders,
    laggards: data.laggards,
    active: data.most_active,
    surge: data.volume_surge,
    rsi_hi: data.rsi_high,
    rsi_lo: data.rsi_low,
  }

  const activeMeta: Record<RankedView, string> = {
    leaders: '20D return',
    laggards: '20D return ↓',
    active: 'by volume',
    surge: 'vol / avg-vol',
    rsi_hi: 'RSI ≥ 70',
    rsi_lo: 'RSI ≤ 30',
  }

  return (
    <div className="monitor-page-grid">
      {/* ── Breadth strip spanning 2 cols ─────────────────────────── */}
      <section className="terminal-panel panel-span-2">
        <div className="panel-header">
          <div className="panel-title">Market Breadth</div>
          <div className="panel-meta">
            {data.universe_size} symbols · {formatTimestamp(data.generated_at)}
          </div>
        </div>
        <BreadthStrip stats={data.breadth} universeSize={data.universe_size} />

        {/* View selector strip */}
        <div
          style={{
            display: 'flex',
            gap: 1,
            padding: '6px 10px',
            borderBottom: '1px solid var(--line)',
            flexWrap: 'wrap',
          }}
        >
          {(Object.keys(VIEW_LABELS) as RankedView[]).map((view) => (
            <button
              key={view}
              type="button"
              className={`toolbar-chip${activeView === view ? ' is-active' : ''}`}
              onClick={() => setActiveView(view)}
            >
              {VIEW_LABELS[view]}
            </button>
          ))}
        </div>

        {/* Active ranked view inline */}
        <div className="panel-table-wrap">
          <table className="terminal-table compact">
            <thead>
              <tr>
                <th>#</th>
                <th>Ticker</th>
                <th>Name</th>
                <th className="align-right">Day</th>
                <th className="align-right">20D</th>
                <th className="align-right">RSI</th>
                <th className="align-right">Score</th>
                <th className="align-right">Vol</th>
                <th>Flow</th>
              </tr>
            </thead>
            <tbody>
              {activeRows[activeView].map((row, i) => (
                <tr key={`active-${row.ticker}`}>
                  <td style={{ color: 'var(--text-dim)', width: 24 }}>{i + 1}</td>
                  <td>
                    <Link to={`/security/${row.ticker}`} className="ticker-link">
                      {row.ticker}
                    </Link>
                  </td>
                  <td style={{ color: 'var(--text-muted)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.name ?? '—'}
                  </td>
                  <td className={`align-right ${toneClass(row.change_pct)}`}>{formatPercent(row.change_pct)}</td>
                  <td className={`align-right ${toneClass(row.return_20d)}`}>{formatPercent(row.return_20d)}</td>
                  <td className={`align-right ${(row.rsi ?? 50) >= 70 ? 'tone-negative' : (row.rsi ?? 50) <= 30 ? 'tone-positive' : ''}`}>
                    {formatNumber(row.rsi, 1)}
                  </td>
                  <td className={`align-right ${(row.tech_score ?? 0) >= 65 ? 'tone-positive' : ''}`}>
                    {formatNumber(row.tech_score, 0)}
                  </td>
                  <td className="align-right">{formatCompactNumber(row.volume)}</td>
                  <td>
                    <div className="table-actions">
                      <button type="button" className="table-action" onClick={() => toggleWatchlist(row.ticker)}>WL</button>
                      <button type="button" className="table-action" onClick={() => { setCompareTickers([row.ticker, 'SPY']); navigate('/compare') }}>COMP</button>
                      <button type="button" className="table-action" onClick={() => navigate(`/backtest?ticker=${row.ticker}`)}>BT</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Sector rotation heatmap ───────────────────────────────── */}
      <SectorHeatmap sectors={data.sectors} />

      {/* ── All ranked views (always visible below) ───────────────── */}
      <RankedTable title="Leaders" rows={data.leaders} meta={activeMeta.leaders} />
      <RankedTable title="Laggards" rows={data.laggards} meta={activeMeta.laggards} />
      <RankedTable title="Most Active" rows={data.most_active} meta={activeMeta.active} />
      <RankedTable title="Volume Surge" rows={data.volume_surge} meta={activeMeta.surge} />
      <RankedTable title="RSI Overbought" rows={data.rsi_high} meta={activeMeta.rsi_hi} />
      <RankedTable title="RSI Oversold" rows={data.rsi_low} meta={activeMeta.rsi_lo} />

      <NewsPanel
        title="Market News"
        items={news.data?.items ?? []}
        loading={news.isPending}
        empty="Market monitor news will populate from broad-market and macro proxies."
      />
    </div>
  )
}
