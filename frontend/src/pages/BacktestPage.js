import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
  Cell,
} from 'recharts';
import NavBar from '../components/NavBar';
import SearchBar from '../components/SearchBar';
import '../styles.css';

const METRICS = [
  { value: 'Ticker_RSI', label: 'RSI' },
  { value: 'Ticker_MACD', label: 'MACD' },
  { value: 'Ticker_MACD_Diff', label: 'MACD Diff' },
  { value: 'Ticker_MACD_Signal', label: 'MACD Signal' },
  { value: 'Ticker_Close', label: 'Price' },
  { value: 'Ticker_SMA_10', label: 'SMA 10' },
  { value: 'Ticker_SMA_30', label: 'SMA 30' },
  { value: 'Ticker_SMA_250W', label: '250W MA' },
  { value: 'Ticker_EMA_10', label: 'EMA 10' },
  { value: 'Ticker_EMA_30', label: 'EMA 30' },
  { value: 'Ticker_VWAP', label: 'VWAP' },
  { value: 'Ticker_Bollinger_PBand', label: 'Bollinger %B' },
  { value: 'Ticker_Bollinger_WBand', label: 'Bollinger Width' },
  { value: 'Ticker_MFI', label: 'MFI' },
  { value: 'Ticker_Tech_Score', label: 'Tech Score' },
  { value: 'Ticker_Stochastic_K', label: 'Stochastic K' },
  { value: 'Ticker_Stochastic_D', label: 'Stochastic D' },
  { value: 'Ticker_Williams_R', label: 'Williams %R' },
  { value: 'Ticker_ROC', label: 'ROC' },
];

const CONDITIONS = [
  { value: 'crosses_below', label: 'crosses below' },
  { value: 'crosses_above', label: 'crosses above' },
  { value: 'below', label: 'is below' },
  { value: 'above', label: 'is above' },
];

const PRESET_GROUPS = [
  {
    label: 'MEAN REVERSION',
    presets: [
      {
        label: 'RSI Oversold',
        entry_metric: 'Ticker_RSI',
        entry_condition: 'crosses_below',
        entry_threshold: 35,
        exit_metric: 'Ticker_RSI',
        exit_condition: 'crosses_above',
        exit_threshold: 65,
      },
      {
        label: 'RSI Deep Oversold',
        entry_metric: 'Ticker_RSI',
        entry_condition: 'crosses_below',
        entry_threshold: 25,
        exit_metric: 'Ticker_RSI',
        exit_condition: 'crosses_above',
        exit_threshold: 55,
      },
      {
        label: 'Stoch Oversold',
        entry_metric: 'Ticker_Stochastic_K',
        entry_condition: 'crosses_below',
        entry_threshold: 20,
        exit_metric: 'Ticker_Stochastic_K',
        exit_condition: 'crosses_above',
        exit_threshold: 80,
      },
      {
        label: 'Stoch Extreme',
        entry_metric: 'Ticker_Stochastic_K',
        entry_condition: 'crosses_below',
        entry_threshold: 10,
        exit_metric: 'Ticker_Stochastic_K',
        exit_condition: 'crosses_above',
        exit_threshold: 90,
      },
      {
        label: 'MFI Value Buy',
        entry_metric: 'Ticker_MFI',
        entry_condition: 'crosses_below',
        entry_threshold: 20,
        exit_metric: 'Ticker_MFI',
        exit_condition: 'crosses_above',
        exit_threshold: 70,
      },
      {
        label: 'Bollinger Bounce',
        entry_metric: 'Ticker_Bollinger_PBand',
        entry_condition: 'crosses_below',
        entry_threshold: 0.1,
        exit_metric: 'Ticker_Bollinger_PBand',
        exit_condition: 'crosses_above',
        exit_threshold: 0.9,
      },
      {
        label: 'Williams Oversold',
        entry_metric: 'Ticker_Williams_R',
        entry_condition: 'crosses_below',
        entry_threshold: -80,
        exit_metric: 'Ticker_Williams_R',
        exit_condition: 'crosses_above',
        exit_threshold: -20,
      },
    ],
  },
  {
    label: 'MOMENTUM',
    presets: [
      {
        label: 'MACD Crossover',
        entry_metric: 'Ticker_MACD_Diff',
        entry_condition: 'crosses_above',
        entry_threshold: 0,
        exit_metric: 'Ticker_MACD_Diff',
        exit_condition: 'crosses_below',
        exit_threshold: 0,
      },
      {
        label: 'MACD Above Zero',
        entry_metric: 'Ticker_MACD',
        entry_condition: 'crosses_above',
        entry_threshold: 0,
        exit_metric: 'Ticker_MACD',
        exit_condition: 'crosses_below',
        exit_threshold: 0,
      },
      {
        label: 'Tech Score Breakout',
        entry_metric: 'Ticker_Tech_Score',
        entry_condition: 'crosses_above',
        entry_threshold: 60,
        exit_metric: 'Ticker_Tech_Score',
        exit_condition: 'crosses_below',
        exit_threshold: 40,
      },
      {
        label: 'Tech Score Strong',
        entry_metric: 'Ticker_Tech_Score',
        entry_condition: 'crosses_above',
        entry_threshold: 75,
        exit_metric: 'Ticker_Tech_Score',
        exit_condition: 'crosses_below',
        exit_threshold: 50,
      },
      {
        label: 'RSI Trend Follow',
        entry_metric: 'Ticker_RSI',
        entry_condition: 'crosses_above',
        entry_threshold: 55,
        exit_metric: 'Ticker_RSI',
        exit_condition: 'crosses_below',
        exit_threshold: 45,
      },
      {
        label: 'ROC Positive',
        entry_metric: 'Ticker_ROC',
        entry_condition: 'crosses_above',
        entry_threshold: 0,
        exit_metric: 'Ticker_ROC',
        exit_condition: 'crosses_below',
        exit_threshold: -2,
      },
      {
        label: 'MFI Momentum',
        entry_metric: 'Ticker_MFI',
        entry_condition: 'crosses_above',
        entry_threshold: 50,
        exit_metric: 'Ticker_MFI',
        exit_condition: 'crosses_below',
        exit_threshold: 30,
      },
    ],
  },
  {
    label: 'VOLATILITY',
    presets: [
      {
        label: 'BB Squeeze Entry',
        entry_metric: 'Ticker_Bollinger_PBand',
        entry_condition: 'crosses_below',
        entry_threshold: 0.05,
        exit_metric: 'Ticker_Bollinger_PBand',
        exit_condition: 'crosses_above',
        exit_threshold: 0.95,
      },
      {
        label: 'BB Breakout High',
        entry_metric: 'Ticker_Bollinger_PBand',
        entry_condition: 'crosses_above',
        entry_threshold: 0.95,
        exit_metric: 'Ticker_Bollinger_PBand',
        exit_condition: 'crosses_below',
        exit_threshold: 0.5,
      },
      {
        label: 'Low Vol Entry',
        entry_metric: 'Ticker_Bollinger_WBand',
        entry_condition: 'crosses_below',
        entry_threshold: 0.05,
        exit_metric: 'Ticker_Bollinger_WBand',
        exit_condition: 'crosses_above',
        exit_threshold: 0.15,
      },
      {
        label: 'Vol Expansion Exit',
        entry_metric: 'Ticker_Bollinger_WBand',
        entry_condition: 'above',
        entry_threshold: 0.08,
        exit_metric: 'Ticker_Bollinger_WBand',
        exit_condition: 'crosses_above',
        exit_threshold: 0.25,
      },
    ],
  },
  {
    label: 'COMPOSITE',
    presets: [
      {
        label: 'RSI + Score Exit',
        entry_metric: 'Ticker_RSI',
        entry_condition: 'crosses_below',
        entry_threshold: 40,
        exit_metric: 'Ticker_Tech_Score',
        exit_condition: 'crosses_above',
        exit_threshold: 65,
      },
      {
        label: 'MACD + RSI Exit',
        entry_metric: 'Ticker_MACD_Diff',
        entry_condition: 'crosses_above',
        entry_threshold: 0,
        exit_metric: 'Ticker_RSI',
        exit_condition: 'crosses_above',
        exit_threshold: 70,
      },
      {
        label: 'Oversold Recovery',
        entry_metric: 'Ticker_MFI',
        entry_condition: 'crosses_below',
        entry_threshold: 30,
        exit_metric: 'Ticker_MACD_Diff',
        exit_condition: 'crosses_above',
        exit_threshold: 0,
      },
      {
        label: 'Stoch + MACD',
        entry_metric: 'Ticker_Stochastic_K',
        entry_condition: 'crosses_below',
        entry_threshold: 20,
        exit_metric: 'Ticker_MACD_Diff',
        exit_condition: 'crosses_below',
        exit_threshold: 0,
      },
    ],
  },
  {
    label: '250W MA',
    presets: [
      {
        label: 'Buy Below 250W MA',
        entry_metric: 'Ticker_Close',
        entry_condition: 'crosses_below',
        entry_threshold: 0,
        entry_threshold_metric: 'Ticker_SMA_250W',
        exit_metric: 'Ticker_Close',
        exit_condition: 'crosses_above',
        exit_threshold: 0,
        exit_threshold_metric: 'Ticker_SMA_250W',
      },
      {
        label: '250W + RSI Exit',
        entry_metric: 'Ticker_Close',
        entry_condition: 'crosses_below',
        entry_threshold: 0,
        entry_threshold_metric: 'Ticker_SMA_250W',
        exit_metric: 'Ticker_RSI',
        exit_condition: 'crosses_above',
        exit_threshold: 60,
        exit_threshold_metric: null,
      },
      {
        label: '250W + MACD Exit',
        entry_metric: 'Ticker_Close',
        entry_condition: 'crosses_below',
        entry_threshold: 0,
        entry_threshold_metric: 'Ticker_SMA_250W',
        exit_metric: 'Ticker_MACD_Diff',
        exit_condition: 'crosses_above',
        exit_threshold: 0,
        exit_threshold_metric: null,
      },
      {
        label: 'Above 250W Momentum',
        entry_metric: 'Ticker_Close',
        entry_condition: 'crosses_above',
        entry_threshold: 0,
        entry_threshold_metric: 'Ticker_SMA_250W',
        exit_metric: 'Ticker_RSI',
        exit_condition: 'crosses_above',
        exit_threshold: 75,
        exit_threshold_metric: null,
      },
    ],
  },
  {
    label: 'VWAP',
    presets: [
      {
        label: 'Buy Below VWAP',
        entry_metric: 'Ticker_Close',
        entry_condition: 'crosses_below',
        entry_threshold: 0,
        entry_threshold_metric: 'Ticker_VWAP',
        exit_metric: 'Ticker_Close',
        exit_condition: 'crosses_above',
        exit_threshold: 0,
        exit_threshold_metric: 'Ticker_VWAP',
      },
      {
        label: 'VWAP Breakout',
        entry_metric: 'Ticker_Close',
        entry_condition: 'crosses_above',
        entry_threshold: 0,
        entry_threshold_metric: 'Ticker_VWAP',
        exit_metric: 'Ticker_RSI',
        exit_condition: 'crosses_above',
        exit_threshold: 70,
        exit_threshold_metric: null,
      },
      {
        label: 'VWAP + RSI Exit',
        entry_metric: 'Ticker_Close',
        entry_condition: 'crosses_below',
        entry_threshold: 0,
        entry_threshold_metric: 'Ticker_VWAP',
        exit_metric: 'Ticker_RSI',
        exit_condition: 'crosses_above',
        exit_threshold: 60,
        exit_threshold_metric: null,
      },
    ],
  },
];

const TIME_HORIZONS = [
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: '2Y', days: 730 },
  { label: '3Y', days: 1095 },
  { label: '5Y', days: 1825 },
  { label: 'ALL', days: null },
];

const toDateStr = (days) => {
  if (!days) return '';
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
};

const BacktestPage = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    ticker: 'AAPL',
    entry_metric: 'Ticker_RSI',
    entry_condition: 'crosses_below',
    entry_threshold: 35,
    entry_threshold_metric: null,
    exit_metric: 'Ticker_RSI',
    exit_condition: 'crosses_above',
    exit_threshold: 65,
    exit_threshold_metric: null,
    initial_capital: 10000,
    start_date: toDateStr(365),
    end_date: '',
  });
  const [entryThreshMode, setEntryThreshMode] = useState('value'); // 'value' | 'metric'
  const [exitThreshMode, setExitThreshMode] = useState('value');
  const [selectedHorizon, setSelectedHorizon] = useState('1Y');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openGroup, setOpenGroup] = useState('MEAN REVERSION');

  const applyPreset = (p) => {
    setForm((f) => ({
      ...f,
      ...p,
      entry_threshold_metric: p.entry_threshold_metric ?? null,
      exit_threshold_metric: p.exit_threshold_metric ?? null,
    }));
    setEntryThreshMode(p.entry_threshold_metric ? 'metric' : 'value');
    setExitThreshMode(p.exit_threshold_metric ? 'metric' : 'value');
  };

  const applyHorizon = (hz) => {
    setSelectedHorizon(hz.label);
    setForm((f) => ({ ...f, start_date: toDateStr(hz.days), end_date: '' }));
  };

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const payload = {
        ...form,
        entry_threshold: Number(form.entry_threshold),
        entry_threshold_metric: entryThreshMode === 'metric' ? form.entry_threshold_metric : null,
        exit_threshold: Number(form.exit_threshold),
        exit_threshold_metric: exitThreshMode === 'metric' ? form.exit_threshold_metric : null,
        initial_capital: Number(form.initial_capital),
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      };
      const res = await fetch('/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.detail || 'Backtest failed');
      }
      setResult(await res.json());
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const f = (v, dec = 2) => (v != null ? Number(v).toFixed(dec) : '—');
  const pct = (v) => (v != null ? `${v > 0 ? '+' : ''}${f(v)}%` : '—');

  return (
    <div className="bg-dark">
      <header className="header">
        <div className="header-left">
          <h1 className="header-title">
            <span>BATES</span>STOCKS
          </h1>
          <NavBar />
        </div>
        <div className="header-controls">
          <SearchBar />
        </div>
      </header>

      <div className="bt-page-body">
        <div className="bt-layout">
          {/* ── Left: Builder ── */}
          <div className="bt-builder">
            <div className="bt-section-title">STRATEGY BUILDER</div>

            <div className="bt-field-group">
              <label className="bt-label">TICKER</label>
              <input
                className="bt-input"
                value={form.ticker}
                onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))}
              />
            </div>

            <div className="bt-field-group">
              <label className="bt-label">INITIAL CAPITAL ($)</label>
              <input
                className="bt-input"
                type="number"
                value={form.initial_capital}
                onChange={(e) => setForm((f) => ({ ...f, initial_capital: e.target.value }))}
              />
            </div>

            {/* Time Horizon */}
            <div className="bt-field-group">
              <label className="bt-label">TIME HORIZON</label>
              <div className="bt-horizon-btns">
                {TIME_HORIZONS.map((hz) => (
                  <button
                    key={hz.label}
                    className={`bt-hz-btn ${selectedHorizon === hz.label ? 'active' : ''}`}
                    onClick={() => applyHorizon(hz)}
                  >
                    {hz.label}
                  </button>
                ))}
              </div>
              <div className="bt-date-row">
                <div className="bt-date-field">
                  <span className="bt-date-label">FROM</span>
                  <input
                    className="bt-input bt-date-input"
                    type="date"
                    value={form.start_date}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, start_date: e.target.value }));
                      setSelectedHorizon('');
                    }}
                  />
                </div>
                <div className="bt-date-field">
                  <span className="bt-date-label">TO</span>
                  <input
                    className="bt-input bt-date-input"
                    type="date"
                    value={form.end_date}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, end_date: e.target.value }));
                      setSelectedHorizon('');
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="bt-rule-card">
              <div className="bt-rule-title">ENTRY — BUY WHEN</div>
              <select
                className="bt-select"
                value={form.entry_metric}
                onChange={(e) => setForm((f) => ({ ...f, entry_metric: e.target.value }))}
              >
                {METRICS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <select
                className="bt-select"
                value={form.entry_condition}
                onChange={(e) => setForm((f) => ({ ...f, entry_condition: e.target.value }))}
              >
                {CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <div className="bt-thresh-row">
                <button
                  className={`bt-thresh-toggle ${entryThreshMode === 'value' ? 'active' : ''}`}
                  onClick={() => setEntryThreshMode('value')}
                >
                  VALUE
                </button>
                <button
                  className={`bt-thresh-toggle ${entryThreshMode === 'metric' ? 'active' : ''}`}
                  onClick={() => setEntryThreshMode('metric')}
                >
                  METRIC
                </button>
                {entryThreshMode === 'value' ? (
                  <input
                    className="bt-input bt-thresh-input"
                    type="number"
                    step="any"
                    value={form.entry_threshold}
                    onChange={(e) => setForm((f) => ({ ...f, entry_threshold: e.target.value }))}
                  />
                ) : (
                  <select
                    className="bt-select bt-thresh-input"
                    value={form.entry_threshold_metric || METRICS[0].value}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, entry_threshold_metric: e.target.value }))
                    }
                  >
                    {METRICS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="bt-rule-card">
              <div className="bt-rule-title">EXIT — SELL WHEN</div>
              <select
                className="bt-select"
                value={form.exit_metric}
                onChange={(e) => setForm((f) => ({ ...f, exit_metric: e.target.value }))}
              >
                {METRICS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <select
                className="bt-select"
                value={form.exit_condition}
                onChange={(e) => setForm((f) => ({ ...f, exit_condition: e.target.value }))}
              >
                {CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <div className="bt-thresh-row">
                <button
                  className={`bt-thresh-toggle ${exitThreshMode === 'value' ? 'active' : ''}`}
                  onClick={() => setExitThreshMode('value')}
                >
                  VALUE
                </button>
                <button
                  className={`bt-thresh-toggle ${exitThreshMode === 'metric' ? 'active' : ''}`}
                  onClick={() => setExitThreshMode('metric')}
                >
                  METRIC
                </button>
                {exitThreshMode === 'value' ? (
                  <input
                    className="bt-input bt-thresh-input"
                    type="number"
                    step="any"
                    value={form.exit_threshold}
                    onChange={(e) => setForm((f) => ({ ...f, exit_threshold: e.target.value }))}
                  />
                ) : (
                  <select
                    className="bt-select bt-thresh-input"
                    value={form.exit_threshold_metric || METRICS[0].value}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, exit_threshold_metric: e.target.value }))
                    }
                  >
                    {METRICS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Presets */}
            <div className="bt-presets-section">
              <div className="bt-label">STRATEGY PRESETS</div>
              {PRESET_GROUPS.map((group) => (
                <div key={group.label} className="bt-preset-group">
                  <button
                    className={`bt-preset-group-header ${openGroup === group.label ? 'open' : ''}`}
                    onClick={() => setOpenGroup((g) => (g === group.label ? '' : group.label))}
                  >
                    <span>{group.label}</span>
                    <span className="bt-preset-arrow">{openGroup === group.label ? '▲' : '▼'}</span>
                  </button>
                  {openGroup === group.label && (
                    <div className="bt-preset-list">
                      {group.presets.map((p) => (
                        <button
                          key={p.label}
                          className="bt-preset-btn"
                          onClick={() => applyPreset(p)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button className="bt-run-btn" onClick={run} disabled={loading}>
              {loading ? 'RUNNING…' : '▶ RUN BACKTEST'}
            </button>
            <button
              className="bt-screen-btn"
              onClick={() => {
                const params = new URLSearchParams({
                  entry_metric: form.entry_metric,
                  entry_condition: form.entry_condition,
                  entry_threshold:
                    entryThreshMode === 'metric' ? '0' : String(form.entry_threshold),
                  ...(entryThreshMode === 'metric' && form.entry_threshold_metric
                    ? { entry_threshold_metric: form.entry_threshold_metric }
                    : {}),
                });
                navigate(`/screener?${params.toString()}`);
              }}
            >
              SCREEN S&P 500 WITH ENTRY RULE →
            </button>
            {error && <div className="bt-error">{error}</div>}
          </div>

          {/* ── Right: Results ── */}
          <div className="bt-results">
            {!result && !loading && (
              <div className="bt-empty">Configure a strategy and click RUN BACKTEST</div>
            )}
            {loading && <div className="bt-empty">Running backtest…</div>}
            {result && (
              <>
                <div className="bt-results-header">
                  <div className="bt-section-title">{result.ticker}</div>
                  <div className="bt-strategy-label">{result.strategy}</div>
                </div>

                <div className="bt-kpi-grid">
                  {[
                    {
                      label: 'STRATEGY RETURN',
                      value: pct(result.total_return_pct),
                      color: result.total_return_pct >= 0 ? 'var(--green)' : 'var(--red)',
                    },
                    {
                      label: 'BUY & HOLD',
                      value: pct(result.buy_hold_return_pct),
                      color: result.buy_hold_return_pct >= 0 ? 'var(--green)' : 'var(--red)',
                    },
                    { label: 'TRADES', value: result.num_trades, color: 'var(--text)' },
                    {
                      label: 'WIN RATE',
                      value: `${f(result.win_rate, 1)}%`,
                      color: result.win_rate >= 50 ? 'var(--green)' : 'var(--red)',
                    },
                    {
                      label: 'AVG RETURN',
                      value: pct(result.avg_return_pct),
                      color: result.avg_return_pct >= 0 ? 'var(--green)' : 'var(--red)',
                    },
                    {
                      label: 'MAX DRAWDOWN',
                      value: `${f(result.max_drawdown_pct)}%`,
                      color: 'var(--red)',
                    },
                    {
                      label: 'SHARPE',
                      value: result.sharpe_ratio != null ? f(result.sharpe_ratio) : '—',
                      color:
                        result.sharpe_ratio > 1
                          ? 'var(--green)'
                          : result.sharpe_ratio > 0
                            ? 'var(--text)'
                            : 'var(--red)',
                    },
                  ].map((k) => (
                    <div key={k.label} className="bt-kpi-card">
                      <div className="bt-kpi-label">{k.label}</div>
                      <div className="bt-kpi-value" style={{ color: k.color }}>
                        {k.value}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bt-chart-title">EQUITY CURVE</div>
                <div className="bt-chart-wrap">
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart
                      data={result.equity_curve}
                      margin={{ top: 4, right: 40, bottom: 4, left: 0 }}
                    >
                      <defs>
                        <linearGradient id="eq_grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f97316" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="1 5" stroke="#1c1c2e" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{
                          fill: '#3e3e58',
                          fontSize: 8,
                          fontFamily: 'JetBrains Mono, monospace',
                        }}
                        interval="preserveStartEnd"
                        minTickGap={40}
                        axisLine={false}
                        tickLine={false}
                        height={14}
                      />
                      <YAxis
                        orientation="right"
                        tick={{
                          fill: '#3e3e58',
                          fontSize: 8,
                          fontFamily: 'JetBrains Mono, monospace',
                          dx: 2,
                        }}
                        tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                      />
                      <Tooltip
                        formatter={(v) => [`$${Number(v).toLocaleString()}`, 'Portfolio']}
                        contentStyle={{
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          fontSize: 10,
                        }}
                      />
                      <ReferenceLine
                        y={result.equity_curve[0]?.value}
                        stroke="#3e3e58"
                        strokeDasharray="3 3"
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#f97316"
                        strokeWidth={1.5}
                        fill="url(#eq_grad)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {result.trades.length > 0 && (
                  <>
                    <div className="bt-chart-title">
                      TRADE RETURNS ({result.trades.length} trades)
                    </div>
                    <div className="bt-chart-wrap">
                      <ResponsiveContainer width="100%" height={120}>
                        <BarChart
                          data={result.trades}
                          margin={{ top: 4, right: 40, bottom: 4, left: 0 }}
                        >
                          <CartesianGrid strokeDasharray="1 5" stroke="#1c1c2e" vertical={false} />
                          <XAxis
                            dataKey="entry_date"
                            tick={{ fill: '#3e3e58', fontSize: 7 }}
                            interval="preserveStartEnd"
                            minTickGap={40}
                            axisLine={false}
                            tickLine={false}
                            height={12}
                          />
                          <YAxis
                            orientation="right"
                            tick={{ fill: '#3e3e58', fontSize: 7, dx: 2 }}
                            tickFormatter={(v) => `${v}%`}
                            axisLine={false}
                            tickLine={false}
                            width={32}
                          />
                          <Tooltip
                            formatter={(v) => [`${v}%`, 'Return']}
                            contentStyle={{
                              background: 'var(--surface-2)',
                              border: '1px solid var(--border)',
                              fontSize: 10,
                            }}
                          />
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
                          <tr>
                            <th>ENTRY DATE</th>
                            <th>ENTRY $</th>
                            <th>EXIT DATE</th>
                            <th>EXIT $</th>
                            <th className="num-col">RETURN</th>
                            <th className="num-col">P&amp;L</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.trades.map((t, i) => (
                            <tr key={i}>
                              <td>{t.entry_date}</td>
                              <td>${f(t.entry_price)}</td>
                              <td>{t.exit_date}</td>
                              <td>${f(t.exit_price)}</td>
                              <td
                                className="num-col"
                                style={{ color: t.return_pct >= 0 ? 'var(--green)' : 'var(--red)' }}
                              >
                                {pct(t.return_pct)}
                              </td>
                              <td
                                className="num-col"
                                style={{ color: t.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}
                              >
                                ${f(Math.abs(t.pnl))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BacktestPage;
