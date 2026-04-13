import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import NewsPanel from '../components/news/NewsPanel'
import { useNewsQuery, useSnapshotsQuery } from '../api/query'
import { formatCompactNumber, formatNumber, formatPercent } from '../lib/formatters'
import { getActiveWatchlist, useTerminalStore } from '../state/terminalStore'

function watchlistName(index: number) {
  return `Watchlist ${index + 1}`
}

export default function WatchlistsPage() {
  const navigate = useNavigate()
  const [renameDraft, setRenameDraft] = useState('')
  const [newName, setNewName] = useState('')
  const {
    watchlists,
    activeWatchlistId,
    activeWatchlist,
    recentTickers,
    setActiveWatchlist,
    createWatchlist,
    renameWatchlist,
    deleteWatchlist,
    toggleWatchlist,
    setCompareTickers,
  } = useTerminalStore(useShallow((state) => ({
    watchlists: state.watchlists,
    activeWatchlistId: state.activeWatchlistId,
    activeWatchlist: getActiveWatchlist(state),
    recentTickers: state.recentTickers,
    setActiveWatchlist: state.setActiveWatchlist,
    createWatchlist: state.createWatchlist,
    renameWatchlist: state.renameWatchlist,
    deleteWatchlist: state.deleteWatchlist,
    toggleWatchlist: state.toggleWatchlist,
    setCompareTickers: state.setCompareTickers,
  })))

  const symbols = activeWatchlist?.symbols ?? []
  const snapshots = useSnapshotsQuery(symbols, symbols.length > 0)
  const news = useNewsQuery(symbols.slice(0, 10), `watchlist-${activeWatchlistId}`, 10, symbols.length > 0)
  const items = snapshots.data?.items ?? []

  const winners = items.filter((item) => (item.change_pct ?? 0) > 0).length
  const losers = items.filter((item) => (item.change_pct ?? 0) < 0).length
  const avgRsi = items.length > 0
    ? items.reduce((sum, item) => sum + (item.rsi ?? 0), 0) / items.length
    : null
  const avgReturn20d = items.length > 0
    ? items.reduce((sum, item) => sum + (item.return_20d ?? 0), 0) / items.length
    : null

  const sectorBreakdown = useMemo(() => {
    const grouped = new Map<string, number>()
    for (const item of items) {
      const sector = item.sector ?? 'Unclassified'
      grouped.set(sector, (grouped.get(sector) ?? 0) + 1)
    }
    return Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [items])

  return (
    <div className="watchlists-grid">
      <section className="terminal-panel panel-span-2">
        <div className="panel-header">
          <div className="panel-title">Watchlist Book</div>
          <div className="panel-meta">{watchlists.length} LISTS</div>
        </div>
        <div className="panel-body-pad">
          <div className="watchlist-tabs">
            {watchlists.map((watchlist, index) => (
              <button
                key={watchlist.id}
                type="button"
                className={`toolbar-chip${watchlist.id === activeWatchlistId ? ' is-active' : ''}`}
                onClick={() => {
                  setActiveWatchlist(watchlist.id)
                  setRenameDraft(watchlist.name)
                }}
              >
                {watchlist.name || watchlistName(index)}
                <span className="chip-count">{watchlist.symbols.length}</span>
              </button>
            ))}
          </div>
          <div className="watchlist-admin">
            <input
              className="terminal-input"
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              placeholder={activeWatchlist?.name ?? 'Rename active watchlist'}
            />
            <button
              type="button"
              className="terminal-button terminal-button-ghost"
              onClick={() => {
                if (!activeWatchlist) return
                renameWatchlist(activeWatchlist.id, renameDraft)
              }}
            >
              RENAME
            </button>
            <input
              className="terminal-input"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="New watchlist"
            />
            <button
              type="button"
              className="terminal-button"
              onClick={() => {
                createWatchlist(newName)
                setNewName('')
              }}
            >
              CREATE
            </button>
            <button
              type="button"
              className="terminal-button terminal-button-ghost"
              onClick={() => activeWatchlist && deleteWatchlist(activeWatchlist.id)}
              disabled={watchlists.length <= 1}
            >
              DELETE
            </button>
          </div>
        </div>
      </section>

      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">List Summary</div>
        </div>
        <div className="quick-grid">
          <div className="quick-card"><span>Symbols</span><span>{symbols.length}</span></div>
          <div className="quick-card"><span>Winners</span><span>{winners}</span></div>
          <div className="quick-card"><span>Losers</span><span>{losers}</span></div>
          <div className="quick-card"><span>Avg RSI</span><span>{formatNumber(avgRsi, 1)}</span></div>
          <div className="quick-card"><span>20D Avg</span><span>{formatPercent(avgReturn20d)}</span></div>
        </div>
      </section>

      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Sector Split</div>
        </div>
        <div className="matrix-grid">
          {sectorBreakdown.map(([sector, count]) => (
            <Link key={sector} to={`/sector/${encodeURIComponent(sector)}`} className="matrix-cell">
              <span>{sector}</span>
              <span>{count}</span>
            </Link>
          ))}
          {sectorBreakdown.length === 0 && (
            <div className="empty-block">
              <div className="empty-title">No sector breakdown yet.</div>
              <div className="empty-copy">Add names to the active list and sector coverage will populate here.</div>
            </div>
          )}
        </div>
      </section>

      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Recent Symbols</div>
        </div>
        <div className="matrix-grid">
          {recentTickers.slice(0, 12).map((ticker) => (
            <Link key={ticker} to={`/security/${ticker}`} className="matrix-cell">
              <span className="ticker-link">{ticker}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="terminal-panel panel-span-2">
        <div className="panel-header">
          <div className="panel-title">{activeWatchlist?.name ?? 'Watchlist'} Monitor</div>
        </div>
        <div className="panel-table-wrap">
          <table className="terminal-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Name</th>
                <th>Sector</th>
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
              {items.map((item) => (
                <tr key={item.ticker}>
                  <td><Link to={`/security/${item.ticker}`} className="ticker-link">{item.ticker}</Link></td>
                  <td>{item.name ?? '—'}</td>
                  <td>{item.sector ? <Link to={`/sector/${encodeURIComponent(item.sector)}`} className="ticker-link">{item.sector}</Link> : '—'}</td>
                  <td className="align-right">{formatNumber(item.close)}</td>
                  <td className="align-right">{formatPercent(item.change_pct)}</td>
                  <td className="align-right">{formatPercent(item.return_20d)}</td>
                  <td className="align-right">{formatPercent(item.return_63d)}</td>
                  <td className="align-right">{formatNumber(item.rsi, 1)}</td>
                  <td className="align-right">{formatNumber(item.tech_score, 0)}</td>
                  <td className="align-right">{formatCompactNumber(item.volume)}</td>
                  <td>
                    <div className="table-actions">
                      <button type="button" className="table-action" onClick={() => toggleWatchlist(item.ticker, activeWatchlistId)}>RM</button>
                      <button
                        type="button"
                        className="table-action"
                        onClick={() => {
                          setCompareTickers([item.ticker, ...symbols.filter((value) => value !== item.ticker).slice(0, 3), 'SPY'])
                          navigate('/compare')
                        }}
                      >
                        COMP
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {symbols.length === 0 && (
                <tr>
                  <td colSpan={11}>
                    <div className="empty-block">
                      <div className="empty-title">Active watchlist is empty.</div>
                      <div className="empty-copy">Add symbols from security, screener, compare, or the command bar to build a live monitor book.</div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <NewsPanel
        title={`${activeWatchlist?.name ?? 'Watchlist'} News`}
        items={news.data?.items ?? []}
        empty="Watchlist headlines will appear here once the active list tracks symbols."
      />
    </div>
  )
}
