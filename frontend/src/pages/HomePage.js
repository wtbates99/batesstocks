import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import StockChart from '../components/StockChart';
import '../styles.css';
import { metricsList, groupedMetrics } from '../metricsList';
import debounce from 'lodash/debounce';

const defaultTickers = ['AAPL', 'GOOGL', 'AMZN', 'MSFT', 'TSLA', 'NKE', 'NVDA', 'NFLX', 'JPM'];

const formatGroupName = (name) => {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const defaultMetrics = {
  default: ['Ticker_Low', 'Ticker_Close', 'Ticker_High', 'Ticker_Open'],
  momentum: ['Ticker_Close', 'Ticker_SMA_10', 'Ticker_SMA_30'],
  breakout: ['Ticker_Close', 'Ticker_Bollinger_High', 'Ticker_Bollinger_Low'],
  trend_strength: ['Ticker_MACD', 'Ticker_MACD_Signal', 'Ticker_MACD_Diff']
};

const HomePage = () => {
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState(
    new Date(new Date().setDate(new Date().getDate() - 30))
  );
  const [endDate, setEndDate] = useState(new Date());
  const [selectedRange, setSelectedRange] = useState(30);
  const [selectedMetrics, setSelectedMetrics] = useState(defaultMetrics.default);
  const [collapsedGroups, setCollapsedGroups] = useState({
    Prices: false,
    Volume: true,
    'Moving Averages': true,
    Oscillators: true,
    'Bollinger Bands': true,
  });
  const [sidebarHidden, setSidebarHidden] = useState(true);
  const [tickerGroups, setTickerGroups] = useState(null);
  const [selectedTickers, setSelectedTickers] = useState(defaultTickers);
  const [selectedGroup, setSelectedGroup] = useState('default');
  const [isHovering, setIsHovering] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchCache, setSearchCache] = useState({});

  const fetchGroupings = useCallback(async () => {
    try {
      const response = await fetch('/groupings');
      const data = await response.json();
      setTickerGroups(data);
    } catch (error) {
      console.error('Error fetching ticker groups:', error);
    }
  }, []);

  useEffect(() => {
    fetchGroupings();
  }, [fetchGroupings]);

  const setDateRange = useCallback((days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setStartDate(start);
    setEndDate(end);
    setSelectedRange(days);
  }, []);

  const toggleMetric = useCallback((metricName) => {
    setSelectedMetrics((prev) =>
      prev.includes(metricName) ? prev.filter((m) => m !== metricName) : [...prev, metricName]
    );
  }, []);

  const toggleGroupCollapse = useCallback((groupName) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarHidden((prev) => !prev);
  }, []);

  const handleBackdropClick = useCallback(() => {
    if (!sidebarHidden) {
      setSidebarHidden(true);
    }
  }, [sidebarHidden]);

  const handleGroupChange = useCallback((group) => {
    setSelectedGroup(group);
    if (group === 'default') {
      setSelectedTickers(defaultTickers);
      setSelectedMetrics(defaultMetrics.default);
    } else if (tickerGroups && tickerGroups[group]) {
      setSelectedTickers(tickerGroups[group]);
      if (group === 'momentum') {
        setSelectedMetrics(defaultMetrics.momentum);
      } else if (group === 'breakout') {
        setSelectedMetrics(defaultMetrics.breakout);
      } else if (group === 'trend_strength') {
        setSelectedMetrics(defaultMetrics.trend_strength);
      } else {
        setSelectedMetrics(defaultMetrics.default);
      }
    }
  }, [tickerGroups]);

  const debouncedSearch = useMemo(
    () =>
      debounce(async (term) => {
        if (term.length > 0) {
          if (searchCache[term]) {
            setSearchResults(searchCache[term]);
          } else {
            try {
              const response = await fetch(`/search?query=${encodeURIComponent(term)}`);
              if (response.ok) {
                const data = await response.json();
                setSearchResults(data);
                setSearchCache(prev => ({ ...prev, [term]: data }));
              } else {
                console.error('Search request failed');
                setSearchResults([]);
              }
            } catch (error) {
              console.error('Error during search:', error);
              setSearchResults([]);
            }
          }
        } else {
          setSearchResults([]);
        }
      }, 150),
    [searchCache]
  );

  const handleSearch = useCallback((event) => {
    const term = event.target.value;
    setSearchTerm(term);
    debouncedSearch(term);
  }, [debouncedSearch]);

  const handleSearchResultClick = useCallback((ticker) => {
    setSearchTerm('');
    setSearchResults([]);
    navigate(`/spotlight/${ticker}`);
  }, [navigate]);

  useEffect(() => {
    if (!sidebarHidden) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }

    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [sidebarHidden]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (e.clientX <= 10) {
        setIsHovering(true);
      } else if (e.clientX > 260) {
        setIsHovering(false);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  const sidebarVisible = !sidebarHidden || isHovering;

  return (
    <div className={`min-h-screen bg-dark ${sidebarVisible ? 'sidebar-visible' : ''}`}>
      <header className="header">
        <h1>Stock Indicators</h1>
        <div className="ticker-group-container">
          <div
            className={`ticker-group ${selectedGroup === 'default' ? 'selected' : ''}`}
            onClick={() => handleGroupChange('default')}
          >
            <h3>Default</h3>
            <div className="ticker-grid">
              {defaultTickers.slice(0, 9).map(ticker => (
                <div key={ticker} className="ticker-item">{ticker}</div>
              ))}
            </div>
          </div>
          {tickerGroups && Object.entries(tickerGroups).map(([group, tickers]) => (
            <div
              key={group}
              className={`ticker-group ${selectedGroup === group ? 'selected' : ''}`}
              onClick={() => handleGroupChange(group)}
            >
              <h3>{formatGroupName(group)}</h3>
              <div className="ticker-grid">
                {tickers.slice(0, 9).map(ticker => (
                  <div key={ticker} className="ticker-item">{ticker}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="search-container">
          <input
            type="text"
            placeholder="Search companies..."
            value={searchTerm}
            onChange={handleSearch}
            className="search-input"
          />
          {searchResults.length > 0 && (
            <ul className="search-results">
              {searchResults.map((result) => (
                <li
                  key={result.ticker}
                  onClick={() => handleSearchResultClick(result.ticker)}
                  className="search-result-item"
                >
                  {result.name} ({result.ticker})
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          className="sidebar-toggle-button"
          onClick={toggleSidebar}
          aria-label={sidebarHidden ? 'Expand Sidebar' : 'Collapse Sidebar'}
          aria-expanded={sidebarVisible}
        >
          {sidebarHidden ? 'Expand Sidebar' : 'Collapse Sidebar'}
        </button>
      </header>

      <div className="main-content">
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
              {Object.entries(groupedMetrics).map(([groupName, groupMetrics]) => (
                <div className="metrics-group" key={groupName}>
                  <h3 onClick={() => toggleGroupCollapse(groupName)} className="group-header">
                    {groupName}
                    <span
                      className={`collapse-icon ${collapsedGroups[groupName] ? 'collapsed' : ''}`}
                    >
                      ▼
                    </span>
                  </h3>
                  {!collapsedGroups[groupName] && (
                    <div className="group-metrics">
                      {groupMetrics.map((metric) => (
                        <div
                          key={metric.name}
                          className={`metric-item ${
                            selectedMetrics.includes(metric.name) ? 'selected' : ''
                          }`}
                          onClick={() => toggleMetric(metric.name)}
                          style={{
                            backgroundColor: selectedMetrics.includes(metric.name)
                              ? `${metric.color.replace('hsl', 'hsla').replace('%)', '%, 0.5)')}`
                              : '#1f1f1f',
                            color: selectedMetrics.includes(metric.name) ? '#ffffff' : '#e5e5e5',
                            textShadow: selectedMetrics.includes(metric.name)
                              ? '1px 1px 2px #000000'
                              : 'none',
                            borderColor: '#444444',
                          }}
                        >
                          <span className="metric-label-text">
                            {metric.name.replace(/Ticker_/g, '').replace(/_/g, ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid-container">
          {selectedTickers.map((ticker) => (
            <div className="chart-wrapper" key={ticker}>
              <Link to={`/spotlight/${ticker}`} className="company-link">
                <h3>{ticker}</h3>
              </Link>
              <StockChart
                initialTicker={ticker}
                startDate={startDate}
                endDate={endDate}
                metrics={selectedMetrics}
                metricsList={metricsList}
              />
            </div>
          ))}
        </div>
      </div>

      {sidebarVisible && <div className="backdrop" onClick={handleBackdropClick} />}
    </div>
  );
};

export default HomePage;
