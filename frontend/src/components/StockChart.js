
// StockChart.js
import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
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

// Simple in-memory cache
const dataCache = {};

const StockChart = memo(({ initialTicker, startDate, endDate, metrics, metricsList }) => {
  const [ticker, setTicker] = useState(initialTicker);
  const [allData, setAllData] = useState([]);
  const [isWaterfall, setIsWaterfall] = useState(true);

  // Fetch all data when the ticker changes
  useEffect(() => {
    if (ticker) {
      const cacheKey = `allData-${ticker}`;
      if (dataCache[cacheKey]) {
        setAllData(dataCache[cacheKey]);
      } else {
        const end = new Date();
        const start = new Date();
        start.setFullYear(end.getFullYear() - 5); // Adjust as needed

        const startDateStr = start.toISOString().split('T')[0];
        const endDateStr = end.toISOString().split('T')[0];
        const metricsParam = metricsList.map((m) => m.name).join(',');

        const fetchData = async () => {
          try {
            const response = await fetch(
              `http://localhost:8000/stock/${ticker}?start_date=${startDateStr}&end_date=${endDateStr}&metrics=${metricsParam}`
            );
            const data = await response.json();
            const sortedData = data.sort((a, b) => new Date(a.Date) - new Date(b.Date));
            dataCache[cacheKey] = sortedData;
            setAllData(sortedData);
          } catch (error) {
            console.error('Error fetching data:', error);
          }
        };

        fetchData();
      }
    }
  }, [ticker, metricsList]);

  // Filter data based on startDate, endDate, and metrics
  const filteredData = useMemo(() => {
    if (!allData.length) return [];

    const start = new Date(startDate).setHours(0, 0, 0, 0);
    const end = new Date(endDate).setHours(23, 59, 59, 999);

    return allData
      .filter((item) => {
        const itemDate = new Date(item.Date).getTime();
        return itemDate >= start && itemDate <= end;
      })
      .map((item) => {
        // Include only the selected metrics
        const newItem = { Date: item.Date };
        metrics.forEach((metric) => {
          newItem[metric] = item[metric];
        });
        return newItem;
      });
  }, [allData, startDate, endDate, metrics]);

  const handleTickerChange = useCallback((e) => {
    setTicker(e.target.value.toUpperCase());
  }, []);

  const toggleWaterfall = useCallback(() => {
    setIsWaterfall((prev) => !prev);
  }, []);

  const yAxisDomain = useMemo(() => {
    if (filteredData.length === 0) return ['auto', 'auto'];

    const allYValues = filteredData.flatMap((d) =>
      metrics.map((metric) => parseFloat(d[metric] || 0))
    );
    const minY = Math.floor(Math.min(...allYValues));
    const maxY = Math.ceil(Math.max(...allYValues));

    return [minY, maxY];
  }, [filteredData, metrics]);

  const formatYAxis = useCallback((tick) => {
    if (tick >= 1e6) return `${Math.round(tick / 1e6)}M`;
    if (tick >= 1e3) return `${Math.round(tick / 1e3)}K`;
    return Math.round(tick).toString();
  }, []);

  const formatXAxis = useCallback(
    (tick) => {
      const date = new Date(tick);
      const diffInDays = (endDate - startDate) / (1000 * 60 * 60 * 24);

      if (diffInDays <= 90) {
        return `${('0' + (date.getMonth() + 1)).slice(-2)}-${(
          '0' + date.getDate()
        ).slice(-2)}-${date.getFullYear().toString().slice(-2)}`;
      }
      return `${date.toLocaleString('default', { month: 'short' })} '${date
        .getFullYear()
        .toString()
        .slice(-2)}`;
    },
    [startDate, endDate]
  );

  const renderCustomTooltip = useCallback(({ payload, label }) => {
    if (!payload || !payload.length) return null;

    return (
      <div className="custom-tooltip">
        <p className="tooltip-label">{`Date: ${new Date(label).toLocaleDateString(undefined, {
          month: '2-digit',
          day: '2-digit',
          year: '2-digit',
        })}`}</p>
        {payload.map((entry) => (
          <p key={entry.dataKey}>
            <span className="metric-name" style={{ color: entry.stroke }}>
              {entry.dataKey.replace('Ticker_', '')}:
            </span>{' '}
            <span className="metric-value">{parseFloat(entry.value).toFixed(2)}</span>
          </p>
        ))}
      </div>
    );
  }, []);

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
            <YAxis stroke="#cccccc" domain={yAxisDomain} tickFormatter={formatYAxis} />
            <CartesianGrid strokeDasharray="3 3" stroke="#333333" />
            <Tooltip content={renderCustomTooltip} />
            {metrics.map((metric) => {
              const cleanMetric = metric.replace('Ticker_', '');
              const metricColor =
                metricsList.find((m) => m.name === metric)?.color || '#00bfff';

              return (
                <React.Fragment key={cleanMetric}>
                  <defs>
                    <linearGradient id={`gradient_${cleanMetric}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={metricColor} stopOpacity={0.7} />
                      <stop offset="100%" stopColor={metricColor} stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey={metric}
                    stroke={metricColor}
                    fill={`url(#gradient_${cleanMetric})`}
                    fillOpacity={0.2}
                  />
                </React.Fragment>
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
            <YAxis stroke="#cccccc" domain={yAxisDomain} tickFormatter={formatYAxis} />
            <CartesianGrid strokeDasharray="3 3" stroke="#333333" />
            <Tooltip content={renderCustomTooltip} />
            {metrics.map((metric) => {
              const cleanMetric = metric.replace('Ticker_', '');
              const metricColor =
                metricsList.find((m) => m.name === metric)?.color || '#00bfff';
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
});

export default StockChart;
