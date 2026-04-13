import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import NewsPanel from '../components/news/NewsPanel'
import { useNewsQuery, useSnapshotsQuery } from '../api/query'
import {
  formatNumber,
  formatPercent,
  toneClass,
} from '../lib/formatters'
import { getActiveWatchlist, useTerminalStore } from '../state/terminalStore'

export default function NewsMonitorPage() {
  const { activeTicker, watchlist, recentTickers, setAiContext } = useTerminalStore(
    useShallow((state) => ({
      activeTicker: state.activeTicker,
      watchlist: getActiveWatchlist(state)?.symbols ?? [],
      recentTickers: state.recentTickers,
      setAiContext: state.setAiContext,
    })),
  )
  const [scope, setScope] = useState<'focus' | 'watchlist' | 'recent' | 'market'>('watchlist')

  const tickers = useMemo(
    () =>
      scope === 'focus'
        ? [activeTicker]
        : scope === 'watchlist'
          ? watchlist.slice(0, 10)
          : scope === 'recent'
            ? recentTickers.slice(0, 10)
            : ['SPY', 'QQQ', 'IWM', 'TLT', 'GLD', 'XLF'],
    [activeTicker, recentTickers, scope, watchlist],
  )

  const news = useNewsQuery(tickers, `news-${scope}`, 24, tickers.length > 0)
  const snapshots = useSnapshotsQuery(tickers, tickers.length > 0)
  const items = snapshots.data?.items ?? []

  useEffect(() => {
    setAiContext({
      page: 'news',
      scope,
      tickers,
      items: news.data?.items.slice(0, 8) ?? [],
      snapshotItems: items.slice(0, 8),
    })
  }, [items, news.data, scope, setAiContext, tickers])

  const stats = useMemo(() => {
    const avg20d =
      items.length > 0
        ? items.reduce((sum, item) => sum + (item.return_20d ?? 0), 0) / items.length
        : null
    const avgRsi =
      items.length > 0 ? items.reduce((sum, item) => sum + (item.rsi ?? 0), 0) / items.length : null
    const positives = items.filter((item) => (item.change_pct ?? 0) > 0).length
    return { avg20d, avgRsi, positives }
  }, [items])

  return (
    <div className="news-monitor-grid">
      <section className="terminal-panel panel-span-2">
        <div className="panel-header">
          <div className="panel-title">News Scope</div>
          <div className="panel-meta">
            {tickers.length} symbols · {news.data?.items.length ?? 0} headlines
          </div>
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
        <div className="stats-row">
          <div className="stats-cell">
            <div className="stats-label">Scope</div>
            <div className="stats-value">{scope.toUpperCase()}</div>
          </div>
          <div className="stats-cell">
            <div className="stats-label">Advancers</div>
            <div className="stats-value tone-positive">
              {items.length > 0 ? `${stats.positives}/${items.length}` : '—'}
            </div>
          </div>
          <div className="stats-cell">
            <div className="stats-label">Avg 20D</div>
            <div className={`stats-value ${toneClass(stats.avg20d)}`}>
              {formatPercent(stats.avg20d)}
            </div>
          </div>
          <div className="stats-cell">
            <div className="stats-label">Avg RSI</div>
            <div className="stats-value">{formatNumber(stats.avgRsi, 1)}</div>
          </div>
        </div>
      </section>

      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Context Tape</div>
          <div className="panel-meta">{items.length} ranked names</div>
        </div>
        <div className="panel-table-wrap">
          <table className="terminal-table compact">
            <thead>
              <tr>
                <th>Ticker</th>
                <th className="align-right">Day</th>
                <th className="align-right">20D</th>
                <th className="align-right">RSI</th>
                <th className="align-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.ticker}>
                  <td>
                    <Link to={`/security/${item.ticker}`} className="ticker-link">
                      {item.ticker}
                    </Link>
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
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ color: 'var(--text-dim)', padding: '12px 10px' }}>
                    No scoped symbols loaded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <NewsPanel
        className="panel-span-2"
        title="News Monitor"
        items={news.data?.items ?? []}
        empty="Select a scope to load market, watchlist, recent, or focus-symbol news."
      />
    </div>
  )
}
