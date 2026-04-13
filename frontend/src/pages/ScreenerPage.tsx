import { useEffect, useState } from 'react'
import { Play, RotateCcw, Save } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import NewsPanel from '../components/news/NewsPanel'
import StrategyWorkbench from '../components/strategy/StrategyWorkbench'
import { useNewsQuery, useScreenMutation } from '../api/query'
import {
  buildStrategyDefinition,
  createDefaultStrategyDraft,
  type StrategyDraft,
} from '../lib/strategy'
import { formatNumber, formatPercent, formatTimestamp, toneClass } from '../lib/formatters'
import { loadJsonState, saveJsonState } from '../lib/storage'
import { useTerminalStore } from '../state/terminalStore'

export default function ScreenerPage() {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<StrategyDraft>(() =>
    loadJsonState('batesstocks:screener-draft', createDefaultStrategyDraft()),
  )
  const screen = useScreenMutation()
  const { setAiContext, saveScreenDraft, savedScreens, toggleWatchlist, setCompareTickers } =
    useTerminalStore(
      useShallow((state) => ({
        setAiContext: state.setAiContext,
        saveScreenDraft: state.saveScreenDraft,
        savedScreens: state.savedScreens,
        toggleWatchlist: state.toggleWatchlist,
        setCompareTickers: state.setCompareTickers,
      })),
    )

  const result = screen.data
  const newsTicker = result?.matches[0]?.ticker ?? 'SPY'
  const news = useNewsQuery([newsTicker], 'screener', 6, Boolean(newsTicker))

  useEffect(() => {
    saveJsonState('batesstocks:screener-draft', draft)
  }, [draft])

  const topSector = result?.matches
    .reduce(
      (acc, match) => {
        const s = match.sector ?? 'Unknown'
        acc[s] = (acc[s] ?? 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )
  const leadSector = topSector
    ? Object.entries(topSector).sort((a, b) => b[1] - a[1])[0]?.[0]
    : null

  return (
    <div className="workbench-grid">
      {/* ── Screener Builder ──────────────────────────────────── */}
      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Screener Builder</div>
          <div className="panel-meta">COMPOSITE RULE STACKS</div>
        </div>
        <div className="panel-body-pad">
          <StrategyWorkbench
            draft={draft}
            includeTicker={false}
            onChange={(updater) => setDraft((current) => updater(current))}
          />
          <div className="action-row">
            <button
              type="button"
              className="terminal-button"
              onClick={async () => {
                const strategy = buildStrategyDefinition(draft)
                setAiContext({ page: 'screener', strategy })
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
          {screen.isError && (
            <div className="inline-error">
              {screen.error instanceof Error ? screen.error.message : 'Screen request failed.'}
            </div>
          )}
        </div>
      </section>

      {/* ── Matches panel ─────────────────────────────────────── */}
      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Matches</div>
          <div className="panel-meta">{result?.generated_at ?? 'Awaiting execution'}</div>
        </div>

        {result && result.matches.length > 0 && (
          <>
            <div className="stats-row">
              <div className="stats-cell">
                <div className="stats-label">Matches</div>
                <div className="stats-value">{result.matches.length}</div>
              </div>
              <div className="stats-cell">
                <div className="stats-label">Top Score</div>
                <div className="stats-value tone-positive">
                  {formatNumber(result.matches[0]?.tech_score, 0)}
                </div>
              </div>
              <div className="stats-cell">
                <div className="stats-label">Lead Sector</div>
                <div className="stats-value" style={{ fontSize: 'var(--fs-xs)' }}>
                  {leadSector ?? '—'}
                </div>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                gap: 'var(--sp-2)',
                padding: '6px 10px',
                borderBottom: '1px solid var(--line)',
              }}
            >
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
          </>
        )}

        {result ? (
          <div className="panel-table-wrap">
            <table className="terminal-table compact">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Ticker</th>
                  <th>Sector</th>
                  <th className="align-right">Px</th>
                  <th className="align-right">RSI</th>
                  <th className="align-right">Score</th>
                  <th>State</th>
                  <th>Flow</th>
                </tr>
              </thead>
              <tbody>
                {result.matches.map((match, i) => (
                  <tr key={match.ticker}>
                    <td style={{ color: 'var(--text-dim)', width: 24 }}>{i + 1}</td>
                    <td>
                      <Link to={`/security/${match.ticker}`} className="ticker-link">
                        {match.ticker}
                      </Link>
                      {match.name && (
                        <div
                          style={{
                            color: 'var(--text-dim)',
                            fontSize: 'var(--fs-xs)',
                            marginTop: 1,
                          }}
                        >
                          {match.name.slice(0, 20)}
                        </div>
                      )}
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
                    <td
                      style={{
                        fontSize: 'var(--fs-xs)',
                        color:
                          match.signal_state === 'entry'
                            ? 'var(--green-soft)'
                            : match.signal_state === 'exit'
                              ? 'var(--red-soft)'
                              : 'var(--text-dim)',
                      }}
                    >
                      {match.signal_state.toUpperCase()}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="table-action"
                          onClick={() => toggleWatchlist(match.ticker)}
                        >
                          WATCH
                        </button>
                        <button
                          type="button"
                          className="table-action"
                          onClick={() => navigate(`/backtest?ticker=${match.ticker}`)}
                        >
                          BT
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {result.matches.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty-block">
                        <div className="empty-title">No active matches.</div>
                        <div className="empty-copy">
                          The current rule stack did not produce a live signal in the tracked
                          universe.
                        </div>
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
