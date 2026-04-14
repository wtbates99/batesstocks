import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import NewsPanel from '../components/news/NewsPanel'
import { useNewsQuery, useSnapshotsQuery } from '../api/query'
import {
  formatCompactNumber,
  formatNumber,
  formatPercent,
  toneClass,
} from '../lib/formatters'
import { getActiveWatchlist, useTerminalStore, type WatchlistAnnotation } from '../state/terminalStore'

function watchlistName(index: number) {
  return `Watchlist ${index + 1}`
}

const RISK_LABELS: Record<string, string> = { H: 'HIGH', M: 'MED', L: 'LOW' }
const RISK_CLASSES: Record<string, string> = { H: 'tone-negative', M: 'tone-warning', L: 'tone-positive' }

export default function WatchlistsPage() {
  const navigate = useNavigate()
  const [renameDraft, setRenameDraft] = useState('')
  const [newName, setNewName] = useState('')
  const [batchAdd, setBatchAdd] = useState('')
  const [annotatingKey, setAnnotatingKey] = useState<string | null>(null)
  const [annDraft, setAnnDraft] = useState<WatchlistAnnotation>({})
  const {
    watchlists,
    activeWatchlistId,
    activeWatchlist,
    recentTickers,
    watchlistAnnotations,
    setActiveWatchlist,
    createWatchlist,
    renameWatchlist,
    deleteWatchlist,
    toggleWatchlist,
    setCompareTickers,
    setAnnotation,
    clearAnnotation,
  } = useTerminalStore(
    useShallow((state) => ({
      watchlists: state.watchlists,
      activeWatchlistId: state.activeWatchlistId,
      activeWatchlist: getActiveWatchlist(state),
      recentTickers: state.recentTickers,
      watchlistAnnotations: state.watchlistAnnotations,
      setActiveWatchlist: state.setActiveWatchlist,
      createWatchlist: state.createWatchlist,
      renameWatchlist: state.renameWatchlist,
      deleteWatchlist: state.deleteWatchlist,
      toggleWatchlist: state.toggleWatchlist,
      setCompareTickers: state.setCompareTickers,
      setAnnotation: state.setAnnotation,
      clearAnnotation: state.clearAnnotation,
    })),
  )

  function annKey(ticker: string) { return `${activeWatchlistId}:${ticker}` }

  function openAnn(ticker: string) {
    const key = annKey(ticker)
    setAnnotatingKey(key)
    setAnnDraft(watchlistAnnotations[key] ?? {})
  }

  function saveAnn() {
    if (!annotatingKey) return
    if (annDraft.note || annDraft.triggerPrice || annDraft.riskTag || annDraft.reviewDate) {
      setAnnotation(annotatingKey, annDraft)
    } else {
      clearAnnotation(annotatingKey)
    }
    setAnnotatingKey(null)
  }

  const symbols = activeWatchlist?.symbols ?? []
  const snapshots = useSnapshotsQuery(symbols, symbols.length > 0)
  const news = useNewsQuery(
    symbols.slice(0, 10),
    `watchlist-${activeWatchlistId}`,
    10,
    symbols.length > 0,
  )
  const items = snapshots.data?.items ?? []

  const winners = items.filter((item) => (item.change_pct ?? 0) > 0).length
  const losers = items.filter((item) => (item.change_pct ?? 0) < 0).length
  const avgRsi =
    items.length > 0
      ? items.reduce((sum, item) => sum + (item.rsi ?? 0), 0) / items.length
      : null
  const avgReturn20d =
    items.length > 0
      ? items.reduce((sum, item) => sum + (item.return_20d ?? 0), 0) / items.length
      : null
  const pctAbove200d =
    items.length > 0
      ? (items.filter((item) => item.above_sma_200).length / items.length) * 100
      : null

  const sectorBreakdown = useMemo(() => {
    const grouped = new Map<string, number>()
    for (const item of items) {
      const sector = item.sector ?? 'Unclassified'
      grouped.set(sector, (grouped.get(sector) ?? 0) + 1)
    }
    return Array.from(grouped.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
  }, [items])

  function handleBatchAdd() {
    if (!batchAdd.trim()) return
    const tickers = batchAdd
      .split(/[,\s]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean)
    for (const ticker of tickers) {
      if (!symbols.includes(ticker)) {
        toggleWatchlist(ticker, activeWatchlistId)
      }
    }
    setBatchAdd('')
  }

  return (
    <div className="watchlists-grid">
      {/* ── Watchlist Book management ──────────────────────────── */}
      <section className="terminal-panel panel-span-2">
        <div className="panel-header">
          <div className="panel-title">Watchlist Book</div>
          <div className="panel-meta">{watchlists.length} LISTS</div>
        </div>
        <div className="panel-body-pad">
          <div className="watchlist-tabs">
            {watchlists.map((watchlist, index) => (
              <button
                key={watchlist.id}
                type="button"
                className={`toolbar-chip${watchlist.id === activeWatchlistId ? ' is-active' : ''}`}
                onClick={() => {
                  setActiveWatchlist(watchlist.id)
                  setRenameDraft(watchlist.name)
                }}
              >
                {watchlist.name || watchlistName(index)}
                <span className="chip-count">{watchlist.symbols.length}</span>
              </button>
            ))}
          </div>
          <div className="watchlist-admin">
            <input
              className="terminal-input"
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              placeholder={activeWatchlist?.name ?? 'Rename active watchlist'}
            />
            <button
              type="button"
              className="terminal-button terminal-button-ghost"
              onClick={() => {
                if (!activeWatchlist) return
                renameWatchlist(activeWatchlist.id, renameDraft)
              }}
            >
              RENAME
            </button>
            <input
              className="terminal-input"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="New watchlist"
            />
            <button
              type="button"
              className="terminal-button"
              onClick={() => {
                createWatchlist(newName)
                setNewName('')
              }}
            >
              CREATE
            </button>
            <button
              type="button"
              className="terminal-button terminal-button-ghost"
              onClick={() => activeWatchlist && deleteWatchlist(activeWatchlist.id)}
              disabled={watchlists.length <= 1}
            >
              DELETE
            </button>
          </div>
          <div className="watchlist-admin" style={{ marginTop: 'var(--sp-2)' }}>
            <input
              className="terminal-input"
              style={{ flex: 1 }}
              value={batchAdd}
              onChange={(event) => setBatchAdd(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleBatchAdd()
              }}
              placeholder="Batch add: AAPL, MSFT, NVDA…"
            />
            <button type="button" className="terminal-button" onClick={handleBatchAdd}>
              ADD
            </button>
          </div>
        </div>
      </section>

      {/* ── List Summary stats ────────────────────────────────── */}
      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">List Summary</div>
          <div className="panel-meta">{symbols.length} SYMBOLS</div>
        </div>
        <div className="stats-row">
          <div className="stats-cell">
            <div className="stats-label">Winners</div>
            <div className={`stats-value ${winners > losers ? 'tone-positive' : winners < losers ? 'tone-negative' : ''}`}>
              {winners}
            </div>
            <div className="stats-sub">{losers} losers</div>
          </div>
          <div className="stats-cell">
            <div className="stats-label">Avg RSI</div>
            <div
              className={`stats-value ${(avgRsi ?? 50) >= 70 ? 'tone-negative' : (avgRsi ?? 50) <= 30 ? 'tone-positive' : ''}`}
            >
              {formatNumber(avgRsi, 1)}
            </div>
          </div>
          <div className="stats-cell">
            <div className="stats-label">20D Avg</div>
            <div className={`stats-value ${toneClass(avgReturn20d)}`}>
              {formatPercent(avgReturn20d)}
            </div>
          </div>
          <div className="stats-cell">
            <div className="stats-label">% &gt;200D</div>
            <div
              className={`stats-value ${(pctAbove200d ?? 0) >= 60 ? 'tone-positive' : (pctAbove200d ?? 0) <= 40 ? 'tone-negative' : 'tone-warning'}`}
            >
              {formatPercent(pctAbove200d, 0)}
            </div>
          </div>
        </div>
      </section>

      {/* ── Sector split ─────────────────────────────────────── */}
      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Sector Split</div>
        </div>
        {sectorBreakdown.length > 0 ? (
          <div className="panel-table-wrap">
            <table className="terminal-table compact">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Sector</th>
                  <th className="align-right">N</th>
                  <th className="align-right">%</th>
                </tr>
              </thead>
              <tbody>
                {sectorBreakdown.map(([sector, count], i) => (
                  <tr key={sector}>
                    <td style={{ color: 'var(--text-dim)', width: 24 }}>{i + 1}</td>
                    <td>
                      <Link
                        to={`/sector/${encodeURIComponent(sector)}`}
                        className="ticker-link"
                      >
                        {sector}
                      </Link>
                    </td>
                    <td className="align-right">{count}</td>
                    <td className="align-right" style={{ color: 'var(--text-dim)' }}>
                      {symbols.length > 0
                        ? formatPercent((count / symbols.length) * 100, 0)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-block">
            <div className="empty-title">No sector breakdown yet.</div>
            <div className="empty-copy">
              Add names to the active list and sector coverage will populate here.
            </div>
          </div>
        )}
      </section>

      {/* ── Recent symbols ───────────────────────────────────── */}
      <section className="terminal-panel">
        <div className="panel-header">
          <div className="panel-title">Recent Symbols</div>
        </div>
        <div className="panel-table-wrap">
          <table className="terminal-table compact">
            <thead>
              <tr>
                <th>Ticker</th>
                <th className="align-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {recentTickers.slice(0, 12).map((ticker) => (
                <tr key={ticker}>
                  <td>
                    <Link to={`/security/${ticker}`} className="ticker-link">
                      {ticker}
                    </Link>
                  </td>
                  <td className="align-right">
                    <button
                      type="button"
                      className="table-action"
                      onClick={() => toggleWatchlist(ticker, activeWatchlistId)}
                    >
                      {symbols.includes(ticker) ? 'RM' : 'ADD'}
                    </button>
                  </td>
                </tr>
              ))}
              {recentTickers.length === 0 && (
                <tr>
                  <td colSpan={2} style={{ color: 'var(--text-dim)', padding: '12px 10px' }}>
                    Navigate to symbols to build history
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Main monitor table ───────────────────────────────── */}
      <section className="terminal-panel panel-span-2">
        <div className="panel-header">
          <div className="panel-title">{activeWatchlist?.name ?? 'Watchlist'} Monitor</div>
          <div className="panel-meta">{items.length} loaded</div>
        </div>
        <div className="panel-table-wrap">
          <table className="terminal-table compact">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Name</th>
                <th>Sector</th>
                <th className="align-right">Px</th>
                <th className="align-right">Day</th>
                <th className="align-right">20D</th>
                <th className="align-right">63D</th>
                <th className="align-right">RSI</th>
                <th className="align-right">Score</th>
                <th className="align-right">Vol</th>
                <th>Flow</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const key = annKey(item.ticker)
                const ann = watchlistAnnotations[key]
                const isEditing = annotatingKey === key
                return (
                  <>
                    <tr key={item.ticker}>
                      <td>
                        <Link to={`/security/${item.ticker}`} className="ticker-link">{item.ticker}</Link>
                        {ann?.riskTag && <span className={`ann-risk-badge ${RISK_CLASSES[ann.riskTag]}`}>{RISK_LABELS[ann.riskTag]}</span>}
                      </td>
                      <td style={{ color: 'var(--text-muted)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name ?? '—'}
                        {ann?.note && <span className="ann-note-hint" title={ann.note}> ✎</span>}
                      </td>
                      <td>
                        {item.sector ? <Link to={`/sector/${encodeURIComponent(item.sector)}`} className="ticker-link">{item.sector}</Link> : '—'}
                      </td>
                      <td className="align-right">
                        {formatNumber(item.close)}
                        {ann?.triggerPrice && (
                          <div style={{ fontSize: 'var(--fs-xs)', color: (item.close ?? 0) >= ann.triggerPrice ? 'var(--green-soft)' : 'var(--amber-soft)' }}>
                            T:{formatNumber(ann.triggerPrice)}
                          </div>
                        )}
                      </td>
                      <td className={`align-right ${toneClass(item.change_pct)}`}>{formatPercent(item.change_pct)}</td>
                      <td className={`align-right ${toneClass(item.return_20d)}`}>{formatPercent(item.return_20d)}</td>
                      <td className={`align-right ${toneClass(item.return_63d)}`}>{formatPercent(item.return_63d)}</td>
                      <td className={`align-right ${(item.rsi ?? 50) >= 70 ? 'tone-negative' : (item.rsi ?? 50) <= 30 ? 'tone-positive' : ''}`}>
                        {formatNumber(item.rsi, 1)}
                      </td>
                      <td className={`align-right ${(item.tech_score ?? 0) >= 65 ? 'tone-positive' : ''}`}>{formatNumber(item.tech_score, 0)}</td>
                      <td className="align-right">{formatCompactNumber(item.volume)}</td>
                      <td>
                        <div className="table-actions">
                          <button type="button" className="table-action" onClick={() => toggleWatchlist(item.ticker, activeWatchlistId)}>RM</button>
                          <button type="button" className="table-action" onClick={() => { setCompareTickers([item.ticker, ...symbols.filter((v) => v !== item.ticker).slice(0, 3), 'SPY']); navigate('/compare') }}>COMP</button>
                          <button type="button" className="table-action" onClick={() => navigate(`/backtest?ticker=${item.ticker}`)}>BT</button>
                          <button type="button" className={`table-action${isEditing ? ' is-active' : ''}`} onClick={() => isEditing ? setAnnotatingKey(null) : openAnn(item.ticker)}>ANN</button>
                        </div>
                      </td>
                    </tr>
                    {isEditing && (
                      <tr key={`${item.ticker}-ann`}>
                        <td colSpan={11}>
                          <div className="ann-editor">
                            <input className="terminal-input" placeholder="Note / thesis" value={annDraft.note ?? ''} onChange={(e) => setAnnDraft((d) => ({ ...d, note: e.target.value }))} />
                            <input className="terminal-input" type="number" placeholder="Trigger price" value={annDraft.triggerPrice ?? ''} onChange={(e) => setAnnDraft((d) => ({ ...d, triggerPrice: e.target.value ? Number(e.target.value) : undefined }))} style={{ width: 110 }} />
                            <select className="terminal-input" value={annDraft.riskTag ?? ''} onChange={(e) => setAnnDraft((d) => ({ ...d, riskTag: e.target.value as 'H' | 'M' | 'L' | undefined || undefined }))}>
                              <option value="">Risk</option>
                              <option value="H">HIGH</option>
                              <option value="M">MED</option>
                              <option value="L">LOW</option>
                            </select>
                            <input className="terminal-input" type="date" value={annDraft.reviewDate ?? ''} onChange={(e) => setAnnDraft((d) => ({ ...d, reviewDate: e.target.value || undefined }))} style={{ width: 130 }} />
                            <button type="button" className="terminal-button" onClick={saveAnn}>SAVE</button>
                            {ann && <button type="button" className="terminal-button terminal-button-ghost" onClick={() => { clearAnnotation(key); setAnnotatingKey(null) }}>CLEAR</button>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
              {symbols.length === 0 && (
                <tr>
                  <td colSpan={11}>
                    <div className="empty-block">
                      <div className="empty-title">Active watchlist is empty.</div>
                      <div className="empty-copy">Add symbols from security, screener, compare, or the command bar.</div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <NewsPanel
        title={`${activeWatchlist?.name ?? 'Watchlist'} News`}
        items={news.data?.items ?? []}
        loading={news.isPending}
        empty="Watchlist headlines will appear here once the active list tracks symbols."
      />
    </div>
  )
}
