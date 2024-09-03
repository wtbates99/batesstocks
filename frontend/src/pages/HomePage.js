
import React, { useState } from 'react';
import StockChart from '../components/StockChart';
import '../styles.css';


function hexToRgb(hex) {
  const bigint = parseInt(hex.replace('#', ''), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r}, ${g}, ${b}`;
}
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
  { name: 'Ticker_SMA_10', color: 'hsl(60, 70%, 50%)' },
  { name: 'Ticker_EMA_10', color: 'hsl(160, 70%, 50%)' },
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

const HomePage = () => {
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 30)));
  const [endDate, setEndDate] = useState(new Date());
  const [selectedRange, setSelectedRange] = useState(30); // Default to Last 30 Days
  const [selectedMetrics, setSelectedMetrics] = useState(metricsList.slice(0, 4).map(m => m.name));
  const [collapsedGroups, setCollapsedGroups] = useState({
    Prices: false,
    Volume: true,
    'Moving Averages': true,
    Oscillators: true,
    'Bollinger Bands': true,
  });
  const [sidebarHidden, setSidebarHidden] = useState(false);

  const setDateRange = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setStartDate(start);
    setEndDate(end);
    setSelectedRange(days);
  };

  const toggleMetric = (metric) => {
    setSelectedMetrics(prev =>
      prev.includes(metric.name) ? prev.filter(m => m !== metric.name) : [...prev, metric.name]
    );
  };

  const toggleGroupCollapse = (groupName) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  const toggleSidebar = () => {
    setSidebarHidden(!sidebarHidden);
  };

  return (
    <div className={`min-h-screen bg-dark ${sidebarHidden ? 'sidebar-hidden' : ''}`}>
      <header className="header">
        <h1>Stock Indicators</h1>
        <button className="sidebar-toggle-button" onClick={toggleSidebar}>
          {sidebarHidden ? 'Expand Metrics' : 'Collapse Metrics'}
        </button>
      </header>

      <div className="main-content">
        <div className={`sidebar-container ${sidebarHidden ? 'hidden' : ''}`}>
          <div className="sidebar-content">
            <div className="date-buttons-grid">
              <button className={selectedRange === 7 ? 'active' : ''} onClick={() => setDateRange(7)}>7D</button>
              <button className={selectedRange === 30 ? 'active' : ''} onClick={() => setDateRange(30)}>30D</button>
              <button className={selectedRange === 90 ? 'active' : ''} onClick={() => setDateRange(90)}>90D</button>
              <button className={selectedRange === 180 ? 'active' : ''} onClick={() => setDateRange(180)}>180D</button>
              <button className={selectedRange === 365 ? 'active' : ''} onClick={() => setDateRange(365)}>1Y</button>
              <button className={selectedRange === 730 ? 'active' : ''} onClick={() => setDateRange(730)}>2Y</button>
              <button className={selectedRange === 1095 ? 'active' : ''} onClick={() => setDateRange(1095)}>3Y</button>
              <button className={selectedRange === 1460 ? 'active' : ''} onClick={() => setDateRange(1460)}>4Y</button>
              <button className={selectedRange === 1825 ? 'active' : ''} onClick={() => setDateRange(1825)}>5Y</button>
            </div>

            <div className="metrics-section">
              {Object.entries({
                Prices: metricsList.filter(metric => ['Open', 'Close', 'High', 'Low'].includes(metric.name.replace('Ticker_', ''))),
                Volume: metricsList.filter(metric => metric.name.includes('Volume')),
                'Moving Averages': metricsList.filter(metric => metric.name.includes('SMA') || metric.name.includes('EMA')),
                Oscillators: metricsList.filter(metric => metric.name.includes('MACD') || metric.name.includes('RSI')),
                'Bollinger Bands': metricsList.filter(metric => metric.name.includes('Bollinger')),
              }).map(([groupName, groupMetrics]) => (
                <div className="metrics-group" key={groupName}>
                  <h3 onClick={() => toggleGroupCollapse(groupName)} className="group-header">
                    {groupName}
                    <span className={`collapse-icon ${collapsedGroups[groupName] ? 'collapsed' : ''}`}>▼</span>
                  </h3>
                  {!collapsedGroups[groupName] && (
                    <div className="group-metrics">
                      {groupMetrics.map((metric) => (
                        <div
                          key={metric.name}
                          className={`metric-item ${selectedMetrics.includes(metric.name) ? 'selected' : ''}`}
                          onClick={() => toggleMetric(metric)}
                          style={{
                            backgroundColor: selectedMetrics.includes(metric.name)
                              ? `rgba(${hexToRgb(metric.color)}, 0.5)` // 50% opacity for selected background color
                              : '#1f1f1f', // Use stock background color for unselected
                            borderColor: '#444444',  /* Light grey border */
                          }}
                        >
                          <span className="metric-label-text">{metric.name.replace(/Ticker_/g, '').replace(/_/g, ' ')}</span>
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
          {defaultTickers.map((ticker) => (
            <div className="chart-wrapper" key={ticker}>
              <StockChart
                initialTicker={ticker}
                startDate={startDate}
                endDate={endDate}
                metrics={selectedMetrics}
                metricsList={metricsList}
                roundToWholeNumber={true}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HomePage;
