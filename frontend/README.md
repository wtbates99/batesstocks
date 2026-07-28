# BatesStocks Frontend

This directory contains the React, TypeScript, and Vite frontend for
BatesStocks. It is a dense market-research workspace designed to run against the
FastAPI backend during development and to be served by FastAPI in production.

## Capabilities

- Provides watchlist, monitor, security research, compare, screener, backtest,
  news, and AI-assisted research workflows.
- Persists lightweight workspace state in the browser.
- Uses server state from the FastAPI backend for market data and analytics.
- Builds to static assets for production serving.

## Requirements

- Node.js 20+
- npm
- BatesStocks backend running locally for development data

## Setup

```bash
npm install
```

## Run

```bash
npm run dev
```

The Vite dev server runs separately from FastAPI. Configure the frontend API
base URL through the existing client configuration when the backend is not on
the default local address.

## Build

```bash
npm run build
```

The production Docker image builds the frontend and copies the static output
into the FastAPI runtime image.

## Validation

```bash
npm run typecheck
npm run lint
npm run build
```

## Notes

Screens, commands, and backend handlers change quickly. Keep this README focused
on stable development and build workflows rather than route or endpoint lists.
