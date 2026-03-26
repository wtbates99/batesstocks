import React, { useState, useEffect } from 'react';

function getETTime() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

function isMarketOpen(et) {
  const d = et.getDay(), m = et.getHours() * 60 + et.getMinutes();
  return d >= 1 && d <= 5 && m >= 570 && m < 960;
}

function getCountdown(et) {
  const d = et.getDay(), m = et.getHours() * 60 + et.getMinutes();
  const isWeekend = d === 0 || d === 6;
  if (isWeekend) return null;
  if (m < 570) { const diff = 570 - m; return `OPENS ${Math.floor(diff/60)}h${diff%60}m`; }
  if (m >= 570 && m < 960) { const diff = 960 - m; return `CLOSES ${Math.floor(diff/60)}h${diff%60}m`; }
  return `OPENS TMR`;
}

const MarketClock = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // eslint-disable-next-line no-unused-vars
  const _now = now; // trigger re-render on tick
  const et = getETTime();
  const open = isMarketOpen(et);
  const countdown = getCountdown(et);
  const timeStr = et.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const dateStr = et.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="market-clock">
      <span className={`clock-dot ${open ? 'open' : 'closed'}`} />
      <span className="clock-time">{timeStr}</span>
      <span className="clock-date">{dateStr} ET</span>
      {countdown && <span className="clock-countdown">{countdown}</span>}
    </div>
  );
};

export default MarketClock;
