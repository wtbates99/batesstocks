import { useEffect, useMemo, useState } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Play, Save, ScanSearch } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import NewsPanel from '../components/news/NewsPanel'
import StrategyWorkbench from '../components/strategy/StrategyWorkbench'
import { useBacktestMutation, useNewsQuery, useScreenMutation } from '../api/query'
import {
  buildStrategyDefinition,
  createDefaultStrategyDraft,
  type StrategyDraft,
} from '../lib/strategy'
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatTimestamp,
} from '../lib/formatters'
import { loadJsonState, saveJsonState } from '../lib/storage'
import { useTerminalStore } from '../state/terminalStore'

export default function BacktestPage() {
  const [params] = useSearchParams()
  const [draft, setDraft] = useState<StrategyDraft>(() => {
    const base = loadJsonState('batesstocks:backtest-draft', createDefaultStrategyDraft())
    const ticker = params.get('ticker')
    return ticker ? { ...base, ticker: ticker.toUpperCase() } : base
  })
  const backtest = useBacktestMutation()
  const screen = useScreenMutation()
  const { setAiContext, saveBacktestDraft, savedBacktests, toggleWatchlist } = useTerminalStore(
    useShallow((state) => ({
      setAiContext: state.setAiContext,
      saveBacktestDraft: state.saveBacktestDraft,
      savedBacktests: state.savedBacktests,
      toggleWatchlist: state.toggleWatchlist,
    })),
  )

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
  const currentMatches = result?.current_matches ?? screen.data?.matches ?? []
  const newsTickers = Array.from(
    new Set([draft.ticker.toUpperCase(), ...currentMatches.slice(0, 4).map((match) => match.ticker)]),
  ).filter(Boolean)
  const news = useNewsQuery(newsTickers, 'backtest', 8, newsTickers.length > 0)
  const chartData = useMemo(
    () =>
      result?.equity_curve.map((point) => ({
        date: point.date.slice(2),
        equity: point.equity,
        benchmark: point.benchmark,
        edge:
          point.benchmark != null && point.benchmark !== 0
            ? ((point.equity / point.benchmark) - 1) * 100
            : null,
      })) ?? [],
    [result],
  )

  useEffect(() => {
    if (!result && currentMatches.length === 0) return
    setAiContext({
      page: 'backtest',
      ticker: draft.ticker,
      strategy: draft,
      summary: result?.summary,
      currentMatches: currentMatches.slice(0, 8),
      newsTickers,
    })
  }, [currentMatches, draft, newsTickers, result, setAiContext])

  return (
    <div className="workbench-grid">
      {/* ── Backtest Builder ──────────────────────────────────── */}
      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Backtest Builder</div>
          <div className="panel-meta">NET OF FEES + SLIPPAGE</div>
        </div>
        <div className="panel-body-pad">
          <StrategyWorkbench
            draft={draft}
            includeTicker
            onChange={(updater) => setDraft((current) => updater(current))}
          />
          <div className="action-row">
            <button
              type="button"
              className="terminal-button"
              onClick={async () => {
                const strategy = buildStrategyDefinition(draft)
                setAiContext({ page: 'backtest', ticker: draft.ticker, strategy })
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
                <button
                  key={item.id}
                  type="button"
                  className="saved-inline-button"
                  onClick={() => setDraft(item.draft)}
                >
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

      {/* ── Analytics grid ────────────────────────────────────── */}
      <div className="analytics-grid">
        {/* Scorecard */}
        <section className="terminal-panel">
          <div className="panel-header">
            <div className="panel-title">Scorecard</div>
            {result && (
              <div className="panel-meta">
                {result.summary.num_trades} trades · {formatPercent(result.summary.win_rate, 0)}{' '}
                win rate
              </div>
            )}
          </div>
          <div className="stats-row" style={{ flexWrap: 'wrap' }}>
            <div className="stats-cell">
              <div className="stats-label">Net Return</div>
              <div
                className={`stats-value ${result && result.summary.total_return_pct >= 0 ? 'tone-positive' : 'tone-negative'}`}
              >
                {result ? formatPercent(result.summary.total_return_pct) : '—'}
              </div>
              {result && (
                <div className="stats-sub">
                  gross {formatPercent(result.summary.gross_return_pct)}
                </div>
              )}
            </div>
            <div className="stats-cell">
              <div className="stats-label">CAGR</div>
              <div className="stats-value">
                {result ? formatPercent(result.summary.annualized_return_pct) : '—'}
              </div>
            </div>
            <div className="stats-cell">
              <div className="stats-label">Max DD</div>
              <div className="stats-value tone-negative">
                {result ? formatPercent(result.summary.max_drawdown_pct) : '—'}
              </div>
            </div>
            <div className="stats-cell">
              <div className="stats-label">Sharpe</div>
              <div
                className={`stats-value ${result && (result.summary.sharpe_ratio ?? 0) >= 1 ? 'tone-positive' : ''}`}
              >
                {result ? formatNumber(result.summary.sharpe_ratio, 2) : '—'}
              </div>
            </div>
            <div className="stats-cell">
              <div className="stats-label">Sortino</div>
              <div className="stats-value">
                {result ? formatNumber(result.summary.sortino_ratio, 2) : '—'}
              </div>
            </div>
            <div className="stats-cell">
              <div className="stats-label">Beta</div>
              <div className="stats-value">
                {result ? formatNumber(result.summary.beta, 2) : '—'}
              </div>
            </div>
            <div className="stats-cell">
              <div className="stats-label">Cost Drag</div>
              <div className="stats-value tone-warning">
                {result ? formatPercent(result.summary.cost_drag_pct) : '—'}
              </div>
              {result && (
                <div className="stats-sub">{formatCurrency(result.summary.total_fees_paid)}</div>
              )}
            </div>
            <div className="stats-cell">
              <div className="stats-label">Buy &amp; Hold</div>
              <div
                className={`stats-value ${result && result.summary.buy_hold_return_pct >= 0 ? 'tone-positive' : 'tone-negative'}`}
              >
                {result ? formatPercent(result.summary.buy_hold_return_pct) : '—'}
              </div>
            </div>
          </div>
        </section>

        {/* Run Assumptions */}
        <section className="terminal-panel">
          <div className="panel-header">
            <div className="panel-title">Run Assumptions</div>
          </div>
          <div className="signal-list panel-body-pad">
            <div className="signal-row">
              <span>Ticker</span>
              <span>{draft.ticker || '—'}</span>
            </div>
            <div className="signal-row">
              <span>Initial Capital</span>
              <span>{formatCurrency(Number(draft.initialCapital || 0))}</span>
            </div>
            <div className="signal-row">
              <span>Position Size</span>
              <span>{formatPercent(Number(draft.positionSizePct || 0))}</span>
            </div>
            <div className="signal-row">
              <span>Fee Bps</span>
              <span>{formatNumber(Number(draft.feeBps || 0), 0)}</span>
            </div>
            <div className="signal-row">
              <span>Slippage Bps</span>
              <span>{formatNumber(Number(draft.slippageBps || 0), 0)}</span>
            </div>
            <div className="signal-row">
              <span>Max Positions</span>
              <span>1</span>
            </div>
          </div>
        </section>

        {/* Equity Curve */}
        <section className="terminal-panel">
          <div className="panel-header">
            <div className="panel-title">Equity Curve</div>
            <div className="panel-meta">
              <span style={{ color: '#f3a037' }}>■</span> strategy &nbsp;
              <span style={{ color: '#3bb9e3' }}>■</span> benchmark
            </div>
          </div>
          <div className="chart-panel">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#7f8b96', fontSize: 10 }}
                    minTickGap={32}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                    tick={{ fill: '#7f8b96', fontSize: 10 }}
                    width={54}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#090b0d',
                      border: '1px solid #1e242d',
                      color: '#d4dae1',
                    }}
                    formatter={(value: number) => [formatCurrency(value)]}
                  />
                  <Line
                    type="monotone"
                    dataKey="benchmark"
                    stroke="#3bb9e3"
                    dot={false}
                    strokeWidth={1.4}
                  />
                  <Line
                    type="monotone"
                    dataKey="equity"
                    stroke="#f3a037"
                    dot={false}
                    strokeWidth={1.8}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="state-panel">Run a backtest to populate the equity curve.</div>
            )}
          </div>
        </section>

        {/* Relative Edge */}
        <section className="terminal-panel">
          <div className="panel-header">
            <div className="panel-title">Relative Edge</div>
            <div className="panel-meta">strategy vs benchmark %</div>
          </div>
          <div className="chart-panel">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData}>
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#7f8b96', fontSize: 10 }}
                    minTickGap={32}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                    tick={{ fill: '#7f8b96', fontSize: 10 }}
                    width={44}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#090b0d',
                      border: '1px solid #1e242d',
                      color: '#d4dae1',
                    }}
                    formatter={(value: number) => [`${value.toFixed(2)}%`]}
                  />
                  <Line
                    type="monotone"
                    dataKey="edge"
                    stroke="#3bb9e3"
                    dot={false}
                    strokeWidth={1.4}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="state-panel">Run a backtest to inspect benchmark-relative edge.</div>
            )}
          </div>
        </section>

        {/* Executed Trades */}
        <section className="terminal-panel">
          <div className="panel-header">
            <div className="panel-title">Executed Trades</div>
            {result && (
              <div className="panel-meta">
                {result.trades.filter((t) => t.return_pct >= 0).length} wins /{' '}
                {result.trades.filter((t) => t.return_pct < 0).length} losses
              </div>
            )}
          </div>
          {result ? (
            <div className="panel-table-wrap">
              <table className="terminal-table compact">
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
                      <td
                        className={`align-right ${trade.return_pct >= 0 ? 'tone-positive' : 'tone-negative'}`}
                      >
                        {formatPercent(trade.return_pct)}
                      </td>
                      <td
                        className={`align-right ${trade.pnl >= 0 ? 'tone-positive' : 'tone-negative'}`}
                      >
                        {formatCurrency(trade.pnl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="state-panel">No trade blotter yet.</div>
          )}
        </section>

        {/* Current Matches */}
        <section className="terminal-panel">
          <div className="panel-header">
            <div className="panel-title">Current Matches</div>
          </div>
          {currentMatches.length > 0 ? (
            <div className="panel-table-wrap">
              <table className="terminal-table compact">
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
                  {currentMatches.map((match) => (
                    <tr key={match.ticker}>
                      <td>
                        <Link to={`/security/${match.ticker}`} className="ticker-link">
                          {match.ticker}
                        </Link>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>
                        {match.sector ?? '—'}
                      </td>
                      <td className="align-right">{formatNumber(match.last_price)}</td>
                      <td
                        className={`align-right ${
                          (match.rsi ?? 50) >= 70
                            ? 'tone-negative'
                            : (match.rsi ?? 50) <= 30
                              ? 'tone-positive'
                              : ''
                        }`}
                      >
                        {formatNumber(match.rsi, 1)}
                      </td>
                      <td
                        className={`align-right ${(match.tech_score ?? 0) >= 65 ? 'tone-positive' : ''}`}
                      >
                        {formatNumber(match.tech_score, 0)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="table-action"
                          onClick={() => toggleWatchlist(match.ticker)}
                        >
                          WATCH
                        </button>
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
          title={`Research News ${newsTickers.join(' · ')}`}
          items={news.data?.items ?? []}
          empty="The research blotter will show current ticker and active match news alongside the backtest workspace."
        />
      </div>
    </div>
  )
}
