import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import StockChart from '../components/StockChart';
import SearchBar from '../components/SearchBar';
import NavBar from '../components/NavBar';
import { metricsList, groupedMetrics } from '../metricsList';
import '../styles.css';

const DATE_RANGES = [
  { days: 7,    label: '7D'  },
  { days: 30,   label: '1M'  },
  { days: 90,   label: '3M'  },
  { days: 180,  label: '6M'  },
  { days: 365,  label: '1Y'  },
  { days: 730,  label: '2Y'  },
  { days: 1095, label: '3Y'  },
  { days: 1825, label: '5Y'  },
];

const CompanyPage = () => {
  const { ticker } = useParams();
  const [companyInfo, setCompanyInfo]         = useState(null);
  const [priceData, setPriceData]             = useState(null);
  const [startDate, setStartDate]             = useState(new Date(Date.now() - 90 * 86400000));
  const [endDate, setEndDate]                 = useState(new Date());
  const [selectedRange, setSelectedRange]     = useState(90);
  const [selectedMetrics, setSelectedMetrics] = useState([
    'Ticker_Close', 'Ticker_SMA_10', 'Ticker_Bollinger_High', 'Ticker_Bollinger_Low',
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

  useEffect(() => {
    setCompanyInfo(null);
    setPriceData(null);
    fetch(`/company/${ticker}`)
      .then((r) => r.json())
      .then(setCompanyInfo)
      .catch(console.error);
  }, [ticker]);

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
              <span className="cp-exchange">{companyInfo.Exchange}</span>
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
              {[{ key: 'area', label: 'AREA' }, { key: 'candle', label: 'CANDLE' }].map(({ key, label }) => (
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
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default CompanyPage;
