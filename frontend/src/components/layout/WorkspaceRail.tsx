import { Clock3, FolderKanban, Star, Trash2 } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { formatTimestamp } from '../../lib/formatters'
import { getActiveWatchlist, useTerminalStore } from '../../state/terminalStore'

export default function WorkspaceRail() {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    watchlist,
    watchlists,
    activeWatchlistId,
    setActiveWatchlist,
    savedCompareSets,
    setCompareTickers,
    recentTickers,
    savedScreens,
    savedBacktests,
    toggleWatchlist,
    deleteCompareSet,
    deleteScreenDraft,
    deleteBacktestDraft,
  } = useTerminalStore((state) => ({
    watchlist: getActiveWatchlist(state)?.symbols ?? [],
    watchlists: state.watchlists,
    activeWatchlistId: state.activeWatchlistId,
    setActiveWatchlist: state.setActiveWatchlist,
    savedCompareSets: state.savedCompareSets,
    setCompareTickers: state.setCompareTickers,
    recentTickers: state.recentTickers,
    savedScreens: state.savedScreens,
    savedBacktests: state.savedBacktests,
    toggleWatchlist: state.toggleWatchlist,
    deleteCompareSet: state.deleteCompareSet,
    deleteScreenDraft: state.deleteScreenDraft,
    deleteBacktestDraft: state.deleteBacktestDraft,
  }))

  const isScreener = location.pathname.startsWith('/screener')
  const isBacktest = location.pathname.startsWith('/backtest')
  const isCompare = location.pathname.startsWith('/compare')

  return (
    <aside className="workspace-rail">
      <section className="rail-section">
        <div className="rail-title"><Star size={12} /> Watchlist</div>
        <div className="rail-list rail-tabs">
          {watchlists.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rail-chip${item.id === activeWatchlistId ? ' is-active' : ''}`}
              onClick={() => setActiveWatchlist(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
        <div className="rail-list">
          {watchlist.map((ticker) => (
            <div key={ticker} className="rail-row">
              <Link to={`/security/${ticker}`} className="ticker-link">{ticker}</Link>
              <button type="button" className="terminal-icon-button" onClick={() => toggleWatchlist(ticker)}>
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {isCompare && (
        <section className="rail-section">
          <div className="rail-title"><FolderKanban size={12} /> Saved Compare</div>
          <div className="rail-list">
            {savedCompareSets.length === 0 && <div className="rail-empty">No saved sets</div>}
            {savedCompareSets.map((item) => (
              <div key={item.id} className="saved-row">
                <button
                  type="button"
                  className="saved-open"
                  onClick={() => {
                    setCompareTickers(item.tickers)
                    navigate('/compare')
                  }}
                >
                  <div className="saved-name">{item.name}</div>
                  <div className="saved-meta">{item.tickers.join(' · ')}</div>
                </button>
                <button type="button" className="terminal-icon-button" onClick={() => deleteCompareSet(item.id)}>
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rail-section">
        <div className="rail-title"><Clock3 size={12} /> Recents</div>
        <div className="rail-list">
          {recentTickers.slice(0, 8).map((ticker) => (
            <Link key={ticker} to={`/security/${ticker}`} className="rail-link">{ticker}</Link>
          ))}
        </div>
      </section>

      {isScreener && (
        <section className="rail-section">
          <div className="rail-title"><FolderKanban size={12} /> Saved Screens</div>
          <div className="rail-list">
            {savedScreens.length === 0 && <div className="rail-empty">No saved screens</div>}
            {savedScreens.map((item) => (
              <div key={item.id} className="saved-row">
                <div>
                  <div className="saved-name">{item.name}</div>
                  <div className="saved-meta">{formatTimestamp(item.createdAt)}</div>
                </div>
                <button type="button" className="terminal-icon-button" onClick={() => deleteScreenDraft(item.id)}>
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {isBacktest && (
        <section className="rail-section">
          <div className="rail-title"><FolderKanban size={12} /> Saved Runs</div>
          <div className="rail-list">
            {savedBacktests.length === 0 && <div className="rail-empty">No saved runs</div>}
            {savedBacktests.map((item) => (
              <div key={item.id} className="saved-row">
                <div>
                  <div className="saved-name">{item.name}</div>
                  <div className="saved-meta">{formatTimestamp(item.createdAt)}</div>
                </div>
                <button type="button" className="terminal-icon-button" onClick={() => deleteBacktestDraft(item.id)}>
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </aside>
  )
}
