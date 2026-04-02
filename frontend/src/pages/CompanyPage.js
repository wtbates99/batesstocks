import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import StockChart from '../components/StockChart';
import SearchBar from '../components/SearchBar';
import NavBar from '../components/NavBar';
import StockRadar from '../components/RadarChart';
import MarketClock from '../components/MarketClock';
import TechnicalSummaryPanel from '../components/TechnicalSummary';
import { metricsList, groupedMetrics } from '../metricsList';
import '../styles.css';

const DATE_RANGES = [
  { days: 7,    label: '7D' },
  { days: 30,   label: '1M' },
  { days: 90,   label: '3M' },
  { days: 180,  label: '6M' },
  { days: 365,  label: '1Y' },
  { days: 730,  label: '2Y' },
  { days: 1825, label: '5Y' },
  { days: 2555, label: '7Y' },
];

const EXCHANGE_LABELS = {
  NMS: 'NASDAQ', NGM: 'NASDAQ', NasdaqGS: 'NASDAQ', NasdaqGM: 'NASDAQ', NasdaqCM: 'NASDAQ',
  NYQ: 'NYSE', NYSE: 'NYSE',
  ASE: 'AMEX', AMEX: 'AMEX',
  PCX: 'NYSE Arca', NYSEArca: 'NYSE Arca',
  BTS: 'BATS', BATS: 'BATS',
};

const CompanyPage = () => {
  const { ticker } = useParams();
  const [companyInfo, setCompanyInfo]         = useState(null);
  const [priceData, setPriceData]             = useState(null);
  const [startDate, setStartDate]             = useState(new Date(Date.now() - 90 * 86400000));
  const [endDate, setEndDate]                 = useState(new Date());
  const [selectedRange, setSelectedRange]     = useState(90);
  const [selectedMetrics, setSelectedMetrics] = useState([
    'Ticker_Close', 'Ticker_SMA_10', 'Ticker_SMA_250W', 'Ticker_VWAP',
    'Ticker_Bollinger_High', 'Ticker_Bollinger_Low',
  ]);
  const [collapsedGroups, setCollapsedGroups] = useState({
    'Price Data':           false,
    'Volume Indicators':    true,
    'Moving Averages':      false,
    'Momentum Oscillators': true,
    'Bollinger Bands':      true,
  });
  const [chartType, setChartType] = useState('area');
  const [infoTab, setInfoTab]     = useState('financials');

  // News state
  const [newsItems, setNewsItems] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);

  // Options state
  const [optionsData, setOptionsData] = useState(null);
  const [optionsExpiry, setOptionsExpiry] = useState(null);
  const [optionsSide, setOptionsSide] = useState('calls');
  const [optionsLoading, setOptionsLoading] = useState(false);

  // Earnings state
  const [earningsHistory, setEarningsHistory] = useState([]);
  const [earningsLoading, setEarningsLoading] = useState(false);

  // Peers state
  const [peersData, setPeersData] = useState([]);
  const [peersLoading, setPeersLoading] = useState(false);

  // Patterns state
  const [patterns, setPatterns] = useState([]);
  const [patternsLoading, setPatternsLoading] = useState(false);

  useEffect(() => {
    setCompanyInfo(null);
    setPriceData(null);
    fetch(`/company/${ticker}`)
      .then((r) => r.json())
      .then(setCompanyInfo)
      .catch(console.error);
  }, [ticker]);

  useEffect(() => {
    if (infoTab !== 'news') return;
    setNewsLoading(true);
    fetch(`/news/${ticker}`)
      .then(r => r.json())
      .then(d => { setNewsItems(Array.isArray(d) ? d : []); setNewsLoading(false); })
      .catch(() => setNewsLoading(false));
  }, [infoTab, ticker]);

  useEffect(() => {
    if (infoTab !== 'options') return;
    setOptionsLoading(true);
    const url = optionsExpiry ? `/options/${ticker}?expiry=${optionsExpiry}` : `/options/${ticker}`;
    fetch(url)
      .then(r => r.json())
      .then(d => { setOptionsData(d); if (!optionsExpiry && d.expiry) setOptionsExpiry(d.expiry); setOptionsLoading(false); })
      .catch(() => setOptionsLoading(false));
  }, [infoTab, ticker, optionsExpiry]);

  useEffect(() => {
    if (infoTab !== 'earnings') return;
    setEarningsLoading(true);
    fetch(`/earnings/${ticker}`)
      .then(r => r.json())
      .then(d => { setEarningsHistory(Array.isArray(d) ? d : []); setEarningsLoading(false); })
      .catch(() => setEarningsLoading(false));
  }, [infoTab, ticker]);

  useEffect(() => {
    if (infoTab !== 'peers') return;
    setPeersLoading(true);
    fetch(`/peers/${ticker}`)
      .then(r => r.json())
      .then(d => { setPeersData(Array.isArray(d) ? d : []); setPeersLoading(false); })
      .catch(() => setPeersLoading(false));
  }, [infoTab, ticker]);

  useEffect(() => {
    if (infoTab !== 'patterns') return;
    setPatternsLoading(true);
    fetch(`/patterns/${ticker}?days=30`)
      .then(r => r.json())
      .then(d => { setPatterns(Array.isArray(d) ? d : []); setPatternsLoading(false); })
      .catch(() => setPatternsLoading(false));
  }, [infoTab, ticker]);

  const setDateRange = useCallback((days) => {
    setStartDate(new Date(Date.now() - days * 86400000));
    setEndDate(new Date());
    setSelectedRange(days);
  }, []);

  const toggleMetric = useCallback((name) => {
    setSelectedMetrics((prev) =>
      prev.includes(name) ? prev.filter((m) => m !== name) : [...prev, name]
    );
  }, []);

  const toggleGroupCollapse = useCallback((name) => {
    setCollapsedGroups((prev) => ({ ...prev, [name]: !prev[name] }));
  }, []);

  const fmt = (key, value) => {
    if (value === null || value === undefined) return 'N/A';
    switch (key) {
      case 'MarketCap': case 'Revenue': case 'GrossProfit': case 'FreeCashFlow':
        return new Intl.NumberFormat('en-US', {
          style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
        }).format(value);
      case 'Price': case 'DividendRate': case 'EPS':
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
      case 'DividendYield': case 'PayoutRatio':
        return `${(parseFloat(value) * 100).toFixed(2)}%`;
      case 'Beta': case 'PE':
        return parseFloat(value).toFixed(2);
      case 'Employees':
        return new Intl.NumberFormat('en-US').format(value);
      default:
        return value;
    }
  };

  if (!companyInfo) {
    return (
      <div className="company-page">
        <div className="cp-loading">
          <span className="cp-loading-ticker">{ticker}</span>
          <span className="cp-loading-label">Loading…</span>
        </div>
      </div>
    );
  }

  const change = priceData ? priceData.latestClose - priceData.prevClose : 0;
  const pct    = priceData?.prevClose ? (change / priceData.prevClose) * 100 : 0;
  const isPos  = change >= 0;

  const infoGroups = {
    financials: ['MarketCap', 'Price', 'PE', 'EPS', 'Beta', 'DividendRate', 'DividendYield', 'PayoutRatio', 'Revenue', 'GrossProfit', 'FreeCashFlow'],
    general:    ['FullName', 'Sector', 'Subsector', 'Country', 'Exchange', 'Currency', 'QuoteType'],
    company:    ['CEO', 'Employees', 'City', 'State', 'Address', 'Phone', 'Website'],
  };

  return (
    <div className="company-page">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="company-header">
        <div className="company-header-left">
          <div className="cp-ticker-row">
            <span className="cp-ticker">{ticker}</span>
            <span className="cp-name">{companyInfo.FullName}</span>
            {companyInfo.Exchange && (
              <span className="cp-exchange">
                {EXCHANGE_LABELS[companyInfo.Exchange] || companyInfo.Exchange}
              </span>
            )}
          </div>
          {priceData && (
            <div className="company-header-price">
              <span className="company-current-price">${priceData.latestClose.toFixed(2)}</span>
              <span className={`company-price-change ${isPos ? 'positive' : 'negative'}`}>
                {isPos ? '▲' : '▼'} {Math.abs(change).toFixed(2)} ({Math.abs(pct).toFixed(2)}%)
              </span>
              {priceData.latestOpen > 0 && (
                <div className="company-ohlc">
                  <span className="ohlc-item">O <strong>{priceData.latestOpen.toFixed(2)}</strong></span>
                  <span className="ohlc-item">H <strong>{priceData.latestHigh.toFixed(2)}</strong></span>
                  <span className="ohlc-item">L <strong>{priceData.latestLow.toFixed(2)}</strong></span>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="header-controls">
          <NavBar />
          <SearchBar />
          <MarketClock />
          <Link to="/" className="back-button">← Back</Link>
        </div>
      </header>

      {/* ── Key stats ──────────────────────────────────────────── */}
      <div className="key-stats-strip">
        {[
          { label: 'MKT CAP',   value: companyInfo.MarketCap     ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:1}).format(companyInfo.MarketCap) : null },
          { label: 'P/E',       value: companyInfo.PE            ? parseFloat(companyInfo.PE).toFixed(2) : null },
          { label: 'EPS',       value: companyInfo.EPS           ? `$${parseFloat(companyInfo.EPS).toFixed(2)}` : null },
          { label: 'DIV YIELD', value: companyInfo.DividendYield ? `${(parseFloat(companyInfo.DividendYield)*100).toFixed(2)}%` : null },
          { label: 'BETA',      value: companyInfo.Beta          ? parseFloat(companyInfo.Beta).toFixed(2) : null },
          { label: 'SECTOR',    value: companyInfo.Sector },
          { label: 'SUBSECTOR', value: companyInfo.Subsector },
        ].filter(s => s.value).map(s => (
          <div key={s.label} className="key-stat-item">
            <span className="key-stat-label">{s.label}</span>
            <span className="key-stat-value">{s.value}</span>
          </div>
        ))}
      </div>

      {/* ── Main layout ────────────────────────────────────────── */}
      <div className="cp-main">

        {/* Left: metrics sidebar */}
        <aside className="cp-metrics-sidebar">
          <div className="cp-sidebar-header">INDICATORS</div>
          {Object.entries(groupedMetrics).map(([groupName, gMetrics]) => (
            <div className="cp-metric-group" key={groupName}>
              <button
                className="cp-group-header"
                onClick={() => toggleGroupCollapse(groupName)}
              >
                <span>{groupName}</span>
                <span className={`cp-collapse-icon ${collapsedGroups[groupName] ? '' : 'open'}`}>›</span>
              </button>
              {!collapsedGroups[groupName] && (
                <div className="cp-group-metrics">
                  {gMetrics.map((metric) => {
                    const isSelected = selectedMetrics.includes(metric.name);
                    return (
                      <button
                        key={metric.name}
                        className={`cp-metric-btn ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleMetric(metric.name)}
                        style={isSelected ? {
                          backgroundColor: metric.color.replace('hsl', 'hsla').replace('%)', '%, 0.12)'),
                          borderColor:     metric.color.replace('hsl', 'hsla').replace('%)', '%, 0.4)'),
                        } : {}}
                      >
                        <span
                          className="cp-metric-dot"
                          style={{ backgroundColor: isSelected ? metric.color : 'var(--dim)' }}
                        />
                        <span className="cp-metric-name">
                          {metric.name.replace(/Ticker_/g, '').replace(/_/g, ' ')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </aside>

        {/* Right: chart + company info */}
        <div className="cp-right">

          {/* Chart toolbar: date range + chart type */}
          <div className="cp-chart-toolbar">
            <div className="cp-date-range">
              {DATE_RANGES.map(({ days, label }) => (
                <button
                  key={days}
                  className={`cp-range-btn ${selectedRange === days ? 'active' : ''}`}
                  onClick={() => setDateRange(days)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="cp-chart-type">
              {[{ key: 'area', label: 'AREA' }, { key: 'candle', label: 'CANDLE' }, { key: 'relative', label: 'RELATIVE' }].map(({ key, label }) => (
                <button
                  key={key}
                  className={`cp-range-btn ${chartType === key ? 'active' : ''}`}
                  onClick={() => setChartType(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Chart */}
          <div className="cp-chart-container">
            <StockChart
              initialTicker={ticker}
              startDate={startDate}
              endDate={endDate}
              metrics={selectedMetrics}
              metricsList={metricsList}
              onDataLoaded={setPriceData}
              chartType={chartType}
            />
          </div>

          {/* Stock DNA Radar */}
          <div className="cp-radar-section">
            <StockRadar ticker={ticker} />
          </div>

          <TechnicalSummaryPanel ticker={ticker} />

          {/* Active metrics legend */}
          {selectedMetrics.length > 0 && (
            <div className="cp-metrics-legend">
              {selectedMetrics.map((m) => {
                const meta = metricsList.find((ml) => ml.name === m);
                if (!meta) return null;
                return (
                  <button
                    key={m}
                    className="cp-legend-chip"
                    onClick={() => toggleMetric(m)}
                    title="Click to remove"
                  >
                    <span className="cp-legend-dot" style={{ backgroundColor: meta.color }} />
                    {m.replace(/Ticker_/g, '').replace(/_/g, ' ')}
                    <span className="cp-legend-x">×</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Company info tabs */}
          <div className="cp-info-card">
            <div className="cp-info-tabs">
              {[
                { key: 'financials', label: 'FINANCIALS' },
                { key: 'general',   label: 'GENERAL'    },
                { key: 'company',   label: 'COMPANY'    },
                { key: 'news',      label: 'NEWS'       },
                { key: 'options',   label: 'OPTIONS'    },
                { key: 'earnings',  label: 'EARNINGS'   },
                { key: 'peers',     label: 'PEERS'      },
                { key: 'patterns',  label: 'PATTERNS'   },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  className={`cp-info-tab ${infoTab === key ? 'active' : ''}`}
                  onClick={() => setInfoTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="cp-info-body">
              {(infoGroups[infoTab] || []).map((field) => {
                const value = companyInfo[field];
                if (value === null || value === undefined || value === '') return null;
                return (
                  <div key={field} className="cp-info-row">
                    <span className="cp-info-label">
                      {field.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <span className="cp-info-value">{fmt(field, value)}</span>
                  </div>
                );
              })}

              {infoTab === 'news' && (
                <div className="news-panel">
                  {newsLoading ? <div className="cp-loading-label">Loading…</div>
                  : newsItems.length === 0 ? <div className="cp-loading-label">No news available.</div>
                  : newsItems.map((item, i) => (
                    <a key={i} className="news-item" href={item.link} target="_blank" rel="noreferrer">
                      <div className="news-meta">
                        <span className="news-publisher">{item.publisher}</span>
                        <span className="news-date">{item.published_at?.slice(0,10)}</span>
                      </div>
                      <div className="news-title">{item.title}</div>
                    </a>
                  ))}
                </div>
              )}

              {infoTab === 'options' && (
                <div className="options-panel">
                  {optionsLoading ? <div className="cp-loading-label">Loading…</div>
                  : !optionsData ? <div className="cp-loading-label">No options data.</div>
                  : <>
                    <div className="options-toolbar">
                      <select className="options-expiry-select" value={optionsExpiry || ''} onChange={e => setOptionsExpiry(e.target.value)}>
                        {(optionsData.expirations || []).map(e => <option key={e} value={e}>{e}</option>)}
                      </select>
                      <div className="options-side-toggle">
                        {['calls','puts'].map(s => (
                          <button key={s} className={`cp-range-btn ${optionsSide===s?'active':''}`} onClick={() => setOptionsSide(s)}>{s.toUpperCase()}</button>
                        ))}
                      </div>
                    </div>
                    <div className="options-table-wrap">
                      <table className="options-table">
                        <thead><tr><th>STRIKE</th><th>LAST</th><th>BID</th><th>ASK</th><th>VOL</th><th>OI</th><th>IV</th><th>ITM</th></tr></thead>
                        <tbody>
                          {(optionsData[optionsSide] || []).map((c, i) => (
                            <tr key={i} className={c.inTheMoney ? 'itm-row' : ''}>
                              <td>{c.strike?.toFixed(2)}</td>
                              <td>{c.lastPrice?.toFixed(2) ?? '—'}</td>
                              <td>{c.bid?.toFixed(2) ?? '—'}</td>
                              <td>{c.ask?.toFixed(2) ?? '—'}</td>
                              <td>{c.volume?.toLocaleString() ?? '—'}</td>
                              <td>{c.openInterest?.toLocaleString() ?? '—'}</td>
                              <td>{c.impliedVolatility != null ? `${(c.impliedVolatility*100).toFixed(1)}%` : '—'}</td>
                              <td style={{color: c.inTheMoney ? 'var(--green)' : 'var(--dim)'}}>{c.inTheMoney ? '✓' : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>}
                </div>
              )}

              {infoTab === 'earnings' && (
                <div className="earnings-panel">
                  {earningsLoading ? <div className="cp-loading-label">Loading…</div>
                  : earningsHistory.length === 0 ? <div className="cp-loading-label">No earnings data available.</div>
                  : <>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={earningsHistory.slice(0, 8).reverse()} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                        <XAxis dataKey="earnings_date" tick={{ fill: '#3e3e58', fontSize: 8 }} tickFormatter={v => v?.slice(0,7)} />
                        <YAxis tick={{ fill: '#3e3e58', fontSize: 8 }} orientation="right" axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 10 }} />
                        <Bar dataKey="eps_estimate" fill="#3e3e58" name="EPS Est" radius={[2,2,0,0]} />
                        <Bar dataKey="eps_actual" name="EPS Act" radius={[2,2,0,0]}>
                          {earningsHistory.slice(0,8).reverse().map((e, i) => (
                            <Cell key={i} fill={e.eps_actual >= (e.eps_estimate || 0) ? '#22c55e' : '#ef4444'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <table className="options-table" style={{ marginTop: 8 }}>
                      <thead><tr><th>DATE</th><th>EPS EST</th><th>EPS ACT</th><th>SURPRISE</th></tr></thead>
                      <tbody>
                        {earningsHistory.map((e, i) => (
                          <tr key={i}>
                            <td>{e.earnings_date}</td>
                            <td>{e.eps_estimate != null ? e.eps_estimate.toFixed(2) : '—'}</td>
                            <td>{e.eps_actual != null ? e.eps_actual.toFixed(2) : '—'}</td>
                            <td style={{ color: e.surprise_pct == null ? 'var(--dim)' : e.surprise_pct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                              {e.surprise_pct != null ? `${e.surprise_pct > 0 ? '+' : ''}${e.surprise_pct.toFixed(1)}%` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>}
                </div>
              )}

              {infoTab === 'peers' && (
                <div className="peers-panel">
                  {peersLoading ? <div className="cp-loading-label">Loading…</div>
                  : <table className="options-table">
                      <thead>
                        <tr><th>TICKER</th><th className="num-col">MKT CAP</th><th className="num-col">P/E</th><th className="num-col">EPS</th><th className="num-col">BETA</th><th className="num-col">RSI</th><th className="num-col">52W RET</th><th className="num-col">SCORE</th></tr>
                      </thead>
                      <tbody>
                        {peersData.map(p => {
                          const isSelected = p.ticker === ticker;
                          return (
                            <tr key={p.ticker} className={isSelected ? 'selected-peer-row' : ''} style={{ cursor: 'pointer' }} onClick={() => window.location.href = `/spotlight/${p.ticker}`}>
                              <td style={{ color: isSelected ? 'var(--accent)' : 'var(--text)', fontWeight: isSelected ? 700 : 400 }}>{p.ticker}</td>
                              <td className="num-col">{p.market_cap ? new Intl.NumberFormat('en-US', { notation: 'compact', style: 'currency', currency: 'USD', maximumFractionDigits: 1 }).format(p.market_cap) : '—'}</td>
                              <td className="num-col">{p.pe?.toFixed(1) ?? '—'}</td>
                              <td className="num-col">{p.eps?.toFixed(2) ?? '—'}</td>
                              <td className="num-col">{p.beta?.toFixed(2) ?? '—'}</td>
                              <td className="num-col" style={{ color: p.rsi > 70 ? 'var(--red)' : p.rsi < 30 ? 'var(--green)' : 'var(--text)' }}>{p.rsi?.toFixed(0) ?? '—'}</td>
                              <td className="num-col" style={{ color: p.return_52w >= 0 ? 'var(--green)' : 'var(--red)' }}>{p.return_52w != null ? `${p.return_52w > 0 ? '+' : ''}${p.return_52w.toFixed(1)}%` : '—'}</td>
                              <td className="num-col" style={{ color: p.tech_score >= 70 ? 'var(--green)' : p.tech_score < 40 ? 'var(--red)' : 'var(--text)' }}>{p.tech_score?.toFixed(0) ?? '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  }
                </div>
              )}

              {infoTab === 'patterns' && (
                <div className="patterns-panel">
                  {patternsLoading ? <div className="cp-loading-label">Loading…</div>
                  : patterns.length === 0 ? <div className="cp-loading-label">No patterns detected recently.</div>
                  : patterns.map(p => {
                      const colors = { double_top: 'var(--red)', double_bottom: 'var(--green)', resistance: 'var(--red)', support: 'var(--green)' };
                      const col = colors[p.pattern_type] || 'var(--muted)';
                      return (
                        <div key={p.id} className="pattern-card">
                          <div className="pattern-header">
                            <span className="pattern-badge" style={{ color: col, borderColor: col }}>{p.pattern_type.replace(/_/g,' ').toUpperCase()}</span>
                            <span className="pattern-date">{p.detected_at}</span>
                          </div>
                          <div className="pattern-details">
                            {p.level != null && <span>Level: <strong>{p.level.toFixed(2)}</strong></span>}
                            <span>Confidence: <strong>{p.confidence != null ? `${(p.confidence*100).toFixed(0)}%` : '—'}</strong></span>
                          </div>
                          {p.notes && <div className="pattern-notes">{p.notes}</div>}
                        </div>
                      );
                    })
                  }
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default CompanyPage;
