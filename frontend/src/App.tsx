import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AiContextProvider } from './contexts/AiContext'
import TerminalShell from './components/layout/TerminalShell'
import DashboardPage from './pages/DashboardPage'
import SecurityPage from './pages/SecurityPage'
import ScreenerPage from './pages/ScreenerPage'
import BacktestPage from './pages/BacktestPage'

export default function App() {
  return (
    <BrowserRouter>
      <AiContextProvider>
      <TerminalShell>
        <Routes>
          <Route path="/"                  element={<DashboardPage />}  />
          <Route path="/security/:ticker"  element={<SecurityPage />}   />
          <Route path="/screener"          element={<ScreenerPage />}   />
          <Route path="/backtest"          element={<BacktestPage />}   />
          <Route path="*"                  element={<DashboardPage />}  />
        </Routes>
      </TerminalShell>
      </AiContextProvider>
    </BrowserRouter>
  )
}
