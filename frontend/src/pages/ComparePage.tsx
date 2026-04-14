import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link, useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { api } from '../api/client'
import { terminalKeys, useNewsQuery, useSnapshotsQuery } from '../api/query'
import NewsPanel from '../components/news/NewsPanel'
import {
  formatCompactNumber,
  formatNumber,
  formatPercent,
  toneClass,
} from '../lib/formatters'
import { useTerminalStore } from '../state/terminalStore'

const COLORS = ['#f3a037', '#3bb9e3', '#19b878', '#d24545', '#8b7cff', '#f08fb0']

export default function ComparePage() {
  const navigate = useNavigate()
  const { compareTickers, setCompareTickers, saveCompareSet, savedCompareSets } =
    useTerminalStore(
      useShallow((state) => ({
        compareTickers:
          state.compareTickers.length > 0 ? state.compareTickers : ['SPY', 'QQQ'],
        setCompareTickers: state.setCompareTickers,
        saveCompareSet: state.saveCompareSet,
        savedCompareSets: state.savedCompareSets,
      })),
    )
  const snapshots = useSnapshotsQuery(compareTickers, compareTickers.length > 0)
  const news = useNewsQuery(compareTickers, 'compare', 10, compareTickers.length > 0)
  const securities = useQueries({
    queries: compareTickers.map((ticker) => ({
      queryKey: terminalKeys.security(ticker, 260),
      queryFn: () => api.terminal.security(ticker, 260),
      staleTime: 30_000,
    })),
  })

  const chartData = useMemo(() => {
    const ready = securities.filter((query) => query.data).map((query) => query.data!)
    if (ready.length === 0) return []
    const maps = ready.map((security) => {
      const first = security.bars[0]?.close ?? 1
      return new Map(
        security.bars.map((bar) => [bar.date, ((bar.close / first) - 1) * 100]),
      )
    })
    const dates = ready[0].bars.map((bar) => bar.date)
    return dates.map((date) => {
      const point: Record<string, string | number | null> = { date: date.slice(2) }
      compareTickers.forEach((ticker, index) => {
        point[ticker] = maps[index]?.get(date) ?? null
      })
      return point
    })
  }, [compareTickers, securities])

  const snapshotItems = snapshots.data?.items ?? []

  return (
    <div className="compare-grid">
      {/* ── Relative Performance chart ────────────────────────── */}
      <section className="terminal-panel panel-span-2">
        <div className="panel-header">
          <div className="panel-title">Relative Performance</div>
          <div className="panel-meta">normalized returns · base = first bar</div>
        </div>
        <div className="chart-panel">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#7f8b96', fontSize: 10 }}
                  minTickGap={28}
                />
                <YAxis
                  tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                  tick={{ fill: '#7f8b96', fontSize: 10 }}
                  width={54}
                />
                <Tooltip
                  contentStyle={{
                    background: '#090b0d',
                    border: '1px solid #1e242d',
                    color: '#d4dae1',
                  }}
                  formatter={(value: number) => [`${value.toFixed(2)}%`]}
                />
                {compareTickers.map((ticker, index) => (
                  <Line
                    key={ticker}
                    type="monotone"
                    dataKey={ticker}
                    stroke={COLORS[index % COLORS.length]}
                    dot={false}
                    strokeWidth={1.8}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="state-panel">Add symbols to compare normalized returns.</div>
          )}
        </div>

        {/* Legend row */}
        {compareTickers.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 'var(--sp-3)',
              padding: '6px 12px',
              borderTop: '1px solid var(--line)',
              flexWrap: 'wrap',
            }}
          >
            {compareTickers.map((ticker, index) => (
              <Link
                key={ticker}
                to={`/security/${ticker}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--sp-1)',
                  color: COLORS[index % COLORS.length],
                  fontSize: 'var(--fs-xs)',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 18,
                    height: 2,
                    background: COLORS[index % COLORS.length],
                    borderRadius: 1,
                  }}
                />
                {ticker}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Compare Set management ───────────────────────────── */}
      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Compare Set</div>
          <div className="panel-meta">{compareTickers.length} symbols</div>
        </div>
        <div className="panel-table-wrap">
          <table className="terminal-table compact">
            <thead>
              <tr>
                <th>Ticker</th>
                <th className="align-right">Flow</th>
              </tr>
            </thead>
            <tbody>
              {compareTickers.map((ticker, index) => (
                <tr key={ticker}>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: COLORS[index % COLORS.length],
                        marginRight: 'var(--sp-2)',
                        verticalAlign: 'middle',
                      }}
                    />
                    <Link to={`/security/${ticker}`} className="ticker-link">
                      {ticker}
                    </Link>
                  </td>
                  <td className="align-right">
                    <button
                      type="button"
                      className="table-action"
                      onClick={() =>
                        setCompareTickers(
                          compareTickers.filter((value) => value !== ticker),
                        )
                      }
                    >
                      RM
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel-body-pad">
          <div className="action-row">
            <button
              type="button"
              className="terminal-button terminal-button-ghost"
              onClick={() =>
                saveCompareSet(`Set ${compareTickers.join(' / ')}`, compareTickers)
              }
            >
              SAVE SET
            </button>
            <button
              type="button"
              className="terminal-button terminal-button-ghost"
              onClick={() => setCompareTickers(['SPY', 'QQQ'])}
            >
              RESET
            </button>
          </div>
          {savedCompareSets.length > 0 && (
            <div className="saved-inline-list">
              {savedCompareSets.slice(0, 4).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="saved-inline-button"
                  onClick={() => setCompareTickers(item.tickers)}
                >
                  <span>{item.name}</span>
                  <span>{item.tickers.join(' · ')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Snapshot Comparison table ────────────────────────── */}
      <section className="terminal-panel panel-span-2">
        <div className="panel-header">
          <div className="panel-title">Snapshot Comparison</div>
          <div className="panel-meta">ranked as loaded</div>
        </div>
        <div className="panel-table-wrap">
          <table className="terminal-table compact">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Name</th>
                <th className="align-right">Px</th>
                <th className="align-right">Day</th>
                <th className="align-right">20D</th>
                <th className="align-right">63D</th>
                <th className="align-right">252D</th>
                <th className="align-right">RSI</th>
                <th className="align-right">Score</th>
                <th className="align-right">Mkt Cap</th>
                <th>Flow</th>
              </tr>
            </thead>
            <tbody>
              {snapshotItems.map((item) => (
                <tr key={item.ticker}>
                  <td>
                    <Link to={`/security/${item.ticker}`} className="ticker-link">
                      {item.ticker}
                    </Link>
                  </td>
                  <td
                    style={{
                      color: 'var(--text-muted)',
                      maxWidth: 140,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.name ?? '—'}
                  </td>
                  <td className="align-right">{formatNumber(item.close)}</td>
                  <td className={`align-right ${toneClass(item.change_pct)}`}>
                    {formatPercent(item.change_pct)}
                  </td>
                  <td className={`align-right ${toneClass(item.return_20d)}`}>
                    {formatPercent(item.return_20d)}
                  </td>
                  <td className={`align-right ${toneClass(item.return_63d)}`}>
                    {formatPercent(item.return_63d)}
                  </td>
                  <td className={`align-right ${toneClass(item.return_252d)}`}>
                    {formatPercent(item.return_252d)}
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
                  <td className="align-right">{formatCompactNumber(item.market_cap)}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="table-action"
                        onClick={() =>
                          setCompareTickers(
                            compareTickers.filter((value) => value !== item.ticker),
                          )
                        }
                      >
                        RM
                      </button>
                      <button
                        type="button"
                        className="table-action"
                        onClick={() => navigate(`/security/${item.ticker}`)}
                      >
                        VIEW
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {snapshotItems.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ color: 'var(--text-dim)', padding: '12px 10px' }}>
                    Loading snapshot data…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <NewsPanel
        title="Compare News"
        items={news.data?.items ?? []}
        loading={news.isPending}
        empty="Comparison headlines will populate from the current compare set."
      />
    </div>
  )
}
