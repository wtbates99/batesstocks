# BATESSTOCKS Frontend

The frontend is a React 18 + TypeScript + Vite terminal client for BATESSTOCKS. It is designed for dense, long-session use on modest hardware and is served by FastAPI in production.

## Frontend Stack

- React 18
- TypeScript
- Vite
- Zustand for terminal and workspace state
- TanStack Query for server state
- `lightweight-charts` for security price charts
- `recharts` for compare and backtest analytics

## Current Routes

- `/` launchpad dashboard
- `/monitor` market monitor
- `/watchlists` watchlist monitor
- `/compare` compare workspace
- `/news` news monitor
- `/sector/:sector` sector drilldown
- `/security/:ticker` security detail
- `/screener` strategy screener
- `/backtest` backtest analytics

## Major Frontend Modules

- `src/components/layout/TerminalShell.tsx`
  Dense application shell, nav strip, status strip, workspace outlet, and AI drawer.

- `src/components/command/CommandBar.tsx`
  Global terminal command input with search fallback, command parsing, and recent command memory.

- `src/components/layout/WorkspaceRail.tsx`
  Persistent rail for watchlists, recents, saved compare sets, saved screens, and saved runs.

- `src/components/charts/TerminalChart.tsx`
  Lightweight security chart with overlay support.

- `src/components/strategy/StrategyWorkbench.tsx`
  Shared strategy rule builder used by screener and backtest.

## State Model

### Zustand

`src/state/terminalStore.ts` persists:
- active ticker
- named watchlists
- active watchlist selection
- recent tickers
- compare set
- saved compare sets
- saved screens
- saved backtests
- recent commands
- last route

### TanStack Query

`src/api/query.ts` handles:
- workspace
- market monitor
- sector drilldown
- security detail
- snapshot tables
- news
- live prices
- search
- sync status
- health endpoints

## API Expectations

The frontend expects the FastAPI backend to expose:
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
- `GET /health/live`
- `GET /health/ready`

## Development

Install:

```bash
npm install
```

Run Vite:

```bash
npm run dev
```

Typecheck:

```bash
npm run typecheck
```

Lint:

```bash
npm run lint
```

Build:

```bash
npm run build
```

Vite serves the app during development. In production, FastAPI serves the built frontend from `frontend/build`.

## Terminal Behavior

Implemented terminal commands include:
- `[TICKER] DES`
- `MON`
- `WL`
- `NEWS`
- `COMP`
- `EQS`
- `PORT`
- `SYNC [TICKER...]`
- `AI [PROMPT]`

Workspace persistence is local and intentionally lightweight so the terminal remains fast and self-contained on a home server.
