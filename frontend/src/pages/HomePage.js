
import React, { useState } from 'react';
import StockChart from '../components/StockChart';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
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
  const [selectedMetrics, setSelectedMetrics] = useState(metricsList.slice(0, 4).map(m => m.name));
  const [collapsedGroups, setCollapsedGroups] = useState({
    Prices: false,
    Volume: true,
    'Moving Averages': true,
    Oscillators: true,
    'Bollinger Bands': true,
  });

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

  const setDateRange = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setStartDate(start);
    setEndDate(end);
  };

  return (
    <div className="min-h-screen bg-dark p-8">
      <header className="header">
        <h1>Stock Indicators</h1>
      </header>

      <div className="layout-container">
        <aside className="sidebar">
          <div className="sidebar-box">
            <h2>Date Range</h2>
            <div className="sidebar-date-picker">
              <DatePicker
                selected={startDate}
                onChange={(date) => setStartDate(date)}
                selectsStart
                startDate={startDate}
                endDate={endDate}
                placeholderText="Start Date"
                className="date-picker-single"
              />
              <span className="date-range-separator">to</span>
              <DatePicker
                selected={endDate}
                onChange={(date) => setEndDate(date)}
                selectsEnd
                startDate={startDate}
                endDate={endDate}
                minDate={startDate}
                placeholderText="End Date"
                className="date-picker-single"
              />
              <div className="date-buttons">
                <button onClick={() => setDateRange(7)}>7D</button>
                <button onClick={() => setDateRange(30)}>30D</button>
                <button onClick={() => setDateRange(180)}>180D</button>
              </div>
            </div>
          </div>

          <div className="sidebar-box">
            <h2>Metrics</h2>
            <div className="metrics-section">
              {Object.entries({
                Prices: metricsList.filter(metric => ['Ticker_Open', 'Ticker_Close', 'Ticker_High', 'Ticker_Low'].includes(metric.name)),
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
                        <div key={metric.name} className="metric-checkbox">
                          <label>
                            <input
                              type="checkbox"
                              checked={selectedMetrics.includes(metric.name)}
                              onChange={() => toggleMetric(metric)}
                            />
                            {metric.name.replace('Ticker_', '')}
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className="grid-container">
          {defaultTickers.map((ticker) => (
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
        </main>
      </div>
    </div>
  );
};

export default HomePage;
