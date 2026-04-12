# BATESSTOCKS

BATESSTOCKS is a self-hosted Bloomberg-style terminal built for a constrained home-server deployment. The current runtime is a full replacement of the old app: FastAPI on the backend, DuckDB as the analytics engine, and a Vite + React + TypeScript frontend.

The active product surface is a dense terminal workflow with:
- Dashboard workspace
- Security monitor
- Strategy screener
- Strategy backtesting
- Integrated AI panel

The app is designed to ship as a Docker image and be pulled by a parent home-server stack via Watchtower.

## Current Runtime

Backend:
- FastAPI
- DuckDB
- Pandas / NumPy for sync and indicator computation
- `yfinance` for free market data

Frontend:
- React 18
- TypeScript
- Vite
- `lightweight-charts` + `recharts`

Current routes:
- `/` dashboard
- `/security/:ticker`
- `/screener`
- `/backtest`

Current API surface:
- `GET /search`
- `GET|POST /live-prices`
- `POST /ai/chat`
- `GET /terminal/workspace`
- `GET /terminal/security/{ticker}`
- `POST /strategies/backtest`
- `POST /strategies/screen`
- `POST /system/sync`
- `GET /system/backups`
- `POST /system/backups/create`
- `GET /health/live`
- `GET /health/ready`

## First-Boot Data Behavior

This app no longer assumes a pre-populated database.

On startup, if DuckDB is empty and `AUTO_SYNC_ON_START=true`, BATESSTOCKS pulls a default market universe and computes the local analytics tables automatically.

Default universe:
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

If a requested ticker is missing, the API will attempt to sync that symbol before returning terminal data. `SPY` is the intended default landing symbol.

## Docker

The repo ships with a multi-stage Docker build:
- frontend built in Node
- backend/runtime in Python 3.11
- non-root app user
- built-in healthcheck

Build locally:

```bash
docker build -t batesstocks:test .
```

Run locally:

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

Health checks:

```bash
curl -sf http://127.0.0.1:8000/health/live
curl -sf http://127.0.0.1:8000/health/ready
```

## Docker Compose

The local compose file mounts:
- DuckDB data file
- backup directory

Start:

```bash
docker compose up --build
```

Stop:

```bash
docker compose down
```

Important environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `DB_PATH` | `stock_data.duckdb` | DuckDB file path |
| `BACKUP_DIR` | `<db dir>/backups` | Snapshot backup directory |
| `PORT` | `8000` | Uvicorn port |
| `AUTO_SYNC_ON_START` | `true` | Pull default market data when DB is empty |
| `DUCKDB_MEMORY_LIMIT` | `2GB` | Per-process DuckDB memory cap |
| `DUCKDB_THREADS` | `4` | DuckDB execution threads |
| `OLLAMA_HOST` | `http://localhost:11434` | Local Ollama endpoint |
| `OLLAMA_MODEL` | `llama3.1` | Default Ollama model |
| `OPENAI_API_KEY` | unset | Enables OpenAI chat provider |
| `OPENAI_MODEL` | `gpt-5-mini` | Default OpenAI model |
| `ANTHROPIC_API_KEY` | unset | Enables Anthropic chat provider |
| `ANTHROPIC_MODEL` | `claude-3-5-haiku-latest` | Default Anthropic model |
| `AI_PROVIDER` | `ollama` | Default AI provider |
| `CORS_ORIGINS` | local + prod defaults | Allowed origins |

## Manual Development

Backend setup:

```bash
uv sync
```

Frontend setup:

```bash
cd frontend
npm install
```

Run frontend dev server:

```bash
cd frontend
npm run dev
```

Run backend:

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

The production app serves the built frontend from FastAPI. In development, run Vite separately.

## Data Model

DuckDB is the primary local analytics store.

Current core tables:
- `ohlcv_daily`
- `ticker_data`
- `stock_information`
- `strategy_runs`
- `backup_runs`

Current computed fields include:
- SMA / EMA
- RSI
- MACD
- Bollinger position
- MFI
- VWAP
- terminal tech score

## Backups

Backups are implemented for deployment and operations, but they are not meant to be a primary user-facing terminal feature.

Current backup behavior:
- checkpoint before copy
- copy DuckDB snapshot safely
- optional gzip compression
- retention pruning
- restore-open validation

Endpoints:
- `GET /system/backups`
- `POST /system/backups/create`

## AI Panel

The integrated AI panel is terminal-facing and supports:
- market questions
- strategy drafting help
- backtest interpretation
- security context analysis

Providers supported:
- Ollama
- OpenAI
- Anthropic

If no provider is reachable or configured, the app returns a fallback analyst response instead of failing the UI.

## Validation

Useful checks:

```bash
.venv/bin/ruff check .
.venv/bin/pytest --tb=short -v
cd frontend && npm run lint
cd frontend && npm run build
docker build -t batesstocks:test .
```

## Deployment Notes

This repo is intended to be consumed by a parent home-server repo that:
- runs the container through Docker Compose
- mounts persistent DuckDB storage
- pulls new images through Watchtower

Recommended parent-stack contract:
- mount `/app/data`
- mount `/app/backups`
- set `DB_PATH=/app/data/stock_data.duckdb`
- set `BACKUP_DIR=/app/backups`
- keep `AUTO_SYNC_ON_START=true` unless you have an external sync workflow

If the parent stack still references old SQLite files or Redis sidecars from the removed app, those references should be deleted there. They are not part of the active BATESSTOCKS runtime.
