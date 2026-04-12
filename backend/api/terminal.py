from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from backend.core.duckdb import duckdb_connection, ensure_schema
from backend.models import (
    BackupCreateRequest,
    BackupCreateResponse,
    BackupStatus,
    SecurityOverview,
    SyncRequest,
    SyncResponse,
    StrategyBacktestRequest,
    StrategyBacktestResponse,
    StrategyDefinition,
    StrategyScreenResponse,
    TerminalOverview,
)
from backend.services.backup_service import create_backup, list_backups
from backend.services.data_sync_service import sync_market_data
from backend.services.terminal_service import (
    get_security_overview,
    get_terminal_overview,
    run_strategy_backtest,
    screen_strategy,
)

router = APIRouter(tags=["terminal"])


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/terminal/workspace", response_model=TerminalOverview)
def terminal_workspace(ticker: str = Query("SPY", min_length=1, max_length=10)) -> TerminalOverview:
    ensure_schema()
    return get_terminal_overview(ticker)


@router.get("/terminal/security/{ticker}", response_model=SecurityOverview)
def terminal_security(
    ticker: str,
    limit: int = Query(180, ge=30, le=365),
) -> SecurityOverview:
    ensure_schema()
    try:
        return get_security_overview(ticker, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/strategies/backtest", response_model=StrategyBacktestResponse)
def strategy_backtest(request: StrategyBacktestRequest) -> StrategyBacktestResponse:
    ensure_schema()
    try:
        response = run_strategy_backtest(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    with duckdb_connection() as conn:
        conn.execute(
            """
            INSERT INTO strategy_runs (ticker, strategy_name, request_json, summary_json)
            VALUES (?, ?, ?, ?)
            """,
            [
                response.ticker,
                response.strategy_name,
                json.dumps(request.model_dump(mode="json")),
                json.dumps(response.summary.model_dump(mode="json")),
            ],
        )
    return response


@router.post("/strategies/screen", response_model=StrategyScreenResponse)
def strategy_screen(strategy: StrategyDefinition) -> StrategyScreenResponse:
    ensure_schema()
    try:
        matches = screen_strategy(strategy)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StrategyScreenResponse(
        generated_at=_utc_now(),
        strategy_name=strategy.name,
        matches=matches[:50],
    )


@router.get("/system/backups", response_model=BackupStatus)
def backup_status(retention_count: int = Query(7, ge=1, le=90)) -> BackupStatus:
    ensure_schema()
    return list_backups(retention_count=retention_count)


@router.post("/system/backups/create", response_model=BackupCreateResponse)
def backup_create(request: BackupCreateRequest) -> BackupCreateResponse:
    ensure_schema()
    return create_backup(
        compress=request.compress,
        retention_count=request.retention_count,
    )


@router.post("/system/sync", response_model=SyncResponse)
def system_sync(request: SyncRequest) -> SyncResponse:
    ensure_schema()
    try:
        return sync_market_data(request.tickers, years=request.years)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Data sync failed: {exc}") from exc
