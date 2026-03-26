import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes, useNavigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import CompanyPage from './pages/CompanyPage';
import HeatmapPage from './pages/HeatmapPage';
import ScreenerPage from './pages/ScreenerPage';
import WatchlistPage from './pages/WatchlistPage';
import CalendarPage from './pages/CalendarPage';
import MarketPage from './pages/MarketPage';
import BacktestPage from './pages/BacktestPage';
import CommandPalette from './components/CommandPalette';

function KeyboardNav({ onCmdK }) {
  const navigate = useNavigate();
  React.useEffect(() => {
    const handler = (e) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key === 'k') { e.preventDefault(); onCmdK(); return; }
      const pages = ['/', '/heatmap', '/screener', '/market', '/calendar', '/watchlist', '/backtest'];
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < pages.length) { e.preventDefault(); navigate(pages[idx]); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, onCmdK]);
  return null;
}

function App() {
  const [cmdOpen, setCmdOpen] = useState(false);

  const toggleTheme = () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('batesstocks_theme', next);
  };

  return (
    <Router>
      <div className="App">
        <KeyboardNav onCmdK={() => setCmdOpen(o => !o)} />
        <Routes>
          <Route path="/"                  element={<HomePage />}    />
          <Route path="/spotlight/:ticker" element={<CompanyPage />} />
          <Route path="/heatmap"           element={<HeatmapPage />} />
          <Route path="/screener"          element={<ScreenerPage />} />
          <Route path="/watchlist"         element={<WatchlistPage />} />
          <Route path="/calendar"          element={<CalendarPage />} />
          <Route path="/market"            element={<MarketPage />} />
          <Route path="/backtest"          element={<BacktestPage />} />
        </Routes>
        <CommandPalette
          isOpen={cmdOpen}
          onClose={() => setCmdOpen(false)}
          onThemeToggle={toggleTheme}
        />
      </div>
    </Router>
  );
}

export default App;
