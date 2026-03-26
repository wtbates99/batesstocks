import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const STATIC_COMMANDS = [
  { id: 'go-home',      label: 'Go to Charts',             icon: '▦',  action: 'nav', path: '/' },
  { id: 'go-screener',  label: 'Go to Screener',            icon: '⊞',  action: 'nav', path: '/screener' },
  { id: 'go-heatmap',   label: 'Go to Heatmap',             icon: '▤',  action: 'nav', path: '/heatmap' },
  { id: 'go-market',    label: 'Go to Market Breadth',      icon: '◈',  action: 'nav', path: '/market' },
  { id: 'go-calendar',  label: 'Go to Earnings Calendar',   icon: '◷',  action: 'nav', path: '/calendar' },
  { id: 'go-backtest',  label: 'Go to Backtester',          icon: '⟳',  action: 'nav', path: '/backtest' },
  { id: 'go-watchlist', label: 'Go to Watchlist',           icon: '♡',  action: 'nav', path: '/watchlist' },
  { id: 'theme',        label: 'Toggle Dark / Light Mode',  icon: '◑',  action: 'theme' },
  { id: 'refresh',      label: 'Trigger Data Refresh',      icon: '↺',  action: 'refresh' },
];

const CommandPalette = ({ isOpen, onClose, onThemeToggle }) => {
  const [query, setQuery]             = useState('');
  const [tickerResults, setTickerResults] = useState([]);
  const [selected, setSelected]       = useState(0);
  const inputRef                      = useRef(null);
  const navigate                      = useNavigate();

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelected(0);
      setTickerResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const q = query.toLowerCase().trim();
    if (q.length >= 1) {
      fetch(`/search?query=${encodeURIComponent(q)}&limit=6`)
        .then(r => r.json())
        .then(d => setTickerResults(Array.isArray(d) ? d : []))
        .catch(() => setTickerResults([]));
    } else {
      setTickerResults([]);
    }
    setSelected(0);
  }, [query]);

  const filteredCommands = STATIC_COMMANDS.filter(c =>
    !query.trim() || c.label.toLowerCase().includes(query.toLowerCase())
  );

  const allItems = [
    ...tickerResults.map(t => ({
      id: `ticker-${t.ticker}`, label: t.name || t.ticker,
      icon: '$', action: 'ticker', ticker: t.ticker, sub: t.ticker,
    })),
    ...filteredCommands,
  ];

  const execute = useCallback((item) => {
    if (!item) return;
    if (item.action === 'nav')     navigate(item.path);
    else if (item.action === 'ticker') navigate(`/spotlight/${item.ticker}`);
    else if (item.action === 'theme')  onThemeToggle?.();
    else if (item.action === 'refresh') fetch('/refresh_data', { method: 'POST' }).catch(() => {});
    onClose();
  }, [navigate, onClose, onThemeToggle]);

  const allItemsRef = useRef(allItems);
  allItemsRef.current = allItems;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape')    { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, allItemsRef.current.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (e.key === 'Enter')     { e.preventDefault(); execute(allItemsRef.current[selected]); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, selected, execute, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-modal" onClick={e => e.stopPropagation()}>
        <div className="cmd-input-wrap">
          <span className="cmd-search-icon">⌘</span>
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder="Search tickers, navigate, run commands…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <span className="cmd-esc">ESC</span>
        </div>
        <div className="cmd-results">
          {allItems.length === 0 && <div className="cmd-empty">No results</div>}
          {allItems.map((item, i) => (
            <div
              key={item.id}
              className={`cmd-result-item ${i === selected ? 'selected' : ''}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => execute(item)}
            >
              <span className="cmd-item-icon">{item.icon}</span>
              <span className="cmd-item-label">{item.label}</span>
              {item.sub && <span className="cmd-item-sub">{item.sub}</span>}
            </div>
          ))}
        </div>
        <div className="cmd-footer">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>ESC close</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
