
import React, { useState, useEffect } from 'react';
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
  const [filteredData, setFilteredData] = useState([]);

  useEffect(() => {
    if (ticker) {
      const end = new Date();
      const start = new Date();
      start.setFullYear(end.getFullYear() - 3);

      const startDateStr = start.toISOString().split('T')[0];
      const endDateStr = end.toISOString().split('T')[0];
      const metricsParam = metrics.join(',');

      fetch(`http://localhost:8000/stock/${ticker}?start_date=${startDateStr}&end_date=${endDateStr}&metrics=${metricsParam}`)
        .then((response) => response.json())
        .then((data) => {
          const sortedData = data.sort((a, b) => new Date(a.Date) - new Date(b.Date));
          setData(sortedData);
        });
    }
  }, [ticker, metrics]);

  useEffect(() => {
    if (data.length > 0) {
      const start = startDate.toISOString().split('T')[0];
      const end = endDate.toISOString().split('T')[0];

      const filtered = data.filter(item => {
        const itemDate = new Date(item.Date);
        return itemDate >= new Date(start) && itemDate <= new Date(end);
      });

      setFilteredData(filtered);
    }
  }, [data, startDate, endDate]);

  const handleTickerChange = (e) => {
    setTicker(e.target.value.toUpperCase());
  };

  const getYAxisDomain = () => {
    if (filteredData.length === 0) return ['auto', 'auto'];

    const allYValues = filteredData.flatMap(d => metrics.map(metric => parseFloat(d[metric])));
    const minY = Math.min(...allYValues);
    const maxY = Math.max(...allYValues);

    return [minY * 0.985, maxY * 1.02];
  };

  const yAxisDomain = getYAxisDomain();

  return (
    <div className="chart-container">
      <div className="ticker-field">
        <input
          type="text"
          value={ticker}
          onChange={handleTickerChange}
          className="ticker-input-field"
          placeholder="Enter Ticker"
        />
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={filteredData}>
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
