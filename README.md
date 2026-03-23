# BatesStocks

A self-hosted stock analysis dashboard with technical indicators, interactive charts, and AI-powered analysis. Built with FastAPI and React.

## Features

- S&P 500 data via Yahoo Finance (5+ years of daily OHLCV)
- 24 technical indicators: trend, momentum, volatility, volume
- Interactive multi-ticker charts with customizable metrics, date ranges, and CSV export
- AI analysis chat with live indicator context — powered by local Ollama (`qwen3.5:cloud`) in production; Ollama/Anthropic/OpenAI available in dev
- Bullish stock groupings: momentum, breakout, trend strength — shown as signal badges on each card
- Real-time OHLC display (Open / High / Low) per card and on the company spotlight page
- Sort chart grid by: default order, top gainers, top losers, or alphabetical
- Toggle grid density: 2, 3, or 4 columns
- Save/load view presets (ticker + metric combinations)
- Dark/light mode with keyboard shortcuts
- Auto-initializes on first run — no manual data scripts needed
- Redis caching with automatic fakeredis fallback
- Rate-limited API endpoints

---

## Quick Start (Docker)

The easiest way to run the app. Requires Docker and Docker Compose.

```bash
git clone https://github.com/wtbates99/batesstocks.git
cd batesstocks
cp .env.example .env        # edit if needed
docker compose up --build
```

Access at `http://localhost:8000`. Redis runs as a sidecar container. The SQLite database is persisted via a volume mount at `./stock_data.db`.

On first launch the server fetches all S&P 500 data in the background (~10 min). The UI is usable immediately; charts populate as data arrives.

### Docker commands

```bash
docker compose up --build       # build and start
docker compose up -d            # run in background
docker compose down             # stop
docker compose logs -f app      # tail app logs
docker compose logs -f redis    # tail redis logs
```

---

## Manual Setup

**Prerequisites**: Python 3.11+, Node.js 20+, [uv](https://github.com/astral-sh/uv)

```bash
# 1. Clone
git clone https://github.com/wtbates99/batesstocks.git
cd batesstocks

# 2. Configure environment
cp .env.example .env
# Edit .env if you want a custom DB path, Redis host, etc.

# 3. Install Python dependencies
uv sync

# 4. Build the frontend
cd frontend
npm install
npm run build
cd ..

# 5. Start the server
uv run python main.py
```

Access at `http://localhost:8000`.

### Frontend dev server

Run the React dev server alongside the backend for hot-reload during frontend development:

```bash
# Terminal 1 — backend
uv run python main.py

# Terminal 2 — frontend dev server (proxies API calls to :8000)
cd frontend
npm start
```

---

## Configuration

All settings are read from a `.env` file in the project root. Copy `.env.example` to get started:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `DB_PATH` | `stock_data.db` | Path to the SQLite database file |
| `REDIS_HOST` | `localhost` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama API base URL |
| `OLLAMA_MODEL` | `qwen3.5:cloud` | Ollama model to use (production always uses this) |
| `ENV` | `development` | Set to `production` to lock AI to ollama and enable IP rate limiting |
| `APP_HOST` | `0.0.0.0` | Uvicorn bind host |
| `APP_PORT` | `8000` | Uvicorn bind port |
| `CORS_ORIGINS` | `http://localhost:8000,...` | Comma-separated allowed CORS origins |

If Redis is unavailable at startup the app automatically falls back to an in-memory fakeredis instance (cache is lost on restart).

---

## API

| Endpoint | Rate limit | Description |
|---|---|---|
| `GET /stock/{ticker}` | 60/min | OHLCV + all indicators. Params: `start_date`, `end_date`, `page`, `page_size` |
| `GET /company/{ticker}` | 30/min | Company info and financials |
| `GET /groupings` | 20/min | Live bullish groupings (momentum / breakout / trend strength) |
| `GET /search?query=&limit=` | 30/min | Ticker and company name autocomplete. `limit` 1–50, default 10 |
| `GET /ai/config` | — | AI configuration (production mode, fixed model) |
| `POST /ai/chat` | 10/min | AI technical analysis. In production: ollama only, 100 requests/IP |
| `POST /refresh_data` | 2/min | Trigger full data pipeline in background |
| `GET /refresh_status` | 20/min | Check pipeline progress |

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

Supported providers: `ollama`, `anthropic`, `openai`. `api_key` is required for Anthropic and OpenAI.

In production (`ENV=production`), the `provider`, `model`, and `api_key` fields are ignored — the backend always uses Ollama with `OLLAMA_MODEL`. A 100-request limit per IP applies.

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `\` | Toggle AI Terminal |
| `/` | Focus search bar |
| `t` | Toggle dark / light mode |
| `g` | Cycle through stock groupings |
| `[` | Step to shorter date range |
| `]` | Step to longer date range |
| `?` | Show keyboard shortcuts help |

---

## Presets

Save any combination of tickers and metrics as a named preset using the **Presets** section in the sidebar. Presets are stored in browser localStorage and survive page reloads.

---

## Data Refresh

Trigger a full data refresh without restarting the server:

```
POST /refresh_data
GET  /refresh_status   → {"running": true, "phase": "full_load", "loaded": 120, "total": 503}
```

The pipeline runs in two phases:
1. **Fast load** — 27 priority tickers (AAPL, MSFT, TSLA, NVDA, etc.) loaded first so the default view is usable immediately
2. **Full load** — remaining ~475 S&P 500 tickers loaded in background

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, SQLAlchemy, SQLite, `databases` (async), `ta` |
| Frontend | React 18, Recharts, Tailwind CSS, Radix UI |
| Caching | Redis (with fakeredis fallback) |
| Rate limiting | SlowAPI |
| Data sources | yfinance, BeautifulSoup (Wikipedia S&P 500 list) |
| AI | Ollama (local), Anthropic Claude, OpenAI |
| Config | python-dotenv |
| Packaging | uv, Docker + Docker Compose |

---

## Running Tests

```bash
uv run pytest
```

Tests cover:
- `tests/test_data_manipulation.py` — indicator calculations (RSI range, SMA correctness, Bollinger band ordering, no infinities, row count)
- `tests/test_signals.py` — SQL signal views: bullish/bearish/neutral detection, Bollinger breakouts, golden cross, volume breakout
- `tests/test_data_pull.py` — data pipeline (table creation, column schema) with mocked yfinance
