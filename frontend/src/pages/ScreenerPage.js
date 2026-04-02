import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import NavBar from '../components/NavBar';
import '../styles.css';

const STRATEGY_METRICS = [
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

const STRATEGY_CONDITIONS = [
  { value: 'crosses_below', label: 'crosses below' },
  { value: 'crosses_above', label: 'crosses above' },
  { value: 'below', label: 'is below' },
  { value: 'above', label: 'is above' },
];

function Sparkline({ data, width = 60, height = 24 }) {
  if (!data || data.length < 2) return <span style={{ color: 'var(--dim)', fontSize: 9 }}>—</span>;
  const min = Math.min(...data),
    max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = data[data.length - 1];
  const first = data[0];
  const color = last >= first ? '#22c55e' : '#ef4444';
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function fmt(key, val) {
  if (val == null) return <span style={{ color: 'var(--dim)' }}>—</span>;
  switch (key) {
    case 'market_cap':
      return new Intl.NumberFormat('en-US', {
        notation: 'compact',
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 1,
      }).format(val);
    case 'latest_close':
      return `$${Number(val).toFixed(2)}`;
    case 'pe':
      return Number(val).toFixed(1);
    case 'eps':
      return `$${Number(val).toFixed(2)}`;
    case 'beta':
      return (
        <span
          style={{ color: val > 1.5 ? 'var(--red)' : val < 0.5 ? 'var(--cyan)' : 'var(--text)' }}
        >
          {Number(val).toFixed(2)}
        </span>
      );
    case 'rsi':
      return (
        <span
          style={{ color: val > 70 ? 'var(--red)' : val < 30 ? 'var(--green)' : 'var(--text)' }}
        >
          {Number(val).toFixed(1)}
        </span>
      );
    case 'tech_score':
      return (
        <span
          style={{ color: val >= 70 ? 'var(--green)' : val < 40 ? 'var(--red)' : 'var(--text)' }}
        >
          {Number(val).toFixed(0)}
        </span>
      );
    case 'return_52w':
      return (
        <span style={{ color: val >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {val >= 0 ? '+' : ''}
          {Number(val).toFixed(1)}%
        </span>
      );
    default:
      return val;
  }
}

const ScreenerPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('market_cap');
  const [sortDir, setSortDir] = useState('desc');
  const [filters, setFilters] = useState({
    sector: '',
    minPE: '',
    maxPE: '',
    minMktCap: '',
    maxMktCap: '',
    minRSI: '',
    maxRSI: '',
    min52W: '',
    max52W: '',
  });
  const [patternFilter, setPatternFilter] = useState('');
  const [patternMap, setPatternMap] = useState({});

  // Strategy filter state
  const [strategyRule, setStrategyRule] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return {
      entry_metric: p.get('entry_metric') || 'Ticker_RSI',
      entry_condition: p.get('entry_condition') || 'crosses_below',
      entry_threshold: p.get('entry_threshold') || '35',
      entry_threshold_metric: p.get('entry_threshold_metric') || '',
    };
  });
  const [strategyThreshMode, setStrategyThreshMode] = useState(() =>
    new URLSearchParams(window.location.search).get('entry_threshold_metric') ? 'metric' : 'value'
  );
  const [strategyMatches, setStrategyMatches] = useState(null); // null = no scan run yet
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [strategyEnabled, setStrategyEnabled] = useState(false);

  useEffect(() => {
    fetch('/screener')
      .then((r) => r.json())
      .then((d) => {
        setAllData(d);
        setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetch('/patterns?days=1')
      .then((r) => r.json())
      .then((d) => {
        const map = {};
        (Array.isArray(d) ? d : []).forEach((p) => {
          if (!map[p.ticker]) map[p.ticker] = [];
          map[p.ticker].push(p.pattern_type);
        });
        setPatternMap(map);
      })
      .catch(() => {});
  }, []);

  // Auto-run scan if arriving from backtest page
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get('entry_metric')) {
      setStrategyEnabled(true);
      runStrategyScreen({
        entry_metric: p.get('entry_metric') || 'Ticker_RSI',
        entry_condition: p.get('entry_condition') || 'crosses_below',
        entry_threshold: parseFloat(p.get('entry_threshold') || '35'),
        entry_threshold_metric: p.get('entry_threshold_metric') || null,
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runStrategyScreen = useCallback(
    async (rule) => {
      const r = rule || {
        entry_metric: strategyRule.entry_metric,
        entry_condition: strategyRule.entry_condition,
        entry_threshold: parseFloat(strategyRule.entry_threshold) || 0,
        entry_threshold_metric:
          strategyThreshMode === 'metric' ? strategyRule.entry_threshold_metric || null : null,
      };
      setStrategyLoading(true);
      setStrategyEnabled(true);
      try {
        const res = await fetch('/strategy-screen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(r),
        });
        if (!res.ok) throw new Error('Scan failed');
        const tickers = await res.json();
        setStrategyMatches(new Set(tickers));
      } catch (e) {
        console.error(e);
        setStrategyMatches(new Set());
      }
      setStrategyLoading(false);
    },
    [strategyRule, strategyThreshMode]
  );

  const sectors = useMemo(() => {
    const s = new Set(allData.map((r) => r.sector).filter(Boolean));
    return [...s].sort();
  }, [allData]);

  const setFilter = useCallback((key, val) => {
    setFilters((prev) => ({ ...prev, [key]: val }));
  }, []);

  const filtered = useMemo(() => {
    let rows = allData;
    const { sector, minPE, maxPE, minMktCap, maxMktCap, minRSI, maxRSI, min52W, max52W } = filters;
    if (sector) rows = rows.filter((r) => r.sector === sector);
    if (minPE) rows = rows.filter((r) => r.pe != null && r.pe >= parseFloat(minPE));
    if (maxPE) rows = rows.filter((r) => r.pe != null && r.pe <= parseFloat(maxPE));
    if (minMktCap)
      rows = rows.filter(
        (r) => r.market_cap != null && r.market_cap >= parseFloat(minMktCap) * 1e9
      );
    if (maxMktCap)
      rows = rows.filter(
        (r) => r.market_cap != null && r.market_cap <= parseFloat(maxMktCap) * 1e9
      );
    if (minRSI) rows = rows.filter((r) => r.rsi != null && r.rsi >= parseFloat(minRSI));
    if (maxRSI) rows = rows.filter((r) => r.rsi != null && r.rsi <= parseFloat(maxRSI));
    if (min52W)
      rows = rows.filter((r) => r.return_52w != null && r.return_52w >= parseFloat(min52W));
    if (max52W)
      rows = rows.filter((r) => r.return_52w != null && r.return_52w <= parseFloat(max52W));
    if (patternFilter)
      rows = rows.filter((r) => (patternMap[r.ticker] || []).includes(patternFilter));
    if (strategyEnabled && strategyMatches)
      rows = rows.filter((r) => strategyMatches.has(r.ticker));
    return rows;
  }, [allData, filters, patternFilter, patternMap, strategyEnabled, strategyMatches]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey],
        bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const handleSort = useCallback((key) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return key;
      }
      setSortDir('desc');
      return key;
    });
  }, []);

  const exportCSV = () => {
    const headers = [
      'Ticker',
      'Name',
      'Sector',
      'Market Cap',
      'P/E',
      'EPS',
      'Beta',
      'RSI',
      'Price',
      '52W Return',
      'Score',
    ];
    const rows = filtered.map((r) => [
      r.ticker,
      r.name || '',
      r.sector || '',
      r.market_cap ? (r.market_cap / 1e9).toFixed(2) + 'B' : '',
      r.pe ? r.pe.toFixed(1) : '',
      r.eps ? r.eps.toFixed(2) : '',
      r.beta ? r.beta.toFixed(2) : '',
      r.rsi ? r.rsi.toFixed(1) : '',
      r.latest_close ? r.latest_close.toFixed(2) : '',
      r.return_52w != null ? r.return_52w.toFixed(1) + '%' : '',
      r.tech_score ? r.tech_score.toFixed(0) : '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'screener.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setFilters({
      sector: '',
      minPE: '',
      maxPE: '',
      minMktCap: '',
      maxMktCap: '',
      minRSI: '',
      maxRSI: '',
      min52W: '',
      max52W: '',
    });
    setPatternFilter('');
    setStrategyEnabled(false);
    setStrategyMatches(null);
  };

  const colHeaders = [
    { key: 'spark', label: 'SPARK', noSort: true },
    { key: 'ticker', label: 'TICKER' },
    { key: 'name', label: 'NAME' },
    { key: 'sector', label: 'SECTOR' },
    { key: 'market_cap', label: 'MKT CAP' },
    { key: 'pe', label: 'P/E' },
    { key: 'eps', label: 'EPS' },
    { key: 'beta', label: 'BETA' },
    { key: 'rsi', label: 'RSI' },
    { key: 'latest_close', label: 'PRICE' },
    { key: 'return_52w', label: '52W RET' },
    { key: 'tech_score', label: 'SCORE' },
  ];

  return (
    <div className="screener-page">
      <header className="header">
        <div className="header-left">
          <h1 className="header-title">
            <span>BATES</span>STOCKS
          </h1>
          <NavBar />
        </div>
        <div className="header-controls">
          <span className="screener-count">
            {sorted.length} / {allData.length} stocks
          </span>
          <button className="toolbar-btn" onClick={exportCSV} title="Export to CSV">
            ⬇ CSV
          </button>
        </div>
      </header>

      <div className="screener-body">
        {/* Filters */}
        <div className="screener-filters">
          <div className="filter-row-header">
            <span className="filter-title">FILTERS</span>
            <button className="filter-clear-btn" onClick={clearFilters}>
              CLEAR
            </button>
          </div>

          <div className="filter-group">
            <label className="filter-label">SECTOR</label>
            <select
              className="filter-select"
              value={filters.sector}
              onChange={(e) => setFilter('sector', e.target.value)}
            >
              <option value="">All</option>
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">P/E RATIO</label>
            <div className="filter-range">
              <input
                className="filter-input"
                type="number"
                placeholder="Min"
                value={filters.minPE}
                onChange={(e) => setFilter('minPE', e.target.value)}
              />
              <span className="filter-sep">–</span>
              <input
                className="filter-input"
                type="number"
                placeholder="Max"
                value={filters.maxPE}
                onChange={(e) => setFilter('maxPE', e.target.value)}
              />
            </div>
          </div>

          <div className="filter-group">
            <label className="filter-label">MKT CAP ($B)</label>
            <div className="filter-range">
              <input
                className="filter-input"
                type="number"
                placeholder="Min"
                value={filters.minMktCap}
                onChange={(e) => setFilter('minMktCap', e.target.value)}
              />
              <span className="filter-sep">–</span>
              <input
                className="filter-input"
                type="number"
                placeholder="Max"
                value={filters.maxMktCap}
                onChange={(e) => setFilter('maxMktCap', e.target.value)}
              />
            </div>
          </div>

          <div className="filter-group">
            <label className="filter-label">RSI</label>
            <div className="filter-range">
              <input
                className="filter-input"
                type="number"
                placeholder="Min"
                value={filters.minRSI}
                onChange={(e) => setFilter('minRSI', e.target.value)}
              />
              <span className="filter-sep">–</span>
              <input
                className="filter-input"
                type="number"
                placeholder="Max"
                value={filters.maxRSI}
                onChange={(e) => setFilter('maxRSI', e.target.value)}
              />
            </div>
          </div>

          <div className="filter-group">
            <label className="filter-label">52W RETURN %</label>
            <div className="filter-range">
              <input
                className="filter-input"
                type="number"
                placeholder="Min"
                value={filters.min52W}
                onChange={(e) => setFilter('min52W', e.target.value)}
              />
              <span className="filter-sep">–</span>
              <input
                className="filter-input"
                type="number"
                placeholder="Max"
                value={filters.max52W}
                onChange={(e) => setFilter('max52W', e.target.value)}
              />
            </div>
          </div>

          <div className="filter-group">
            <label className="filter-label">PATTERN</label>
            <select
              className="filter-select"
              value={patternFilter}
              onChange={(e) => setPatternFilter(e.target.value)}
            >
              <option value="">All</option>
              <option value="double_top">Double Top</option>
              <option value="double_bottom">Double Bottom</option>
              <option value="support">Support</option>
              <option value="resistance">Resistance</option>
            </select>
          </div>

          <div className="filter-group strategy-filter-group">
            <label className="filter-label">
              STRATEGY ENTRY
              {strategyEnabled && strategyMatches && (
                <span className="strategy-match-count">{strategyMatches.size} matches</span>
              )}
            </label>
            <select
              className="filter-select"
              value={strategyRule.entry_metric}
              onChange={(e) => setStrategyRule((r) => ({ ...r, entry_metric: e.target.value }))}
            >
              {STRATEGY_METRICS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              className="filter-select"
              value={strategyRule.entry_condition}
              onChange={(e) => setStrategyRule((r) => ({ ...r, entry_condition: e.target.value }))}
            >
              {STRATEGY_CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <div className="strategy-thresh-row">
              <button
                className={`bt-thresh-toggle ${strategyThreshMode === 'value' ? 'active' : ''}`}
                onClick={() => setStrategyThreshMode('value')}
              >
                VALUE
              </button>
              <button
                className={`bt-thresh-toggle ${strategyThreshMode === 'metric' ? 'active' : ''}`}
                onClick={() => setStrategyThreshMode('metric')}
              >
                METRIC
              </button>
              {strategyThreshMode === 'value' ? (
                <input
                  className="filter-input strategy-thresh-input"
                  type="number"
                  step="any"
                  value={strategyRule.entry_threshold}
                  onChange={(e) =>
                    setStrategyRule((r) => ({ ...r, entry_threshold: e.target.value }))
                  }
                />
              ) : (
                <select
                  className="filter-select"
                  value={strategyRule.entry_threshold_metric || STRATEGY_METRICS[0].value}
                  onChange={(e) =>
                    setStrategyRule((r) => ({ ...r, entry_threshold_metric: e.target.value }))
                  }
                >
                  {STRATEGY_METRICS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="strategy-btn-row">
              <button
                className="bt-run-btn strategy-scan-btn"
                onClick={() => runStrategyScreen()}
                disabled={strategyLoading}
              >
                {strategyLoading ? 'SCANNING…' : '▶ SCAN ALL STOCKS'}
              </button>
              {strategyEnabled && (
                <button
                  className="filter-clear-btn"
                  onClick={() => {
                    setStrategyEnabled(false);
                    setStrategyMatches(null);
                  }}
                >
                  CLEAR
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="screener-table-wrap">
          {loading ? (
            <div className="screener-loading">Loading S&P 500 data…</div>
          ) : (
            <table className="screener-table">
              <thead>
                <tr>
                  {colHeaders.map(({ key, label, noSort }) => (
                    <th
                      key={key}
                      className={`screener-th ${sortKey === key ? 'sort-active' : ''}`}
                      onClick={() => !noSort && handleSort(key)}
                      style={noSort ? { cursor: 'default' } : undefined}
                    >
                      {label}
                      {sortKey === key && (
                        <span className="sort-arrow">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr
                    key={row.ticker}
                    className="screener-row"
                    onClick={() => navigate(`/spotlight/${row.ticker}`)}
                  >
                    <td className="screener-td num-cell">
                      <Sparkline data={row.spark} />
                    </td>
                    <td className="screener-td ticker-cell">{row.ticker}</td>
                    <td className="screener-td name-cell">{row.name || '—'}</td>
                    <td className="screener-td">{row.sector || '—'}</td>
                    {[
                      'market_cap',
                      'pe',
                      'eps',
                      'beta',
                      'rsi',
                      'latest_close',
                      'return_52w',
                      'tech_score',
                    ].map((k) => (
                      <td key={k} className="screener-td num-cell">
                        {fmt(k, row[k])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScreenerPage;
