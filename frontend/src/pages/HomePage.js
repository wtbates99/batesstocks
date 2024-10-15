import React, { useState, useMemo, useCallback, useEffect } from 'react';
import StockChart from '../components/StockChart';
import '../styles.css';

const metricsList = [
  { name: 'Ticker_Low', color: 'hsl(0, 70%, 50%)' },
  { name: 'Ticker_Close', color: 'hsl(60, 70%, 50%)' },
  { name: 'Ticker_High', color: 'hsl(120, 70%, 50%)' },
  { name: 'Ticker_Open', color: 'hsl(0, 0%, 80%)' },
  { name: 'Ticker_Volume', color: 'hsl(280, 70%, 50%)' },
  { name: 'Ticker_On_Balance_Volume', color: 'hsl(30, 70%, 50%)' },
  { name: 'Ticker_Chaikin_MF', color: 'hsl(90, 70%, 50%)' },
  { name: 'Ticker_Force_Index', color: 'hsl(200, 70%, 50%)' },
  { name: 'Ticker_MFI', color: 'hsl(340, 70%, 50%)' },
  { name: 'Ticker_SMA_10', color: 'hsl(40, 50%, 70%)' },
  { name: 'Ticker_EMA_10', color: 'hsl(160, 70%, 50%)' },
  { name: 'Ticker_SMA_30', color: 'hsl(40, 50%, 70%)' },
  { name: 'Ticker_EMA_30', color: 'hsl(160, 70%, 50%)' },
  { name: 'Ticker_RSI', color: 'hsl(180, 70%, 50%)' },
  { name: 'Ticker_Stochastic_K', color: 'hsl(240, 70%, 50%)' },
  { name: 'Ticker_Stochastic_D', color: 'hsl(320, 70%, 50%)' },
  { name: 'Ticker_MACD', color: 'hsl(20, 70%, 50%)' },
  { name: 'Ticker_MACD_Signal', color: 'hsl(140, 70%, 50%)' },
  { name: 'Ticker_MACD_Diff', color: 'hsl(280, 70%, 50%)' },
  { name: 'Ticker_TSI', color: 'hsl(300, 70%, 50%)' },
  { name: 'Ticker_UO', color: 'hsl(200, 70%, 50%)' },
  { name: 'Ticker_ROC', color: 'hsl(360, 70%, 50%)' },
  { name: 'Ticker_Williams_R', color: 'hsl(80, 70%, 50%)' },
  { name: 'Ticker_Bollinger_High', color: 'hsl(120, 70%, 50%)' },
  { name: 'Ticker_Bollinger_Low', color: 'hsl(180, 70%, 50%)' },
  { name: 'Ticker_Bollinger_Mid', color: 'hsl(240, 70%, 50%)' },
  { name: 'Ticker_Bollinger_PBand', color: 'hsl(300, 70%, 50%)' },
  { name: 'Ticker_Bollinger_WBand', color: 'hsl(40, 70%, 50%)' },
];

const defaultTickers = ['AAPL', 'GOOGL', 'AMZN', 'MSFT', 'TSLA', 'NKE', 'NVDA', 'NFLX', 'JPM'];

const formatGroupName = (name) => {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const HomePage = () => {
  const [startDate, setStartDate] = useState(
    new Date(new Date().setDate(new Date().getDate() - 30))
  );
  const [endDate, setEndDate] = useState(new Date());
  const [selectedRange, setSelectedRange] = useState(30);
  const [selectedMetrics, setSelectedMetrics] = useState(
    metricsList.slice(0, 4).map((m) => m.name)
  );
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

  // New function to fetch groupings with caching
  const fetchGroupings = useCallback(async () => {
    const cachedGroupings = localStorage.getItem('tickerGroupings');
    const lastFetchTime = localStorage.getItem('lastGroupingsFetchTime');
    const currentTime = new Date().getTime();

    // Check if cache exists and is less than 24 hours old
    if (cachedGroupings && lastFetchTime && currentTime - parseInt(lastFetchTime) < 24 * 60 * 60 * 1000) {
      setTickerGroups(JSON.parse(cachedGroupings));
    } else {
      try {
        const response = await fetch('/groupings');
        const data = await response.json();
        setTickerGroups(data);
        localStorage.setItem('tickerGroupings', JSON.stringify(data));
        localStorage.setItem('lastGroupingsFetchTime', currentTime.toString());
      } catch (error) {
        console.error('Error fetching ticker groups:', error);
      }
    }
  }, []);

  useEffect(() => {
    fetchGroupings();
  }, [fetchGroupings]);

  const groupedMetrics = useMemo(
    () => ({
      Prices: metricsList.filter((metric) =>
        ['Open', 'Close', 'High', 'Low'].includes(metric.name.replace('Ticker_', ''))
      ),
      Volume: metricsList.filter((metric) => metric.name.includes('Volume')),
      'Moving Averages': metricsList.filter(
        (metric) => metric.name.includes('SMA') || metric.name.includes('EMA')
      ),
      Oscillators: metricsList.filter(
        (metric) => metric.name.includes('MACD') || metric.name.includes('RSI')
      ),
      'Bollinger Bands': metricsList.filter((metric) => metric.name.includes('Bollinger')),
    }),
    []
  );

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
    } else if (tickerGroups && tickerGroups[group]) {
      setSelectedTickers(tickerGroups[group]);
    }
  }, [tickerGroups]);

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
