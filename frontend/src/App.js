import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import CompanyPage from './pages/CompanyPage';
import HeatmapPage from './pages/HeatmapPage';
import ScreenerPage from './pages/ScreenerPage';
import WatchlistPage from './pages/WatchlistPage';
import CalendarPage from './pages/CalendarPage';
import MarketPage from './pages/MarketPage';
import BacktestPage from './pages/BacktestPage';
import CommandPalette from './components/CommandPalette';

function App() {
  const [cmdOpen, setCmdOpen] = useState(false);

  const toggleTheme = () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('batesstocks_theme', next);
  };

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(o => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <Router>
      <div className="App">
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
