
import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
  AreaChart,
} from 'recharts';
import '../styles.css';

const StockChart = ({ initialTicker, startDate, endDate, metrics, metricsList }) => {
  const [ticker, setTicker] = useState(initialTicker);
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [isWaterfall, setIsWaterfall] = useState(true);

  useEffect(() => {
    if (ticker) {
      const end = new Date();
      const start = new Date();
      start.setFullYear(end.getFullYear() - 5);

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

  const toggleWaterfall = () => {
    setIsWaterfall(!isWaterfall);
  };

  const getYAxisDomain = () => {
    if (filteredData.length === 0) return ['auto', 'auto'];

    const allYValues = filteredData.flatMap(d => metrics.map(metric => parseFloat(d[metric])));
    const minY = Math.floor(Math.min(...allYValues));
    const maxY = Math.ceil(Math.max(...allYValues));

    return [minY, maxY];
  };

  const formatYAxis = (tick) => {
    if (tick >= 1e6) return `${Math.round(tick / 1e6)}M`;
    if (tick >= 1e3) return `${Math.round(tick / 1e3)}K`;
    return Math.round(tick).toString();
  };

  const renderCustomTooltip = ({ payload, label }) => {
    if (!payload || !payload.length) return null;

    return (
      <div className="custom-tooltip">
        <p className="tooltip-label">{`Date: ${new Date(label).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: '2-digit' })}`}</p>
        {payload.map((entry, index) => (
          <p key={index}>
            <span className="metric-name" style={{ color: entry.stroke }}>
              {entry.dataKey.replace('Ticker_', '')}:
            </span>{' '}
            <span className="metric-value">{entry.value.toFixed(2)}</span>
          </p>
        ))}
      </div>
    );
  };

  const formatXAxis = (tick) => {
    const date = new Date(tick);
    const diffInDays = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);

    if (diffInDays <= 90) {
      return `${('0' + (date.getMonth() + 1)).slice(-2)}-${('0' + date.getDate()).slice(-2)}-${date.getFullYear().toString().slice(-2)}`;
    }
    return `${date.toLocaleString('default', { month: 'short' })} '${date.getFullYear().toString().slice(-2)}`;
  };

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
        <button onClick={toggleWaterfall} className="toggle-button">
          {isWaterfall ? 'Line Chart' : 'Waterfall Chart'}
        </button>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        {isWaterfall ? (
          <AreaChart data={filteredData} margin={{ top: 10, right: 30, bottom: 10, left: 0 }}>
            <XAxis
              dataKey="Date"
              stroke="#cccccc"
              tickFormatter={formatXAxis}
              interval="preserveStartEnd"
              minTickGap={20}
            />
            <YAxis
              stroke="#cccccc"
              domain={getYAxisDomain()}
              tickFormatter={formatYAxis}
            />
            <CartesianGrid strokeDasharray="3 3" stroke="#333333" />
            <Tooltip content={renderCustomTooltip} />
            {metrics.map((metric) => {
              const cleanMetric = metric.replace('Ticker_', '');
              const metricColor = metricsList.find((m) => m.name === metric)?.color || '#00bfff';

              return (
                <Area
                  key={cleanMetric}
                  type="monotone"
                  dataKey={metric}
                  stroke={metricColor}
                  fill={`url(#gradient_${cleanMetric})`}
                  fillOpacity={0.2} // Faster fade
                />
              );
            })}
            {metrics.map((metric) => {
              const cleanMetric = metric.replace('Ticker_', '');
              const metricColor = metricsList.find((m) => m.name === metric)?.color || '#00bfff';
              return (
                <defs key={cleanMetric}>
                  <linearGradient id={`gradient_${cleanMetric}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={metricColor} stopOpacity={0.7} />
                    <stop offset="100%" stopColor={metricColor} stopOpacity={0.1} />
                  </linearGradient>
                </defs>
              );
            })}
          </AreaChart>
        ) : (
          <LineChart data={filteredData} margin={{ top: 10, right: 30, bottom: 10, left: 0 }}>
            <XAxis
              dataKey="Date"
              stroke="#cccccc"
              tickFormatter={formatXAxis}
              interval="preserveStartEnd"
              minTickGap={20}
            />
            <YAxis
              stroke="#cccccc"
              domain={getYAxisDomain()}
              tickFormatter={formatYAxis}
            />
            <CartesianGrid strokeDasharray="3 3" stroke="#333333" />
            <Tooltip content={renderCustomTooltip} />
            {metrics.map((metric) => {
              const cleanMetric = metric.replace('Ticker_', '');
              const metricColor = metricsList.find((m) => m.name === metric)?.color || '#00bfff';

              return (
                <Line
                  key={cleanMetric}
                  type="monotone"
                  dataKey={metric}
                  stroke={metricColor}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: '#ffffff' }}
                />
              );
            })}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

export default StockChart;
