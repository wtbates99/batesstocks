import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import '../styles.css';

function fmt(key, val) {
  if (val == null) return <span style={{ color: 'var(--dim)' }}>—</span>;
  switch (key) {
    case 'market_cap':   return new Intl.NumberFormat('en-US', { notation: 'compact', style: 'currency', currency: 'USD', maximumFractionDigits: 1 }).format(val);
    case 'latest_close': return `$${Number(val).toFixed(2)}`;
    case 'pe':           return Number(val).toFixed(1);
    case 'eps':          return `$${Number(val).toFixed(2)}`;
    case 'beta':         return Number(val).toFixed(2);
    case 'rsi':          return Number(val).toFixed(1);
    case 'tech_score':   return (
      <span style={{ color: val >= 70 ? 'var(--green)' : val < 40 ? 'var(--red)' : 'var(--text)' }}>
        {Number(val).toFixed(0)}
      </span>
    );
    case 'return_52w':   return (
      <span style={{ color: val >= 0 ? 'var(--green)' : 'var(--red)' }}>
        {val >= 0 ? '+' : ''}{Number(val).toFixed(1)}%
      </span>
    );
    default: return val;
  }
}

const ScreenerPage = () => {
  const navigate = useNavigate();
  const [allData, setAllData]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [sortKey, setSortKey]   = useState('market_cap');
  const [sortDir, setSortDir]   = useState('desc');
  const [filters, setFilters]   = useState({
    sector: '', minPE: '', maxPE: '', minMktCap: '', maxMktCap: '',
    minRSI: '', maxRSI: '', min52W: '', max52W: '',
  });
  const [patternFilter, setPatternFilter] = useState('');
  const [patternMap, setPatternMap] = useState({});

  useEffect(() => {
    fetch('/screener')
      .then((r) => r.json())
      .then((d) => { setAllData(d); setLoading(false); })
      .catch((e) => { console.error(e); setLoading(false); });
  }, []);

  useEffect(() => {
    fetch('/patterns?days=1')
      .then(r => r.json())
      .then(d => {
        const map = {};
        (Array.isArray(d) ? d : []).forEach(p => {
          if (!map[p.ticker]) map[p.ticker] = [];
          map[p.ticker].push(p.pattern_type);
        });
        setPatternMap(map);
      })
      .catch(() => {});
  }, []);

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
    if (sector)   rows = rows.filter((r) => r.sector === sector);
    if (minPE)    rows = rows.filter((r) => r.pe    != null && r.pe    >= parseFloat(minPE));
    if (maxPE)    rows = rows.filter((r) => r.pe    != null && r.pe    <= parseFloat(maxPE));
    if (minMktCap)rows = rows.filter((r) => r.market_cap != null && r.market_cap >= parseFloat(minMktCap) * 1e9);
    if (maxMktCap)rows = rows.filter((r) => r.market_cap != null && r.market_cap <= parseFloat(maxMktCap) * 1e9);
    if (minRSI)   rows = rows.filter((r) => r.rsi   != null && r.rsi   >= parseFloat(minRSI));
    if (maxRSI)   rows = rows.filter((r) => r.rsi   != null && r.rsi   <= parseFloat(maxRSI));
    if (min52W)   rows = rows.filter((r) => r.return_52w != null && r.return_52w >= parseFloat(min52W));
    if (max52W)   rows = rows.filter((r) => r.return_52w != null && r.return_52w <= parseFloat(max52W));
    if (patternFilter) rows = rows.filter((r) => (patternMap[r.ticker] || []).includes(patternFilter));
    return rows;
  }, [allData, filters, patternFilter, patternMap]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const handleSort = useCallback((key) => {
    setSortKey((prev) => {
      if (prev === key) { setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); return key; }
      setSortDir('desc');
      return key;
    });
  }, []);

  const clearFilters = () => {
    setFilters({
      sector: '', minPE: '', maxPE: '', minMktCap: '', maxMktCap: '',
      minRSI: '', maxRSI: '', min52W: '', max52W: '',
    });
    setPatternFilter('');
  };

  const colHeaders = [
    { key: 'ticker',      label: 'TICKER'   },
    { key: 'name',        label: 'NAME'     },
    { key: 'sector',      label: 'SECTOR'   },
    { key: 'market_cap',  label: 'MKT CAP'  },
    { key: 'pe',          label: 'P/E'      },
    { key: 'eps',         label: 'EPS'      },
    { key: 'beta',        label: 'BETA'     },
    { key: 'rsi',         label: 'RSI'      },
    { key: 'latest_close',label: 'PRICE'    },
    { key: 'return_52w',  label: '52W RET'  },
    { key: 'tech_score',  label: 'SCORE'    },
  ];

  return (
    <div className="screener-page">
      <header className="header">
        <div className="header-left">
          <h1 className="header-title"><span>BATES</span>STOCKS</h1>
          <NavBar />
        </div>
        <div className="header-controls">
          <span className="screener-count">{sorted.length} / {allData.length} stocks</span>
        </div>
      </header>

      <div className="screener-body">
        {/* Filters */}
        <div className="screener-filters">
          <div className="filter-row-header">
            <span className="filter-title">FILTERS</span>
            <button className="filter-clear-btn" onClick={clearFilters}>CLEAR</button>
          </div>

          <div className="filter-group">
            <label className="filter-label">SECTOR</label>
            <select className="filter-select" value={filters.sector} onChange={(e) => setFilter('sector', e.target.value)}>
              <option value="">All</option>
              {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">P/E RATIO</label>
            <div className="filter-range">
              <input className="filter-input" type="number" placeholder="Min" value={filters.minPE} onChange={(e) => setFilter('minPE', e.target.value)} />
              <span className="filter-sep">–</span>
              <input className="filter-input" type="number" placeholder="Max" value={filters.maxPE} onChange={(e) => setFilter('maxPE', e.target.value)} />
            </div>
          </div>

          <div className="filter-group">
            <label className="filter-label">MKT CAP ($B)</label>
            <div className="filter-range">
              <input className="filter-input" type="number" placeholder="Min" value={filters.minMktCap} onChange={(e) => setFilter('minMktCap', e.target.value)} />
              <span className="filter-sep">–</span>
              <input className="filter-input" type="number" placeholder="Max" value={filters.maxMktCap} onChange={(e) => setFilter('maxMktCap', e.target.value)} />
            </div>
          </div>

          <div className="filter-group">
            <label className="filter-label">RSI</label>
            <div className="filter-range">
              <input className="filter-input" type="number" placeholder="Min" value={filters.minRSI} onChange={(e) => setFilter('minRSI', e.target.value)} />
              <span className="filter-sep">–</span>
              <input className="filter-input" type="number" placeholder="Max" value={filters.maxRSI} onChange={(e) => setFilter('maxRSI', e.target.value)} />
            </div>
          </div>

          <div className="filter-group">
            <label className="filter-label">52W RETURN %</label>
            <div className="filter-range">
              <input className="filter-input" type="number" placeholder="Min" value={filters.min52W} onChange={(e) => setFilter('min52W', e.target.value)} />
              <span className="filter-sep">–</span>
              <input className="filter-input" type="number" placeholder="Max" value={filters.max52W} onChange={(e) => setFilter('max52W', e.target.value)} />
            </div>
          </div>

          <div className="filter-group">
            <label className="filter-label">PATTERN</label>
            <select className="filter-select" value={patternFilter} onChange={(e) => setPatternFilter(e.target.value)}>
              <option value="">All</option>
              <option value="double_top">Double Top</option>
              <option value="double_bottom">Double Bottom</option>
              <option value="support">Support</option>
              <option value="resistance">Resistance</option>
            </select>
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
                  {colHeaders.map(({ key, label }) => (
                    <th
                      key={key}
                      className={`screener-th ${sortKey === key ? 'sort-active' : ''}`}
                      onClick={() => handleSort(key)}
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
                    <td className="screener-td ticker-cell">{row.ticker}</td>
                    <td className="screener-td name-cell">{row.name || '—'}</td>
                    <td className="screener-td">{row.sector || '—'}</td>
                    {['market_cap','pe','eps','beta','rsi','latest_close','return_52w','tech_score'].map((k) => (
                      <td key={k} className="screener-td num-cell">{fmt(k, row[k])}</td>
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
