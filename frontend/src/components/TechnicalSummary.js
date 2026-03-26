import React, { useState, useEffect } from 'react';

const SIGNAL_COLORS = { bull: 'var(--green)', bear: 'var(--red)', neutral: 'var(--dim)' };
const SIGNAL_LABELS = { bull: '▲ BULL', bear: '▼ BEAR', neutral: '◆ NTRL' };

const TechnicalSummaryPanel = ({ ticker }) => {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!ticker) return;
    fetch(`/technical-summary/${ticker}`)
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => {});
  }, [ticker]);
  if (!data) return null;

  const overallColor = SIGNAL_COLORS[data.overall];
  return (
    <div className="tech-summary-wrap">
      <div className="tech-summary-header">
        <span className="tech-summary-title">SIGNAL SUMMARY</span>
        <span className="tech-overall" style={{ color: overallColor }}>
          {SIGNAL_LABELS[data.overall]}
        </span>
      </div>
      <div className="tech-signals-grid">
        {data.signals.map(sig => (
          <div key={sig.label} className="tech-signal-card">
            <div className="tech-sig-label">{sig.label}</div>
            <div className="tech-sig-value" style={{ color: SIGNAL_COLORS[sig.signal] }}>{sig.value}</div>
            <div className="tech-sig-detail">{sig.detail}</div>
            <div className="tech-sig-bar" style={{ background: SIGNAL_COLORS[sig.signal] }} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default TechnicalSummaryPanel;
