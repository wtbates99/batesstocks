import React, { useState, useEffect } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
} from 'recharts';

const StockRadar = ({ ticker }) => {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    fetch(`/radar/${ticker}`)
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => {});
  }, [ticker]);

  if (!data) return null;

  const chartData = [
    { axis: 'MOMENTUM',   stock: data.momentum,   sector: data.sector_momentum },
    { axis: 'TREND',      stock: data.trend,       sector: data.sector_trend },
    { axis: 'VOLUME',     stock: data.volume,      sector: data.sector_volume },
    { axis: 'VOLATILITY', stock: data.volatility,  sector: data.sector_volatility },
    { axis: 'VALUE',      stock: data.value,       sector: data.sector_value },
  ];

  return (
    <div className="radar-wrap">
      <div className="radar-title">STOCK DNA — {ticker}</div>
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
          <PolarGrid stroke="#1c1c2e" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fill: '#3e3e58', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}
          />
          <Radar
            name="Sector Avg" dataKey="sector"
            stroke="#3e3e58" fill="#3e3e58" fillOpacity={0.3} strokeWidth={1} dot={false}
          />
          <Radar
            name={ticker} dataKey="stock"
            stroke="#f97316" fill="#f97316" fillOpacity={0.25} strokeWidth={2}
            dot={{ r: 3, fill: '#f97316' }}
          />
        </RadarChart>
      </ResponsiveContainer>
      <div className="radar-legend">
        <span>
          <span style={{ background: '#f97316', width: 10, height: 2, display: 'inline-block', marginRight: 4, verticalAlign: 'middle' }} />
          {ticker}
        </span>
        <span>
          <span style={{ background: '#3e3e58', width: 10, height: 2, display: 'inline-block', marginRight: 4, verticalAlign: 'middle' }} />
          Sector Avg
        </span>
      </div>
    </div>
  );
};

export default StockRadar;
