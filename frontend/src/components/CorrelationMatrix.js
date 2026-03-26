import React, { useState, useEffect } from 'react';

function corrColor(v) {
  if (v == null) return 'var(--surface-2)';
  const abs = Math.abs(v);
  if (v >= 0) return `rgba(34, 197, 94, ${0.08 + abs * 0.65})`;
  return `rgba(239, 68, 68, ${0.08 + abs * 0.65})`;
}

const CorrelationMatrix = ({ tickers, days = 90 }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tickers || tickers.length < 2) return;
    setLoading(true);
    const params = tickers.map(t => `tickers=${t}`).join('&');
    fetch(`/correlations?${params}&days=${days}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tickers, days]);

  if (!tickers || tickers.length < 2) return null;
  if (loading) return <div className="corr-loading">Computing correlations…</div>;
  if (!data) return null;

  return (
    <div className="corr-matrix-wrap">
      <table className="corr-table">
        <thead>
          <tr>
            <th></th>
            {data.tickers.map(t => <th key={t}>{t}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.matrix.map((row, i) => (
            <tr key={data.tickers[i]}>
              <td className="corr-row-label">{data.tickers[i]}</td>
              {row.map((v, j) => (
                <td key={j} style={{ background: corrColor(v), color: 'var(--text)' }} title={`${data.tickers[i]} / ${data.tickers[j]}: ${v?.toFixed(4)}`}>
                  {v != null ? (i === j ? '1.00' : v.toFixed(2)) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CorrelationMatrix;
