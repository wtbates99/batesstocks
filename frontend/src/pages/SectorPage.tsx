import { Link, useNavigate, useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import NewsPanel from '../components/news/NewsPanel'
import { useNewsQuery, useSectorQuery } from '../api/query'
import type { SecurityListItem } from '../api/types'
import {
  formatCompactNumber,
  formatNumber,
  formatPercent,
  formatTimestamp,
  toneClass,
  toneFromLabel,
} from '../lib/formatters'
import { useTerminalStore } from '../state/terminalStore'

function SectorRankTable({
  title,
  items,
}: {
  title: string
  items: SecurityListItem[]
}) {
  return (
    <section className="terminal-panel">
      <div className="panel-header">
        <div className="panel-title">{title}</div>
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
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={`${title}-${item.ticker}`}>
                <td style={{ color: 'var(--text-dim)', width: 24 }}>{i + 1}</td>
                <td>
                  <Link to={`/security/${item.ticker}`} className="ticker-link">
                    {item.ticker}
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
                  {item.name ?? '—'}
                </td>
                <td className={`align-right ${toneClass(item.change_pct)}`}>
                  {formatPercent(item.change_pct)}
                </td>
                <td className={`align-right ${toneClass(item.return_20d)}`}>
                  {formatPercent(item.return_20d)}
                </td>
                <td
                  className={`align-right ${
                    (item.rsi ?? 50) >= 70
                      ? 'tone-negative'
                      : (item.rsi ?? 50) <= 30
                        ? 'tone-positive'
                        : ''
                  }`}
                >
                  {formatNumber(item.rsi, 1)}
                </td>
                <td
                  className={`align-right ${(item.tech_score ?? 0) >= 65 ? 'tone-positive' : ''}`}
                >
                  {formatNumber(item.tech_score, 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function SectorPage() {
  const navigate = useNavigate()
  const { sector: routeSector } = useParams<{ sector: string }>()
  const sector = decodeURIComponent(routeSector ?? '')
  const data = useSectorQuery(sector, Boolean(sector))
  const { toggleWatchlist, setCompareTickers } = useTerminalStore(
    useShallow((state) => ({
      toggleWatchlist: state.toggleWatchlist,
      setCompareTickers: state.setCompareTickers,
    })),
  )

  const newsUniverse = data.data?.members.slice(0, 8).map((item) => item.ticker) ?? []
  const news = useNewsQuery(newsUniverse, `sector-${sector}`, 14, newsUniverse.length > 0)

  if (data.isPending) {
    return <div className="state-panel">Loading sector drilldown for {sector}…</div>
  }

  if (data.isError || !data.data) {
    return (
      <div className="state-panel error-state">
        {data.error instanceof Error ? data.error.message : 'Sector unavailable.'}
      </div>
    )
  }

  const overview = data.data

  return (
    <div className="monitor-page-grid">
      {/* ── Sector header + stats ─────────────────────────────── */}
      <section className="terminal-panel panel-span-2">
        <div className="panel-header">
          <div className="panel-title">{overview.sector} Drilldown</div>
          <div className="panel-meta">
            {overview.members.length} names · {formatTimestamp(overview.generated_at)}
          </div>
        </div>
        <div className="stats-row">
          {overview.summary.map((stat) => (
            <div key={stat.label} className="stats-cell">
              <div className="stats-label">{stat.label}</div>
              <div className={`stats-value ${toneFromLabel(stat.tone)}`}>{stat.value}</div>
              {stat.change && <div className="stats-sub">{stat.change}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* ── Leaders / Laggards ───────────────────────────────── */}
      <SectorRankTable title="Sector Leaders" items={overview.leaders} />
      <SectorRankTable title="Sector Laggards" items={overview.laggards} />

      {/* ── Full member table ────────────────────────────────── */}
      <section className="terminal-panel panel-span-2">
        <div className="panel-header">
          <div className="panel-title">Sector Members</div>
          <div className="panel-meta">{overview.members.length} names</div>
        </div>
        <div className="panel-table-wrap">
          <table className="terminal-table compact">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Name</th>
                <th className="align-right">Px</th>
                <th className="align-right">Day</th>
                <th className="align-right">20D</th>
                <th className="align-right">63D</th>
                <th className="align-right">RSI</th>
                <th className="align-right">Score</th>
                <th className="align-right">Vol</th>
                <th>Flow</th>
              </tr>
            </thead>
            <tbody>
              {overview.members.map((item) => (
                <tr key={item.ticker}>
                  <td>
                    <Link to={`/security/${item.ticker}`} className="ticker-link">
                      {item.ticker}
                    </Link>
                  </td>
                  <td
                    style={{
                      color: 'var(--text-muted)',
                      maxWidth: 140,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.name ?? '—'}
                  </td>
                  <td className="align-right">{formatNumber(item.close)}</td>
                  <td className={`align-right ${toneClass(item.change_pct)}`}>
                    {formatPercent(item.change_pct)}
                  </td>
                  <td className={`align-right ${toneClass(item.return_20d)}`}>
                    {formatPercent(item.return_20d)}
                  </td>
                  <td className={`align-right ${toneClass(item.return_63d)}`}>
                    {formatPercent(item.return_63d)}
                  </td>
                  <td
                    className={`align-right ${
                      (item.rsi ?? 50) >= 70
                        ? 'tone-negative'
                        : (item.rsi ?? 50) <= 30
                          ? 'tone-positive'
                          : ''
                    }`}
                  >
                    {formatNumber(item.rsi, 1)}
                  </td>
                  <td
                    className={`align-right ${(item.tech_score ?? 0) >= 65 ? 'tone-positive' : ''}`}
                  >
                    {formatNumber(item.tech_score, 0)}
                  </td>
                  <td className="align-right">{formatCompactNumber(item.volume)}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="table-action"
                        onClick={() => toggleWatchlist(item.ticker)}
                      >
                        WATCH
                      </button>
                      <button
                        type="button"
                        className="table-action"
                        onClick={() => {
                          setCompareTickers([
                            item.ticker,
                            'SPY',
                            ...overview.leaders
                              .filter((row) => row.ticker !== item.ticker)
                              .slice(0, 2)
                              .map((row) => row.ticker),
                          ])
                          navigate('/compare')
                        }}
                      >
                        COMP
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <NewsPanel
        title={`${overview.sector} News`}
        items={news.data?.items ?? []}
        loading={news.isPending}
        empty="Sector headlines will appear here from the highest-ranked names in this group."
      />
    </div>
  )
}
