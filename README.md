# BatesStocks

A self-hosted stock analysis dashboard with technical indicators, interactive charts, and AI-powered analysis. Built with FastAPI and React.

## Features

- S&P 500 data via Yahoo Finance (5+ years of daily OHLCV)
- 24 technical indicators across trend, momentum, volatility, and volume categories
- Interactive charts with customizable metrics and date ranges
- AI analysis chat (Ollama, Anthropic Claude, OpenAI)
- Bullish stock groupings: momentum, breakout, trend strength
- Auto-initializes on first run — no manual data scripts needed

## Setup

**Prerequisites**: Python 3.11+, Node.js 14+, uv

```bash
# Backend
uv sync

# Frontend
cd frontend
npm install
npm run build
cd ..

# Start — data pulls automatically on first run
uv run python main.py
```

Access at `http://localhost:8000`. On first launch the server fetches all S&P 500 data in the background (~10 min). The UI is usable immediately; charts populate as data arrives.

## Refreshing Data

Trigger a full data refresh from the API — no CLI scripts needed:

```
POST /refresh_data
GET  /refresh_status   # {"running": true/false}
```

Or hit the refresh button in the UI.

## API

| Endpoint | Description |
|---|---|
| `GET /stock/{ticker}` | OHLCV + indicators (supports `start_date`, `end_date`, `page`) |
| `GET /company/{ticker}` | Company info and financials |
| `GET /groupings` | Live bullish stock groupings (momentum / breakout / trend strength) |
| `GET /search?query=` | Ticker and company name autocomplete |
| `POST /ai/chat` | AI technical analysis (Ollama / Anthropic / OpenAI) |
| `POST /refresh_data` | Trigger full data pipeline in background |
| `GET /refresh_status` | Check if pipeline is running |

Interactive docs: `http://localhost:8000/docs`

## Tech Stack

- **Backend**: FastAPI, SQLAlchemy, SQLite, `ta` library
- **Frontend**: React 18, Recharts, Tailwind CSS, Radix UI
- **Data**: yfinance, BeautifulSoup (S&P 500 list from Wikipedia)
- **AI**: Ollama (local), Anthropic Claude, OpenAI
