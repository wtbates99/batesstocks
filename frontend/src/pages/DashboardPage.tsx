import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import NewsPanel from '../components/news/NewsPanel'
import BreadthStrip from '../components/app/BreadthStrip'
import DeltaPill from '../components/app/DeltaPill'
import { useLivePricesQuery, useNewsQuery, useWorkspaceQuery } from '../api/query'
import type { TerminalMover } from '../api/types'
import {
  formatCompactNumber,
  formatNumber,
  formatPercent,
  formatTimestamp,
  toneClass,
  toneFromLabel,
} from '../lib/formatters'
import { getActiveWatchlist, useTerminalStore } from '../state/terminalStore'

function MoverTable({
  title,
  rows,
  meta,
}: {
  title: string
  rows: TerminalMover[]
  meta?: string
}) {
  if (rows.length === 0) return null
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
                <td>
                  <Link to={`/security/${row.ticker}`} className="ticker-link">
                    {row.ticker}
                  </Link>
                </td>
                <td style={{ color: 'var(--text-muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.name ?? '—'}
                </td>
                <td className="align-right">{formatNumber(row.last_price)}</td>
                <td className={`align-right ${toneClass(row.change_pct)}`}>
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
  const { activeTicker, watchlist, recentTickers, setAiContext } = useTerminalStore(
    useShallow((state) => ({
      activeTicker: state.activeTicker,
      watchlist: getActiveWatchlist(state)?.symbols ?? [],
      recentTickers: state.recentTickers,
      setAiContext: state.setAiContext,
    })),
  )

  const workspace = useWorkspaceQuery(activeTicker)
  const newsUniverse = Array.from(
    new Set([activeTicker, ...watchlist.slice(0, 5), ...recentTickers.slice(0, 4)]),
  ).slice(0, 6)
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
    return <div className="state-panel loading-state">Loading workspace for {activeTicker}…</div>
  }

  if (workspace.isError || !workspace.data) {
    return (
      <div className="state-panel error-state">
        {workspace.error instanceof Error ? workspace.error.message : 'Workspace unavailable.'}
      </div>
    )
  }

  const overview = workspace.data
  const pulseSymbols = Array.from(new Set(pulseUniverse)).slice(0, 16)

  // Separate breadth stats from price stats for better rendering
  const breadthStats = overview.stats.slice(0, 5)
  const extendedStats = overview.stats.slice(5)

  return (
    <div className="dashboard-grid">
      {/* ── Row 1: Market Pulse spanning 2 cols ───────────────────── */}
      <section className="terminal-panel panel-span-2">
        <div className="panel-header">
          <div className="panel-title">Market Pulse — {overview.focus_ticker}</div>
          <div className="panel-meta">
            {overview.universe_size} symbols · {formatTimestamp(overview.generated_at)}
          </div>
        </div>

        {/* Dense breadth strip */}
        <BreadthStrip stats={breadthStats} />

        {/* Extended stats grid */}
        {extendedStats.length > 0 && (
          <div className="stats-row">
            {extendedStats.map((stat) => (
              <div key={stat.label} className="stats-cell">
                <div className="stats-label">{stat.label}</div>
                <div className={`stats-value ${toneFromLabel(stat.tone)}`}>{stat.value}</div>
                {stat.change && <div className="stats-sub">{stat.change}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Row 1 col 3: Watchlist board ──────────────────────────── */}
      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Watchlist Board</div>
          <div className="panel-meta">{watchlist.length} symbols</div>
        </div>
        <div className="panel-table-wrap">
          <table className="terminal-table compact">
            <thead>
              <tr>
                <th>Ticker</th>
                <th className="align-right">Price</th>
                <th className="align-right">Chg</th>
              </tr>
            </thead>
            <tbody>
              {watchlist.slice(0, 14).map((sym) => {
                const price = live.data?.prices[sym]
                return (
                  <tr key={sym}>
                    <td>
                      <Link to={`/security/${sym}`} className="ticker-link">
                        {sym}
                      </Link>
                    </td>
                    <td className="align-right">{formatNumber(price)}</td>
                    <td className="align-right">—</td>
                  </tr>
                )
              })}
              {watchlist.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ color: 'var(--text-dim)', padding: '12px 10px' }}>
                    No watchlist symbols
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Mover tables ──────────────────────────────────────────── */}
      <MoverTable title="Momentum Leaders" rows={overview.momentum_leaders} meta="20D rank" />
      <MoverTable
        title="Reversal Candidates"
        rows={overview.reversal_candidates}
        meta="RSI 25–45 + above 200D"
      />
      <MoverTable title="Breakout Shelf" rows={overview.breakouts} meta="52W range ≥85%" />

      {/* ── Recent symbols ────────────────────────────────────────── */}
      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Recent Symbols</div>
        </div>
        <div className="panel-table-wrap">
          <table className="terminal-table compact">
            <thead>
              <tr>
                <th>Ticker</th>
                <th className="align-right">Price</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recentTickers.slice(0, 10).map((sym) => (
                <tr key={sym}>
                  <td>
                    <Link to={`/security/${sym}`} className="ticker-link">
                      {sym}
                    </Link>
                  </td>
                  <td className="align-right">{formatNumber(live.data?.prices[sym])}</td>
                  <td>
                    <DeltaPill value={null} />
                  </td>
                </tr>
              ))}
              {recentTickers.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ color: 'var(--text-dim)', padding: '12px 10px' }}>
                    Navigate to symbols to build history
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Pulse matrix ─────────────────────────────────────────── */}
      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Live Pulse</div>
          <div className="panel-meta">{pulseSymbols.length} symbols</div>
        </div>
        <div className="matrix-grid">
          {pulseSymbols.map((sym) => (
            <Link key={sym} to={`/security/${sym}`} className="matrix-cell">
              <span className="ticker-link">{sym}</span>
              <span style={{ color: 'var(--text-muted)' }}>{formatNumber(live.data?.prices[sym])}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── News triage ───────────────────────────────────────────── */}
      <NewsPanel
        title="News Triage"
        items={news.data?.items ?? []}
        empty="News will populate as the focus ticker and watchlist pull live coverage."
      />
    </div>
  )
}
