import { useEffect, useState } from 'react'
import { Play, RotateCcw, Save } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import NewsPanel from '../components/news/NewsPanel'
import StrategyWorkbench from '../components/strategy/StrategyWorkbench'
import { useNewsQuery, useScreenMutation } from '../api/query'
import { buildStrategyDefinition, createDefaultStrategyDraft, type StrategyDraft } from '../lib/strategy'
import { formatNumber, formatTimestamp } from '../lib/formatters'
import { loadJsonState, saveJsonState } from '../lib/storage'
import { useTerminalStore } from '../state/terminalStore'

export default function ScreenerPage() {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<StrategyDraft>(() => loadJsonState('batesstocks:screener-draft', createDefaultStrategyDraft()))
  const screen = useScreenMutation()
  const {
    setAiContext,
    saveScreenDraft,
    savedScreens,
    toggleWatchlist,
    setCompareTickers,
  } = useTerminalStore(useShallow((state) => ({
    setAiContext: state.setAiContext,
    saveScreenDraft: state.saveScreenDraft,
    savedScreens: state.savedScreens,
    toggleWatchlist: state.toggleWatchlist,
    setCompareTickers: state.setCompareTickers,
  })))

  const result = screen.data
  const newsTicker = result?.matches[0]?.ticker ?? 'SPY'
  const news = useNewsQuery([newsTicker], 'screener', 6, Boolean(newsTicker))

  useEffect(() => {
    saveJsonState('batesstocks:screener-draft', draft)
  }, [draft])

  return (
    <div className="workbench-grid">
      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Screener Builder</div>
          <div className="panel-meta">COMPOSITE RULE STACKS</div>
        </div>
        <div className="panel-body-pad">
          <StrategyWorkbench draft={draft} includeTicker={false} onChange={(updater) => setDraft((current) => updater(current))} />
          <div className="action-row">
            <button
              type="button"
              className="terminal-button"
              onClick={async () => {
                const strategy = buildStrategyDefinition(draft)
                setAiContext({
                  page: 'screener',
                  strategy,
                })
                await screen.mutateAsync(strategy)
              }}
            >
              <Play size={12} />
              {screen.isPending ? 'SCANNING' : 'RUN SCREEN'}
            </button>
            <button
              type="button"
              className="terminal-button terminal-button-ghost"
              onClick={() => {
                setDraft(createDefaultStrategyDraft())
                screen.reset()
              }}
            >
              <RotateCcw size={12} />
              RESET
            </button>
            <button
              type="button"
              className="terminal-button terminal-button-ghost"
              onClick={() => saveScreenDraft(draft.name, draft)}
            >
              <Save size={12} />
              SAVE
            </button>
          </div>
          {savedScreens.length > 0 && (
            <div className="saved-inline-list">
              {savedScreens.slice(0, 4).map((item) => (
                <button key={item.id} type="button" className="saved-inline-button" onClick={() => setDraft(item.draft)}>
                  <span>{item.name}</span>
                  <span>{formatTimestamp(item.createdAt)}</span>
                </button>
              ))}
            </div>
          )}
          {screen.isError && (
            <div className="inline-error">
              {screen.error instanceof Error ? screen.error.message : 'Screen request failed.'}
            </div>
          )}
        </div>
      </section>

      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Matches</div>
          <div className="panel-meta">{result?.generated_at ?? 'Awaiting execution'}</div>
        </div>
        {result && result.matches.length > 0 && (
          <div className="panel-body-pad">
            <div className="quick-grid">
              <div className="quick-card"><span>Matches</span><span>{result.matches.length}</span></div>
              <div className="quick-card"><span>Top Score</span><span>{formatNumber(result.matches[0]?.tech_score, 0)}</span></div>
              <div className="quick-card"><span>Lead Sector</span><span>{result.matches[0]?.sector ?? '—'}</span></div>
            </div>
            <div className="action-row">
              <button
                type="button"
                className="terminal-button terminal-button-ghost"
                onClick={() => {
                  setCompareTickers(result.matches.slice(0, 5).map((match) => match.ticker))
                  navigate('/compare')
                }}
              >
                LOAD COMPARE
              </button>
            </div>
          </div>
        )}
        {result ? (
          <div className="panel-table-wrap">
            <table className="terminal-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Name</th>
                  <th>Sector</th>
                  <th className="align-right">Px</th>
                  <th className="align-right">RSI</th>
                  <th className="align-right">Score</th>
                  <th>State</th>
                  <th>Flow</th>
                </tr>
              </thead>
              <tbody>
                {result.matches.map((match) => (
                  <tr key={match.ticker}>
                    <td><Link to={`/security/${match.ticker}`} className="ticker-link">{match.ticker}</Link></td>
                    <td>{match.name ?? '—'}</td>
                    <td>{match.sector ?? '—'}</td>
                    <td className="align-right">{formatNumber(match.last_price)}</td>
                    <td className="align-right">{formatNumber(match.rsi, 1)}</td>
                    <td className="align-right">{formatNumber(match.tech_score, 0)}</td>
                    <td>{match.signal_state}</td>
                    <td>
                      <div className="table-actions">
                        <button type="button" className="table-action" onClick={() => toggleWatchlist(match.ticker)}>WATCH</button>
                        <button type="button" className="table-action" onClick={() => navigate(`/backtest?ticker=${match.ticker}`)}>BT</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {result.matches.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty-block">
                        <div className="empty-title">No active matches.</div>
                        <div className="empty-copy">The current rule stack did not produce a live signal in the tracked universe.</div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="state-panel">Run the screener to populate live matches.</div>
        )}
      </section>

      <NewsPanel
        title={`News ${newsTicker}`}
        items={news.data?.items ?? []}
        empty="Run a screen and the top candidate's news tape will populate here for triage."
      />
    </div>
  )
}
