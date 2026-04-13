# BLOOMBERG Rebuild Plan

Last updated: 2026-04-13

## Objective

Ship a production-grade, Bloomberg-style market terminal that is dense, trustworthy, fast, and repairable.

Working rule:
- prefer data, ranking, and object density over decorative whitespace
- every screen must answer "what matters, why, and what should I do next?"
- every derived number must have an explicit source path and repair path

## Current Baseline

This plan only tracks work that is still open. The following foundation already exists and should be treated as baseline, not backlog:
- DuckDB-backed runtime with FastAPI + React/Vite
- modular query layer under `backend/queries/`
- serving views for latest ticker/security snapshots and sector breadth
- repair/freshness endpoints under `/system/*`
- dense terminal shell and shared UI primitives
- rebuilt dashboard, monitor, sector, security, compare, watchlists, screener, and backtest screens
- local persistence for watchlists, compare sets, screen drafts, and backtest drafts

## Release Standard

The product is not done until all of these are true:
- data is correct enough that bad ranks and impossible values cannot ship silently
- every major screen has a clear primary table, clear secondary context, and clear next action
- sync failures are visible, attributable, and recoverable without manual database surgery
- CI proves lint, type safety, backend tests, frontend build, and browser smoke flows
- Docker image boots cleanly and exposes reliable health/readiness behavior

## Remaining Work

### P0 Data Correctness and Reliability

1. Eliminate unsafe persistence writes.
   Scope:
   - audit every write into persistent DuckDB tables
   - remove remaining positional `INSERT ... SELECT *` patterns
   - require explicit target column lists everywhere
   Acceptance:
   - all persistent writes are schema-order safe
   - a column add/reorder cannot silently corrupt data

2. Split the sync layer into explicit stages.
   Scope:
   - isolate ingestion, indicator transform, cache refresh, and serving invalidation responsibilities
   - make stage boundaries visible in code and telemetry
   Acceptance:
   - one failed stage reports where it failed
   - recompute-only repair can run without pretending to be a full ingestion

3. Implement dependable hourly sync with bounded recompute windows.
   Scope:
   - run incremental OHLCV refresh on a fixed schedule
   - recompute only the lookback range needed for long-horizon indicators
   - prevent duplicate work across overlapping scheduler windows
   Acceptance:
   - regular sync stays fast on the default universe
   - repeated hourly runs do not rewrite the full table unnecessarily

4. Add hard data integrity guards.
   Scope:
   - reject or flag impossible prices, broken ranges, duplicate latest rows, null critical fields, and absurd return/volume values
   - add integrity checks to startup/repair/test paths
   Acceptance:
   - integrity failures are surfaced in API/ops status
   - bad data blocks ranking-derived views from presenting false precision

5. Add real sync telemetry and repair ergonomics.
   Scope:
   - record last run, duration, ticker counts, rows written, stale symbols, and last error by stage
   - expose a compact operator view for "what is broken right now?"
   Acceptance:
   - one glance shows whether data is fresh, stale, partial, or failed
   - repair actions are obvious and verifiable

### P0 Product Coherence

6. Rebuild news ranking around active context.
   Scope:
   - rank stories differently for security, sector, compare set, watchlist, and market-wide routes
   - weight recency, ticker relevance, sector relevance, and route intent
   - explain why a story appears
   Acceptance:
   - security/news route surfaces materially relevant stories first
   - compare/watchlist/news routes do not feel like generic ticker dumps

7. Tighten workflow handoffs between watchlists, compare, screener, and backtest.
   Scope:
   - promote names directly between workspaces
   - preserve context when moving from idea -> screen -> compare -> backtest -> watchlist
   - reduce duplicate input and dead-end pages
   Acceptance:
   - a user can carry a basket or thesis through the stack with one or two actions
   - saved objects feel like a connected workspace, not isolated pages

8. Raise the information density and actionability of each route.
   Scope:
   - keep whitespace subordinate to ranked objects, tables, strip metrics, and state badges
   - remove any panel that does not add new information or an action
   Acceptance:
   - every above-the-fold block contains ranked data, direct context, or an operator action
   - no route has "pretty but empty" space

### P1 Testing and CI

9. Expand Playwright coverage to meaningful route flows.
   Scope:
   - cover dashboard, security, compare, news, watchlists, screener, backtest, and mobile shell behavior
   - assert data rendering, navigation handoffs, saved-object flows, and key recovery states
   Acceptance:
   - browser CI catches broken route wiring and major layout regressions
   - critical user paths have at least one smoke path and one stateful path

10. Add targeted backend tests for ranking and integrity logic.
   Scope:
   - freshness calculations
   - repair endpoints
   - context-aware news ranking
   - invalid-data rejection / guardrails
   Acceptance:
   - ranking bugs and stale-data bugs are reproducible in unit/integration tests

11. Keep CI honest.
   Scope:
   - ensure workflow names match actual checks
   - preserve local/CI parity for lint, format, tests, frontend build, and Docker build
   - avoid "green but weak" jobs
   Acceptance:
   - a green CI run means the app is genuinely shippable, not merely syntactically valid

### P1 Ops and Release Readiness

12. Validate deploy and rollback behavior.
   Scope:
   - document cold start, empty DB bootstrap, stale DB recovery, and rollback expectations
   - verify readiness behavior under empty-data and partial-sync conditions
   Acceptance:
   - operator can recover from a bad deploy or bad data run without guesswork

13. Add alertable operational thresholds.
   Scope:
   - stale universe count
   - failed sync streak
   - repair failure
   - missing latest row coverage
   Acceptance:
   - ops layer can alert before users notice silent degradation

### P2 Additional Features Worth Shipping

14. Add a route-scoped "Why this is on screen" explainer.
   Use cases:
   - why a story ranked high
   - why a ticker is in a screener result
   - why a symbol is flagged in monitor
   Value:
   - builds trust in rankings and derived signals

15. Add analyst presets for saved workspace objects.
   Scope:
   - momentum basket
   - breakdown watch
   - earnings drift
   - sector leadership rotation
   Value:
   - makes the product useful immediately after boot, even before heavy personalization

16. Add compact compare/watchlist annotations.
   Scope:
   - thesis note
   - trigger price
   - risk tag
   - next review date
   Value:
   - turns symbol lists into decision objects

17. Add change journaling for repairs and manual syncs.
   Scope:
   - who triggered it
   - when
   - what tickers were touched
   - what changed materially
   Value:
   - improves trust, debugging, and operator accountability

## Sequencing

Recommended order:
1. Finish P0 data correctness and sync separation.
2. Finish P0 product coherence, especially news/context and workspace handoffs.
3. Add P1 browser/integrity coverage.
4. Close P1 ops/release validation.
5. Ship selected P2 features that improve trust and object usefulness.

## Non-Negotiable Technical Rules

- no positional inserts into persistent tables
- no route-level ranking based on unchecked or partially missing inputs
- no large frontend layout block without a data object, action, or explanation
- no silent sync failure
- no derived metric without a reproducible recompute path
- no CI job that claims more than it actually verifies

## Helpful Implementation Advice

- keep the canonical analytics logic in DuckDB views or explicit query modules, not scattered pandas transforms
- prefer one strong ranked table plus compact strips over many shallow cards
- if a screen needs explanatory prose, make it secondary to the data object it explains
- add small, composable status models instead of growing ad hoc `dict` payloads
- treat saved watchlists, compare sets, screens, and backtests as first-class objects with metadata, not just arrays of tickers
- use browser tests for cross-route workflows; use pytest for ranking logic, scheduler logic, and integrity math

## Done Definition

This rebuild is complete when:
- data freshness, integrity, and repair are operator-visible and trustworthy
- the news system is context-aware and explainable
- watchlists, compare, screener, and backtest form one connected workflow
- browser coverage protects the flagship routes and mobile shell
- deploy, rollback, and sync failure states are documented and verified
- the product feels dense, institutional, fast, and worth paying for
