import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import CompanyPage from './pages/CompanyPage';
import HeatmapPage from './pages/HeatmapPage';
import ScreenerPage from './pages/ScreenerPage';
import WatchlistPage from './pages/WatchlistPage';
import CalendarPage from './pages/CalendarPage';
import MarketPage from './pages/MarketPage';

function App() {
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
        </Routes>
      </div>
    </Router>
  );
}

export default App;
