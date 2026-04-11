import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { api } from '../api/client'
import type { WatchlistOut } from '../api/types'

function fmt(n: number | null | undefined, dec = 2) {
  return n != null ? n.toFixed(dec) : '—'
}

export default function WatchlistPage() {
  const navigate = useNavigate()
  const { data: watchlists, refetch } = useApi(() => api.watchlists.list(), [])
  const [selected, setSelected] = useState<number | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [newName, setNewName] = useState('')
  const [newTicker, setNewTicker] = useState('')
  const [creating, setCreating] = useState(false)

  const wl = watchlists?.find(w => w.id === selected) ?? watchlists?.[0] ?? null

  const createWatchlist = async () => {
    if (!newName.trim()) return
    await api.watchlists.create({ name: newName.trim(), tickers: [] })
    setNewName('')
    setCreating(false)
    refetch()
  }

  const deleteWatchlist = async (id: number) => {
    if (!confirm('Delete this watchlist?')) return
    await api.watchlists.delete(id)
    if (selected === id) setSelected(null)
    refetch()
  }

  const saveEdit = async (wl: WatchlistOut) => {
    await api.watchlists.update(wl.id, { name: editName, tickers: wl.tickers })
    setEditId(null)
    refetch()
  }

  const addTicker = async (wl: WatchlistOut) => {
    const t = newTicker.trim().toUpperCase()
    if (!t || wl.tickers.includes(t)) return
    await api.watchlists.update(wl.id, { name: wl.name, tickers: [...wl.tickers, t] })
    setNewTicker('')
    refetch()
  }

  const removeTicker = async (wl: WatchlistOut, ticker: string) => {
    await api.watchlists.update(wl.id, { name: wl.name, tickers: wl.tickers.filter(t => t !== ticker) })
    refetch()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 8, height: '100%', minHeight: 0 }}>
      {/* Left: list of watchlists */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Watchlists</span>
          <button className="term-btn" onClick={() => setCreating(true)} style={{ padding: '1px 4px' }}>
            <Plus size={11} />
          </button>
        </div>
        <div className="panel-body no-pad">
          {creating && (
            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 4 }}>
              <input
                className="term-input"
                placeholder="Name…"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createWatchlist()}
                autoFocus
              />
              <button className="term-btn primary" onClick={createWatchlist} style={{ padding: '2px 6px' }}>
                <Check size={11} />
              </button>
              <button className="term-btn" onClick={() => setCreating(false)} style={{ padding: '2px 6px' }}>
                <X size={11} />
              </button>
            </div>
          )}

          {watchlists?.map(w => (
            <div
              key={w.id}
              onClick={() => setSelected(w.id)}
              style={{
                padding: '6px 10px',
                borderBottom: '1px solid var(--border-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                background: wl?.id === w.id ? 'var(--bg-selected)' : '',
              }}
            >
              {editId === w.id ? (
                <>
                  <input
                    className="term-input"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(w); if (e.key === 'Escape') setEditId(null) }}
                    autoFocus
                    onClick={e => e.stopPropagation()}
                    style={{ flex: 1 }}
                  />
                  <button className="term-btn" onClick={e => { e.stopPropagation(); saveEdit(w) }} style={{ padding: '2px 4px' }}>
                    <Check size={11} />
                  </button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: wl?.id === w.id ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {w.name}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {w.tickers.length}
                  </span>
                  <button
                    className="term-btn"
                    style={{ padding: '1px 3px' }}
                    onClick={e => { e.stopPropagation(); setEditId(w.id); setEditName(w.name) }}
                  >
                    <Edit2 size={9} />
                  </button>
                  <button
                    className="term-btn danger"
                    style={{ padding: '1px 3px' }}
                    onClick={e => { e.stopPropagation(); deleteWatchlist(w.id) }}
                  >
                    <Trash2 size={9} />
                  </button>
                </>
              )}
            </div>
          ))}

          {watchlists?.length === 0 && (
            <div className="empty-state" style={{ padding: 24 }}>No watchlists</div>
          )}
        </div>
      </div>

      {/* Right: tickers */}
      <div className="panel" style={{ minHeight: 0 }}>
        {wl ? (
          <>
            <div className="panel-header">
              <span className="panel-title">{wl.name}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  className="term-input"
                  placeholder="Add ticker…"
                  value={newTicker}
                  onChange={e => setNewTicker(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && addTicker(wl)}
                  style={{ width: 90 }}
                />
                <button className="term-btn primary" onClick={() => addTicker(wl)} style={{ padding: '2px 6px' }}>
                  <Plus size={11} />
                </button>
              </div>
            </div>
            <div className="panel-body no-pad" style={{ overflow: 'auto' }}>
              {wl.tickers.length === 0 ? (
                <div className="empty-state">No tickers — add one above</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th>Company</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wl.tickers.map(t => (
                      <WatchlistRow
                        key={t}
                        ticker={t}
                        onView={() => navigate(`/spotlight/${t}`)}
                        onRemove={() => removeTicker(wl, t)}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ height: '100%' }}>
            Select or create a watchlist
          </div>
        )}
      </div>
    </div>
  )
}

function WatchlistRow({ ticker, onView, onRemove }: {
  ticker: string
  onView: () => void
  onRemove: () => void
}) {
  const { data: info } = useApi(() => api.stock.info(ticker), [ticker])

  return (
    <tr>
      <td>
        <span className="col-ticker" onClick={onView}>{ticker}</span>
      </td>
      <td>
        <span className="col-name">{info?.FullName ?? info?.ShortName ?? '—'}</span>
      </td>
      <td style={{ textAlign: 'right' }}>
        <button className="term-btn danger" onClick={onRemove} style={{ padding: '1px 4px' }}>
          <Trash2 size={10} />
        </button>
      </td>
    </tr>
  )
}
