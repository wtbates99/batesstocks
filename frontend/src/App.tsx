import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import TerminalShell from './components/layout/TerminalShell'
import BacktestPage from './pages/BacktestPage'
import DashboardPage from './pages/DashboardPage'
import ScreenerPage from './pages/ScreenerPage'
import SecurityPage from './pages/SecurityPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<TerminalShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/security/:ticker" element={<SecurityPage />} />
          <Route path="/screener" element={<ScreenerPage />} />
          <Route path="/backtest" element={<BacktestPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
