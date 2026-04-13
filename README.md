# BATESSTOCKS

BATESSTOCKS is a self-hosted, Bloomberg-style market terminal built for a constrained home-server deployment. The active system is a FastAPI backend backed by DuckDB and `yfinance`, with a React 18 + TypeScript + Vite frontend served by FastAPI in production.

The product is intentionally dense, keyboard-first, and operator-oriented:
- edge-to-edge terminal shell
- market monitor and ranked tables
- named watchlists
- side-by-side compare workspace
- security drilldowns
- sector drilldowns
- news monitor
- strategy screener
- backtest analytics
- integrated AI panel

## Stack

Backend:
- FastAPI
- DuckDB
- Pandas / NumPy
- `yfinance`

Frontend:
- React 18
- TypeScript
- Vite
- Zustand
- TanStack Query
- `lightweight-charts`
- `recharts`

## Product Surface

Routes:
- `/` launchpad dashboard
- `/monitor` market monitor
- `/watchlists` watchlist monitor
- `/compare` compare workspace
- `/news` news monitor
- `/sector/:sector` sector drilldown
- `/security/:ticker` security detail
- `/screener` screener
- `/backtest` backtest analytics

Primary backend endpoints:
- `GET /search`
- `GET|POST /live-prices`
- `POST /ai/chat`
- `GET /news`
- `GET /terminal/workspace`
- `GET /terminal/monitor`
- `GET /terminal/snapshots`
- `GET /terminal/sector/{sector}`
- `GET /terminal/security/{ticker}`
- `POST /strategies/backtest`
- `POST /strategies/screen`
- `POST /system/sync`
- `GET /system/sync/status`
- `GET /system/backups`
- `POST /system/backups/create`
- `GET /health/live`
- `GET /health/ready`

## Runtime Behavior

- DuckDB is the single analytics store.
- SQLite and Redis are not part of the active runtime.
- The app is built for Docker deployment and parent-stack consumption through Watchtower.
- First boot may start with an empty DuckDB.
- If `AUTO_SYNC_ON_START=true`, the backend syncs a default universe automatically on empty boot.
- If a requested ticker is missing, the backend may sync it on demand before returning terminal data.
- `SPY` is the default landing symbol.

Default bootstrap universe:
- `SPY`
- `QQQ`
- `IWM`
- `AAPL`
- `MSFT`
- `NVDA`
- `AMZN`
- `META`
- `GOOGL`
- `TSLA`
- `JPM`
- `XOM`

## Terminal Screens

### Launchpad
Dense dashboard with workspace stats, live pulse modules, watchlist board, recent symbols, ranked movers, and integrated news triage.

### Market Monitor
Broad-market destination with:
- market breadth
- sector matrix
- leaders / laggards
- most active
- volume surge
- RSI extremes
- market-wide news

### Watchlists
Persistent named watchlists with:
- create / rename / delete
- dense monitor table
- sector split
- compare handoff
- watchlist news

### Compare
Research workspace with:
- normalized return chart
- side-by-side snapshot table
- saved compare sets
- compare-linked news

### Security Detail
Single-name destination with:
- quote strip
- interactive chart
- overlay toggles
- signal stack
- return ladder
- related names
- recent bars
- security news
- sector jump-out

### Sector Drilldown
Group-level monitor with:
- sector summary
- sector leaders / laggards
- full member table
- sector-linked news

### Screener
Rule-stack strategy screen with:
- entry and exit stacks
- saved screens
- result summary
- watchlist / compare / backtest handoff

### Backtest
Research workstation with:
- scorecard
- equity curve
- benchmark-relative edge
- executed trades
- current matches
- saved runs
- assumptions summary

## AI Panel

The AI panel is embedded into the terminal rather than standing alone. It supports:
- security analysis
- strategy drafting
- backtest interpretation
- market and sector context questions

Providers supported:
- Ollama
- OpenAI
- Anthropic

If no provider is configured or reachable, the app falls back to a local analyst-style response instead of breaking the terminal flow.

## Docker

Build:

```bash
docker build -t batesstocks:test .
```

Run:

```bash
mkdir -p ./data ./backups

docker run --rm \
  -p 8000:8000 \
  -e DB_PATH=/app/data/stock_data.duckdb \
  -e BACKUP_DIR=/app/backups \
  -e AUTO_SYNC_ON_START=true \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/backups:/app/backups" \
  batesstocks:test
```

Health:

```bash
curl -sf http://127.0.0.1:8000/health/live
curl -sf http://127.0.0.1:8000/health/ready
```

## Environment

Key variables:

| Variable | Default | Purpose |
|---|---|---|
| `DB_PATH` | `stock_data.duckdb` | DuckDB file path |
| `BACKUP_DIR` | `<db dir>/backups` | Backup directory |
| `PORT` | `8000` | Uvicorn port |
| `AUTO_SYNC_ON_START` | `true` | Auto-bootstrap market data on empty boot |
| `DUCKDB_MEMORY_LIMIT` | `2GB` | DuckDB memory cap |
| `DUCKDB_THREADS` | `4` | DuckDB worker threads |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama endpoint |
| `OLLAMA_MODEL` | `llama3.1` | Default Ollama model |
| `OPENAI_API_KEY` | unset | Enables OpenAI chat |
| `OPENAI_MODEL` | `gpt-5-mini` | Default OpenAI model |
| `ANTHROPIC_API_KEY` | unset | Enables Anthropic chat |
| `ANTHROPIC_MODEL` | `claude-3-5-haiku-latest` | Default Anthropic model |
| `AI_PROVIDER` | `ollama` | Default AI provider |
| `CORS_ORIGINS` | local + configured origins | Allowed origins |

## Local Development

Backend:

```bash
uv sync
uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

In production, FastAPI serves the built frontend. In development, run the backend and Vite separately.

## Validation

Backend:

```bash
.venv/bin/ruff check backend main.py tests
.venv/bin/pytest tests/test_terminal_service.py tests/test_runtime.py tests/test_news_service.py --tb=short
```

Frontend:

```bash
cd frontend
npm run lint
npm run typecheck
npm run build
```

Docker:

```bash
docker build -t batesstocks:test .
```

## Deployment Contract

This repo is intended to be consumed by a parent home-server stack that:
- runs the container with Docker Compose
- mounts persistent DuckDB storage
- mounts backup storage
- updates through Watchtower

Recommended parent-stack contract:
- mount `/app/data`
- mount `/app/backups`
- set `DB_PATH=/app/data/stock_data.duckdb`
- set `BACKUP_DIR=/app/backups`
- keep `AUTO_SYNC_ON_START=true` unless sync is handled externally

If the parent stack still references old SQLite files or Redis sidecars from earlier versions of BATESSTOCKS, those references should be removed. They are obsolete in the current runtime.
