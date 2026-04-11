import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AiContextProvider } from './contexts/AiContext'
import TerminalShell from './components/layout/TerminalShell'
import DashboardPage from './pages/DashboardPage'
import CompanyPage from './pages/CompanyPage'
import ScreenerPage from './pages/ScreenerPage'
import BacktestPage from './pages/BacktestPage'
import HeatmapPage from './pages/HeatmapPage'
import MarketPage from './pages/MarketPage'
import CalendarPage from './pages/CalendarPage'
import WatchlistPage from './pages/WatchlistPage'
import PortfolioPage from './pages/PortfolioPage'
import AlertsPage from './pages/AlertsPage'

export default function App() {
  return (
    <BrowserRouter>
      <AiContextProvider>
      <TerminalShell>
        <Routes>
          <Route path="/"                  element={<DashboardPage />}  />
          <Route path="/spotlight/:ticker" element={<CompanyPage />}    />
          <Route path="/screener"          element={<ScreenerPage />}   />
          <Route path="/backtest"          element={<BacktestPage />}   />
          <Route path="/heatmap"           element={<HeatmapPage />}    />
          <Route path="/market"            element={<MarketPage />}     />
          <Route path="/calendar"          element={<CalendarPage />}   />
          <Route path="/watchlist"         element={<WatchlistPage />}  />
          <Route path="/portfolio"         element={<PortfolioPage />}  />
          <Route path="/alerts"            element={<AlertsPage />}     />
          <Route path="*"                  element={<DashboardPage />}  />
        </Routes>
      </TerminalShell>
      </AiContextProvider>
    </BrowserRouter>
  )
}
