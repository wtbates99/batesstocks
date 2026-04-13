import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Plus, Star, StarOff } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import TerminalChart from '../components/charts/TerminalChart'
import NewsPanel from '../components/news/NewsPanel'
import ReturnLadder from '../components/app/ReturnLadder'
import SignalStack from '../components/app/SignalStack'
import { useLivePricesQuery, useNewsQuery, useSecurityQuery } from '../api/query'
import {
  formatCompactNumber,
  formatNumber,
  formatPercent,
  formatTimestamp,
  toneClass,
} from '../lib/formatters'
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

function relatedTickers(compareTickers: string[], ticker: string) {
  return compareTickers.filter((value) => value !== ticker).slice(0, 3)
}

export default function SecurityPage() {
  const { ticker: routeTicker } = useParams<{ ticker: string }>()
  const ticker = (routeTicker ?? 'SPY').toUpperCase()
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]['days']>(132)
  const [overlays, setOverlays] = useState<Array<'sma_10' | 'sma_30' | 'sma_200' | 'ema_10'>>([
    'sma_10',
    'sma_30',
    'sma_200',
  ])
  const {
    compareTickers,
    watchlist,
    setActiveTicker,
    setAiContext,
    openAi,
    addRecentTicker,
    toggleWatchlist,
    toggleCompareTicker,
  } = useTerminalStore(
    useShallow((state) => ({
      compareTickers: state.compareTickers,
      watchlist: getActiveWatchlist(state)?.symbols ?? [],
      setActiveTicker: state.setActiveTicker,
      setAiContext: state.setAiContext,
      openAi: state.openAi,
      addRecentTicker: state.addRecentTicker,
      toggleWatchlist: state.toggleWatchlist,
      toggleCompareTicker: state.toggleCompareTicker,
    })),
  )

  const security = useSecurityQuery(ticker, 260)
  const news = useNewsQuery(
    [ticker, ...relatedTickers(compareTickers, ticker)],
    'security',
    10,
  )
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
    return (
      <div className="state-panel loading-state">
        Loading {ticker} security monitor…
      </div>
    )
  }

  if (security.isError || !security.data) {
    return (
      <div className="state-panel error-state">
        {security.error instanceof Error
          ? security.error.message
          : 'Security unavailable.'}
      </div>
    )
  }

  const { snapshot, signals, related } = security.data
  const isWatchlisted = watchlist.includes(ticker)
  const livePrice = live.data?.prices[ticker] ?? snapshot.close

  return (
    <div className="security-grid">
      {/* ── Main Column ────────────────────────────────────────────── */}
      <section className="terminal-panel security-main">

        {/* Security header: ticker / name / sector / price / change / actions */}
        <div className="security-header">
          <div style={{ display: 'grid', gap: 'var(--sp-1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <span className="security-ticker-label">{snapshot.ticker}</span>
              {snapshot.sector && (
                <Link
                  to={`/sector/${encodeURIComponent(snapshot.sector)}`}
                  className="sector-chip"
                >
                  {snapshot.sector}
                </Link>
              )}
              {snapshot.subsector && (
                <span className="security-sector-label">{snapshot.subsector}</span>
              )}
            </div>
            <div className="security-name-label">{snapshot.name ?? 'Unknown Security'}</div>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)' }}>
            <span className={`security-price-label ${toneClass(snapshot.change_pct)}`}>
              {formatNumber(livePrice)}
            </span>
            <span className={`security-change-label ${toneClass(snapshot.change_pct)}`}>
              {formatPercent(snapshot.change_pct)}
            </span>
          </div>
        </div>

        {/* Quote strip: compact stats across the top */}
        <div className="quote-strip">
          <div className="quote-cell">
            <div className="quote-label">Vol</div>
            <div className="quote-value">{formatCompactNumber(snapshot.volume)}</div>
          </div>
          <div className="quote-cell">
            <div className="quote-label">Mkt Cap</div>
            <div className="quote-value">{formatCompactNumber(snapshot.market_cap)}</div>
          </div>
          <div className="quote-cell">
            <div className="quote-label">RSI</div>
            <div className={`quote-value ${(snapshot.rsi ?? 50) >= 70 ? 'tone-negative' : (snapshot.rsi ?? 50) <= 30 ? 'tone-positive' : ''}`}>
              {formatNumber(snapshot.rsi, 1)}
            </div>
          </div>
          <div className="quote-cell">
            <div className="quote-label">Score</div>
            <div className={`quote-value ${(snapshot.tech_score ?? 0) >= 65 ? 'tone-positive' : 'tone-warning'}`}>
              {formatNumber(snapshot.tech_score, 0)}
            </div>
          </div>
          <div className="quote-cell">
            <div className="quote-label">200 / 250D</div>
            <div className={`quote-value ${snapshot.above_sma_200 && snapshot.above_sma_250 ? 'tone-positive' : 'tone-warning'}`}>
              {snapshot.above_sma_200 && snapshot.above_sma_250 ? 'ABOVE' : snapshot.above_sma_200 ? 'MIXED' : 'BELOW'}
            </div>
          </div>
          <div className="quote-cell" style={{ flex: 1 }}>
            <div className="quote-label">Generated</div>
            <div className="quote-value" style={{ color: 'var(--text-dim)', fontWeight: 400 }}>
              {formatTimestamp(security.data.generated_at)}
            </div>
          </div>
        </div>

        {/* Return ladder */}
        <ReturnLadder
          change1d={snapshot.change_pct}
          return20d={snapshot.return_20d}
          return63d={snapshot.return_63d}
          return126d={snapshot.return_126d}
          return252d={snapshot.return_252d}
        />

        {/* Compare strip */}
        <div className="compare-strip">
          {compareUniverse.map((symbol) => (
            <Link
              key={symbol}
              to={`/security/${symbol}`}
              className={`compare-chip${symbol === ticker ? ' is-active' : ''}`}
            >
              <span>{symbol}</span>
              <span>{formatNumber(live.data?.prices[symbol])}</span>
            </Link>
          ))}
        </div>

        {/* Chart toolbar */}
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
                onClick={() =>
                  setOverlays((current) =>
                    current.includes(overlay)
                      ? current.filter((value) => value !== overlay)
                      : [...current, overlay],
                  )
                }
              >
                {overlayLabel(overlay)}
              </button>
            ))}
          </div>
          <div className="toolbar-group" style={{ marginLeft: 'auto' }}>
            <button
              type="button"
              className="terminal-button"
              onClick={() =>
                openAi(`Analyze ${ticker} using its active signal stack and trend context.`)
              }
            >
              ANALYZE
            </button>
            <button
              type="button"
              className="terminal-button terminal-button-ghost"
              onClick={() => toggleWatchlist(ticker)}
            >
              {isWatchlisted ? <StarOff size={12} /> : <Star size={12} />}
              {isWatchlisted ? 'UNWATCH' : 'WATCH'}
            </button>
            <button
              type="button"
              className="terminal-button terminal-button-ghost"
              onClick={() => toggleCompareTicker(ticker)}
            >
              <Plus size={12} />
              COMPARE
            </button>
          </div>
        </div>

        <TerminalChart bars={bars} overlays={overlays} />

        {/* Signal stack + snapshot subpanels */}
        <div className="subpanel-grid">
          <section className="terminal-subpanel">
            <div className="subpanel-title">Signal Stack</div>
            <SignalStack signals={signals} />
          </section>
          <section className="terminal-subpanel">
            <div className="subpanel-title">Key Metrics</div>
            <div className="signal-list">
              <div className="signal-row">
                <span>Market Cap</span>
                <span>{formatCompactNumber(snapshot.market_cap)}</span>
              </div>
              <div className="signal-row">
                <span>Volume</span>
                <span>{formatCompactNumber(snapshot.volume)}</span>
              </div>
              <div className="signal-row">
                <span>RSI</span>
                <span>{formatNumber(snapshot.rsi, 1)}</span>
              </div>
              <div className="signal-row">
                <span>Tech Score</span>
                <span>{formatNumber(snapshot.tech_score, 0)}</span>
              </div>
              <div className="signal-row">
                <span>MACD</span>
                <span>{formatNumber(snapshot.macd, 2)}</span>
              </div>
              <div className="signal-row">
                <span>MACD Signal</span>
                <span>{formatNumber(snapshot.macd_signal, 2)}</span>
              </div>
              <div className="signal-row">
                <span>Above SMA 10</span>
                <span className={snapshot.above_sma_10 ? 'tone-positive' : 'tone-negative'}>
                  {snapshot.above_sma_10 ? 'YES' : 'NO'}
                </span>
              </div>
              <div className="signal-row">
                <span>Above SMA 30</span>
                <span className={snapshot.above_sma_30 ? 'tone-positive' : 'tone-negative'}>
                  {snapshot.above_sma_30 ? 'YES' : 'NO'}
                </span>
              </div>
            </div>
          </section>
        </div>
      </section>

      {/* ── Right Rail ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gap: 'var(--sp-4)', alignContent: 'start' }}>
        {/* Related Names */}
        <section className="terminal-panel">
          <div className="panel-header">
            <div className="panel-title">Related Names</div>
            <div className="panel-meta">{snapshot.sector ?? 'SECTOR'}</div>
          </div>
          <div className="panel-table-wrap">
            <table className="terminal-table compact">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th className="align-right">Chg</th>
                  <th className="align-right">Score</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {related.map((row) => (
                  <tr key={row.ticker}>
                    <td>
                      <Link to={`/security/${row.ticker}`} className="ticker-link">
                        {row.ticker}
                      </Link>
                      {row.name && (
                        <div style={{ color: 'var(--text-dim)', fontSize: 'var(--fs-xs)', marginTop: 1 }}>
                          {row.name.slice(0, 22)}
                        </div>
                      )}
                    </td>
                    <td className={`align-right ${toneClass(row.change_pct)}`}>
                      {formatPercent(row.change_pct)}
                    </td>
                    <td className="align-right">{formatNumber(row.tech_score, 0)}</td>
                    <td>
                      <button
                        type="button"
                        className="table-action"
                        onClick={() => toggleCompareTicker(row.ticker)}
                      >
                        COMP
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent Bars */}
        <section className="terminal-panel">
          <div className="panel-header">
            <div className="panel-title">Recent Bars</div>
          </div>
          <div className="panel-table-wrap">
            <table className="terminal-table compact">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="align-right">Close</th>
                  <th className="align-right">RSI</th>
                  <th className="align-right">Vol</th>
                </tr>
              </thead>
              <tbody>
                {security.data.bars
                  .slice(-20)
                  .reverse()
                  .map((bar) => (
                    <tr key={bar.date}>
                      <td>{bar.date}</td>
                      <td className="align-right">{formatNumber(bar.close)}</td>
                      <td
                        className={`align-right ${
                          (bar.rsi ?? 50) >= 70
                            ? 'tone-negative'
                            : (bar.rsi ?? 50) <= 30
                              ? 'tone-positive'
                              : ''
                        }`}
                      >
                        {formatNumber(bar.rsi, 1)}
                      </td>
                      <td className="align-right">{formatCompactNumber(bar.volume)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* News */}
        <NewsPanel
          title="Security News"
          items={news.data?.items ?? []}
          empty="Live security news will appear here when providers have current coverage for this symbol."
        />
      </div>
    </div>
  )
}
