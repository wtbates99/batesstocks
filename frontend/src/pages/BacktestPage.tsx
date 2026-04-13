import { useEffect, useMemo, useState } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Play, Save, ScanSearch } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import NewsPanel from '../components/news/NewsPanel'
import StrategyWorkbench from '../components/strategy/StrategyWorkbench'
import { useBacktestMutation, useNewsQuery, useScreenMutation } from '../api/query'
import { buildStrategyDefinition, createDefaultStrategyDraft, type StrategyDraft } from '../lib/strategy'
import { formatCurrency, formatNumber, formatPercent, formatTimestamp } from '../lib/formatters'
import { loadJsonState, saveJsonState } from '../lib/storage'
import { useTerminalStore } from '../state/terminalStore'

function ScoreCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="score-card">
      <div className="score-label">{label}</div>
      <div className={`score-value ${tone ?? ''}`}>{value}</div>
    </div>
  )
}

export default function BacktestPage() {
  const [params] = useSearchParams()
  const [draft, setDraft] = useState<StrategyDraft>(() => {
    const base = loadJsonState('batesstocks:backtest-draft', createDefaultStrategyDraft())
    const ticker = params.get('ticker')
    return ticker ? { ...base, ticker: ticker.toUpperCase() } : base
  })
  const backtest = useBacktestMutation()
  const screen = useScreenMutation()
  const {
    setAiContext,
    saveBacktestDraft,
    savedBacktests,
    toggleWatchlist,
  } = useTerminalStore((state) => ({
    setAiContext: state.setAiContext,
    saveBacktestDraft: state.saveBacktestDraft,
    savedBacktests: state.savedBacktests,
    toggleWatchlist: state.toggleWatchlist,
  }))

  useEffect(() => {
    const ticker = params.get('ticker')
    if (ticker) {
      setDraft((current) => ({ ...current, ticker: ticker.toUpperCase() }))
    }
  }, [params])

  useEffect(() => {
    saveJsonState('batesstocks:backtest-draft', draft)
  }, [draft])

  const result = backtest.data
  const news = useNewsQuery([draft.ticker], 'backtest', 6, Boolean(draft.ticker))
  const chartData = useMemo(
    () => result?.equity_curve.map((point) => ({
      date: point.date.slice(2),
      equity: point.equity,
      benchmark: point.benchmark,
    })) ?? [],
    [result],
  )

  return (
    <div className="workbench-grid">
      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Backtest Builder</div>
          <div className="panel-meta">NET OF FEES + SLIPPAGE</div>
        </div>
        <div className="panel-body-pad">
          <StrategyWorkbench draft={draft} includeTicker onChange={(updater) => setDraft((current) => updater(current))} />
          <div className="action-row">
            <button
              type="button"
              className="terminal-button"
              onClick={async () => {
                const strategy = buildStrategyDefinition(draft)
                setAiContext({
                  page: 'backtest',
                  ticker: draft.ticker,
                  strategy,
                })
                await backtest.mutateAsync({
                  ticker: draft.ticker.toUpperCase(),
                  strategy,
                })
              }}
            >
              <Play size={12} />
              {backtest.isPending ? 'RUNNING' : 'RUN BACKTEST'}
            </button>
            <button
              type="button"
              className="terminal-button terminal-button-ghost"
              onClick={async () => {
                const strategy = buildStrategyDefinition(draft)
                await screen.mutateAsync(strategy)
              }}
            >
              <ScanSearch size={12} />
              {screen.isPending ? 'SCANNING' : 'REFRESH MATCHES'}
            </button>
            <button
              type="button"
              className="terminal-button terminal-button-ghost"
              onClick={() => saveBacktestDraft(draft.name, draft)}
            >
              <Save size={12} />
              SAVE
            </button>
          </div>
          {savedBacktests.length > 0 && (
            <div className="saved-inline-list">
              {savedBacktests.slice(0, 4).map((item) => (
                <button key={item.id} type="button" className="saved-inline-button" onClick={() => setDraft(item.draft)}>
                  <span>{item.name}</span>
                  <span>{formatTimestamp(item.createdAt)}</span>
                </button>
              ))}
            </div>
          )}
          {backtest.isError && (
            <div className="inline-error">
              {backtest.error instanceof Error ? backtest.error.message : 'Backtest failed.'}
            </div>
          )}
        </div>
      </section>

      <div className="analytics-grid">
        <section className="terminal-panel">
          <div className="panel-header">
            <div className="panel-title">Scorecard</div>
          </div>
          <div className="score-grid">
            <ScoreCard label="Net Return" value={result ? formatPercent(result.summary.total_return_pct) : '—'} tone={result && result.summary.total_return_pct >= 0 ? 'tone-positive' : 'tone-negative'} />
            <ScoreCard label="Gross Return" value={result ? formatPercent(result.summary.gross_return_pct) : '—'} />
            <ScoreCard label="Cost Drag" value={result ? formatPercent(result.summary.cost_drag_pct) : '—'} tone="tone-warning" />
            <ScoreCard label="CAGR" value={result ? formatPercent(result.summary.annualized_return_pct) : '—'} />
            <ScoreCard label="Max Drawdown" value={result ? formatPercent(result.summary.max_drawdown_pct) : '—'} tone="tone-negative" />
            <ScoreCard label="Sharpe" value={result ? formatNumber(result.summary.sharpe_ratio, 2) : '—'} />
            <ScoreCard label="Sortino" value={result ? formatNumber(result.summary.sortino_ratio, 2) : '—'} />
            <ScoreCard label="Beta" value={result ? formatNumber(result.summary.beta, 2) : '—'} />
            <ScoreCard label="Fees Paid" value={result ? formatCurrency(result.summary.total_fees_paid) : '—'} />
          </div>
        </section>

        <section className="terminal-panel">
          <div className="panel-header">
            <div className="panel-title">Equity Curve</div>
          </div>
          <div className="chart-panel">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <XAxis dataKey="date" tick={{ fill: '#7f8b96', fontSize: 10 }} minTickGap={32} />
                  <YAxis tick={{ fill: '#7f8b96', fontSize: 10 }} width={72} />
                  <Tooltip
                    contentStyle={{
                      background: '#090b0d',
                      border: '1px solid #1e242d',
                      color: '#d4dae1',
                    }}
                  />
                  <Line type="monotone" dataKey="benchmark" stroke="#3bb9e3" dot={false} strokeWidth={1.4} />
                  <Line type="monotone" dataKey="equity" stroke="#f3a037" dot={false} strokeWidth={1.8} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="state-panel">Run a backtest to populate the equity curve.</div>
            )}
          </div>
        </section>

        <section className="terminal-panel">
          <div className="panel-header">
            <div className="panel-title">Executed Trades</div>
          </div>
          {result ? (
            <div className="panel-table-wrap">
              <table className="terminal-table">
                <thead>
                  <tr>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th className="align-right">Entry Px</th>
                    <th className="align-right">Exit Px</th>
                    <th className="align-right">Return</th>
                    <th className="align-right">PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((trade) => (
                    <tr key={`${trade.entry_date}-${trade.exit_date}-${trade.entry_price}`}>
                      <td>{trade.entry_date}</td>
                      <td>{trade.exit_date}</td>
                      <td className="align-right">{formatNumber(trade.entry_price)}</td>
                      <td className="align-right">{formatNumber(trade.exit_price)}</td>
                      <td className={`align-right ${trade.return_pct >= 0 ? 'tone-positive' : 'tone-negative'}`}>{formatPercent(trade.return_pct)}</td>
                      <td className={`align-right ${trade.pnl >= 0 ? 'tone-positive' : 'tone-negative'}`}>{formatCurrency(trade.pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="state-panel">No trade blotter yet.</div>
          )}
        </section>

        <section className="terminal-panel">
          <div className="panel-header">
            <div className="panel-title">Current Matches</div>
          </div>
          {(result?.current_matches || screen.data?.matches) ? (
            <div className="panel-table-wrap">
              <table className="terminal-table">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Sector</th>
                    <th className="align-right">Px</th>
                    <th className="align-right">RSI</th>
                    <th className="align-right">Score</th>
                    <th>Flow</th>
                  </tr>
                </thead>
                <tbody>
                  {(result?.current_matches ?? screen.data?.matches ?? []).map((match) => (
                    <tr key={match.ticker}>
                      <td>{match.ticker}</td>
                      <td>{match.sector ?? '—'}</td>
                      <td className="align-right">{formatNumber(match.last_price)}</td>
                      <td className="align-right">{formatNumber(match.rsi, 1)}</td>
                      <td className="align-right">{formatNumber(match.tech_score, 0)}</td>
                      <td>
                        <button type="button" className="table-action" onClick={() => toggleWatchlist(match.ticker)}>WATCH</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="state-panel">No screen results loaded.</div>
          )}
        </section>

        <NewsPanel
          title={`News ${draft.ticker.toUpperCase()}`}
          items={news.data?.items ?? []}
          empty="The research blotter will show current ticker news alongside the backtest workspace."
        />
      </div>
    </div>
  )
}
