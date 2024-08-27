
import React, { useState, useEffect, useRef } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import '../styles.css';

const StockChart = ({ initialTicker, startDate, endDate, metrics, metricsList }) => {
  const [ticker, setTicker] = useState(initialTicker);
  const [data, setData] = useState([]);
  const chartRef = useRef(null);
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    if (ticker) {
      const start = startDate.toISOString().split('T')[0];
      const end = endDate.toISOString().split('T')[0];
      const metricsParam = metrics.join(',');

      fetch(`http://localhost:8000/stock/${ticker}?start_date=${start}&end_date=${end}&metrics=${metricsParam}`)
        .then((response) => response.json())
        .then((data) => {
          const sortedData = data.sort((a, b) => new Date(a.Date) - new Date(b.Date));
          setData(sortedData);
        });
    }
  }, [ticker, startDate, endDate, metrics]);

  const handleTickerChange = (e) => {
    setTicker(e.target.value.toUpperCase());
  };

  const toggleFullScreen = () => {
    if (!isFullScreen) {
      chartRef.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
    setIsFullScreen(!isFullScreen);
  };

  const getYAxisDomain = () => {
    if (data.length === 0) return ['auto', 'auto'];

    const allYValues = data.flatMap(d => metrics.map(metric => parseFloat(d[metric])));
    const minY = Math.min(...allYValues);
    const maxY = Math.max(...allYValues);

    return [minY * 0.985, maxY * 1.02]; // Slight padding to ensure the line isn't touching the edges
  };

  const yAxisDomain = getYAxisDomain();

  return (
    <div className={`chart-container ${isFullScreen ? 'full-screen' : ''}`} ref={chartRef}>
      <div className="ticker-field">
        <input
          type="text"
          value={ticker}
          onChange={handleTickerChange}
          className="ticker-input-field"
          placeholder="Enter Ticker"
        />
        <button onClick={toggleFullScreen} className="full-screen-button">
          {isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
        </button>
      </div>
      <ResponsiveContainer width="100%" height={isFullScreen ? '90%' : 300}>
        <LineChart data={data}>
          <XAxis dataKey="Date" stroke="#ffffff" />
          <YAxis stroke="#ffffff" domain={yAxisDomain} tickFormatter={(tick) => tick.toFixed(2)} />
          <CartesianGrid strokeDasharray="3 3" stroke="#444444" />
          <Tooltip
            formatter={(value) => value.toFixed(2)}
            contentStyle={{
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              borderColor: '#444444',
              color: '#ffffff',
              borderRadius: '5px',
            }}
          />
          {metrics.map((metric) => {
            const metricColor = metricsList.find((m) => m.name === metric)?.color || '#00bfff';
            return (
              <Line
                key={metric}
                type="monotone"
                dataKey={metric}
                stroke={metricColor}
                strokeWidth={2}
                dot={false}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StockChart;
