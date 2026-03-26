import React, { useState, useEffect } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import NavBar from '../components/NavBar';
import SearchBar from '../components/SearchBar';
import '../styles.css';

const StatCard = ({ label, value, sub, color }) => (
  <div className="breadth-stat-card">
    <div className="breadth-stat-label">{label}</div>
    <div className="breadth-stat-value" style={{ color: color || 'var(--text)' }}>{value ?? '—'}</div>
    {sub && <div className="breadth-stat-sub">{sub}</div>}
  </div>
);

const MarketPage = () => {
  const [breadth, setBreadth] = useState(null);
  const [rotation, setRotation] = useState([]);
  const [rotDays, setRotDays] = useState(90);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/market-breadth').then(r => r.json()),
      fetch(`/sector-rotation?days=${rotDays}`).then(r => r.json()),
    ]).then(([b, s]) => {
      setBreadth(b);
      setRotation(Array.isArray(s) ? s : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [rotDays]);

  return (
    <div className="bg-dark">
      <header className="header">
        <div className="header-left">
          <h1 className="header-title"><span>BATES</span>STOCKS</h1>
          <NavBar />
        </div>
        <div className="header-controls"><SearchBar /></div>
      </header>

      <div className="page-body">
        {loading ? (
          <div className="cp-loading"><span className="cp-loading-label">Loading market data…</span></div>
        ) : <>
          <div className="page-header-row">
            <h2 className="page-section-title">MARKET BREADTH</h2>
            {breadth && <span className="breadth-date">{breadth.date}</span>}
          </div>

          {breadth && (
            <>
              <div className="breadth-stat-grid">
                <StatCard label="ADVANCING" value={breadth.advancing} color="var(--green)" />
                <StatCard label="DECLINING" value={breadth.declining} color="var(--red)" />
                <StatCard label="UNCHANGED" value={breadth.unchanged} color="var(--muted)" />
                <StatCard label="% ADVANCING" value={breadth.pct_advancing != null ? `${breadth.pct_advancing}%` : '—'} color={breadth.pct_advancing >= 50 ? 'var(--green)' : 'var(--red)'} />
                <StatCard label="52W NEW HIGHS" value={breadth.new_highs_52w} color="var(--green)" />
                <StatCard label="52W NEW LOWS" value={breadth.new_lows_52w} color="var(--red)" />
                <StatCard label="ABOVE SMA30" value={breadth.above_sma50} color="var(--green)" />
                <StatCard label="BELOW SMA30" value={breadth.below_sma50} color="var(--red)" />
                <StatCard label="AVG RSI" value={breadth.avg_rsi} color={breadth.avg_rsi > 60 ? 'var(--red)' : breadth.avg_rsi < 40 ? 'var(--green)' : 'var(--text)'} />
                <StatCard label="AVG TECH SCORE" value={breadth.avg_tech_score} color={breadth.avg_tech_score >= 60 ? 'var(--green)' : breadth.avg_tech_score < 40 ? 'var(--red)' : 'var(--text)'} />
              </div>

              <div className="breadth-adv-bar-wrap">
                <div className="breadth-adv-bar-bg">
                  <div className="breadth-adv-bar-fill" style={{ width: `${breadth.pct_advancing ?? 50}%` }} />
                  <span className="breadth-adv-label">ADV {breadth.pct_advancing}%</span>
                  <span className="breadth-dec-label">DEC {breadth.pct_advancing != null ? (100 - breadth.pct_advancing).toFixed(1) : '—'}%</span>
                </div>
              </div>
            </>
          )}

          <div className="page-header-row" style={{ marginTop: 28 }}>
            <h2 className="page-section-title">SECTOR ROTATION</h2>
            <div className="day-toggle">
              {[30, 90, 180, 365].map(d => (
                <button key={d} className={`toolbar-btn ${rotDays===d?'active':''}`} onClick={() => setRotDays(d)}>{d}D</button>
              ))}
            </div>
          </div>

          <div className="rotation-chart-wrap">
            <ResponsiveContainer width="100%" height={Math.max(240, rotation.length * 32)}>
              <BarChart data={rotation} layout="vertical" margin={{ top: 4, right: 60, bottom: 4, left: 120 }}>
                <XAxis type="number" tick={{ fill: '#3e3e58', fontSize: 9, fontFamily: 'JetBrains Mono, Fira Code, monospace' }} tickFormatter={v => `${v > 0 ? '+' : ''}${v?.toFixed(1)}%`} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="sector" tick={{ fill: '#8b8ba7', fontSize: 9, fontFamily: 'JetBrains Mono, Fira Code, monospace' }} axisLine={false} tickLine={false} width={116} />
                <Tooltip formatter={(v) => [`${v > 0 ? '+' : ''}${v?.toFixed(2)}%`, 'Return']} contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 10 }} />
                <Bar dataKey="return_pct" radius={[0, 3, 3, 0]}>
                  {rotation.map((entry, i) => (
                    <Cell key={i} fill={entry.return_pct >= 0 ? '#22c55e' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>}
      </div>
    </div>
  );
};

export default MarketPage;
