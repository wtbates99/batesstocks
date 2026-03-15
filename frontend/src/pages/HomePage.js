import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import StockChart from '../components/StockChart';
import SearchBar from '../components/SearchBar';
import AiPanel from '../components/AiPanel';
import '../styles.css';
import { metricsList, groupedMetrics } from '../metricsList';

const defaultTickers = ['AAPL', 'GOOGL', 'AMZN', 'MSFT', 'TSLA', 'NKE', 'NVDA', 'NFLX', 'JPM'];

const formatGroupName = (name) =>
  name.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const defaultMetrics = {
  default:        ['Ticker_Low', 'Ticker_Close', 'Ticker_High', 'Ticker_Open'],
  momentum:       ['Ticker_Close', 'Ticker_SMA_10', 'Ticker_SMA_30'],
  breakout:       ['Ticker_Close', 'Ticker_Bollinger_High', 'Ticker_Bollinger_Low'],
  trend_strength: ['Ticker_MACD', 'Ticker_MACD_Signal', 'Ticker_MACD_Diff'],
};

function isMarketOpen() {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  const mins = et.getHours() * 60 + et.getMinutes();
  return day >= 1 && day <= 5 && mins >= 570 && mins < 960; // 9:30–16:00 ET
}

const HomePage = () => {
  const [startDate, setStartDate]             = useState(new Date(Date.now() - 30 * 86400000));
  const [endDate, setEndDate]                 = useState(new Date());
  const [selectedRange, setSelectedRange]     = useState(30);
  const [selectedMetrics, setSelectedMetrics] = useState(defaultMetrics.default);
  const [collapsedGroups, setCollapsedGroups] = useState({
    'Price Data':           false,
    'Volume Indicators':    true,
    'Moving Averages':      true,
    'Momentum Oscillators': true,
    'Bollinger Bands':      true,
  });
  const [sidebarHidden, setSidebarHidden]     = useState(true);
  const [isHovering, setIsHovering]           = useState(false);
  const [aiPanelOpen, setAiPanelOpen]         = useState(false);
  const [tickerGroups, setTickerGroups]       = useState(null);
  const [selectedTickers, setSelectedTickers] = useState(defaultTickers);
  const [selectedGroup, setSelectedGroup]     = useState('default');
  const [priceData, setPriceData]             = useState({});
  const [marketOpen]                          = useState(isMarketOpen());

  useEffect(() => {
    fetch('/groupings')
      .then((r) => r.json())
      .then(setTickerGroups)
      .catch(console.error);
  }, []);

  useEffect(() => {
    document.body.style.overflow = sidebarHidden ? 'auto' : 'hidden';
    return () => { document.body.style.overflow = 'auto'; };
  }, [sidebarHidden]);

  useEffect(() => {
    const onMove = (e) => {
      if (e.clientX <= 10)    setIsHovering(true);
      else if (e.clientX > 260) setIsHovering(false);
    };
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === '\\') setAiPanelOpen((p) => !p);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

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

  const handleGroupChange = useCallback((group) => {
    setSelectedGroup(group);
    setPriceData({});
    if (group === 'default') {
      setSelectedTickers(defaultTickers);
      setSelectedMetrics(defaultMetrics.default);
    } else if (tickerGroups?.[group]) {
      setSelectedTickers(tickerGroups[group]);
      setSelectedMetrics(defaultMetrics[group] ?? defaultMetrics.default);
    }
  }, [tickerGroups]);

  const handleDataLoaded = useCallback((ticker, data) => {
    setPriceData((prev) => ({ ...prev, [ticker]: data }));
  }, []);

  const sidebarVisible = !sidebarHidden || isHovering;

  const rootClass = [
    'bg-dark',
    sidebarVisible ? 'sidebar-visible' : '',
    aiPanelOpen    ? 'ai-panel-open'   : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClass}>
      {/* ── Header ── */}
      <header className="header">
        <h1 className="header-title"><span>STOCK</span> INDICATORS</h1>
        <div className="header-controls">
          <select
            className="group-selector"
            value={selectedGroup}
            onChange={(e) => handleGroupChange(e.target.value)}
          >
            <option value="default">Default</option>
            {tickerGroups && Object.keys(tickerGroups).map((g) => (
              <option key={g} value={g}>{formatGroupName(g)}</option>
            ))}
          </select>
          <SearchBar />
          <button
            className={`ai-toggle-button ${aiPanelOpen ? 'active' : ''}`}
            onClick={() => setAiPanelOpen((p) => !p)}
            title="AI Terminal  (\\)"
            aria-label="Toggle AI Terminal"
          >
            ⚡
          </button>
          <button
            className="sidebar-toggle-button"
            onClick={() => setSidebarHidden((p) => !p)}
            aria-label={sidebarHidden ? 'Open indicators sidebar' : 'Close sidebar'}
          >
            {sidebarHidden ? '☰' : '✕'}
          </button>
        </div>
      </header>

      {/* ── Ticker Strip ── */}
      <div className="ticker-strip">
        <div className="market-status">
          <span className={`market-dot ${marketOpen ? 'open' : 'closed'}`} />
          {marketOpen ? 'OPEN' : 'CLOSED'}
        </div>
        <div className="ticker-strip-items">
          {selectedTickers.map((ticker) => {
            const pd = priceData[ticker];
            if (!pd) {
              return (
                <span key={ticker} className="ticker-strip-item">
                  <span className="strip-ticker">{ticker}</span>
                  <span className="strip-loading">—</span>
                </span>
              );
            }
            const change  = pd.latestClose - pd.prevClose;
            const pct     = pd.prevClose ? (change / pd.prevClose) * 100 : 0;
            const isPos   = change >= 0;
            return (
              <span key={ticker} className="ticker-strip-item">
                <span className="strip-ticker">{ticker}</span>
                <span className="strip-price">${pd.latestClose.toFixed(2)}</span>
                <span className={`strip-change ${isPos ? 'positive' : 'negative'}`}>
                  {isPos ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* ── Main ── */}
      <div className="main-content">
        {/* Sidebar */}
        <div className={`sidebar-container ${sidebarVisible ? 'visible' : ''}`}>
          <div className="sidebar-content">
            <div className="date-buttons-grid">
              {[7, 30, 90, 180, 365, 730, 1095, 1460, 1825].map((days) => (
                <button
                  key={days}
                  className={selectedRange === days ? 'active' : ''}
                  onClick={() => setDateRange(days)}
                >
                  {days >= 365 ? `${days / 365}Y` : `${days}D`}
                </button>
              ))}
            </div>

            <div className="metrics-section">
              {Object.entries(groupedMetrics).map(([groupName, gMetrics]) => (
                <div className="metrics-group" key={groupName}>
                  <h3 className="group-header" onClick={() => toggleGroupCollapse(groupName)}>
                    {groupName}
                    <span className={`collapse-icon ${collapsedGroups[groupName] ? 'collapsed' : ''}`}>▼</span>
                  </h3>
                  {!collapsedGroups[groupName] && (
                    <div className="group-metrics">
                      {gMetrics.map((metric) => {
                        const isSelected = selectedMetrics.includes(metric.name);
                        return (
                          <div
                            key={metric.name}
                            className={`metric-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => toggleMetric(metric.name)}
                            style={isSelected ? {
                              backgroundColor: metric.color.replace('hsl', 'hsla').replace('%)', '%, 0.12)'),
                              borderColor:     metric.color.replace('hsl', 'hsla').replace('%)', '%, 0.35)'),
                            } : undefined}
                          >
                            <span className="metric-color-dot" style={{ backgroundColor: metric.color }} />
                            <span className="metric-label-text">
                              {metric.name.replace(/Ticker_/g, '').replace(/_/g, ' ')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chart Grid */}
        <div className="grid-container">
          {selectedTickers.map((ticker) => {
            const pd      = priceData[ticker];
            const change  = pd ? pd.latestClose - pd.prevClose : 0;
            const pct     = pd?.prevClose ? (change / pd.prevClose) * 100 : 0;
            const isPos   = change >= 0;
            const trend   = pd ? (isPos ? 'up' : 'down') : 'none';

            return (
              <div className="chart-wrapper" key={ticker} data-trend={trend}>
                <div className="chart-card-header">
                  <Link to={`/spotlight/${ticker}`} className="company-link">
                    {ticker}
                  </Link>
                  {pd && (
                    <div className="chart-card-price-block">
                      <span className="card-price">${pd.latestClose.toFixed(2)}</span>
                      <span className={`card-change ${isPos ? 'positive' : 'negative'}`}>
                        {isPos ? '+' : ''}{change.toFixed(2)} ({isPos ? '+' : ''}{pct.toFixed(2)}%)
                      </span>
                    </div>
                  )}
                </div>
                <StockChart
                  initialTicker={ticker}
                  startDate={startDate}
                  endDate={endDate}
                  metrics={selectedMetrics}
                  metricsList={metricsList}
                  onDataLoaded={(data) => handleDataLoaded(ticker, data)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {sidebarVisible && (
        <div className="backdrop" onClick={() => setSidebarHidden(true)} />
      )}

      <AiPanel
        tickers={selectedTickers}
        dateRange={selectedRange}
        selectedMetrics={selectedMetrics}
        isOpen={aiPanelOpen}
        onToggle={() => setAiPanelOpen((p) => !p)}
      />
    </div>
  );
};

export default HomePage;
