import React, { useEffect, useMemo, useCallback, memo } from 'react';
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
  AreaChart,
  ComposedChart,
  Bar,
  Line,
} from 'recharts';
import '../styles.css';
import useWindowSize from '../hooks/useWindowSize';

// Metrics whose scale is price-level — safe to overlay on candlestick
const PRICE_LEVEL_METRICS = new Set([
  'Ticker_SMA_10', 'Ticker_EMA_10', 'Ticker_SMA_30', 'Ticker_EMA_30',
  'Ticker_Bollinger_High', 'Ticker_Bollinger_Low', 'Ticker_Bollinger_Mid',
  'Ticker_Open', 'Ticker_Close', 'Ticker_High', 'Ticker_Low',
]);

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

// Factory for the candlestick bar shape — captures domain via closure
function makeCandleShape(domainMin, domainMax) {
  return function CandlestickBar(props) {
    const { x, width, payload, background } = props;
    if (!background || !payload) return null;

    const chartTop = background.y;
    const chartH   = background.height;
    const range    = domainMax - domainMin;
    if (!chartH || range <= 0) return null;

    const toY = (v) => chartTop + chartH * (1 - (v - domainMin) / range);

    const o = parseFloat(payload.Ticker_Open);
    const c = parseFloat(payload.Ticker_Close);
    const h = parseFloat(payload.Ticker_High);
    const l = parseFloat(payload.Ticker_Low);
    if (isNaN(o) || isNaN(c) || isNaN(h) || isNaN(l)) return null;

    const isUp  = c >= o;
    const color = isUp ? '#22c55e' : '#ef4444';
    const cx    = x + width / 2;
    const bw    = Math.max(2, width * 0.65);
    const yO    = toY(o), yC = toY(c), yH = toY(h), yL = toY(l);
    const bodyTop = Math.min(yO, yC);
    const bodyH   = Math.max(1, Math.abs(yC - yO));

    return (
      <g>
        <line x1={cx} y1={yH} x2={cx} y2={yL} stroke={color} strokeWidth={1} />
        <rect x={cx - bw / 2} y={bodyTop} width={bw} height={bodyH} fill={color} />
      </g>
    );
  };
}

const StockChart = memo(({ initialTicker, startDate, endDate, metrics, metricsList, onDataLoaded, chartType = 'area' }) => {
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
        // Always include OHLC for candlestick mode
        const row = {
          Date:         item.Date,
          Ticker_Open:  item.Ticker_Open,
          Ticker_Close: item.Ticker_Close,
          Ticker_High:  item.Ticker_High,
          Ticker_Low:   item.Ticker_Low,
        };
        metrics.forEach((m) => { row[m] = item[m]; });
        return row;
      });
  }, [allData, startDate, endDate, metrics]);

  // For candlestick: overlay metrics that are price-level (MAs, Bollinger)
  const overlayMetrics = useMemo(() => {
    if (chartType !== 'candle') return [];
    return metrics.filter(
      (m) => PRICE_LEVEL_METRICS.has(m) &&
             !['Ticker_Open', 'Ticker_Close', 'Ticker_High', 'Ticker_Low'].includes(m)
    );
  }, [metrics, chartType]);

  const yAxisDomain = useMemo(() => {
    if (!filteredData.length) return ['auto', 'auto'];
    const activeMetrics = chartType === 'candle'
      ? ['Ticker_Open', 'Ticker_High', 'Ticker_Low', 'Ticker_Close', ...overlayMetrics]
      : metrics;
    const vals = filteredData
      .flatMap((d) => activeMetrics.map((m) => (d[m] != null ? parseFloat(d[m]) : NaN)))
      .filter((v) => !isNaN(v));
    if (!vals.length) return ['auto', 'auto'];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.05 || 1;
    return [min - pad, max + pad];
  }, [filteredData, metrics, chartType, overlayMetrics]);

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
            <span className="metric-name" style={{ color: entry.stroke || entry.fill }}>
              {entry.dataKey.replace('Ticker_', '').replace(/_/g, ' ')}:{' '}
            </span>
            <span className="metric-value">{parseFloat(entry.value).toFixed(2)}</span>
          </p>
        ))}
      </div>
    );
  }, []);

  const renderCandleTooltip = useCallback(({ payload, label }) => {
    if (!payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    const isUp = parseFloat(d.Ticker_Close) >= parseFloat(d.Ticker_Open);
    return (
      <div className="custom-tooltip">
        <p className="tooltip-label">
          {parseDateLocal(label).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })}
        </p>
        <p><span className="metric-name" style={{ color: 'var(--muted)' }}>O </span><span className="metric-value">{parseFloat(d.Ticker_Open  || 0).toFixed(2)}</span></p>
        <p><span className="metric-name" style={{ color: 'var(--green)' }}>H </span><span className="metric-value">{parseFloat(d.Ticker_High  || 0).toFixed(2)}</span></p>
        <p><span className="metric-name" style={{ color: 'var(--red)'   }}>L </span><span className="metric-value">{parseFloat(d.Ticker_Low   || 0).toFixed(2)}</span></p>
        <p><span className="metric-name" style={{ color: isUp ? 'var(--green)' : 'var(--red)' }}>C </span><span className="metric-value">{parseFloat(d.Ticker_Close || 0).toFixed(2)}</span></p>
        {overlayMetrics.map((m) => {
          const color = metricsList.find((ml) => ml.name === m)?.color || '#f97316';
          return (
            <p key={m}>
              <span className="metric-name" style={{ color }}>{m.replace('Ticker_', '').replace(/_/g, ' ')}: </span>
              <span className="metric-value">{d[m] != null ? parseFloat(d[m]).toFixed(2) : '—'}</span>
            </p>
          );
        })}
      </div>
    );
  }, [overlayMetrics, metricsList]);

  const sharedAxisProps = {
    xAxis: (
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
    ),
    yAxis: (
      <YAxis
        orientation="right"
        tick={{ fill: '#3e3e58', fontSize: 9, fontFamily: 'JetBrains Mono, Fira Code, monospace', dx: 2 }}
        domain={yAxisDomain}
        tickFormatter={formatYAxis}
        axisLine={false}
        tickLine={false}
        width={50}
      />
    ),
    grid: <CartesianGrid strokeDasharray="1 5" stroke="#1c1c2e" vertical={false} />,
  };

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

      {chartType === 'candle' ? (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <ComposedChart
            data={filteredData}
            margin={{ top: 2, right: 52, bottom: 18, left: 2 }}
            style={{ cursor: 'crosshair' }}
          >
            {sharedAxisProps.xAxis}
            {sharedAxisProps.yAxis}
            {sharedAxisProps.grid}
            <Tooltip
              content={renderCandleTooltip}
              cursor={{ stroke: 'rgba(249,115,22,0.35)', strokeWidth: 1, strokeDasharray: '4 3' }}
            />
            <Bar
              dataKey="Ticker_Close"
              shape={makeCandleShape(yAxisDomain[0], yAxisDomain[1])}
              isAnimationActive={false}
            />
            {overlayMetrics.map((metric) => {
              const color = metricsList.find((m) => m.name === metric)?.color || '#f97316';
              return (
                <Line
                  key={metric}
                  type="monotone"
                  dataKey={metric}
                  stroke={color}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                  activeDot={{ r: 3, strokeWidth: 0, fill: color }}
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <AreaChart data={filteredData} margin={{ top: 2, right: 52, bottom: 18, left: 2 }} style={{ cursor: 'crosshair' }}>
            {sharedAxisProps.xAxis}
            {sharedAxisProps.yAxis}
            {sharedAxisProps.grid}
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
      )}
    </div>
  );
});

export default StockChart;
