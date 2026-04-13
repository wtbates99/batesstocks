import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Plus, Star, StarOff } from 'lucide-react'
import TerminalChart from '../components/charts/TerminalChart'
import NewsPanel from '../components/news/NewsPanel'
import { useLivePricesQuery, useNewsQuery, useSecurityQuery } from '../api/query'
import { formatCompactNumber, formatNumber, formatPercent, formatTimestamp, toneClass, toneFromLabel } from '../lib/formatters'
import { getActiveWatchlist, useTerminalStore } from '../state/terminalStore'

const TIMEFRAMES = [
  { label: '1M', days: 22 },
  { label: '3M', days: 66 },
  { label: '6M', days: 132 },
  { label: '1Y', days: 252 },
  { label: 'ALL', days: Infinity },
] as const

function overlayLabel(overlay: 'sma_10' | 'sma_30' | 'sma_200' | 'ema_10') {
  switch (overlay) {
    case 'sma_10':
      return 'SMA 10'
    case 'sma_30':
      return 'SMA 30'
    case 'sma_200':
      return 'SMA 200'
    case 'ema_10':
      return 'EMA 10'
    default:
      return overlay
  }
}

export default function SecurityPage() {
  const { ticker: routeTicker } = useParams<{ ticker: string }>()
  const ticker = (routeTicker ?? 'SPY').toUpperCase()
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]['days']>(132)
  const [overlays, setOverlays] = useState<Array<'sma_10' | 'sma_30' | 'sma_200' | 'ema_10'>>(['sma_10', 'sma_30', 'sma_200'])
  const {
    compareTickers,
    watchlist,
    setActiveTicker,
    setAiContext,
    openAi,
    addRecentTicker,
    toggleWatchlist,
    toggleCompareTicker,
  } = useTerminalStore((state) => ({
    compareTickers: state.compareTickers,
    watchlist: getActiveWatchlist(state)?.symbols ?? [],
    setActiveTicker: state.setActiveTicker,
    setAiContext: state.setAiContext,
    openAi: state.openAi,
    addRecentTicker: state.addRecentTicker,
    toggleWatchlist: state.toggleWatchlist,
    toggleCompareTicker: state.toggleCompareTicker,
  }))
  const security = useSecurityQuery(ticker, 260)
  const news = useNewsQuery([ticker, ...relatedTickers(compareTickers, ticker)], 'security', 10)
  const compareUniverse = Array.from(new Set([ticker, ...compareTickers])).slice(0, 6)
  const live = useLivePricesQuery(compareUniverse)

  useEffect(() => {
    setActiveTicker(ticker)
    addRecentTicker(ticker)
  }, [addRecentTicker, setActiveTicker, ticker])

  useEffect(() => {
    if (!security.data) return
    setAiContext({
      page: 'security',
      ticker,
      snapshot: security.data.snapshot,
      signals: security.data.signals,
      related: security.data.related,
      compareTickers,
      watchlisted: watchlist.includes(ticker),
    })
  }, [compareTickers, security.data, setAiContext, ticker, watchlist])

  const bars = useMemo(() => {
    if (!security.data) return []
    if (!Number.isFinite(timeframe)) return security.data.bars
    return security.data.bars.slice(-timeframe)
  }, [security.data, timeframe])

  if (security.isPending) {
    return <div className="state-panel">Loading {ticker} security monitor…</div>
  }

  if (security.isError || !security.data) {
    return <div className="state-panel error-state">{security.error instanceof Error ? security.error.message : 'Security unavailable.'}</div>
  }

  const { snapshot, signals, related } = security.data
  const isWatchlisted = watchlist.includes(ticker)

  return (
    <div className="security-grid">
      <section className="terminal-panel security-main">
        <div className="panel-header">
          <div>
            <div className="security-kicker">
              {snapshot.sector ? <Link to={`/sector/${encodeURIComponent(snapshot.sector)}`} className="ticker-link">{snapshot.sector}</Link> : 'UNCLASSIFIED'}
              {' / '}
              {snapshot.subsector ?? 'SECURITY'}
            </div>
            <div className="security-title">
              <span>{snapshot.ticker}</span>
              <span className="security-name">{snapshot.name ?? 'Unknown Security'}</span>
            </div>
          </div>
          <div className="security-summary">
            <div className="summary-line">
              <span className="label">LAST</span>
              <span>{formatNumber(live.data?.prices[ticker] ?? snapshot.close)}</span>
            </div>
            <div className={`summary-line ${toneClass(snapshot.change_pct)}`}>
              <span className="label">DAY</span>
              <span>{formatPercent(snapshot.change_pct)}</span>
            </div>
            <div className="action-row">
              <button type="button" className="terminal-button" onClick={() => openAi(`Analyze ${ticker} using its active signal stack and trend context.`)}>
                ANALYZE
              </button>
              <button type="button" className="terminal-button terminal-button-ghost" onClick={() => toggleWatchlist(ticker)}>
                {isWatchlisted ? <StarOff size={12} /> : <Star size={12} />}
                {isWatchlisted ? 'UNWATCH' : 'WATCH'}
              </button>
              <button type="button" className="terminal-button terminal-button-ghost" onClick={() => toggleCompareTicker(ticker)}>
                <Plus size={12} />
                COMPARE
              </button>
            </div>
          </div>
        </div>

        <div className="compare-strip">
          {compareUniverse.map((symbol) => (
            <Link key={symbol} to={`/security/${symbol}`} className={`compare-chip${symbol === ticker ? ' is-active' : ''}`}>
              <span>{symbol}</span>
              <span>{formatNumber(live.data?.prices[symbol])}</span>
            </Link>
          ))}
        </div>

        <div className="chart-toolbar">
          <div className="toolbar-group">
            {TIMEFRAMES.map((option) => (
              <button
                key={option.label}
                type="button"
                className={`toolbar-chip${timeframe === option.days ? ' is-active' : ''}`}
                onClick={() => setTimeframe(option.days)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="toolbar-group">
            {(['sma_10', 'sma_30', 'sma_200', 'ema_10'] as const).map((overlay) => (
              <button
                key={overlay}
                type="button"
                className={`toolbar-chip${overlays.includes(overlay) ? ' is-active' : ''}`}
                onClick={() => setOverlays((current) => (
                  current.includes(overlay)
                    ? current.filter((value) => value !== overlay)
                    : [...current, overlay]
                ))}
              >
                {overlayLabel(overlay)}
              </button>
            ))}
          </div>
          <div className="panel-meta">{formatTimestamp(security.data.generated_at)}</div>
        </div>

        <TerminalChart bars={bars} overlays={overlays} />

        <div className="subpanel-grid">
          <section className="terminal-subpanel">
            <div className="subpanel-title">Signal Stack</div>
            <div className="signal-list">
              {signals.map((signal) => (
                <div key={signal.label} className="signal-row">
                  <span>{signal.label}</span>
                  <span className={toneFromLabel(signal.tone)}>{signal.value}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="terminal-subpanel">
            <div className="subpanel-title">Snapshot</div>
            <div className="signal-list">
              <div className="signal-row"><span>Market Cap</span><span>{formatCompactNumber(snapshot.market_cap)}</span></div>
              <div className="signal-row"><span>Volume</span><span>{formatCompactNumber(snapshot.volume)}</span></div>
              <div className="signal-row"><span>RSI</span><span>{formatNumber(snapshot.rsi, 1)}</span></div>
              <div className="signal-row"><span>Tech Score</span><span>{formatNumber(snapshot.tech_score, 0)}</span></div>
              <div className="signal-row"><span>MACD</span><span>{formatNumber(snapshot.macd, 2)}</span></div>
              <div className="signal-row"><span>200 / 250D</span><span>{snapshot.above_sma_200 && snapshot.above_sma_250 ? 'ABOVE' : 'MIXED'}</span></div>
            </div>
            <div className="subpanel-title" style={{ marginTop: 12 }}>Return Ladder</div>
            <div className="signal-list">
              <div className="signal-row"><span>20D</span><span>{formatPercent(snapshot.return_20d)}</span></div>
              <div className="signal-row"><span>63D</span><span>{formatPercent(snapshot.return_63d)}</span></div>
              <div className="signal-row"><span>126D</span><span>{formatPercent(snapshot.return_126d)}</span></div>
              <div className="signal-row"><span>252D</span><span>{formatPercent(snapshot.return_252d)}</span></div>
            </div>
          </section>
        </div>
      </section>

      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Related Names</div>
        </div>
        <div className="panel-table-wrap">
          <table className="terminal-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Name</th>
                <th className="align-right">Chg</th>
                <th className="align-right">Score</th>
                <th>Flow</th>
              </tr>
            </thead>
            <tbody>
              {related.map((row) => (
                <tr key={row.ticker}>
                  <td><Link to={`/security/${row.ticker}`} className="ticker-link">{row.ticker}</Link></td>
                  <td>{row.name ?? '—'}</td>
                  <td className={`align-right ${toneClass(row.change_pct)}`}>{formatPercent(row.change_pct)}</td>
                  <td className="align-right">{formatNumber(row.tech_score, 0)}</td>
                  <td>
                    <button type="button" className="table-action" onClick={() => toggleCompareTicker(row.ticker)}>COMP</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Recent Bars</div>
        </div>
        <div className="panel-table-wrap">
          <table className="terminal-table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="align-right">Close</th>
                <th className="align-right">RSI</th>
                <th className="align-right">MACD</th>
                <th className="align-right">Vol</th>
              </tr>
            </thead>
            <tbody>
              {security.data.bars.slice(-20).reverse().map((bar) => (
                <tr key={bar.date}>
                  <td>{bar.date}</td>
                  <td className="align-right">{formatNumber(bar.close)}</td>
                  <td className="align-right">{formatNumber(bar.rsi, 1)}</td>
                  <td className="align-right">{formatNumber(bar.macd, 2)}</td>
                  <td className="align-right">{formatCompactNumber(bar.volume)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <NewsPanel
        title="Security News"
        items={news.data?.items ?? []}
        empty="Live security news will appear here when providers have current coverage for this symbol."
      />
    </div>
  )
}

function relatedTickers(compareTickers: string[], ticker: string) {
  return compareTickers.filter((value) => value !== ticker).slice(0, 3)
}
