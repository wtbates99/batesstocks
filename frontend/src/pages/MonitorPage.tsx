import { Link } from 'react-router-dom'
import NewsPanel from '../components/news/NewsPanel'
import { useMonitorQuery, useNewsQuery } from '../api/query'
import type { SecurityListItem } from '../api/types'
import { formatCompactNumber, formatNumber, formatPercent, formatTimestamp } from '../lib/formatters'

function RankedTable({ title, rows }: { title: string; rows: SecurityListItem[] }) {
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
              <th className="align-right">Vol</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${title}-${row.ticker}`}>
                <td><Link to={`/security/${row.ticker}`} className="ticker-link">{row.ticker}</Link></td>
                <td>{row.name ?? '—'}</td>
                <td className="align-right">{formatPercent(row.change_pct)}</td>
                <td className="align-right">{formatPercent(row.return_20d)}</td>
                <td className="align-right">{formatNumber(row.rsi, 1)}</td>
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

  if (monitor.isPending) {
    return <div className="state-panel">Loading market monitor…</div>
  }

  if (monitor.isError || !monitor.data) {
    return <div className="state-panel error-state">{monitor.error instanceof Error ? monitor.error.message : 'Monitor unavailable.'}</div>
  }

  const data = monitor.data

  return (
    <div className="monitor-page-grid">
      <section className="terminal-panel panel-span-2">
        <div className="panel-header">
          <div className="panel-title">Market Breadth</div>
          <div className="panel-meta">{formatTimestamp(data.generated_at)}</div>
        </div>
        <div className="monitor-grid">
          {data.breadth.map((stat) => (
            <div key={stat.label} className="monitor-cell">
              <div className="monitor-label">{stat.label}</div>
              <div className="monitor-value">{stat.value}</div>
              <div className="monitor-subvalue">{stat.change ?? ' '}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Sector Matrix</div>
        </div>
        <div className="panel-table-wrap">
          <table className="terminal-table">
            <thead>
              <tr>
                <th>Sector</th>
                <th className="align-right">Members</th>
                <th className="align-right">Day</th>
                <th className="align-right">20D</th>
                <th className="align-right">RSI</th>
                <th className="align-right">% &gt; 200D</th>
              </tr>
            </thead>
            <tbody>
              {data.sectors.map((sector) => (
                <tr key={sector.sector}>
                  <td><Link to={`/sector/${encodeURIComponent(sector.sector)}`} className="ticker-link">{sector.sector}</Link></td>
                  <td className="align-right">{sector.members}</td>
                  <td className="align-right">{formatPercent(sector.avg_change_pct)}</td>
                  <td className="align-right">{formatPercent(sector.avg_return_20d)}</td>
                  <td className="align-right">{formatNumber(sector.avg_rsi, 1)}</td>
                  <td className="align-right">{formatPercent(sector.pct_above_200d, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <RankedTable title="Leaders" rows={data.leaders} />
      <RankedTable title="Laggards" rows={data.laggards} />
      <RankedTable title="Most Active" rows={data.most_active} />
      <RankedTable title="Volume Surge" rows={data.volume_surge} />
      <RankedTable title="RSI High" rows={data.rsi_high} />
      <RankedTable title="RSI Low" rows={data.rsi_low} />

      <NewsPanel
        title="Market News"
        items={news.data?.items ?? []}
        empty="Market monitor news will populate from broad-market and macro proxies."
      />
    </div>
  )
}
