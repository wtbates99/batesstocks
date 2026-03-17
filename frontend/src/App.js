import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import CompanyPage from './pages/CompanyPage';
import HeatmapPage from './pages/HeatmapPage';
import ScreenerPage from './pages/ScreenerPage';
import WatchlistPage from './pages/WatchlistPage';

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
        </Routes>
      </div>
    </Router>
  );
}

export default App;
