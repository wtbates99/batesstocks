import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import NewsPanel from '../components/news/NewsPanel'
import { useLivePricesQuery, useNewsQuery, useWorkspaceQuery } from '../api/query'
import type { TerminalMover } from '../api/types'
import { formatCompactNumber, formatNumber, formatPercent, formatTimestamp, toneFromLabel } from '../lib/formatters'
import { getActiveWatchlist, useTerminalStore } from '../state/terminalStore'

function DataTable({
  title,
  rows,
}: {
  title: string
  rows: TerminalMover[]
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
              <th className="align-right">Px</th>
              <th className="align-right">Chg</th>
              <th className="align-right">Score</th>
              <th className="align-right">Vol</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${title}-${row.ticker}`}>
                <td><Link to={`/security/${row.ticker}`} className="ticker-link">{row.ticker}</Link></td>
                <td>{row.name ?? '—'}</td>
                <td className="align-right">{formatNumber(row.last_price)}</td>
                <td className={`align-right ${row.change_pct != null && row.change_pct >= 0 ? 'tone-positive' : 'tone-negative'}`}>
                  {formatPercent(row.change_pct)}
                </td>
                <td className="align-right">{formatNumber(row.tech_score, 0)}</td>
                <td className="align-right">{formatCompactNumber(row.volume)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function DashboardPage() {
  const { activeTicker, watchlist, recentTickers, setAiContext } = useTerminalStore((state) => ({
    activeTicker: state.activeTicker,
    watchlist: getActiveWatchlist(state)?.symbols ?? [],
    recentTickers: state.recentTickers,
    setAiContext: state.setAiContext,
  }))
  const workspace = useWorkspaceQuery(activeTicker)
  const newsUniverse = Array.from(new Set([activeTicker, ...watchlist.slice(0, 5), ...recentTickers.slice(0, 4)])).slice(0, 6)
  const news = useNewsQuery(newsUniverse, 'dashboard', 10)
  const pulseUniverse = workspace.data
    ? [
      ...watchlist.slice(0, 6),
      ...recentTickers.slice(0, 6),
      activeTicker,
      ...workspace.data.momentum_leaders.slice(0, 3).map((row) => row.ticker),
      ...workspace.data.breakouts.slice(0, 3).map((row) => row.ticker),
    ]
    : watchlist
  const live = useLivePricesQuery(pulseUniverse)

  useEffect(() => {
    if (!workspace.data) return
    setAiContext({
      page: 'dashboard',
      ticker: activeTicker,
      momentum: workspace.data.momentum_leaders.slice(0, 5),
      breakouts: workspace.data.breakouts.slice(0, 5),
      universeSize: workspace.data.universe_size,
      watchlist,
      recentTickers,
    })
  }, [activeTicker, recentTickers, setAiContext, watchlist, workspace.data])

  if (workspace.isPending) {
    return <div className="state-panel">Loading workspace for {activeTicker}…</div>
  }

  if (workspace.isError || !workspace.data) {
    return <div className="state-panel error-state">{workspace.error instanceof Error ? workspace.error.message : 'Workspace unavailable.'}</div>
  }

  const overview = workspace.data
  const pulseSymbols = Array.from(new Set(pulseUniverse)).slice(0, 12)

  return (
    <div className="dashboard-grid">
      <section className="terminal-panel panel-span-2">
        <div className="panel-header">
          <div className="panel-title">Market Pulse</div>
          <div className="panel-meta">
            <span>{overview.focus_ticker} DEFAULT</span>
            <span>{formatTimestamp(overview.generated_at)}</span>
          </div>
        </div>
        <div className="monitor-grid">
          {overview.stats.map((stat) => (
            <div key={stat.label} className="monitor-cell">
              <div className="monitor-label">{stat.label}</div>
              <div className={`monitor-value ${toneFromLabel(stat.tone)}`}>{stat.value}</div>
              <div className="monitor-subvalue">{stat.change ?? ' '}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Quick Return</div>
        </div>
        <div className="quick-grid">
          {recentTickers.slice(0, 8).map((ticker) => (
            <Link key={ticker} to={`/security/${ticker}`} className="quick-card">
              <span className="ticker-link">{ticker}</span>
              <span>{formatNumber(live.data?.prices[ticker])}</span>
            </Link>
          ))}
        </div>
      </section>

      <NewsPanel
        title="News Triage"
        items={news.data?.items ?? []}
        empty="News will populate as the focus ticker and watchlist pull live coverage."
      />

      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Watchlist Board</div>
        </div>
        <div className="matrix-grid">
          {watchlist.slice(0, 12).map((ticker) => (
            <Link key={ticker} to={`/security/${ticker}`} className="matrix-cell">
              <span className="ticker-link">{ticker}</span>
              <span>{formatNumber(live.data?.prices[ticker])}</span>
            </Link>
          ))}
        </div>
      </section>

      <DataTable title="Momentum Leaders" rows={overview.momentum_leaders} />
      <DataTable title="Reversal Candidates" rows={overview.reversal_candidates} />
      <DataTable title="Breakout Shelf" rows={overview.breakouts} />

      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Pulse Matrix</div>
        </div>
        <div className="matrix-grid">
          {pulseSymbols.map((ticker) => (
            <Link key={ticker} to={`/security/${ticker}`} className="matrix-cell">
              <span className="ticker-link">{ticker}</span>
              <span>{formatNumber(live.data?.prices[ticker])}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
