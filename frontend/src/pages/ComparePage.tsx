import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { api } from '../api/client'
import { terminalKeys, useNewsQuery, useSnapshotsQuery } from '../api/query'
import NewsPanel from '../components/news/NewsPanel'
import { formatNumber, formatPercent } from '../lib/formatters'
import { useTerminalStore } from '../state/terminalStore'

const COLORS = ['#f3a037', '#3bb9e3', '#19b878', '#d24545', '#8b7cff', '#f08fb0']

export default function ComparePage() {
  const navigate = useNavigate()
  const { compareTickers, setCompareTickers, saveCompareSet, savedCompareSets } = useTerminalStore(useShallow((state) => ({
    compareTickers: state.compareTickers.length > 0 ? state.compareTickers : ['SPY', 'QQQ'],
    setCompareTickers: state.setCompareTickers,
    saveCompareSet: state.saveCompareSet,
    savedCompareSets: state.savedCompareSets,
  })))
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
        security.bars.map((bar) => [
          bar.date,
          ((bar.close / first) - 1) * 100,
        ]),
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
      <section className="terminal-panel panel-span-2">
        <div className="panel-header">
          <div className="panel-title">Relative Performance</div>
        </div>
        <div className="chart-panel">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <XAxis dataKey="date" tick={{ fill: '#7f8b96', fontSize: 10 }} minTickGap={28} />
                <YAxis tick={{ fill: '#7f8b96', fontSize: 10 }} width={72} />
                <Tooltip
                  contentStyle={{ background: '#090b0d', border: '1px solid #1e242d', color: '#d4dae1' }}
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
      </section>

      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Compare Set</div>
        </div>
        <div className="matrix-grid">
          {compareTickers.map((ticker) => (
            <button key={ticker} type="button" className="matrix-cell" onClick={() => navigate(`/security/${ticker}`)}>
              <span className="ticker-link">{ticker}</span>
            </button>
          ))}
        </div>
        <div className="panel-body-pad">
          <div className="action-row">
            <button type="button" className="terminal-button terminal-button-ghost" onClick={() => saveCompareSet(`Set ${compareTickers.join(' / ')}`, compareTickers)}>
              SAVE SET
            </button>
            <button type="button" className="terminal-button terminal-button-ghost" onClick={() => setCompareTickers(['SPY', 'QQQ'])}>
              RESET
            </button>
          </div>
          {savedCompareSets.length > 0 && (
            <div className="saved-inline-list">
              {savedCompareSets.slice(0, 4).map((item) => (
                <button key={item.id} type="button" className="saved-inline-button" onClick={() => setCompareTickers(item.tickers)}>
                  <span>{item.name}</span>
                  <span>{item.tickers.join(' · ')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="terminal-panel panel-span-2">
        <div className="panel-header">
          <div className="panel-title">Snapshot Comparison</div>
        </div>
        <div className="panel-table-wrap">
          <table className="terminal-table">
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
                  <td>{item.ticker}</td>
                  <td>{item.name ?? '—'}</td>
                  <td className="align-right">{formatNumber(item.close)}</td>
                  <td className="align-right">{formatPercent(item.change_pct)}</td>
                  <td className="align-right">{formatPercent(item.return_20d)}</td>
                  <td className="align-right">{formatPercent(item.return_63d)}</td>
                  <td className="align-right">{formatPercent(item.return_252d)}</td>
                  <td className="align-right">{formatNumber(item.rsi, 1)}</td>
                  <td className="align-right">{formatNumber(item.tech_score, 0)}</td>
                  <td className="align-right">{formatNumber(item.market_cap, 0)}</td>
                  <td>
                    <button
                      type="button"
                      className="table-action"
                      onClick={() => setCompareTickers(compareTickers.filter((value) => value !== item.ticker))}
                    >
                      RM
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <NewsPanel
        title="Compare News"
        items={news.data?.items ?? []}
        empty="Comparison headlines will populate from the current compare set."
      />
    </div>
  )
}
