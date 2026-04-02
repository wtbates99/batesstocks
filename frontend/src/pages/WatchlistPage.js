import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from 'recharts';
import NavBar from '../components/NavBar';
import { metricsList } from '../metricsList';
import { sessionFetch } from '../hooks/useSessionId';
import '../styles.css';

const FILTER_METRICS = [
  { value: 'Ticker_Close',    label: 'Price' },
  { value: 'Ticker_SMA_250W', label: '250W MA' },
  { value: 'Ticker_SMA_10',   label: 'SMA 10' },
  { value: 'Ticker_SMA_30',   label: 'SMA 30' },
  { value: 'Ticker_EMA_10',   label: 'EMA 10' },
  { value: 'Ticker_EMA_30',   label: 'EMA 30' },
  { value: 'Ticker_VWAP',     label: 'VWAP' },
  { value: 'Ticker_RSI',      label: 'RSI' },
  { value: 'Ticker_MFI',      label: 'MFI' },
  { value: 'Ticker_MACD',     label: 'MACD' },
  { value: 'Ticker_MACD_Diff',label: 'MACD Diff' },
  { value: 'Ticker_Tech_Score',label: 'Tech Score' },
  { value: 'Ticker_Stochastic_K', label: 'Stoch K' },
  { value: 'Ticker_Williams_R',   label: 'Williams %R' },
  { value: 'Ticker_ROC',          label: 'ROC' },
  { value: 'Ticker_Bollinger_PBand', label: 'BB %B' },
];

// ── Watchlist tab ──────────────────────────────────────────────────────────────

function WatchlistTab() {
  const navigate = useNavigate();
  const [lists, setLists]         = useState([]);
  const [newName, setNewName]     = useState('');
  const [newTickers, setNewTickers] = useState('');
  const [editId, setEditId]       = useState(null);
  const [editName, setEditName]   = useState('');
  const [editTickers, setEditTickers] = useState('');

  // Filter state
  const [filterRules, setFilterRules] = useState([
    { metric: 'Ticker_Close', condition: 'below', threshMode: 'metric', threshValue: '100', threshMetric: 'Ticker_SMA_250W' },
  ]);
  const [filterResults, setFilterResults] = useState(null); // null = not run yet
  const [filterLoading, setFilterLoading] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  // All tickers across all watchlists (deduplicated)
  const allTickers = useMemo(() => [...new Set(lists.flatMap(wl => wl.tickers))], [lists]);

  const addFilterRule = () => setFilterRules(r => [...r, { metric: 'Ticker_RSI', condition: 'below', threshMode: 'value', threshValue: '30', threshMetric: 'Ticker_SMA_250W' }]);
  const removeFilterRule = (i) => setFilterRules(r => r.filter((_, idx) => idx !== i));
  const updateFilterRule = (i, patch) => setFilterRules(r => r.map((rule, idx) => idx === i ? { ...rule, ...patch } : rule));

  const runFilter = async () => {
    if (!allTickers.length || !filterRules.length) return;
    setFilterLoading(true);
    try {
      // Collect all metrics needed
      const needed = new Set();
      filterRules.forEach(rule => {
        needed.add(rule.metric);
        if (rule.threshMode === 'metric') needed.add(rule.threshMetric);
      });
      const resp = await fetch('/metrics/latest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: allTickers, metrics: [...needed] }),
      });
      if (!resp.ok) throw new Error('Failed to fetch metrics');
      const data = await resp.json(); // [{ticker, Ticker_Close, ...}]

      // Apply filter rules
      const matching = data.filter(row => {
        return filterRules.every(rule => {
          const val = row[rule.metric];
          const thresh = rule.threshMode === 'metric' ? row[rule.threshMetric] : parseFloat(rule.threshValue);
          if (val == null || thresh == null) return false;
          if (rule.condition === 'above') return val > thresh;
          if (rule.condition === 'below') return val < thresh;
          return false;
        });
      });

      // Include metric values in results for display
      setFilterResults(matching.map(row => ({
        ticker: row.ticker,
        values: Object.fromEntries(filterRules.map(rule => [rule.metric, row[rule.metric]])),
        threshValues: Object.fromEntries(
          filterRules.filter(r => r.threshMode === 'metric').map(r => [r.threshMetric, row[r.threshMetric]])
        ),
      })));
    } catch (e) {
      console.error(e);
    }
    setFilterLoading(false);
  };

  const load = useCallback(() => {
    sessionFetch('/watchlists').then((r) => r.json()).then(setLists).catch(console.error);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!newName.trim()) return;
    const tickers = newTickers.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
    await sessionFetch('/watchlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), tickers }),
    });
    setNewName('');
    setNewTickers('');
    load();
  };

  const del = async (id) => {
    await sessionFetch(`/watchlists/${id}`, { method: 'DELETE' });
    load();
  };

  const startEdit = (wl) => {
    setEditId(wl.id);
    setEditName(wl.name);
    setEditTickers(wl.tickers.join(', '));
  };

  const saveEdit = async () => {
    const tickers = editTickers.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
    await sessionFetch(`/watchlists/${editId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), tickers }),
    });
    setEditId(null);
    load();
  };

  const loadInCharts = (tickers) => {
    navigate(`/?tickers=${tickers.join(',')}`);
  };

  return (
    <div className="wl-tab-content">
      {/* Metric Filter */}
      <div className="wl-filter-section">
        <div className="wl-filter-header" onClick={() => setFilterOpen(o => !o)}>
          <span className="wl-section-title">FILTER BY METRICS</span>
          <span className="bt-preset-arrow">{filterOpen ? '▲' : '▼'}</span>
        </div>
        {filterOpen && (
          <div className="wl-filter-body">
            {filterRules.map((rule, i) => (
              <div key={i} className="wl-filter-rule">
                <select className="filter-select" value={rule.metric} onChange={e => updateFilterRule(i, { metric: e.target.value })}>
                  {FILTER_METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <select className="filter-select" value={rule.condition} onChange={e => updateFilterRule(i, { condition: e.target.value })}>
                  <option value="below">is below</option>
                  <option value="above">is above</option>
                </select>
                <button
                  className={`bt-thresh-toggle ${rule.threshMode === 'value' ? 'active' : ''}`}
                  onClick={() => updateFilterRule(i, { threshMode: 'value' })}
                >VALUE</button>
                <button
                  className={`bt-thresh-toggle ${rule.threshMode === 'metric' ? 'active' : ''}`}
                  onClick={() => updateFilterRule(i, { threshMode: 'metric' })}
                >METRIC</button>
                {rule.threshMode === 'value' ? (
                  <input className="wl-input wl-input-sm" type="number" step="any" value={rule.threshValue}
                    onChange={e => updateFilterRule(i, { threshValue: e.target.value })} />
                ) : (
                  <select className="filter-select" value={rule.threshMetric} onChange={e => updateFilterRule(i, { threshMetric: e.target.value })}>
                    {FILTER_METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                )}
                <button className="wl-btn-danger wl-btn-sm" onClick={() => removeFilterRule(i)}>✕</button>
              </div>
            ))}
            <div className="wl-filter-actions">
              <button className="wl-btn-muted" onClick={addFilterRule}>+ ADD RULE</button>
              <button className="wl-btn-accent" onClick={runFilter} disabled={filterLoading || !allTickers.length}>
                {filterLoading ? 'FILTERING…' : `FILTER ${allTickers.length} TICKERS`}
              </button>
            </div>
            {filterResults !== null && (
              <div className="wl-filter-results">
                <div className="wl-filter-results-header">
                  <span className="wl-section-title">{filterResults.length} MATCHES</span>
                  {filterResults.length > 0 && (
                    <button className="wl-btn-accent" onClick={() => navigate(`/?tickers=${filterResults.map(r => r.ticker).join(',')}`)}>
                      LOAD IN CHARTS
                    </button>
                  )}
                </div>
                {filterResults.length === 0 && <div className="wl-empty">No tickers match the filter.</div>}
                <div className="wl-ticker-chips">
                  {filterResults.map(r => (
                    <span key={r.ticker} className="wl-chip" onClick={() => navigate(`/spotlight/${r.ticker}`)}>
                      {r.ticker}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create new */}
      <div className="wl-create-section">
        <h3 className="wl-section-title">NEW WATCHLIST</h3>
        <div className="wl-create-row">
          <input
            className="wl-input"
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <input
            className="wl-input wl-input-wide"
            placeholder="Tickers (comma-separated)"
            value={newTickers}
            onChange={(e) => setNewTickers(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <button className="wl-btn-accent" onClick={create}>+ CREATE</button>
        </div>
      </div>

      {/* List */}
      <div className="wl-list">
        {lists.length === 0 && (
          <div className="wl-empty">No watchlists yet. Create one above.</div>
        )}
        {lists.map((wl) => (
          <div key={wl.id} className="wl-card">
            {editId === wl.id ? (
              <div className="wl-edit-row">
                <input className="wl-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
                <input className="wl-input wl-input-wide" value={editTickers} onChange={(e) => setEditTickers(e.target.value)} />
                <button className="wl-btn-accent" onClick={saveEdit}>SAVE</button>
                <button className="wl-btn-muted" onClick={() => setEditId(null)}>CANCEL</button>
              </div>
            ) : (
              <>
                <div className="wl-card-header">
                  <span className="wl-card-name">{wl.name}</span>
                  <span className="wl-card-count">{wl.tickers.length} tickers</span>
                  <div className="wl-card-actions">
                    <button className="wl-btn-accent" onClick={() => loadInCharts(wl.tickers)}>LOAD</button>
                    <button className="wl-btn-muted"  onClick={() => startEdit(wl)}>EDIT</button>
                    <button className="wl-btn-danger" onClick={() => del(wl.id)}>✕</button>
                  </div>
                </div>
                <div className="wl-ticker-chips">
                  {wl.tickers.map((t) => (
                    <span
                      key={t}
                      className="wl-chip"
                      onClick={() => navigate(`/spotlight/${t}`)}
                    >{t}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Portfolio tab ──────────────────────────────────────────────────────────────

function PortfolioTab() {
  const navigate = useNavigate();
  const [portfolios, setPortfolios]     = useState([]);
  const [activePort, setActivePort]     = useState(null);
  const [chartData, setChartData]       = useState([]);
  const [chartDays, setChartDays]       = useState(90);
  const [newTicker, setNewTicker]       = useState('');
  const [newShares, setNewShares]       = useState('');
  const [newCost,   setNewCost]         = useState('');
  const [newNotes,  setNewNotes]        = useState('');
  const [portName,  setPortName]        = useState('');
  const [editPosId, setEditPosId]       = useState(null);
  const [editShares, setEditShares]     = useState('');
  const [editCost,   setEditCost]       = useState('');

  const loadPortfolios = useCallback(() => {
    sessionFetch('/portfolios').then((r) => r.json()).then((list) => {
      setPortfolios(list);
      if (list.length > 0 && !activePort) {
        loadPortfolio(list[0].id);
      }
    }).catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPortfolio = useCallback((id) => {
    sessionFetch(`/portfolios/${id}`).then((r) => r.json()).then(setActivePort).catch(console.error);
    sessionFetch(`/portfolios/${id}/chart?days=${chartDays}`)
      .then((r) => r.json()).then(setChartData).catch(console.error);
  }, [chartDays]);

  useEffect(() => { loadPortfolios(); }, [loadPortfolios]);

  useEffect(() => {
    if (activePort) {
      sessionFetch(`/portfolios/${activePort.id}/chart?days=${chartDays}`)
        .then((r) => r.json()).then(setChartData).catch(console.error);
    }
  }, [chartDays, activePort?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const createPortfolio = async () => {
    if (!portName.trim()) return;
    const resp = await sessionFetch('/portfolios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: portName.trim() }),
    });
    const port = await resp.json();
    setPortName('');
    setPortfolios((p) => [...p, { id: port.id, name: port.name }]);
    setActivePort(port);
  };

  const addPosition = async () => {
    if (!activePort || !newTicker || !newShares || !newCost) return;
    await sessionFetch(`/portfolios/${activePort.id}/positions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker: newTicker.toUpperCase(),
        shares: parseFloat(newShares),
        cost_basis: parseFloat(newCost),
        notes: newNotes || null,
      }),
    });
    setNewTicker(''); setNewShares(''); setNewCost(''); setNewNotes('');
    loadPortfolio(activePort.id);
  };

  const deletePosition = async (posId) => {
    await sessionFetch(`/portfolios/${activePort.id}/positions/${posId}`, { method: 'DELETE' });
    loadPortfolio(activePort.id);
  };

  const startEditPos = (pos) => {
    setEditPosId(pos.id);
    setEditShares(String(pos.shares));
    setEditCost(String(pos.cost_basis));
  };

  const saveEditPos = async (pos) => {
    await sessionFetch(`/portfolios/${activePort.id}/positions/${pos.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker: pos.ticker,
        shares: parseFloat(editShares),
        cost_basis: parseFloat(editCost),
        notes: pos.notes,
      }),
    });
    setEditPosId(null);
    loadPortfolio(activePort.id);
  };

  const pnlColor = (v) => v >= 0 ? 'var(--green)' : 'var(--red)';

  const chartFormatter = (v) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(v);

  const formatXTick = (tick) => {
    if (!tick) return '';
    const parts = String(tick).split('-');
    if (parts.length < 3) return tick;
    return `${parts[1]}/${parts[2]}`;
  };

  return (
    <div className="wl-tab-content">
      {/* Portfolio selector + create */}
      <div className="port-header-row">
        <div className="port-selector-group">
          {portfolios.map((p) => (
            <button
              key={p.id}
              className={`wl-btn-muted ${activePort?.id === p.id ? 'active' : ''}`}
              onClick={() => loadPortfolio(p.id)}
            >{p.name}</button>
          ))}
        </div>
        <div className="port-create-row">
          <input
            className="wl-input"
            placeholder="New portfolio name"
            value={portName}
            onChange={(e) => setPortName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createPortfolio()}
          />
          <button className="wl-btn-accent" onClick={createPortfolio}>+ PORTFOLIO</button>
        </div>
      </div>

      {activePort ? (
        <>
          {/* Summary strip */}
          <div className="port-summary-strip">
            <div className="port-stat">
              <span className="port-stat-label">TOTAL COST</span>
              <span className="port-stat-value">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(activePort.total_cost)}</span>
            </div>
            <div className="port-stat">
              <span className="port-stat-label">MARKET VALUE</span>
              <span className="port-stat-value">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(activePort.total_value)}</span>
            </div>
            <div className="port-stat">
              <span className="port-stat-label">TOTAL P&amp;L</span>
              <span className="port-stat-value" style={{ color: pnlColor(activePort.total_pnl) }}>
                {activePort.total_pnl >= 0 ? '+' : ''}{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(activePort.total_pnl)}
              </span>
            </div>
            <div className="port-stat">
              <span className="port-stat-label">POSITIONS</span>
              <span className="port-stat-value">{activePort.positions.length}</span>
            </div>
          </div>

          {/* Add position */}
          <div className="wl-create-section">
            <h3 className="wl-section-title">ADD POSITION</h3>
            <div className="wl-create-row">
              <input className="wl-input" placeholder="Ticker" value={newTicker} onChange={(e) => setNewTicker(e.target.value)} />
              <input className="wl-input" type="number" placeholder="Shares" value={newShares} onChange={(e) => setNewShares(e.target.value)} />
              <input className="wl-input" type="number" placeholder="Cost / share" value={newCost} onChange={(e) => setNewCost(e.target.value)} />
              <input className="wl-input wl-input-wide" placeholder="Notes (optional)" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
              <button className="wl-btn-accent" onClick={addPosition}>+ ADD</button>
            </div>
          </div>

          {/* Positions table */}
          <div className="port-table-wrap">
            <table className="screener-table">
              <thead>
                <tr>
                  {['TICKER','SHARES','COST/SH','TOTAL COST','CURR PRICE','MKT VALUE','P&L','P&L %','NOTES',''].map((h) => (
                    <th key={h} className="screener-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activePort.positions.map((pos) => {
                  const isEditing = editPosId === pos.id;
                  const costTotal = pos.shares * pos.cost_basis;
                  const mktVal = pos.current_price != null ? pos.shares * pos.current_price : costTotal;
                  return (
                    <tr key={pos.id} className="screener-row">
                      <td className="screener-td ticker-cell" onClick={() => navigate(`/spotlight/${pos.ticker}`)} style={{ cursor: 'pointer' }}>{pos.ticker}</td>
                      <td className="screener-td num-cell">
                        {isEditing
                          ? <input className="wl-input wl-input-sm" type="number" value={editShares} onChange={(e) => setEditShares(e.target.value)} />
                          : pos.shares}
                      </td>
                      <td className="screener-td num-cell">
                        {isEditing
                          ? <input className="wl-input wl-input-sm" type="number" value={editCost} onChange={(e) => setEditCost(e.target.value)} />
                          : `$${Number(pos.cost_basis).toFixed(2)}`}
                      </td>
                      <td className="screener-td num-cell">${costTotal.toFixed(2)}</td>
                      <td className="screener-td num-cell">{pos.current_price != null ? `$${Number(pos.current_price).toFixed(2)}` : '—'}</td>
                      <td className="screener-td num-cell">${mktVal.toFixed(2)}</td>
                      <td className="screener-td num-cell" style={{ color: pnlColor(pos.unrealized_pnl) }}>
                        {pos.unrealized_pnl != null ? `${pos.unrealized_pnl >= 0 ? '+' : ''}$${Math.abs(pos.unrealized_pnl).toFixed(2)}` : '—'}
                      </td>
                      <td className="screener-td num-cell" style={{ color: pnlColor(pos.unrealized_pnl_pct) }}>
                        {pos.unrealized_pnl_pct != null ? `${pos.unrealized_pnl_pct >= 0 ? '+' : ''}${pos.unrealized_pnl_pct.toFixed(2)}%` : '—'}
                      </td>
                      <td className="screener-td">{pos.notes || '—'}</td>
                      <td className="screener-td">
                        {isEditing ? (
                          <>
                            <button className="wl-btn-accent wl-btn-sm" onClick={() => saveEditPos(pos)}>✓</button>
                            <button className="wl-btn-muted  wl-btn-sm" onClick={() => setEditPosId(null)}>✕</button>
                          </>
                        ) : (
                          <>
                            <button className="wl-btn-muted  wl-btn-sm" onClick={() => startEditPos(pos)}>EDIT</button>
                            <button className="wl-btn-danger wl-btn-sm" onClick={() => deletePosition(pos.id)}>DEL</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* P&L Chart */}
          {chartData.length > 0 && (
            <div className="port-chart-section">
              <div className="port-chart-header">
                <span className="wl-section-title">PORTFOLIO VALUE</span>
                <div className="port-chart-range">
                  {[30, 90, 180, 365].map((d) => (
                    <button
                      key={d}
                      className={`toolbar-btn ${chartDays === d ? 'active' : ''}`}
                      onClick={() => setChartDays(d)}
                    >{d === 365 ? '1Y' : `${d}D`}</button>
                  ))}
                </div>
              </div>
              <div className="port-chart-container">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{ top: 4, right: 48, bottom: 4, left: 4 }}>
                    <CartesianGrid strokeDasharray="1 5" stroke="#1c1c2e" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#3e3e58', fontSize: 9, fontFamily: 'monospace' }}
                      tickFormatter={formatXTick}
                      interval="preserveStartEnd"
                      minTickGap={40}
                      axisLine={{ stroke: '#1c1c2e' }}
                      tickLine={false}
                      height={16}
                    />
                    <YAxis
                      orientation="right"
                      tick={{ fill: '#3e3e58', fontSize: 9, fontFamily: 'monospace', dx: 2 }}
                      tickFormatter={chartFormatter}
                      axisLine={false}
                      tickLine={false}
                      width={60}
                    />
                    <Tooltip
                      formatter={(v) => [new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v), 'Value']}
                      labelFormatter={(l) => l}
                      contentStyle={{ background: 'rgba(13,13,24,0.98)', border: '1px solid #2c2c44', borderRadius: 6, fontFamily: 'monospace', fontSize: 11 }}
                      labelStyle={{ color: '#3e3e58', fontSize: 10 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--accent)"
                      strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 3, strokeWidth: 0, fill: 'var(--accent)' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="wl-empty">Create a portfolio above to get started.</div>
      )}
    </div>
  );
}

// ── Alerts tab ─────────────────────────────────────────────────────────────────

function AlertsTab() {
  const [alerts, setAlerts] = useState([]);
  const [alertForm, setAlertForm] = useState({ ticker: '', metric: 'Ticker_Close', condition: 'above', threshold: '', notes: '' });

  const loadAlerts = useCallback(() => {
    sessionFetch('/alerts').then(r => r.json()).then(setAlerts).catch(console.error);
  }, []);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  const createAlert = async () => {
    if (!alertForm.ticker || !alertForm.threshold) return;
    await sessionFetch('/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...alertForm, threshold: parseFloat(alertForm.threshold) }),
    });
    setAlertForm({ ticker: '', metric: 'Ticker_Close', condition: 'above', threshold: '', notes: '' });
    loadAlerts();
  };

  const deleteAlert = async (id) => {
    await sessionFetch(`/alerts/${id}`, { method: 'DELETE' });
    loadAlerts();
  };

  return (
    <div className="wl-tab-content">
      <div className="wl-create-section">
        <h3 className="wl-section-title">NEW ALERT</h3>
        <div className="wl-create-row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <input className="wl-input" placeholder="Ticker" value={alertForm.ticker} onChange={e => setAlertForm(p => ({ ...p, ticker: e.target.value.toUpperCase() }))} />
          <select className="filter-select" value={alertForm.metric} onChange={e => setAlertForm(p => ({ ...p, metric: e.target.value }))}>
            {metricsList.map(m => <option key={m.name} value={m.name}>{m.name.replace('Ticker_', '').replace(/_/g, ' ')}</option>)}
          </select>
          <select className="filter-select" value={alertForm.condition} onChange={e => setAlertForm(p => ({ ...p, condition: e.target.value }))}>
            <option value="above">Above</option>
            <option value="below">Below</option>
          </select>
          <input className="wl-input" type="number" placeholder="Threshold" value={alertForm.threshold} onChange={e => setAlertForm(p => ({ ...p, threshold: e.target.value }))} />
          <input className="wl-input wl-input-wide" placeholder="Notes (optional)" value={alertForm.notes} onChange={e => setAlertForm(p => ({ ...p, notes: e.target.value }))} />
          <button className="wl-btn-accent" onClick={createAlert}>+ CREATE</button>
        </div>
      </div>
      <div className="wl-list">
        {alerts.length === 0 && <div className="wl-empty">No alerts yet.</div>}
        {alerts.map(a => (
          <div key={a.id} className="wl-card" style={{ background: a.triggered ? 'rgba(34,197,94,0.08)' : undefined }}>
            <div className="wl-card-header">
              <span className="wl-card-name">{a.ticker}</span>
              <span style={{ fontSize: 10, color: 'var(--dim)' }}>
                {a.metric.replace('Ticker_','').replace(/_/g,' ')} {a.condition} {a.threshold}
              </span>
              {a.triggered && <span className="signal-badge signal-momentum">TRIGGERED</span>}
              <div className="wl-card-actions">
                <button className="wl-btn-danger" onClick={() => deleteAlert(a.id)}>✕</button>
              </div>
            </div>
            {a.notes && <div style={{ fontSize: 9, color: 'var(--dim)', padding: '2px 0' }}>{a.notes}</div>}
            {a.triggered_at && <div style={{ fontSize: 9, color: 'var(--green)' }}>Triggered: {a.triggered_at}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

const WatchlistPage = () => {
  const [activeTab, setActiveTab] = useState('watchlists');

  return (
    <div className="wl-page">
      <header className="header">
        <div className="header-left">
          <h1 className="header-title"><span>BATES</span>STOCKS</h1>
          <NavBar />
        </div>
      </header>

      <div className="wl-body">
        <div className="wl-tab-bar">
          <button
            className={`wl-tab-btn ${activeTab === 'watchlists' ? 'active' : ''}`}
            onClick={() => setActiveTab('watchlists')}
          >WATCHLISTS</button>
          <button
            className={`wl-tab-btn ${activeTab === 'portfolio' ? 'active' : ''}`}
            onClick={() => setActiveTab('portfolio')}
          >PORTFOLIO</button>
          <button
            className={`wl-tab-btn ${activeTab === 'alerts' ? 'active' : ''}`}
            onClick={() => setActiveTab('alerts')}
          >ALERTS</button>
        </div>

        {activeTab === 'watchlists' ? <WatchlistTab /> : activeTab === 'alerts' ? <AlertsTab /> : <PortfolioTab />}
      </div>
    </div>
  );
};

export default WatchlistPage;
