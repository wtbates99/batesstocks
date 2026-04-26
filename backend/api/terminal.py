from __future__ import annotations

import json
from datetime import UTC, datetime

import pandas as pd
import yfinance as yf
from fastapi import APIRouter, HTTPException, Query

from backend.core.duckdb import duckdb_connection, ensure_schema
from backend.models import (
    BackupCreateRequest,
    BackupCreateResponse,
    BackupStatus,
    EarningsResponse,
    Fundamentals,
    IntradayBar,
    IntradayResponse,
    MarketMonitorOverview,
    NewsResponse,
    SectorOverview,
    SecurityOverview,
    SecuritySnapshotResponse,
    StrategyBacktestRequest,
    StrategyBacktestResponse,
    StrategyDefinition,
    StrategyScreenResponse,
    SyncRequest,
    SyncResponse,
    SyncStatus,
    TerminalOverview,
)
from backend.services.backup_service import create_backup, list_backups
from backend.services.data_sync_service import (
    ensure_default_universe_data,
    ensure_market_data,
    sync_market_data,
)
from backend.services.earnings_service import get_earnings
from backend.services.news_service import get_news
from backend.services.quote_cache import fundamentals_cache, intraday_cache
from backend.services.sync_status import sync_status_tracker
from backend.services.terminal_service import (
    get_market_monitor,
    get_sector_overview,
    get_security_overview,
    get_terminal_overview,
    get_terminal_snapshots,
    run_strategy_backtest,
    screen_strategy,
)

router = APIRouter(tags=["terminal"])


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


@router.get("/terminal/workspace", response_model=TerminalOverview)
def terminal_workspace(ticker: str = Query("SPY", min_length=1, max_length=10)) -> TerminalOverview:
    ensure_schema()
    ensure_default_universe_data()
    ensure_market_data([ticker], source="workspace")
    return get_terminal_overview(ticker)


@router.get("/terminal/security/{ticker}", response_model=SecurityOverview)
def terminal_security(
    ticker: str,
    limit: int = Query(260, ge=30, le=1000),
) -> SecurityOverview:
    ensure_schema()
    ensure_market_data([ticker], source="security")
    try:
        return get_security_overview(ticker, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _fetch_intraday(symbol: str, interval: str, period: str) -> IntradayResponse:
    try:
        frame = yf.download(
            tickers=symbol,
            period=period,
            interval=interval,
            auto_adjust=True,
            progress=False,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Intraday fetch failed: {exc}") from exc

    if frame is None or frame.empty:
        raise HTTPException(status_code=404, detail=f"No intraday data for {symbol}")

    # yfinance returns MultiIndex columns (Ticker, Price) — flatten before iterating
    if isinstance(frame.columns, pd.MultiIndex):
        frame.columns = frame.columns.get_level_values(1)

    bars: list[IntradayBar] = []
    for ts, row in frame.iterrows():
        bars.append(
            IntradayBar(
                time=int(ts.timestamp()),
                open=float(row["Open"]),
                high=float(row["High"]),
                low=float(row["Low"]),
                close=float(row["Close"]),
                volume=float(row["Volume"]),
            )
        )
    return IntradayResponse(ticker=symbol, interval=interval, period=period, bars=bars)


@router.get("/terminal/security/{ticker}/intraday", response_model=IntradayResponse)
def terminal_security_intraday(
    ticker: str,
    interval: str = Query("5m", pattern="^(1m|5m|15m|30m|1h)$"),
    period: str = Query("1d", pattern="^(1d|5d|1mo)$"),
) -> IntradayResponse:
    symbol = ticker.strip().upper()
    return intraday_cache.get_or_compute(
        (symbol, interval, period),
        lambda: _fetch_intraday(symbol, interval, period),
    )


def _fetch_fundamentals(symbol: str) -> Fundamentals:
    try:
        info = yf.Ticker(symbol).info
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Fundamentals fetch failed: {exc}") from exc

    def _f(key: str) -> float | None:
        v = info.get(key)
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    return Fundamentals(
        ticker=symbol,
        generated_at=datetime.now(UTC).isoformat(),
        pe_ratio=_f("trailingPE"),
        forward_pe=_f("forwardPE"),
        peg_ratio=_f("pegRatio"),
        ev_ebitda=_f("enterpriseToEbitda"),
        price_to_book=_f("priceToBook"),
        price_to_sales=_f("priceToSalesTrailing12Months"),
        enterprise_value=_f("enterpriseValue"),
        gross_margin=_f("grossMargins"),
        operating_margin=_f("operatingMargins"),
        profit_margin=_f("profitMargins"),
        roe=_f("returnOnEquity"),
        roa=_f("returnOnAssets"),
        eps_ttm=_f("trailingEps"),
        eps_forward=_f("forwardEps"),
        revenue_per_share=_f("revenuePerShare"),
        book_value=_f("bookValue"),
        revenue_growth=_f("revenueGrowth"),
        earnings_growth=_f("earningsGrowth"),
        total_cash=_f("totalCash"),
        total_debt=_f("totalDebt"),
        debt_to_equity=_f("debtToEquity"),
        current_ratio=_f("currentRatio"),
        free_cash_flow=_f("freeCashflow"),
        dividend_yield=_f("dividendYield"),
        payout_ratio=_f("payoutRatio"),
        beta=_f("beta"),
        shares_outstanding=_f("sharesOutstanding"),
        short_ratio=_f("shortRatio"),
        total_revenue=_f("totalRevenue"),
        ebitda=_f("ebitda"),
    )


@router.get("/terminal/security/{ticker}/fundamentals", response_model=Fundamentals)
def terminal_security_fundamentals(ticker: str) -> Fundamentals:
    symbol = ticker.strip().upper()
    return fundamentals_cache.get_or_compute(symbol, lambda: _fetch_fundamentals(symbol))


@router.get("/terminal/snapshots", response_model=SecuritySnapshotResponse)
def terminal_snapshots(
    tickers: str = Query(..., min_length=1, max_length=512),
) -> SecuritySnapshotResponse:
    ensure_schema()
    symbols = [value.strip().upper() for value in tickers.split(",") if value.strip()]
    ensure_market_data(symbols, source="snapshots")
    return get_terminal_snapshots(symbols)


@router.get("/terminal/monitor", response_model=MarketMonitorOverview)
def terminal_monitor() -> MarketMonitorOverview:
    ensure_schema()
    ensure_default_universe_data()
    return get_market_monitor()


@router.get("/terminal/sector/{sector}", response_model=SectorOverview)
def terminal_sector(sector: str) -> SectorOverview:
    ensure_schema()
    ensure_default_universe_data()
    try:
        return get_sector_overview(sector)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/strategies/backtest", response_model=StrategyBacktestResponse)
def strategy_backtest(request: StrategyBacktestRequest) -> StrategyBacktestResponse:
    ensure_schema()
    ensure_default_universe_data()
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
    ensure_default_universe_data()
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


@router.get("/system/sync/status", response_model=SyncStatus)
def system_sync_status() -> SyncStatus:
    snapshot = sync_status_tracker.get()
    return SyncStatus(**snapshot.__dict__)


@router.post("/system/sync", response_model=SyncResponse)
def system_sync(request: SyncRequest) -> SyncResponse:
    ensure_schema()
    try:
        return sync_market_data(request.tickers, years=request.years, source="manual")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Data sync failed: {exc}") from exc


@router.get("/api/earnings", response_model=EarningsResponse)
def terminal_earnings(
    tickers: str = Query("", max_length=512),
) -> EarningsResponse:
    ticker_list = [v.strip().upper() for v in tickers.split(",") if v.strip()]
    return get_earnings(ticker_list)


@router.get("/api/news", response_model=NewsResponse)
def terminal_news(
    tickers: str = Query("", max_length=256),
    scope: str = Query("terminal", min_length=1, max_length=32),
    limit: int = Query(12, ge=1, le=40),
) -> NewsResponse:
    ensure_schema()
    ticker_list = [value.strip().upper() for value in tickers.split(",") if value.strip()]
    return get_news(scope=scope, tickers=ticker_list, limit=limit)


@router.get("/system/freshness")
def system_freshness() -> dict[str, object]:
    """Return data freshness summary: latest date per ticker, stale count, total count."""
    ensure_schema()
    with duckdb_connection(read_only=True) as conn:
        row = conn.execute("""
            SELECT
                MAX(Date)::TEXT AS latest_date,
                MIN(Date)::TEXT AS oldest_date,
                COUNT(DISTINCT Ticker) AS ticker_count,
                COUNTIF(Date < CURRENT_DATE - INTERVAL '3 days') AS stale_count
            FROM v_latest_ticker
        """).fetchone()
        stale_rows = conn.execute("""
            SELECT Ticker, Date::TEXT AS latest
            FROM v_latest_ticker
            WHERE Date < CURRENT_DATE - INTERVAL '3 days'
            ORDER BY Date ASC
            LIMIT 50
        """).fetchall()
    if row is None:
        return {
            "generated_at": _utc_now(),
            "latest_date": None,
            "oldest_date": None,
            "ticker_count": 0,
            "stale_count": 0,
            "stale_tickers": [],
        }
    latest_date, oldest_date, ticker_count, stale_count = row
    return {
        "generated_at": _utc_now(),
        "latest_date": latest_date,
        "oldest_date": oldest_date,
        "ticker_count": int(ticker_count or 0),
        "stale_count": int(stale_count or 0),
        "stale_tickers": [{"ticker": r[0], "latest": r[1]} for r in stale_rows],
    }


@router.post("/system/rebuild/indicators")
def system_rebuild_indicators(
    tickers: str = Query(
        "", max_length=1024, description="Comma-separated tickers; empty = full universe"
    ),
) -> dict[str, object]:
    """Trigger an indicator-only re-sync from existing raw OHLCV data.

    This is a repair path — it re-fetches and rewrites ticker_data rows for
    the specified tickers (or the full default universe if none are given).
    Does not require external network for already-ingested tickers.
    """
    ensure_schema()
    ticker_list = [v.strip().upper() for v in tickers.split(",") if v.strip()] or None
    try:
        result = sync_market_data(ticker_list, years=2, source="repair")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Indicator rebuild failed: {exc}") from exc
    return {
        "generated_at": _utc_now(),
        "tickers_rebuilt": result.tickers,
        "rows_written": result.rows_written,
        "finished_at": result.finished_at,
    }


@router.post("/system/rebuild/security/{ticker}")
def system_rebuild_security(ticker: str) -> dict[str, object]:
    """Repair a single ticker's data — re-syncs and recomputes indicators."""
    ensure_schema()
    symbol = ticker.strip().upper()
    try:
        result = sync_market_data([symbol], years=2, source="repair_single")
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Single-ticker rebuild failed for {symbol}: {exc}"
        ) from exc
    return {
        "generated_at": _utc_now(),
        "ticker": symbol,
        "rows_written": result.rows_written,
        "finished_at": result.finished_at,
    }
