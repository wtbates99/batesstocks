
import React, { useState } from 'react';
import StockChart from '../components/StockChart';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '../styles.css';

const metricsList = [
  { name: 'Ticker_Open', color: 'hsl(0, 70%, 50%)' },
  { name: 'Ticker_Close', color: 'hsl(20, 70%, 50%)' },
  { name: 'Ticker_High', color: 'hsl(40, 70%, 50%)' },
  { name: 'Ticker_Low', color: 'hsl(60, 70%, 50%)' },
  { name: 'Ticker_Volume', color: 'hsl(80, 70%, 50%)' },
  { name: 'Ticker_SMA_10', color: 'hsl(100, 70%, 50%)' },
  { name: 'Ticker_EMA_10', color: 'hsl(120, 70%, 50%)' },
  { name: 'Ticker_RSI', color: 'hsl(140, 70%, 50%)' },
  { name: 'Ticker_Stochastic_K', color: 'hsl(160, 70%, 50%)' },
  { name: 'Ticker_Stochastic_D', color: 'hsl(180, 70%, 50%)' },
  { name: 'Ticker_MACD', color: 'hsl(200, 70%, 50%)' },
  { name: 'Ticker_MACD_Signal', color: 'hsl(220, 70%, 50%)' },
  { name: 'Ticker_MACD_Diff', color: 'hsl(240, 70%, 50%)' },
  { name: 'Ticker_TSI', color: 'hsl(260, 70%, 50%)' },
  { name: 'Ticker_UO', color: 'hsl(280, 70%, 50%)' },
  { name: 'Ticker_ROC', color: 'hsl(300, 70%, 50%)' },
  { name: 'Ticker_Williams_R', color: 'hsl(320, 70%, 50%)' },
  { name: 'Ticker_Bollinger_High', color: 'hsl(340, 70%, 50%)' },
  { name: 'Ticker_Bollinger_Low', color: 'hsl(360, 70%, 50%)' },
  { name: 'Ticker_Bollinger_Mid', color: 'hsl(380, 70%, 50%)' },
  { name: 'Ticker_Bollinger_PBand', color: 'hsl(400, 70%, 50%)' },
  { name: 'Ticker_Bollinger_WBand', color: 'hsl(420, 70%, 50%)' },
  { name: 'Ticker_On_Balance_Volume', color: 'hsl(440, 70%, 50%)' },
  { name: 'Ticker_Chaikin_MF', color: 'hsl(460, 70%, 50%)' },
  { name: 'Ticker_Force_Index', color: 'hsl(480, 70%, 50%)' },
  { name: 'Ticker_MFI', color: 'hsl(500, 70%, 50%)' },
];

const defaultTickers = ['AAPL', 'GOOGL', 'AMZN', 'MSFT', 'TSLA', 'NKE', 'NVDA', 'NFLX', 'JPM'];

const HomePage = () => {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date;
  });
  const [endDate, setEndDate] = useState(new Date());
  const [selectedMetrics, setSelectedMetrics] = useState(metricsList.slice(0, 3).map(m => m.name));

  const toggleMetric = (metric) => {
    setSelectedMetrics((prev) =>
      prev.includes(metric.name)
        ? prev.filter((m) => m !== metric.name)
        : [...prev, metric.name]
    );
  };

  return (
    <div className="min-h-screen bg-dark p-8">
      <div className="layout-container">
        <div className="grid-container">
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
        </div>

        <div className="sidebar">
          <div className="sidebar-content">
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
            </div>
            <div className="metrics-section">
              <h2 className="metrics-title">Select Metrics</h2>
              <div className="metrics-selector">
                {metricsList.map((metric) => (
                  <button
                    key={metric.name}
                    className={`metric-button ${selectedMetrics.includes(metric.name) ? 'active' : ''}`}
                    style={{
                      backgroundColor: selectedMetrics.includes(metric.name)
                        ? metric.color
                        : '#2d2d2d',
                      borderColor: selectedMetrics.includes(metric.name)
                        ? metric.color
                        : '#444444',
                    }}
                    onClick={() => toggleMetric(metric)}
                  >
                    {metric.name.replace('Ticker_', '')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
