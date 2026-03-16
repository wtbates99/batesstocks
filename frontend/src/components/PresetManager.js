import React, { useState, useCallback } from 'react';

const STORAGE_KEY = 'batesstocks_presets';

function loadPresets() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

const PresetManager = ({ selectedTickers, selectedMetrics, onLoad }) => {
  const [presets, setPresets] = useState(loadPresets);
  const [name, setName]       = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const save = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const entry = { name: trimmed, tickers: selectedTickers, metrics: selectedMetrics, createdAt: Date.now() };
    const updated = [...presets.filter((p) => p.name !== trimmed), entry];
    setPresets(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setName('');
  }, [name, presets, selectedTickers, selectedMetrics]);

  const remove = useCallback((presetName) => {
    const updated = presets.filter((p) => p.name !== presetName);
    setPresets(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, [presets]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') save();
  };

  return (
    <div className="preset-manager">
      <div className="preset-manager-header" onClick={() => setCollapsed((c) => !c)}>
        PRESETS
        <span className={`collapse-icon ${collapsed ? 'collapsed' : ''}`}>▼</span>
      </div>
      {!collapsed && (
        <div className="preset-manager-body">
          <div className="preset-save-row">
            <input
              className="preset-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Preset name…"
              maxLength={30}
            />
            <button className="preset-save-btn" onClick={save}>SAVE</button>
          </div>
          <div className="preset-list">
            {presets.length === 0 && (
              <div className="preset-empty">No presets saved</div>
            )}
            {presets.map((p) => (
              <div key={p.name} className="preset-item">
                <span className="preset-item-name" title={`${p.tickers.length} tickers · ${p.metrics.length} metrics`}>
                  {p.name}
                </span>
                <button className="preset-load-btn" onClick={() => onLoad(p.tickers, p.metrics)}>LOAD</button>
                <button className="preset-delete-btn" onClick={() => remove(p.name)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PresetManager;
