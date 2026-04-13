import { Link, useNavigate, useParams } from 'react-router-dom'
import NewsPanel from '../components/news/NewsPanel'
import { useNewsQuery, useSectorQuery } from '../api/query'
import type { SecurityListItem } from '../api/types'
import { formatCompactNumber, formatNumber, formatPercent, formatTimestamp } from '../lib/formatters'
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
        <table className="terminal-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Name</th>
              <th className="align-right">Day</th>
              <th className="align-right">20D</th>
              <th className="align-right">RSI</th>
              <th className="align-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${title}-${item.ticker}`}>
                <td><Link to={`/security/${item.ticker}`} className="ticker-link">{item.ticker}</Link></td>
                <td>{item.name ?? '—'}</td>
                <td className="align-right">{formatPercent(item.change_pct)}</td>
                <td className="align-right">{formatPercent(item.return_20d)}</td>
                <td className="align-right">{formatNumber(item.rsi, 1)}</td>
                <td className="align-right">{formatNumber(item.tech_score, 0)}</td>
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
  const { toggleWatchlist, setCompareTickers } = useTerminalStore((state) => ({
    toggleWatchlist: state.toggleWatchlist,
    setCompareTickers: state.setCompareTickers,
  }))

  const newsUniverse = data.data?.members.slice(0, 8).map((item) => item.ticker) ?? []
  const news = useNewsQuery(newsUniverse, `sector-${sector}`, 14, newsUniverse.length > 0)

  if (data.isPending) {
    return <div className="state-panel">Loading sector drilldown for {sector}…</div>
  }

  if (data.isError || !data.data) {
    return <div className="state-panel error-state">{data.error instanceof Error ? data.error.message : 'Sector unavailable.'}</div>
  }

  const overview = data.data

  return (
    <div className="monitor-page-grid">
      <section className="terminal-panel panel-span-2">
        <div className="panel-header">
          <div className="panel-title">{overview.sector} Drilldown</div>
          <div className="panel-meta">{formatTimestamp(overview.generated_at)}</div>
        </div>
        <div className="monitor-grid">
          {overview.summary.map((stat) => (
            <div key={stat.label} className="monitor-cell">
              <div className="monitor-label">{stat.label}</div>
              <div className="monitor-value">{stat.value}</div>
              <div className="monitor-subvalue">{stat.change ?? ' '}</div>
            </div>
          ))}
        </div>
      </section>

      <SectorRankTable title="Sector Leaders" items={overview.leaders} />
      <SectorRankTable title="Sector Laggards" items={overview.laggards} />

      <section className="terminal-panel panel-span-2">
        <div className="panel-header">
          <div className="panel-title">Sector Members</div>
          <div className="panel-meta">{overview.members.length} names</div>
        </div>
        <div className="panel-table-wrap">
          <table className="terminal-table">
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
                  <td><Link to={`/security/${item.ticker}`} className="ticker-link">{item.ticker}</Link></td>
                  <td>{item.name ?? '—'}</td>
                  <td className="align-right">{formatNumber(item.close)}</td>
                  <td className="align-right">{formatPercent(item.change_pct)}</td>
                  <td className="align-right">{formatPercent(item.return_20d)}</td>
                  <td className="align-right">{formatPercent(item.return_63d)}</td>
                  <td className="align-right">{formatNumber(item.rsi, 1)}</td>
                  <td className="align-right">{formatNumber(item.tech_score, 0)}</td>
                  <td className="align-right">{formatCompactNumber(item.volume)}</td>
                  <td>
                    <div className="table-actions">
                      <button type="button" className="table-action" onClick={() => toggleWatchlist(item.ticker)}>WATCH</button>
                      <button
                        type="button"
                        className="table-action"
                        onClick={() => {
                          setCompareTickers([item.ticker, 'SPY', ...overview.leaders.filter((row) => row.ticker !== item.ticker).slice(0, 2).map((row) => row.ticker)])
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
        empty="Sector headlines will appear here from the highest-ranked names in this group."
      />
    </div>
  )
}
