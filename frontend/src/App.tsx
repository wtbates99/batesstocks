import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import TerminalShell from './components/layout/TerminalShell'

const BacktestPage = lazy(() => import('./pages/BacktestPage'))
const ComparePage = lazy(() => import('./pages/ComparePage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const MonitorPage = lazy(() => import('./pages/MonitorPage'))
const NewsMonitorPage = lazy(() => import('./pages/NewsMonitorPage'))
const ScreenerPage = lazy(() => import('./pages/ScreenerPage'))
const SectorPage = lazy(() => import('./pages/SectorPage'))
const SecurityPage = lazy(() => import('./pages/SecurityPage'))
const WatchlistsPage = lazy(() => import('./pages/WatchlistsPage'))

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="state-panel loading-state">Loading workspace…</div>}>
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
      </Suspense>
    </BrowserRouter>
  )
}
