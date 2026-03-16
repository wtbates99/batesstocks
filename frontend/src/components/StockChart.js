import React, { useEffect, useMemo, useCallback, memo } from 'react';
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
  AreaChart,
} from 'recharts';
import '../styles.css';
import useWindowSize from '../hooks/useWindowSize';

function downloadCSV(data, ticker, metrics) {
  if (!data.length) return;
  const headers = ['Date', 'Ticker', ...metrics.map((m) => m.replace('Ticker_', ''))];
  const rows = data.map((row) => [
    row.Date,
    ticker,
    ...metrics.map((m) => (row[m] != null ? row[m] : '')),
  ]);
  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ticker}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const dataCache = {};

function parseDateLocal(dateInput) {
  if (typeof dateInput === 'string') {
    const [y, m, d] = dateInput.split('-');
    return new Date(y, m - 1, d);
  }
  if (dateInput instanceof Date) {
    return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
  }
  return new Date(dateInput);
}

const StockChart = memo(({ initialTicker, startDate, endDate, metrics, metricsList, onDataLoaded }) => {
  const [allData, setAllData] = React.useState([]);
  const { width } = useWindowSize();

  const chartHeight = useMemo(() => {
    if (width <= 480) return 180;
    if (width <= 768) return 220;
    return 260;
  }, [width]);

  useEffect(() => {
    if (!initialTicker) return;

    const cacheKey = `allData-${initialTicker}`;
    const cached = dataCache[cacheKey];

    const notifyLoaded = (data) => {
      if (onDataLoaded && data.length >= 2) {
        const last = data[data.length - 1];
        const prev = data[data.length - 2];
        onDataLoaded({
          latestClose:  parseFloat(last.Ticker_Close  || 0),
          prevClose:    parseFloat(prev.Ticker_Close  || 0),
          latestOpen:   parseFloat(last.Ticker_Open   || 0),
          latestHigh:   parseFloat(last.Ticker_High   || 0),
          latestLow:    parseFloat(last.Ticker_Low    || 0),
        });
      }
    };

    if (cached) {
      setAllData(cached);
      notifyLoaded(cached);
      return;
    }

    const end   = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - 5 * 365 * 86400000).toISOString().split('T')[0];
    const metricsParam = metricsList.map((m) => m.name).join(',');

    fetch(`/stock/${initialTicker}?start_date=${start}&end_date=${end}&metrics=${metricsParam}`)
      .then((r) => r.json())
      .then((data) => {
        const sorted = [...data].sort((a, b) => parseDateLocal(a.Date) - parseDateLocal(b.Date));
        dataCache[cacheKey] = sorted;
        setAllData(sorted);
        notifyLoaded(sorted);
      })
      .catch((e) => console.error(`StockChart fetch error [${initialTicker}]:`, e));
  }, [initialTicker, metricsList]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredData = useMemo(() => {
    if (!allData.length) return [];
    const start = parseDateLocal(startDate).setHours(0, 0, 0, 0);
    const end   = parseDateLocal(endDate).setHours(23, 59, 59, 999);

    return allData
      .filter((item) => {
        const t = parseDateLocal(item.Date).getTime();
        return t >= start && t <= end;
      })
      .map((item) => {
        const row = { Date: item.Date };
        metrics.forEach((m) => { row[m] = item[m]; });
        return row;
      });
  }, [allData, startDate, endDate, metrics]);

  const yAxisDomain = useMemo(() => {
    if (!filteredData.length) return ['auto', 'auto'];
    const vals = filteredData
      .flatMap((d) => metrics.map((m) => (d[m] != null ? parseFloat(d[m]) : NaN)))
      .filter((v) => !isNaN(v));
    if (!vals.length) return ['auto', 'auto'];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.05 || 1;
    return [min - pad, max + pad];
  }, [filteredData, metrics]);

  const formatYAxis = useCallback((v) => {
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return v.toFixed(v < 10 ? 1 : 0);
  }, []);

  const formatXAxis = useCallback((tick) => {
    const date = parseDateLocal(tick);
    const diffDays = (parseDateLocal(endDate) - parseDateLocal(startDate)) / 86400000;
    if (diffDays <= 90) {
      return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
    }
    return `${date.toLocaleString('default', { month: 'short' })} '${String(date.getFullYear()).slice(-2)}`;
  }, [startDate, endDate]);

  const renderTooltip = useCallback(({ payload, label }) => {
    if (!payload?.length) return null;
    return (
      <div className="custom-tooltip">
        <p className="tooltip-label">
          {parseDateLocal(label).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })}
        </p>
        {payload.map((entry) => (
          <p key={entry.dataKey}>
            <span className="metric-name" style={{ color: entry.stroke }}>
              {entry.dataKey.replace('Ticker_', '').replace(/_/g, ' ')}:{' '}
            </span>
            <span className="metric-value">{parseFloat(entry.value).toFixed(2)}</span>
          </p>
        ))}
      </div>
    );
  }, []);

  return (
    <div className="chart-container">
      <button
        className="chart-download-btn"
        onClick={() => downloadCSV(filteredData, initialTicker, metrics)}
        title="Download CSV"
        aria-label="Download chart data as CSV"
      >
        ↓ CSV
      </button>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <AreaChart data={filteredData} margin={{ top: 2, right: 52, bottom: 18, left: 2 }} style={{ cursor: 'crosshair' }}>
          <XAxis
            dataKey="Date"
            tick={{ fill: '#3e3e58', fontSize: 9, fontFamily: 'JetBrains Mono, Fira Code, monospace' }}
            tickFormatter={formatXAxis}
            interval="preserveStartEnd"
            minTickGap={28}
            axisLine={{ stroke: '#1c1c2e' }}
            tickLine={false}
            height={16}
          />
          <YAxis
            orientation="right"
            tick={{ fill: '#3e3e58', fontSize: 9, fontFamily: 'JetBrains Mono, Fira Code, monospace', dx: 2 }}
            domain={yAxisDomain}
            tickFormatter={formatYAxis}
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <CartesianGrid strokeDasharray="1 5" stroke="#1c1c2e" vertical={false} />
          <Tooltip
            content={renderTooltip}
            cursor={{ stroke: 'rgba(249,115,22,0.35)', strokeWidth: 1, strokeDasharray: '4 3' }}
          />
          {metrics.map((metric) => {
            const key   = metric.replace('Ticker_', '');
            const color = metricsList.find((m) => m.name === metric)?.color || '#f97316';
            return (
              <React.Fragment key={key}>
                <defs>
                  <linearGradient id={`g_${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={color} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={color} stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey={metric}
                  stroke={color}
                  strokeWidth={1.5}
                  dot={false}
                  fill={`url(#g_${key})`}
                  fillOpacity={1}
                  activeDot={{ r: 3, strokeWidth: 0, fill: color }}
                />
              </React.Fragment>
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

export default StockChart;
