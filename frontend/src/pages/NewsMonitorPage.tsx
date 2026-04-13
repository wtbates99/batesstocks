import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import NewsPanel from '../components/news/NewsPanel'
import { useNewsQuery } from '../api/query'
import { getActiveWatchlist, useTerminalStore } from '../state/terminalStore'

export default function NewsMonitorPage() {
  const { activeTicker, watchlist, recentTickers } = useTerminalStore(useShallow((state) => ({
    activeTicker: state.activeTicker,
    watchlist: getActiveWatchlist(state)?.symbols ?? [],
    recentTickers: state.recentTickers,
  })))
  const [scope, setScope] = useState<'focus' | 'watchlist' | 'recent' | 'market'>('watchlist')

  const tickers =
    scope === 'focus'
      ? [activeTicker]
      : scope === 'watchlist'
        ? watchlist.slice(0, 10)
        : scope === 'recent'
          ? recentTickers.slice(0, 10)
          : ['SPY', 'QQQ', 'IWM', 'TLT', 'GLD', 'XLF']

  const news = useNewsQuery(tickers, `news-${scope}`, 24, tickers.length > 0)

  return (
    <div className="news-monitor-grid">
      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">News Scope</div>
        </div>
        <div className="panel-body-pad">
          <div className="toolbar-group">
            {(['focus', 'watchlist', 'recent', 'market'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`toolbar-chip${scope === option ? ' is-active' : ''}`}
                onClick={() => setScope(option)}
              >
                {option.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="feed-meta">{tickers.join(' · ')}</div>
        </div>
      </section>

      <NewsPanel
        title="News Monitor"
        items={news.data?.items ?? []}
        empty="Select a scope to load market, watchlist, recent, or focus-symbol news."
      />
    </div>
  )
}
