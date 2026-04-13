import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import TerminalShell from './components/layout/TerminalShell'
import BacktestPage from './pages/BacktestPage'
import DashboardPage from './pages/DashboardPage'
import ComparePage from './pages/ComparePage'
import MonitorPage from './pages/MonitorPage'
import NewsMonitorPage from './pages/NewsMonitorPage'
import ScreenerPage from './pages/ScreenerPage'
import SectorPage from './pages/SectorPage'
import SecurityPage from './pages/SecurityPage'
import WatchlistsPage from './pages/WatchlistsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<TerminalShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/monitor" element={<MonitorPage />} />
          <Route path="/watchlists" element={<WatchlistsPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/news" element={<NewsMonitorPage />} />
          <Route path="/sector/:sector" element={<SectorPage />} />
          <Route path="/security/:ticker" element={<SecurityPage />} />
          <Route path="/screener" element={<ScreenerPage />} />
          <Route path="/backtest" element={<BacktestPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
