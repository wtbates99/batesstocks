"""Shared query helpers shared across all domain query modules."""

from __future__ import annotations

from datetime import UTC, datetime

import pandas as pd

from backend.core.duckdb import duckdb_connection
from backend.models import SecurityListItem, TerminalMover


def to_float(value: float | int | None) -> float | None:
    """Coerce a nullable numeric to float, treating pandas NA as None."""
    return None if value is None or pd.isna(value) else float(value)


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def row_to_mover(row: pd.Series) -> TerminalMover:
    return TerminalMover(
        ticker=row["Ticker"],
        name=row.get("FullName"),
        last_price=to_float(row.get("Close")),
        change_pct=to_float(row.get("change_pct")),
        volume=to_float(row.get("Volume")),
        tech_score=to_float(row.get("Ticker_Tech_Score")),
    )


def row_to_security_list_item(row: pd.Series) -> SecurityListItem:
    close = to_float(row.get("Close"))
    sma_200 = to_float(row.get("Ticker_SMA_200"))
    return SecurityListItem(
        ticker=row["Ticker"],
        name=row.get("FullName"),
        sector=row.get("Sector"),
        close=close,
        change_pct=to_float(row.get("change_pct")),
        volume=to_float(row.get("Volume")),
        avg_volume_20d=to_float(row.get("Ticker_Avg_Volume_20D")),
        rsi=to_float(row.get("Ticker_RSI")),
        tech_score=to_float(row.get("Ticker_Tech_Score")),
        return_20d=to_float(row.get("Ticker_Return_20D")),
        return_63d=to_float(row.get("Ticker_Return_63D")),
        return_126d=to_float(row.get("Ticker_Return_126D")),
        return_252d=to_float(row.get("Ticker_Return_252D")),
        market_cap=to_float(row.get("MarketCap")),
        above_sma_200=bool(
            close is not None and sma_200 is not None and float(close) > float(sma_200)
        ),
    )


def load_focus_frame(
    ticker: str, start_date: str | None = None, end_date: str | None = None
) -> pd.DataFrame:
    """Load all ticker_data rows for a single symbol, optionally date-bounded."""
    filters = ["Ticker = ?"]
    params: list[str] = [ticker.upper()]
    if start_date:
        filters.append("Date >= ?")
        params.append(start_date)
    if end_date:
        filters.append("Date <= ?")
        params.append(end_date)

    sql = f"""
        SELECT *
        FROM ticker_data
        WHERE {" AND ".join(filters)}
        ORDER BY Date
    """
    with duckdb_connection(read_only=True) as conn:
        return conn.execute(sql, params).df()


def load_screen_frame(universe: list[str] | None = None) -> pd.DataFrame:
    """Load the two most-recent rows per ticker (for change_pct computation) with info join.

    Kept for callers that need two-row context for external pct_change computation.
    New callers should prefer load_latest_market_frame which uses v_latest_security.
    """
    with duckdb_connection(read_only=True) as conn:
        frame = conn.execute("""
            WITH ranked AS (
                SELECT
                    td.*,
                    ROW_NUMBER() OVER (PARTITION BY td.Ticker ORDER BY td.Date DESC) AS rn
                FROM ticker_data td
            )
            SELECT
                ranked.*,
                si.FullName,
                si.Sector
            FROM ranked
            LEFT JOIN stock_information si ON si.Ticker = ranked.Ticker
            WHERE ranked.rn <= 2
            ORDER BY ranked.Ticker, ranked.Date
        """).df()
    if universe:
        allowed = {ticker.upper() for ticker in universe}
        frame = frame[frame["Ticker"].isin(allowed)].copy()
    return frame


def load_latest_market_frame(universe: list[str] | None = None) -> pd.DataFrame:
    """Latest snapshot per ticker using v_latest_security (pre-computed change_pct, volume_ratio).

    All change_pct and volume_ratio computation happens in DuckDB via the serving view,
    avoiding the two-row scan + Python groupby path used by the legacy load_screen_frame approach.
    """
    universe_filter = ""
    params: list[object] = []
    if universe:
        placeholders = ", ".join(["?"] * len(universe))
        universe_filter = f"WHERE Ticker IN ({placeholders})"
        params = [t.upper() for t in universe]

    sql = f"SELECT * FROM v_latest_security {universe_filter} ORDER BY Ticker"
    with duckdb_connection(read_only=True) as conn:
        return conn.execute(sql, params).df()
