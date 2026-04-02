import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import StockChart from '../components/StockChart';
import SearchBar from '../components/SearchBar';
import AiPanel from '../components/AiPanel';
import PresetManager from '../components/PresetManager';
import KeyboardShortcutsHelp from '../components/KeyboardShortcutsHelp';
import NavBar from '../components/NavBar';
import CorrelationMatrix from '../components/CorrelationMatrix';
import MarketClock from '../components/MarketClock';
import '../styles.css';
import { metricsList, groupedMetrics } from '../metricsList';

const defaultTickers = ['AAPL', 'GOOGL', 'AMZN', 'MSFT', 'TSLA', 'NKE', 'NVDA', 'NFLX', 'JPM'];

function useLivePrices(tickers, enabled) {
  const [prices, setPrices]     = React.useState({});
  const [flashing, setFlashing] = React.useState({});
  const prevRef                 = React.useRef({});

  React.useEffect(() => {
    if (!enabled || !tickers.length) return;
    const poll = () => {
      const params = tickers.map(t => `tickers=${t}`).join('&');
      fetch(`/live-prices?${params}`)
        .then(r => r.json())
        .then(data => {
          if (!data.prices) return;
          const newFlash = {};
          Object.entries(data.prices).forEach(([t, p]) => {
            if (prevRef.current[t] != null && p !== prevRef.current[t]) {
              newFlash[t] = p > prevRef.current[t] ? 'up' : 'down';
            }
          });
          prevRef.current = data.prices;
          setPrices(data.prices);
          if (Object.keys(newFlash).length) {
            setFlashing(newFlash);
            setTimeout(() => setFlashing({}), 800);
          }
        })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 60000);
    return () => clearInterval(id);
  }, [tickers, enabled]);

  return { prices, flashing };
}

const MacroStrip = () => {
  const [indices, setIndices] = React.useState([]);
  React.useEffect(() => {
    fetch('/market-indices').then(r => r.json()).then(setIndices).catch(() => {});
  }, []);
  if (!indices.length) return null;
  return (
    <div className="macro-strip">
      {indices.map(idx => (
        <span key={idx.ticker} className="macro-item">
          <span className="macro-ticker">{idx.ticker}</span>
          <span className="macro-price">${idx.price.toFixed(2)}</span>
          {idx.change_pct != null && (
            <span className={`macro-chg ${idx.change_pct >= 0 ? 'positive' : 'negative'}`}>
              {idx.change_pct >= 0 ? '▲' : '▼'}{Math.abs(idx.change_pct).toFixed(2)}%
            </span>
          )}
        </span>
      ))}
    </div>
  );
};

const MarketPulseWidget = () => {
  const [pulse, setPulse] = React.useState(null);
  const [open, setOpen]   = React.useState(true);

  React.useEffect(() => {
    fetch('/market-pulse')
      .then(r => r.json())
      .then(setPulse)
      .catch(() => {});
  }, []);

  if (!pulse?.items?.length) return null;

  return (
    <div className="pulse-widget">
      <button className="pulse-header" onClick={() => setOpen(o => !o)}>
        <span className="pulse-dot" />
        <span className="pulse-title">MARKET PULSE</span>
        <span className="pulse-toggle">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="pulse-items">
          {pulse.items.map((item, i) => (
            <a key={i} className="pulse-item" href={`/spotlight/${item.ticker}`}>
              <span className={`pulse-item-dot ${item.color}`} />
              <span className="pulse-ticker">{item.ticker}</span>
              <span className="pulse-headline">{item.headline}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

const formatGroupName = (name) =>
  name.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const defaultMetrics = {
  default:        ['Ticker_Low', 'Ticker_Close', 'Ticker_High', 'Ticker_Open'],
  momentum:       ['Ticker_Close', 'Ticker_SMA_10', 'Ticker_SMA_30'],
  breakout:       ['Ticker_Close', 'Ticker_Bollinger_High', 'Ticker_Bollinger_Low'],
  trend_strength: ['Ticker_MACD', 'Ticker_MACD_Signal', 'Ticker_MACD_Diff'],
};

const DATE_RANGES = [7, 30, 90, 180, 365, 730, 1825, 2555];

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
  const [selectedTickers, setSelectedTickers] = useState(() => {
    const param = new URLSearchParams(window.location.search).get('tickers');
    return param ? param.split(',').map(t => t.trim().toUpperCase()).filter(Boolean) : defaultTickers;
  });
  const [selectedGroup, setSelectedGroup]     = useState('default');
  const [priceData, setPriceData]             = useState({});
  const [marketOpen, setMarketOpen]           = useState(isMarketOpen());
  const [pipelineStatus, setPipelineStatus]   = useState(null);
  const [shortcutsOpen, setShortcutsOpen]     = useState(false);
  const [sortOrder, setSortOrder]   = useState('default'); // 'default'|'gainers'|'losers'|'alpha'
  const [numCols, setNumCols]       = useState(3);
  const [chartType, setChartType]   = useState('area'); // 'area'|'candle'
  const [corrDays, setCorrDays]     = useState(90);
  const [showCorr, setShowCorr]     = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // Dark/light mode — persisted to localStorage
  const [theme, setTheme] = useState(() => localStorage.getItem('batesstocks_theme') || 'dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('batesstocks_theme', theme);
  }, [theme]);

  const groupIndexRef = useRef(0);

  // Re-check market status every 60 s
  useEffect(() => {
    const id = setInterval(() => setMarketOpen(isMarketOpen()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Poll pipeline status while loading
  useEffect(() => {
    let id;
    const poll = () => {
      fetch('/refresh_status')
        .then(r => r.json())
        .then(s => {
          setPipelineStatus(s);
          if (!s.running && (s.phase === 'complete' || s.phase === 'idle')) {
            clearInterval(id);
          }
        })
        .catch(console.error);
    };
    poll();
    id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

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

      // \ → toggle AI panel
      if (e.key === '\\') { setAiPanelOpen((p) => !p); return; }

      // ? → toggle keyboard shortcuts help
      if (e.key === '?') { setShortcutsOpen((p) => !p); return; }

      // t → toggle theme
      if (e.key === 't') { setTheme((th) => th === 'dark' ? 'light' : 'dark'); return; }

      // / → focus search
      if (e.key === '/') {
        e.preventDefault();
        document.querySelector('.search-input')?.focus();
        return;
      }

      // [ / ] → step through date ranges
      if (e.key === '[') {
        setSelectedRange((cur) => {
          const idx = DATE_RANGES.indexOf(cur);
          const next = DATE_RANGES[Math.max(0, idx - 1)];
          setStartDate(new Date(Date.now() - next * 86400000));
          setEndDate(new Date());
          return next;
        });
        return;
      }
      if (e.key === ']') {
        setSelectedRange((cur) => {
          const idx = DATE_RANGES.indexOf(cur);
          const next = DATE_RANGES[Math.min(DATE_RANGES.length - 1, idx + 1)];
          setStartDate(new Date(Date.now() - next * 86400000));
          setEndDate(new Date());
          return next;
        });
        return;
      }

      // g → cycle through groupings
      if (e.key === 'g') {
        const groups = ['default', ...(tickerGroups ? Object.keys(tickerGroups) : [])];
        groupIndexRef.current = (groupIndexRef.current + 1) % groups.length;
        handleGroupChange(groups[groupIndexRef.current]);
        return;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [tickerGroups]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleLoadPreset = useCallback((tickers, metrics) => {
    setSelectedTickers(tickers);
    setSelectedMetrics(metrics);
    setSelectedGroup('default');
    setPriceData({});
  }, []);

  const displayTickers = useMemo(() => {
    const tickers = [...selectedTickers];
    if (sortOrder === 'alpha')   return tickers.sort((a, b) => a.localeCompare(b));
    if (sortOrder === 'gainers') return tickers.sort((a, b) => {
      const pctA = priceData[a] ? (priceData[a].latestClose - priceData[a].prevClose) / (priceData[a].prevClose || 1) : -Infinity;
      const pctB = priceData[b] ? (priceData[b].latestClose - priceData[b].prevClose) / (priceData[b].prevClose || 1) : -Infinity;
      return pctB - pctA;
    });
    if (sortOrder === 'losers')  return tickers.sort((a, b) => {
      const pctA = priceData[a] ? (priceData[a].latestClose - priceData[a].prevClose) / (priceData[a].prevClose || 1) : Infinity;
      const pctB = priceData[b] ? (priceData[b].latestClose - priceData[b].prevClose) / (priceData[b].prevClose || 1) : Infinity;
      return pctA - pctB;
    });
    return tickers;
  }, [selectedTickers, sortOrder, priceData]);

  const { prices: livePrices, flashing } = useLivePrices(selectedTickers, marketOpen);

  const sidebarVisible = !sidebarHidden || isHovering;

  const rootClass = [
    'bg-dark',
    sidebarVisible            ? 'sidebar-visible'  : '',
    aiPanelOpen               ? 'ai-panel-open'    : '',
    pipelineStatus?.running   ? 'pipeline-loading' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClass}>
      {/* ── Header ── */}
      <header className="header">
        <div className="header-left">
          <h1 className="header-title"><span>BATES</span>STOCKS</h1>
          <NavBar />
        </div>
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
            className="mobile-search-btn"
            onClick={() => setMobileSearchOpen((p) => !p)}
            aria-label="Search stocks"
          >
            🔍
          </button>
          <MarketClock />
          <button
            className="sidebar-toggle-button"
            onClick={() => setTheme((t) => t === 'dark' ? 'light' : 'dark')}
            title="Toggle theme  (t)"
            aria-label="Toggle dark/light mode"
          >
            {theme === 'dark' ? '☀' : '☽'}
          </button>
          <button
            className={`ai-toggle-button ${aiPanelOpen ? 'active' : ''}`}
            onClick={() => setAiPanelOpen((p) => !p)}
            title="AI Terminal  (\\)"
            aria-label="Toggle AI Terminal"
          >
            🤖
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

      {/* ── Mobile search overlay ── */}
      {mobileSearchOpen && (
        <div className="mobile-search-overlay">
          <SearchBar autoFocus onNavigate={() => setMobileSearchOpen(false)} />
          <button className="mobile-search-close" onClick={() => setMobileSearchOpen(false)} aria-label="Close search">✕</button>
        </div>
      )}

      {/* ── Pipeline loading banner ── */}
      {pipelineStatus?.running && (
        <div className="pipeline-banner">
          <div
            className="pipeline-bar"
            style={{ width: pipelineStatus.total > 0 ? `${(pipelineStatus.loaded / pipelineStatus.total) * 100}%` : '4%' }}
          />
          <span className="pipeline-label">
            {pipelineStatus.phase === 'fast_load' ? 'Loading core tickers…' : 'Loading full S&P 500…'}
            {pipelineStatus.total > 0 && ` ${pipelineStatus.loaded} / ${pipelineStatus.total}`}
          </span>
        </div>
      )}

      {/* ── Ticker Strip ── */}
      <div className="ticker-strip">
        <div className="market-status">
          <span className={`market-dot ${marketOpen ? 'open' : 'closed'}`} />
          {marketOpen ? 'OPEN' : 'CLOSED'}
        </div>
        <MacroStrip />
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
              {DATE_RANGES.map((days) => (
                <button
                  key={days}
                  className={selectedRange === days ? 'active' : ''}
                  onClick={() => setDateRange(days)}
                >
                  {days >= 365 ? `${days / 365}Y` : `${days}D`}
                </button>
              ))}
            </div>

            <PresetManager
              selectedTickers={selectedTickers}
              selectedMetrics={selectedMetrics}
              onLoad={handleLoadPreset}
            />

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
        <div className="grid-area">
          <MarketPulseWidget />
          <div className="grid-toolbar">
            <div className="grid-toolbar-left">
              <span className="toolbar-label">SORT</span>
              {[
                { key: 'default', label: 'DEFAULT' },
                { key: 'gainers', label: '▲ GAIN' },
                { key: 'losers',  label: '▼ LOSS' },
                { key: 'alpha',   label: 'A–Z' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  className={`toolbar-btn ${sortOrder === key ? 'active' : ''}`}
                  onClick={() => setSortOrder(key)}
                >{label}</button>
              ))}
            </div>
            <div className="grid-toolbar-center">
              <span className="toolbar-label">CHART</span>
              {[{ key: 'area', label: 'AREA' }, { key: 'candle', label: 'CANDLE' }].map(({ key, label }) => (
                <button
                  key={key}
                  className={`toolbar-btn ${chartType === key ? 'active' : ''}`}
                  onClick={() => setChartType(key)}
                >{label}</button>
              ))}
            </div>
            <div className="grid-toolbar-right">
              <span className="toolbar-label">COLS</span>
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  className={`toolbar-btn ${numCols === n ? 'active' : ''}`}
                  onClick={() => setNumCols(n)}
                >{n}</button>
              ))}
            </div>
          </div>
          <div className="grid-container" style={{ gridTemplateColumns: `repeat(${numCols}, 1fr)` }}>
          {displayTickers.map((ticker) => {
            const pd      = priceData[ticker];
            const change  = pd ? pd.latestClose - pd.prevClose : 0;
            const pct     = pd?.prevClose ? (change / pd.prevClose) * 100 : 0;
            const isPos   = change >= 0;
            const trend   = pd ? (isPos ? 'up' : 'down') : 'none';

            const livePrice = livePrices[ticker];
            const displayPrice = livePrice ?? pd?.latestClose;

            return (
              <div className="chart-wrapper" key={ticker} data-trend={trend}>
                <div className={`chart-card-header ${flashing[ticker] === 'up' ? 'flash-up' : flashing[ticker] === 'down' ? 'flash-down' : ''}`}>
                  <div className="card-header-left">
                    <Link to={`/spotlight/${ticker}`} className="company-link">{ticker}</Link>
                    {tickerGroups && Object.entries(tickerGroups).map(([group, gtickers]) =>
                      gtickers.includes(ticker) ? (
                        <span key={group} className={`signal-badge signal-${group}`}>
                          {group === 'momentum' ? 'MOM' : group === 'breakout' ? 'BRK' : 'TRD'}
                        </span>
                      ) : null
                    )}
                  </div>
                  {pd && (
                    <div className="card-header-right">
                      <div className="chart-card-price-block">
                        <span className="card-price">${displayPrice ? displayPrice.toFixed(2) : pd.latestClose.toFixed(2)}</span>
                        <span className={`card-change ${isPos ? 'positive' : 'negative'}`}>
                          {isPos ? '+' : ''}{pct.toFixed(2)}%
                        </span>
                      </div>
                      {pd.latestOpen > 0 && (
                        <div className="card-ohlc">
                          <span className="ohlc-item">O<strong>{pd.latestOpen.toFixed(2)}</strong></span>
                          <span className="ohlc-item">H<strong>{pd.latestHigh.toFixed(2)}</strong></span>
                          <span className="ohlc-item">L<strong>{pd.latestLow.toFixed(2)}</strong></span>
                        </div>
                      )}
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
                  chartType={chartType}
                />
              </div>
            );
          })}
            <div className="corr-section">
              <div className="page-header-row" style={{ padding: '0 0 8px 0' }}>
                <button className="toolbar-btn" onClick={() => setShowCorr(p => !p)}>
                  {showCorr ? '▲' : '▼'} CORRELATION MATRIX
                </button>
                {showCorr && (
                  <div className="day-toggle">
                    {[30, 90, 180].map(d => (
                      <button key={d} className={`toolbar-btn ${corrDays===d?'active':''}`} onClick={() => setCorrDays(d)}>{d}D</button>
                    ))}
                  </div>
                )}
              </div>
              {showCorr && <CorrelationMatrix tickers={selectedTickers} days={corrDays} />}
            </div>
          </div>
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

      <KeyboardShortcutsHelp isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
};

export default HomePage;
