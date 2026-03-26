# BatesStocks

A self-hosted Bloomberg-style stock dashboard with technical analysis, fundamental data, live options chains, earnings calendars, market breadth, AI-powered analysis, and more. Built with FastAPI and React.

---

## Features

### Charts & Technical Analysis
- **Multi-ticker dashboard** — 2–4 column chart grid with area, candlestick, or relative-performance (indexed base-100) chart types
- **24+ indicators** — SMA, EMA, VWAP, RSI, MACD, Stochastic, Bollinger Bands, OBV, CMF, Force Index, MFI, TSI, Williams %R, ROC, and more
- **Composite technical score (0–100)** — pre-computed nightly per ticker; shown on chart cards and in the screener
- **Chart pattern detection** — support/resistance pivots, double top/bottom detected nightly
- **Bullish groupings** — momentum, breakout, trend-strength signal badges on each card
- **2 years of daily OHLCV** for all S&P 500 stocks, auto-refreshed nightly at 6:30 PM ET
- **CSV export** on every chart

### Company Spotlight (`/spotlight/:ticker`)
Eight info tabs per stock:

| Tab | Content |
|-----|---------|
| **FINANCIALS** | Market cap, P/E, EPS, beta, dividend yield, revenue, gross profit, FCF |
| **GENERAL** | Exchange, currency, country, quote type |
| **COMPANY** | CEO, employees, address, phone, website |
| **NEWS** | Latest 15 headlines from Yahoo Finance (15-min cache) |
| **OPTIONS** | Full call/put chains — strike, bid/ask, IV%, OI, ITM highlighting; expiry selector |
| **EARNINGS** | EPS estimate vs actual bar chart + surprise % history |
| **PEERS** | All subsector peers ranked by market cap with RSI, tech score, 52W return |
| **PATTERNS** | Detected support/resistance, double top/bottom with confidence scores |

### Market Intelligence
- **Market Breadth (`/market`)** — advancing/declining counts, % above SMA30, 52W new highs/lows, avg RSI, avg tech score, advance-decline bar, sector rotation chart
- **Sector Rotation** — horizontal return chart per GICS sector for 30/90/180/365-day windows
- **Earnings Calendar (`/calendar`)** — upcoming earnings for all S&P 500 grouped by date, with EPS estimate and surprise %
- **Correlation Matrix** — NxN Pearson return heatmap for selected tickers, collapsible on homepage

### Screener (`/screener`)
- Filter by sector, P/E range, market cap, RSI range, 52W return, and chart pattern type
- Sort by any column including composite tech score
- Click any row to open the company spotlight

### Heatmap (`/heatmap`)
- Drill-down treemap: Sector → Subsector → Individual Stock
- Sector Rotation tab with selectable time window

### Watchlist & Portfolio (`/watchlist`)
- **Watchlists** — create/edit named ticker lists; load any list into the chart dashboard
- **Portfolio** — track positions with cost basis, unrealized P&L, and a value-over-time chart
- **Alerts** — set price or indicator thresholds (above/below); evaluated nightly with triggered state

### AI Analysis
- Chat terminal powered by local **Ollama** (`qwen3.5:cloud`) in production
- Dev mode supports **Anthropic Claude** (if `ANTHROPIC_API_KEY` set) or **OpenAI**
- Pre-built quick prompts: bullish analysis, breakout detection, trend summary
- Full indicator context passed automatically (RSI, MACD, Bollinger, price levels)

### UX
- Dark/light mode, keyboard shortcuts, collapsible sidebar
- Save/load view presets (ticker + metric combinations) in localStorage
- Responsive chart heights

---

## Quick Start (Docker)

```bash
git clone https://github.com/wtbates99/batesstocks.git
cd batesstocks
cp .env.example .env   # edit as needed
docker compose up --build
```

Access at `http://localhost:8000`. Redis runs as a sidecar. SQLite is persisted at `./stock_data.db`.

On first launch the server fetches 2 years of S&P 500 data in two phases (~10 min total). The UI is usable immediately — charts populate as data arrives.

```bash
docker compose up -d         # run in background
docker compose down          # stop
docker compose logs -f app   # tail app logs
```

---

## Manual Setup

**Prerequisites**: Python 3.11+, Node.js 20+, [uv](https://github.com/astral-sh/uv)

```bash
git clone https://github.com/wtbates99/batesstocks.git
cd batesstocks
cp .env.example .env

uv sync               # install Python deps

cd frontend
npm install
npm run build
cd ..

uv run python main.py   # starts at http://localhost:8000
```

### Frontend dev server (hot reload)

```bash
# Terminal 1
uv run python main.py

# Terminal 2
cd frontend && npm start   # proxies API calls to :8000
```

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `DB_PATH` | `stock_data.db` | SQLite database path |
| `REDIS_HOST` | `localhost` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama API base URL |
| `OLLAMA_MODEL` | `qwen3.5:cloud` | Model used in production |
| `ANTHROPIC_API_KEY` | — | Enables Claude in dev mode |
| `ENV` | `development` | Set `production` to lock AI to Ollama + enable IP rate limiting |
| `APP_HOST` | `0.0.0.0` | Uvicorn bind host |
| `APP_PORT` | `8000` | Uvicorn bind port |
| `CORS_ORIGINS` | `http://localhost:8000,...` | Comma-separated allowed origins |

Redis unavailability is handled automatically — the app falls back to in-memory fakeredis.

---

## Data Refresh

Data refreshes automatically every day at **18:30 US/Eastern** (after market close). The scheduler fetches only new rows since the last stored date, recomputes all indicators, detects chart patterns, evaluates alerts, and flushes the Redis cache.

Manual trigger (no restart required):

```
POST /refresh_data
GET  /refresh_status   → {"running": true, "phase": "full_load", "loaded": 120, "total": 503}
```

Two-phase pipeline:
1. **Fast load** — 27 priority tickers (AAPL, MSFT, TSLA, NVDA …) loaded first so the default view works immediately
2. **Full load** — remaining ~475 S&P 500 tickers in the background

---

## API Reference

### Stock Data
| Endpoint | Rate limit | Description |
|---|---|---|
| `GET /stock/{ticker}` | 60/min | OHLCV + all 24+ indicators. Params: `start_date`, `end_date` |
| `GET /company/{ticker}` | 30/min | Fundamentals and company info |
| `GET /news/{ticker}` | 20/min | Latest headlines (15-min cache) |
| `GET /options/{ticker}` | 10/min | Options chain. Param: `expiry` (YYYY-MM-DD) |
| `GET /earnings/{ticker}` | 20/min | EPS estimate vs actual history |
| `GET /peers/{ticker}` | 20/min | Subsector peers ranked by market cap |
| `GET /patterns/{ticker}` | 20/min | Detected chart patterns. Param: `days` |

### Market & Screening
| Endpoint | Rate limit | Description |
|---|---|---|
| `GET /screener` | 20/min | All S&P 500 with RSI, P/E, market cap, tech score, 52W return |
| `GET /heatmap` | 20/min | Treemap data. Param: `level` (sector/subsector/stock) |
| `GET /groupings` | 20/min | Live bullish groupings (momentum / breakout / trend strength) |
| `GET /market-breadth` | 20/min | Advancing/declining, 52W highs/lows, SMA stats |
| `GET /sector-rotation` | 10/min | Sector returns. Param: `days` (30–730) |
| `GET /correlations` | 10/min | Pearson correlation matrix. Params: `tickers[]`, `days` |
| `GET /earnings` | 5/min | Upcoming earnings calendar. Param: `days_ahead` |
| `GET /patterns` | 10/min | Recent patterns across all tickers. Params: `pattern_type`, `days` |

### Portfolio & User Data
| Endpoint | Description |
|---|---|
| `GET /portfolios` | List portfolios |
| `POST /portfolios` | Create portfolio |
| `GET /portfolios/{id}` | Portfolio with positions and P&L |
| `POST /portfolios/{id}/positions` | Add position |
| `PUT /portfolios/{id}/positions/{pid}` | Edit position |
| `DELETE /portfolios/{id}/positions/{pid}` | Delete position |
| `GET /watchlists` | List watchlists |
| `POST /watchlists` | Create watchlist |
| `PUT /watchlists/{id}` | Update watchlist |
| `DELETE /watchlists/{id}` | Delete watchlist |
| `GET /alerts` | List alerts |
| `POST /alerts` | Create alert |
| `DELETE /alerts/{id}` | Delete alert |

### Search & AI
| Endpoint | Rate limit | Description |
|---|---|---|
| `GET /search?query=` | 30/min | Ticker and company name autocomplete |
| `POST /ai/chat` | 10/min | AI analysis with indicator context |
| `POST /refresh_data` | 2/min | Trigger full pipeline |
| `GET /refresh_status` | 20/min | Pipeline progress |

Interactive docs: `http://localhost:8000/docs`

### AI chat request body

```json
{
  "provider": "ollama",
  "model": "qwen3:8b",
  "api_key": null,
  "message": "Which stocks show the strongest momentum?",
  "context": {
    "tickers": ["AAPL", "MSFT"],
    "dateRange": "30 days",
    "metrics": ["Ticker_RSI", "Ticker_MACD"],
    "dataSummary": "..."
  }
}
```

Supported providers: `ollama`, `anthropic`, `openai`. In production (`ENV=production`) the provider is always Ollama and a 100-request/IP daily limit applies.

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `\` | Toggle AI terminal |
| `/` | Focus search bar |
| `t` | Toggle dark / light mode |
| `g` | Cycle stock groupings |
| `[` | Shorter date range |
| `]` | Longer date range |
| `?` | Show shortcuts help |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, SQLAlchemy, SQLite, `databases` (async) |
| Indicators | `ta` library (24+ technical indicators) |
| Frontend | React 18, Recharts, Tailwind CSS |
| Caching | Redis (fakeredis fallback) |
| Rate limiting | SlowAPI |
| Scheduling | APScheduler (daily 18:30 ET refresh) |
| Data | yfinance, BeautifulSoup (Wikipedia S&P 500) |
| AI | Ollama, Anthropic Claude, OpenAI |
| Packaging | uv, Docker + Docker Compose |

---

## Tests

```bash
uv run pytest
```

- `tests/test_data_manipulation.py` — indicator math (RSI range, SMA correctness, Bollinger band ordering, no infinities)
- `tests/test_signals.py` — SQL signal views: bullish/bearish detection, Bollinger breakouts, golden cross, volume breakout
- `tests/test_data_pull.py` — pipeline table creation and column schema with mocked yfinance
