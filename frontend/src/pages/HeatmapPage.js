import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Treemap } from 'recharts';
import NavBar from '../components/NavBar';
import '../styles.css';

function pctToColor(pct) {
  if (pct == null || isNaN(pct)) return 'rgba(30,30,48,0.9)';
  const clamped = Math.max(-5, Math.min(5, pct));
  if (clamped >= 0) {
    const ratio = clamped / 5;
    return `rgba(34, 197, 94, ${0.12 + ratio * 0.72})`;
  }
  const ratio = Math.abs(clamped) / 5;
  return `rgba(239, 68, 68, ${0.12 + ratio * 0.72})`;
}

function TreeNode(props) {
  const { x, y, width, height, name, pct_change, ticker, onClick } = props;
  if (!width || !height || width < 4 || height < 4) return null;
  const bg = pctToColor(pct_change);
  const pctStr =
    pct_change != null && !isNaN(pct_change)
      ? `${pct_change >= 0 ? '+' : ''}${Number(pct_change).toFixed(2)}%`
      : '';
  const label = ticker || (name || '').substring(0, 12);
  const fontSize = Math.min(13, Math.max(8, width / 7));
  const showLabel = width > 32 && height > 22;
  const showPct   = height > 44 && width > 40;

  return (
    <g style={{ cursor: 'pointer' }} onClick={() => onClick && onClick({ name, pct_change, ticker })}>
      <rect
        x={x + 1} y={y + 1}
        width={width - 2} height={height - 2}
        fill={bg}
        stroke="var(--border)"
        strokeWidth={1}
        rx={3}
      />
      {showLabel && (
        <text
          x={x + width / 2}
          y={y + height / 2 + (showPct ? -8 : 0)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--text)"
          fontSize={fontSize}
          fontFamily="JetBrains Mono, monospace"
          fontWeight="700"
        >
          {label}
        </text>
      )}
      {showPct && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 10}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={pct_change >= 0 ? '#22c55e' : '#ef4444'}
          fontSize={Math.max(8, fontSize - 2)}
          fontFamily="JetBrains Mono, monospace"
        >
          {pctStr}
        </text>
      )}
    </g>
  );
}

const HeatmapPage = () => {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const [level, setLevel]               = useState('sector');
  const [activeSector, setActiveSector] = useState(null);
  const [activeSubsector, setActiveSubsector] = useState(null);
  const [data, setData]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  // Measure container so Treemap gets explicit pixel dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const fetchData = useCallback((lvl, sector, subsector) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ level: lvl });
    if (sector)    params.set('sector', sector);
    if (subsector) params.set('subsector', subsector);
    fetch(`/heatmap?${params}`)
      .then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(e.detail || `HTTP ${r.status}`));
        return r.json();
      })
      .then((rows) => {
        if (!rows.length) {
          setError('No data available — the data pipeline may still be loading.');
          setData([]);
        } else {
          setData(rows.map((r) => ({ ...r, value: Math.max(1, r.market_cap || 1) })));
        }
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setData([]);
        setLoading(false);
      });
  }, []);

  useEffect(() => { fetchData('sector', null, null); }, [fetchData]);

  const handleNodeClick = useCallback(({ name, ticker }) => {
    if (level === 'sector') {
      setActiveSector(name);
      setLevel('subsector');
      fetchData('subsector', name, null);
    } else if (level === 'subsector') {
      setActiveSubsector(name);
      setLevel('stock');
      fetchData('stock', activeSector, name);
    } else if (level === 'stock' && ticker) {
      navigate(`/spotlight/${ticker}`);
    }
  }, [level, activeSector, fetchData, navigate]);

  const goToLevel = useCallback((targetLevel) => {
    if (targetLevel === 'sector') {
      setLevel('sector');
      setActiveSector(null);
      setActiveSubsector(null);
      fetchData('sector', null, null);
    } else if (targetLevel === 'subsector') {
      setLevel('subsector');
      setActiveSubsector(null);
      fetchData('subsector', activeSector, null);
    }
  }, [activeSector, fetchData]);

  return (
    <div className="heatmap-page">
      <header className="header">
        <div className="header-left">
          <h1 className="header-title"><span>BATES</span>STOCKS</h1>
          <NavBar />
        </div>
        <div className="header-controls">
          <div className="heatmap-legend">
            <span className="legend-item red">-5%</span>
            <div className="legend-bar" />
            <span className="legend-item green">+5%</span>
          </div>
        </div>
      </header>

      <div className="heatmap-body">
        {/* Breadcrumb */}
        <div className="heatmap-breadcrumb">
          <button className="breadcrumb-item" onClick={() => goToLevel('sector')}>S&amp;P 500</button>
          {activeSector && (
            <>
              <span className="breadcrumb-sep">›</span>
              <button className="breadcrumb-item" onClick={() => goToLevel('subsector')}>{activeSector}</button>
            </>
          )}
          {activeSubsector && (
            <>
              <span className="breadcrumb-sep">›</span>
              <span className="breadcrumb-item active">{activeSubsector}</span>
            </>
          )}
          <span className="breadcrumb-hint">
            {level === 'sector'    && '· click sector to drill down'}
            {level === 'subsector' && '· click subsector to drill down'}
            {level === 'stock'     && '· click ticker to view spotlight'}
          </span>
        </div>

        {/* Treemap container — measured by ResizeObserver */}
        <div className="heatmap-treemap" ref={containerRef}>
          {loading && (
            <div className="heatmap-overlay">Loading…</div>
          )}
          {!loading && error && (
            <div className="heatmap-overlay heatmap-error">{error}</div>
          )}
          {!loading && !error && data.length > 0 && dims.width > 0 && dims.height > 0 && (
            <Treemap
              width={dims.width}
              height={dims.height}
              data={data}
              dataKey="value"
              isAnimationActive={false}
              content={(props) => <TreeNode {...props} onClick={handleNodeClick} />}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default HeatmapPage;
