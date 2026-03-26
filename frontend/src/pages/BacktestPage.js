import React, { useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid, Cell,
} from 'recharts';
import NavBar from '../components/NavBar';
import SearchBar from '../components/SearchBar';
import '../styles.css';

const METRICS = [
  { value: 'Ticker_RSI',           label: 'RSI' },
  { value: 'Ticker_MACD',          label: 'MACD' },
  { value: 'Ticker_MACD_Diff',     label: 'MACD Diff' },
  { value: 'Ticker_Close',         label: 'Price' },
  { value: 'Ticker_SMA_10',        label: 'SMA 10' },
  { value: 'Ticker_SMA_30',        label: 'SMA 30' },
  { value: 'Ticker_Bollinger_PBand', label: 'Bollinger %B' },
  { value: 'Ticker_MFI',           label: 'MFI' },
  { value: 'Ticker_Tech_Score',    label: 'Tech Score' },
];

const CONDITIONS = [
  { value: 'crosses_below', label: 'crosses below' },
  { value: 'crosses_above', label: 'crosses above' },
  { value: 'below',         label: 'is below' },
  { value: 'above',         label: 'is above' },
];

const PRESETS = [
  { label: 'RSI Mean Reversion',   entry_metric: 'Ticker_RSI',        entry_condition: 'crosses_below', entry_threshold: 35, exit_metric: 'Ticker_RSI',        exit_condition: 'crosses_above', exit_threshold: 65 },
  { label: 'MACD Crossover',       entry_metric: 'Ticker_MACD_Diff',  entry_condition: 'crosses_above', entry_threshold: 0,  exit_metric: 'Ticker_MACD_Diff',  exit_condition: 'crosses_below', exit_threshold: 0 },
  { label: 'Tech Score Momentum',  entry_metric: 'Ticker_Tech_Score', entry_condition: 'crosses_above', entry_threshold: 60, exit_metric: 'Ticker_Tech_Score', exit_condition: 'crosses_below', exit_threshold: 40 },
  { label: 'Bollinger Squeeze',    entry_metric: 'Ticker_Bollinger_PBand', entry_condition: 'crosses_below', entry_threshold: 0.1, exit_metric: 'Ticker_Bollinger_PBand', exit_condition: 'crosses_above', exit_threshold: 0.9 },
];

const BacktestPage = () => {
  const [form, setForm] = useState({
    ticker: 'AAPL',
    entry_metric: 'Ticker_RSI', entry_condition: 'crosses_below', entry_threshold: 35,
    exit_metric: 'Ticker_RSI',  exit_condition: 'crosses_above',  exit_threshold: 65,
    initial_capital: 10000,
  });
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const applyPreset = (p) => setForm(f => ({ ...f, ...p }));

  const run = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch('/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          entry_threshold: Number(form.entry_threshold),
          exit_threshold:  Number(form.exit_threshold),
          initial_capital: Number(form.initial_capital),
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Backtest failed'); }
      setResult(await res.json());
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const f   = (v, dec = 2) => v != null ? Number(v).toFixed(dec) : '—';
  const pct = (v) => v != null ? `${v > 0 ? '+' : ''}${f(v)}%` : '—';

  return (
    <div className="bg-dark">
      <header className="header">
        <div className="header-left">
          <h1 className="header-title"><span>BATES</span>STOCKS</h1>
          <NavBar />
        </div>
        <div className="header-controls"><SearchBar /></div>
      </header>

      <div className="page-body">
        <div className="bt-layout">
          {/* Left: Builder */}
          <div className="bt-builder">
            <div className="bt-section-title">STRATEGY BUILDER</div>

            <div className="bt-field-group">
              <label className="bt-label">TICKER</label>
              <input className="bt-input" value={form.ticker}
                onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))} />
            </div>
            <div className="bt-field-group">
              <label className="bt-label">INITIAL CAPITAL ($)</label>
              <input className="bt-input" type="number" value={form.initial_capital}
                onChange={e => setForm(f => ({ ...f, initial_capital: e.target.value }))} />
            </div>

            <div className="bt-rule-card">
              <div className="bt-rule-title">ENTRY — BUY WHEN</div>
              <select className="bt-select" value={form.entry_metric}
                onChange={e => setForm(f => ({ ...f, entry_metric: e.target.value }))}>
                {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <select className="bt-select" value={form.entry_condition}
                onChange={e => setForm(f => ({ ...f, entry_condition: e.target.value }))}>
                {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <input className="bt-input" type="number" step="any" value={form.entry_threshold}
                onChange={e => setForm(f => ({ ...f, entry_threshold: e.target.value }))} />
            </div>

            <div className="bt-rule-card">
              <div className="bt-rule-title">EXIT — SELL WHEN</div>
              <select className="bt-select" value={form.exit_metric}
                onChange={e => setForm(f => ({ ...f, exit_metric: e.target.value }))}>
                {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <select className="bt-select" value={form.exit_condition}
                onChange={e => setForm(f => ({ ...f, exit_condition: e.target.value }))}>
                {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <input className="bt-input" type="number" step="any" value={form.exit_threshold}
                onChange={e => setForm(f => ({ ...f, exit_threshold: e.target.value }))} />
            </div>

            <div className="bt-presets">
              <div className="bt-label">PRESETS</div>
              {PRESETS.map(p => (
                <button key={p.label} className="bt-preset-btn" onClick={() => applyPreset(p)}>
                  {p.label}
                </button>
              ))}
            </div>

            <button className="bt-run-btn" onClick={run} disabled={loading}>
              {loading ? 'RUNNING…' : '▶ RUN BACKTEST'}
            </button>
            {error && <div className="bt-error">{error}</div>}
          </div>

          {/* Right: Results */}
          <div className="bt-results">
            {!result && !loading && (
              <div className="bt-empty">Configure a strategy and click RUN BACKTEST</div>
            )}
            {result && <>
              <div className="bt-section-title">{result.ticker} — {result.strategy}</div>

              <div className="bt-kpi-grid">
                {[
                  { label: 'STRATEGY RETURN', value: pct(result.total_return_pct),    color: result.total_return_pct >= 0 ? 'var(--green)' : 'var(--red)' },
                  { label: 'BUY & HOLD',       value: pct(result.buy_hold_return_pct), color: result.buy_hold_return_pct >= 0 ? 'var(--green)' : 'var(--red)' },
                  { label: 'TRADES',            value: result.num_trades,              color: 'var(--text)' },
                  { label: 'WIN RATE',          value: `${f(result.win_rate, 1)}%`,    color: result.win_rate >= 50 ? 'var(--green)' : 'var(--red)' },
                  { label: 'AVG RETURN',        value: pct(result.avg_return_pct),     color: result.avg_return_pct >= 0 ? 'var(--green)' : 'var(--red)' },
                  { label: 'MAX DRAWDOWN',      value: `${f(result.max_drawdown_pct)}%`, color: 'var(--red)' },
                  { label: 'SHARPE',            value: result.sharpe_ratio != null ? f(result.sharpe_ratio) : '—', color: result.sharpe_ratio > 1 ? 'var(--green)' : result.sharpe_ratio > 0 ? 'var(--text)' : 'var(--red)' },
                ].map(k => (
                  <div key={k.label} className="bt-kpi-card">
                    <div className="bt-kpi-label">{k.label}</div>
                    <div className="bt-kpi-value" style={{ color: k.color }}>{k.value}</div>
                  </div>
                ))}
              </div>

              <div className="bt-chart-title">EQUITY CURVE</div>
              <div className="bt-chart-wrap">
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={result.equity_curve} margin={{ top: 4, right: 40, bottom: 4, left: 0 }}>
                    <defs>
                      <linearGradient id="eq_grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#f97316" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#f97316" stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="1 5" stroke="#1c1c2e" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#3e3e58', fontSize: 8, fontFamily: 'JetBrains Mono, monospace' }}
                      interval="preserveStartEnd" minTickGap={40} axisLine={false} tickLine={false} height={14} />
                    <YAxis orientation="right" tick={{ fill: '#3e3e58', fontSize: 8, fontFamily: 'JetBrains Mono, monospace', dx: 2 }}
                      tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={40} />
                    <Tooltip formatter={(v) => [`$${Number(v).toLocaleString()}`, 'Portfolio']}
                      contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 10 }} />
                    <ReferenceLine y={result.equity_curve[0]?.value} stroke="#3e3e58" strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="value" stroke="#f97316" strokeWidth={1.5} fill="url(#eq_grad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {result.trades.length > 0 && <>
                <div className="bt-chart-title">TRADE RETURNS ({result.trades.length} trades)</div>
                <div className="bt-chart-wrap">
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={result.trades} margin={{ top: 4, right: 40, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="1 5" stroke="#1c1c2e" vertical={false} />
                      <XAxis dataKey="entry_date" tick={{ fill: '#3e3e58', fontSize: 7 }} interval="preserveStartEnd" minTickGap={40} axisLine={false} tickLine={false} height={12} />
                      <YAxis orientation="right" tick={{ fill: '#3e3e58', fontSize: 7, dx: 2 }} tickFormatter={v => `${v}%`} axisLine={false} tickLine={false} width={32} />
                      <Tooltip formatter={(v) => [`${v}%`, 'Return']}
                        contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 10 }} />
                      <ReferenceLine y={0} stroke="#3e3e58" />
                      <Bar dataKey="return_pct" radius={[2, 2, 0, 0]}>
                        {result.trades.map((t, i) => (
                          <Cell key={i} fill={t.return_pct >= 0 ? '#22c55e' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="bt-chart-title">TRADE HISTORY</div>
                <div className="bt-trades-wrap">
                  <table className="options-table">
                    <thead>
                      <tr><th>ENTRY DATE</th><th>ENTRY $</th><th>EXIT DATE</th><th>EXIT $</th><th className="num-col">RETURN</th><th className="num-col">P&amp;L</th></tr>
                    </thead>
                    <tbody>
                      {result.trades.map((t, i) => (
                        <tr key={i}>
                          <td>{t.entry_date}</td>
                          <td>${f(t.entry_price)}</td>
                          <td>{t.exit_date}</td>
                          <td>${f(t.exit_price)}</td>
                          <td className="num-col" style={{ color: t.return_pct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {pct(t.return_pct)}
                          </td>
                          <td className="num-col" style={{ color: t.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            ${f(Math.abs(t.pnl))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>}
            </>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BacktestPage;
