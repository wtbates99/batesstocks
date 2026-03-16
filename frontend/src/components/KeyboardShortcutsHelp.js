import React from 'react';

const SHORTCUTS = [
  { key: '\\',    desc: 'Toggle AI Terminal' },
  { key: '/',     desc: 'Focus search' },
  { key: 't',     desc: 'Toggle dark/light mode' },
  { key: 'g',     desc: 'Cycle groupings' },
  { key: '[',     desc: 'Shorter date range' },
  { key: ']',     desc: 'Longer date range' },
  { key: '?',     desc: 'Show this help' },
];

const KeyboardShortcutsHelp = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard Shortcuts</h2>
        <div className="shortcuts-list">
          {SHORTCUTS.map(({ key, desc }) => (
            <div key={key} className="shortcut-row">
              <span className="shortcut-key">{key}</span>
              <span className="shortcut-desc">{desc}</span>
            </div>
          ))}
        </div>
        <button className="shortcuts-close-btn" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
};

export default KeyboardShortcutsHelp;
