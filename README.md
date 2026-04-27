# BatesStocks

BatesStocks is a self-hosted market analytics terminal for watchlists, market
monitoring, technical analysis, screening, backtesting, news review, and
AI-assisted research. The backend is a FastAPI service backed by DuckDB, and the
frontend is a dense React workspace designed for long research sessions on a
home-server deployment.

Live demo: [stocks.palanbates.com](https://stocks.palanbates.com)

The demo is not a brokerage product, investment service, or source of financial
advice. Run your own instance if you want persistent data or private research
state.

## Capabilities

- Pulls market data from `yfinance` into a local DuckDB analytics file.
- Builds dashboards for quotes, movers, breadth, sectors, watchlists, and recent
  snapshots.
- Provides security-level research views with charts, overlays, signals, recent
  bars, news, and related names.
- Supports strategy screening and backtest workflows with saved local state.
- Includes an AI analyst panel that can use Ollama, OpenAI, or Anthropic when
  configured.
- Creates database backups and can bootstrap data on an empty startup.

## Run with Docker

```bash
git clone https://github.com/wtbates99/batesstocks.git
cd batesstocks
mkdir -p data backups
docker build -t batesstocks:local .
```

```bash
docker run --rm \
  -p 8000:8000 \
  -e DB_PATH=/app/data/stock_data.duckdb \
  -e BACKUP_DIR=/app/backups \
  -e AUTO_SYNC_ON_START=true \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/backups:/app/backups" \
  batesstocks:local
```

Open [http://localhost:8000](http://localhost:8000).

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

In development, run FastAPI and Vite separately. In production, FastAPI serves
the built frontend.

## Configuration

Common environment variables:

| Variable | Purpose |
| --- | --- |
| `DB_PATH` | DuckDB database path |
| `BACKUP_DIR` | Backup directory |
| `PORT` | Uvicorn port |
| `AUTO_SYNC_ON_START` | Bootstrap market data on empty startup |
| `DUCKDB_MEMORY_LIMIT` | DuckDB memory cap |
| `DUCKDB_THREADS` | DuckDB worker threads |
| `AI_PROVIDER` | Default AI provider |
| `AI_CHAT_TOKEN` | Required token for server-side AI chat unless public AI is explicitly allowed |
| `ALLOW_PUBLIC_SERVER_AI` | Local/demo opt-in for unauthenticated server-side AI chat |
| `OLLAMA_HOST` | Ollama-compatible endpoint |
| `OLLAMA_MODEL` | Ollama model name |
| `OPENAI_API_KEY` | Enables OpenAI chat |
| `ANTHROPIC_API_KEY` | Enables Anthropic chat |
| `CORS_ORIGINS` | Allowed browser origins |
| `SYSTEM_ADMIN_TOKEN` | Required token for system mutation endpoints |
| `ALLOW_UNAUTHENTICATED_SYSTEM_MUTATIONS` | Local-only opt-in for unauthenticated system mutations |

## Validation

Backend:

```bash
uv run ruff check backend main.py tests
uv run pytest
```

Frontend:

```bash
cd frontend
npm run typecheck
npm run build
```

Docker:

```bash
docker build -t batesstocks:local .
```

## Notes

The product surface is actively changing. This README intentionally avoids
route lists, endpoint inventories, and implementation maps that drift faster
than the core setup and operating model.
