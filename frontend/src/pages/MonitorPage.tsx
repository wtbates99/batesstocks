import { useState } from 'react'
import { Link } from 'react-router-dom'
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

function SectorTable({ sectors }: { sectors: MonitorSector[] }) {
  return (
    <section className="terminal-panel">
      <div className="panel-header">
        <div className="panel-title">Sector Rank</div>
        <div className="panel-meta">ranked by 20D return</div>
      </div>
      <div className="panel-table-wrap">
        <table className="terminal-table compact">
          <thead>
            <tr>
              <th>#</th>
              <th>Sector</th>
              <th className="align-right">N</th>
              <th className="align-right">Day</th>
              <th className="align-right">20D</th>
              <th className="align-right">RSI</th>
              <th className="align-right">% &gt;200D</th>
            </tr>
          </thead>
          <tbody>
            {sectors.map((sector, i) => (
              <tr key={sector.sector}>
                <td style={{ color: 'var(--text-dim)', width: 24 }}>{i + 1}</td>
                <td>
                  <Link
                    to={`/sector/${encodeURIComponent(sector.sector)}`}
                    className="ticker-link"
                  >
                    {sector.sector}
                  </Link>
                </td>
                <td className="align-right" style={{ color: 'var(--text-dim)' }}>
                  {sector.members}
                </td>
                <td className={`align-right ${toneClass(sector.avg_change_pct)}`}>
                  {formatPercent(sector.avg_change_pct)}
                </td>
                <td className={`align-right ${toneClass(sector.avg_return_20d)}`}>
                  {formatPercent(sector.avg_return_20d)}
                </td>
                <td className="align-right">{formatNumber(sector.avg_rsi, 1)}</td>
                <td
                  className={`align-right ${
                    (sector.pct_above_200d ?? 0) >= 60
                      ? 'tone-positive'
                      : (sector.pct_above_200d ?? 0) <= 40
                        ? 'tone-negative'
                        : 'tone-warning'
                  }`}
                >
                  {formatPercent(sector.pct_above_200d, 0)}
                </td>
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

      {/* ── Sector rank table ─────────────────────────────────────── */}
      <SectorTable sectors={data.sectors} />

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
