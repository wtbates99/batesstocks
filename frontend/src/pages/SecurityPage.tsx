import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FlaskConical, Plus, Star, StarOff } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import TerminalChart from '../components/charts/TerminalChart'
import NewsPanel from '../components/news/NewsPanel'
import ReturnLadder from '../components/app/ReturnLadder'
import SignalStack from '../components/app/SignalStack'
import {
  useEarningsQuery,
  useFundamentalsQuery,
  useIntradayQuery,
  useLivePricesQuery,
  useNewsQuery,
  useSecurityQuery,
} from '../api/query'
import {
  formatCompactNumber,
  formatNumber,
  formatPercent,
  formatTimestamp,
  toneClass,
} from '../lib/formatters'
import { getActiveWatchlist, useTerminalStore } from '../state/terminalStore'

// ── Timeframe definitions ────────────────────────────────────────────────────

type IntradayTimeframe = { label: string; intraday: true; interval: string; period: string }
type DailyTimeframe = { label: string; intraday: false; days: number | typeof Infinity }
type Timeframe = IntradayTimeframe | DailyTimeframe

const TIMEFRAMES: Timeframe[] = [
  { label: '1D', intraday: true, interval: '5m', period: '1d' },
  { label: '5D', intraday: true, interval: '15m', period: '5d' },
  { label: '1M', intraday: false, days: 22 },
  { label: '3M', intraday: false, days: 66 },
  { label: '6M', intraday: false, days: 132 },
  { label: '1Y', intraday: false, days: 252 },
  { label: 'ALL', intraday: false, days: Infinity },
]

function overlayLabel(overlay: 'sma_10' | 'sma_30' | 'sma_200' | 'ema_10') {
  switch (overlay) {
    case 'sma_10': return 'SMA 10'
    case 'sma_30': return 'SMA 30'
    case 'sma_200': return 'SMA 200'
    case 'ema_10': return 'EMA 10'
  }
}

function relatedTickers(compareTickers: string[], ticker: string) {
  return compareTickers.filter((value) => value !== ticker).slice(0, 3)
}

// ── Fundamentals panel ───────────────────────────────────────────────────────

function FundamentalsPanel({ ticker }: { ticker: string }) {
  const { data, isPending, isError } = useFundamentalsQuery(ticker)

  if (isPending) return <div className="state-panel loading-state" style={{ minHeight: 120 }}>Loading fundamentals…</div>
  if (isError || !data) return <div className="state-panel error-state" style={{ minHeight: 80 }}>Fundamentals unavailable.</div>

  function pct(v: number | null | undefined) {
    return v == null ? '—' : `${(v * 100).toFixed(1)}%`
  }
  function num(v: number | null | undefined, digits = 2) {
    return v == null ? '—' : formatNumber(v, digits)
  }
  function compact(v: number | null | undefined) {
    return v == null ? '—' : formatCompactNumber(v)
  }

  const sections: { title: string; rows: [string, string][] }[] = [
    {
      title: 'Valuation',
      rows: [
        ['P/E (TTM)', num(data.pe_ratio, 1)],
        ['P/E (Fwd)', num(data.forward_pe, 1)],
        ['PEG Ratio', num(data.peg_ratio, 2)],
        ['EV / EBITDA', num(data.ev_ebitda, 1)],
        ['P / Book', num(data.price_to_book, 2)],
        ['P / Sales', num(data.price_to_sales, 2)],
        ['Enterprise Val', compact(data.enterprise_value)],
      ],
    },
    {
      title: 'Profitability',
      rows: [
        ['Gross Margin', pct(data.gross_margin)],
        ['Operating Margin', pct(data.operating_margin)],
        ['Net Margin', pct(data.profit_margin)],
        ['ROE', pct(data.roe)],
        ['ROA', pct(data.roa)],
      ],
    },
    {
      title: 'Per Share',
      rows: [
        ['EPS (TTM)', num(data.eps_ttm, 2)],
        ['EPS (Fwd)', num(data.eps_forward, 2)],
        ['Revenue / Share', num(data.revenue_per_share, 2)],
        ['Book Value', num(data.book_value, 2)],
      ],
    },
    {
      title: 'Growth',
      rows: [
        ['Revenue Growth', pct(data.revenue_growth)],
        ['Earnings Growth', pct(data.earnings_growth)],
      ],
    },
    {
      title: 'Balance Sheet',
      rows: [
        ['Total Revenue', compact(data.total_revenue)],
        ['EBITDA', compact(data.ebitda)],
        ['Total Cash', compact(data.total_cash)],
        ['Total Debt', compact(data.total_debt)],
        ['D / E Ratio', num(data.debt_to_equity, 2)],
        ['Current Ratio', num(data.current_ratio, 2)],
        ['Free Cash Flow', compact(data.free_cash_flow)],
      ],
    },
    {
      title: 'Dividends & Float',
      rows: [
        ['Dividend Yield', pct(data.dividend_yield)],
        ['Payout Ratio', pct(data.payout_ratio)],
        ['Beta', num(data.beta, 2)],
        ['Shares Out.', compact(data.shares_outstanding)],
        ['Short Ratio', num(data.short_ratio, 1)],
      ],
    },
  ]

  return (
    <div className="fundamentals-grid">
      {sections.map((section) => (
        <div key={section.title} className="fundamentals-section">
          <div className="fundamentals-section-title">{section.title}</div>
          {section.rows.map(([label, value]) => (
            <div key={label} className="signal-row">
              <span>{label}</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const { ticker: routeTicker } = useParams<{ ticker: string }>()
  const ticker = (routeTicker ?? 'SPY').toUpperCase()
  const navigate = useNavigate()

  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>(TIMEFRAMES[2]) // default 1M
  const [overlays, setOverlays] = useState<Array<'sma_10' | 'sma_30' | 'sma_200' | 'ema_10'>>([
    'sma_10', 'sma_30', 'sma_200',
  ])
  const [tab, setTab] = useState<'chart' | 'fundamentals'>('chart')

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

  const security = useSecurityQuery(ticker, 1000)
  const earnings = useEarningsQuery([ticker])
  const earningsItem = earnings.data?.items[0]
  const news = useNewsQuery(
    [ticker, ...relatedTickers(compareTickers, ticker)],
    'security',
    10,
  )
  const compareUniverse = Array.from(new Set([ticker, ...compareTickers])).slice(0, 6)
  const live = useLivePricesQuery(compareUniverse)

  const isIntraday = activeTimeframe.intraday
  const intradayQuery = useIntradayQuery(
    ticker,
    isIntraday ? activeTimeframe.interval : '5m',
    isIntraday ? activeTimeframe.period : '1d',
    isIntraday,
  )

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

  const dailyBars = useMemo(() => {
    if (!security.data || isIntraday) return []
    const tf = activeTimeframe as DailyTimeframe
    if (!Number.isFinite(tf.days)) return security.data.bars
    return security.data.bars.slice(-(tf.days as number))
  }, [security.data, activeTimeframe, isIntraday])

  if (security.isPending) {
    return <div className="state-panel loading-state">Loading {ticker} security monitor…</div>
  }
  if (security.isError || !security.data) {
    return (
      <div className="state-panel error-state">
        {security.error instanceof Error ? security.error.message : 'Security unavailable.'}
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

        {/* Header */}
        <div className="security-header">
          <div style={{ display: 'grid', gap: 'var(--sp-1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <span className="security-ticker-label">{snapshot.ticker}</span>
              {snapshot.sector && (
                <Link to={`/sector/${encodeURIComponent(snapshot.sector)}`} className="sector-chip">
                  {snapshot.sector}
                </Link>
              )}
              {snapshot.subsector && (
                <span className="security-sector-label">{snapshot.subsector}</span>
              )}
            </div>
            <div className="security-name-label">{snapshot.name ?? 'Unknown Security'}</div>
          </div>

          <div className="security-price-group">
            <span className={`security-price-label ${toneClass(snapshot.change_pct)}`}>
              {formatNumber(livePrice)}
            </span>
            <span className={`security-change-label ${toneClass(snapshot.change_pct)}`}>
              {formatPercent(snapshot.change_pct)}
            </span>
          </div>
        </div>

        {/* Quote strip */}
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
          {earningsItem?.earnings_date && (
            <div className="quote-cell">
              <div className="quote-label">Next Earnings</div>
              <div className={`quote-value ${
                (() => {
                  const days = Math.ceil((new Date(earningsItem.earnings_date).getTime() - Date.now()) / 86400000)
                  return days <= 7 ? 'tone-warning' : days <= 30 ? 'tone-cyan' : ''
                })()
              }`}>
                {earningsItem.earnings_date}
              </div>
            </div>
          )}
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

        {/* Tab switcher + toolbar */}
        <div className="chart-toolbar">
          {/* Tab selector */}
          <div className="toolbar-group">
            <button
              type="button"
              className={`toolbar-chip${tab === 'chart' ? ' is-active' : ''}`}
              onClick={() => setTab('chart')}
            >
              CHART
            </button>
            <button
              type="button"
              className={`toolbar-chip${tab === 'fundamentals' ? ' is-active' : ''}`}
              onClick={() => setTab('fundamentals')}
            >
              FUNDAMENTALS
            </button>
          </div>

          {/* Timeframe + overlay (only shown on chart tab) */}
          {tab === 'chart' && (
            <>
              <div className="toolbar-group">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf.label}
                    type="button"
                    className={`toolbar-chip${activeTimeframe.label === tf.label ? ' is-active' : ''}`}
                    onClick={() => setActiveTimeframe(tf)}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
              {!isIntraday && (
                <div className="toolbar-group">
                  {(['sma_10', 'sma_30', 'sma_200', 'ema_10'] as const).map((overlay) => (
                    <button
                      key={overlay}
                      type="button"
                      className={`toolbar-chip${overlays.includes(overlay) ? ' is-active' : ''}`}
                      onClick={() =>
                        setOverlays((current) =>
                          current.includes(overlay)
                            ? current.filter((v) => v !== overlay)
                            : [...current, overlay],
                        )
                      }
                    >
                      {overlayLabel(overlay)}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="toolbar-group toolbar-actions">
            <button
              type="button"
              className="terminal-button"
              onClick={() => openAi(`Analyze ${ticker} using its active signal stack and trend context.`)}
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
            <button
              type="button"
              className="terminal-button terminal-button-ghost"
              onClick={() => navigate(`/backtest?ticker=${ticker}`)}
            >
              <FlaskConical size={12} />
              BACKTEST
            </button>
          </div>
        </div>

        {/* Chart or Fundamentals */}
        {tab === 'chart' ? (
          <>
            {isIntraday ? (
              intradayQuery.isPending ? (
                <div className="chart-host" style={{ height: 440, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
                  Loading intraday data…
                </div>
              ) : intradayQuery.isError || !intradayQuery.data?.bars.length ? (
                <div className="chart-host" style={{ height: 440, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
                  Intraday data unavailable — market may be closed.
                </div>
              ) : (
                <TerminalChart intradayBars={intradayQuery.data.bars} />
              )
            ) : (
              <TerminalChart bars={dailyBars} overlays={overlays} />
            )}

            {/* Signal stack + key metrics */}
            <div className="subpanel-grid">
              <section className="terminal-subpanel">
                <div className="subpanel-title">Signal Stack</div>
                <SignalStack signals={signals} />
              </section>
              <section className="terminal-subpanel">
                <div className="subpanel-title">Key Metrics</div>
                <div className="signal-list">
                  <div className="signal-row"><span>Market Cap</span><span>{formatCompactNumber(snapshot.market_cap)}</span></div>
                  <div className="signal-row"><span>Volume</span><span>{formatCompactNumber(snapshot.volume)}</span></div>
                  <div className="signal-row"><span>RSI</span><span>{formatNumber(snapshot.rsi, 1)}</span></div>
                  <div className="signal-row"><span>Tech Score</span><span>{formatNumber(snapshot.tech_score, 0)}</span></div>
                  <div className="signal-row"><span>MACD</span><span>{formatNumber(snapshot.macd, 2)}</span></div>
                  <div className="signal-row"><span>MACD Signal</span><span>{formatNumber(snapshot.macd_signal, 2)}</span></div>
                  <div className="signal-row">
                    <span>Above SMA 10</span>
                    <span className={snapshot.above_sma_10 ? 'tone-positive' : 'tone-negative'}>{snapshot.above_sma_10 ? 'YES' : 'NO'}</span>
                  </div>
                  <div className="signal-row">
                    <span>Above SMA 30</span>
                    <span className={snapshot.above_sma_30 ? 'tone-positive' : 'tone-negative'}>{snapshot.above_sma_30 ? 'YES' : 'NO'}</span>
                  </div>
                </div>
              </section>
            </div>
          </>
        ) : (
          <FundamentalsPanel ticker={ticker} />
        )}
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
                      <Link to={`/security/${row.ticker}`} className="ticker-link">{row.ticker}</Link>
                      {row.name && (
                        <div style={{ color: 'var(--text-dim)', fontSize: 'var(--fs-xs)', marginTop: 1 }}>
                          {row.name.slice(0, 22)}
                        </div>
                      )}
                    </td>
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
                      <td className={`align-right ${(bar.rsi ?? 50) >= 70 ? 'tone-negative' : (bar.rsi ?? 50) <= 30 ? 'tone-positive' : ''}`}>
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
          loading={news.isPending}
          empty="Live security news will appear here when providers have current coverage for this symbol."
        />
      </div>
    </div>
  )
}
