"""Market monitor and sector overview queries."""

from __future__ import annotations

import pandas as pd

from backend.core.duckdb import duckdb_connection
from backend.models import (
    MarketMonitorOverview,
    MonitorSector,
    SectorOverview,
    TerminalStat,
)
from backend.queries.common import (
    load_latest_market_frame,
    row_to_security_list_item,
    to_float,
    utc_now,
)


def get_market_monitor(universe: list[str] | None = None) -> MarketMonitorOverview:
    latest = load_latest_market_frame(universe)
    if latest.empty:
        raise ValueError("No market data available for terminal monitor")

    universe_size = len(latest)
    advancers = int((latest["change_pct"] > 0).sum())
    decliners = int((latest["change_pct"] < 0).sum())
    avg_rsi = latest["Ticker_RSI"].dropna().mean()
    pct_above_200 = (
        ((latest["Close"] > latest["Ticker_SMA_200"]).fillna(False).mean()) * 100
        if not latest.empty
        else 0.0
    )

    breadth = [
        TerminalStat(label="Advancers", value=str(advancers), tone="positive"),
        TerminalStat(label="Decliners", value=str(decliners), tone="negative"),
        TerminalStat(
            label="Net Breadth",
            value=f"{advancers - decliners:+d}",
            tone="positive" if advancers >= decliners else "negative",
        ),
        TerminalStat(
            label="Above 200D",
            value=f"{pct_above_200:.0f}%",
            tone="positive" if pct_above_200 >= 50 else "warning",
        ),
        TerminalStat(
            label="Avg RSI",
            value="—" if avg_rsi is None else f"{float(avg_rsi):.1f}",
            tone="neutral",
        ),
    ]

    # Use v_sector_breadth when no universe filter is applied (common hot path).
    # With a universe filter, fall back to in-memory aggregation over the filtered frame.
    if universe is None:
        with duckdb_connection(read_only=True) as conn:
            sectors_frame = conn.execute(
                """
                SELECT Sector, members, avg_change_pct, avg_return_20d, avg_rsi, pct_above_200d
                FROM v_sector_breadth
                ORDER BY avg_return_20d DESC NULLS LAST
                LIMIT 12
                """
            ).df()
    else:
        sectors_frame = (
            latest.dropna(subset=["Sector"])
            .groupby("Sector", as_index=False)
            .agg(
                members=("Ticker", "count"),
                avg_change_pct=("change_pct", "mean"),
                avg_return_20d=("Ticker_Return_20D", "mean"),
                avg_rsi=("Ticker_RSI", "mean"),
                pct_above_200d=(
                    "Close",
                    lambda close: float(
                        ((close > latest.loc[close.index, "Ticker_SMA_200"]).fillna(False).mean())
                        * 100
                    ),
                ),
            )
            .sort_values("avg_return_20d", ascending=False, na_position="last")
        )

    sectors = [
        MonitorSector(
            sector=str(row["Sector"]),
            members=int(row["members"]),
            avg_change_pct=to_float(row.get("avg_change_pct")),
            avg_return_20d=to_float(row.get("avg_return_20d")),
            avg_rsi=to_float(row.get("avg_rsi")),
            pct_above_200d=to_float(row.get("pct_above_200d")),
        )
        for _, row in sectors_frame.head(12).iterrows()
    ]

    def _ranked(frame: pd.DataFrame) -> list:
        return [row_to_security_list_item(row) for _, row in frame.head(12).iterrows()]

    leaders = latest.sort_values("Ticker_Return_20D", ascending=False, na_position="last")
    laggards = latest.sort_values("Ticker_Return_20D", ascending=True, na_position="last")
    most_active = latest.sort_values("Volume", ascending=False, na_position="last")
    volume_surge = latest.sort_values("volume_ratio", ascending=False, na_position="last")
    rsi_high = latest.sort_values("Ticker_RSI", ascending=False, na_position="last")
    rsi_low = latest.sort_values("Ticker_RSI", ascending=True, na_position="last")

    return MarketMonitorOverview(
        generated_at=utc_now(),
        universe_size=universe_size,
        breadth=breadth,
        sectors=sectors,
        leaders=_ranked(leaders),
        laggards=_ranked(laggards),
        most_active=_ranked(most_active),
        volume_surge=_ranked(volume_surge),
        rsi_high=_ranked(rsi_high),
        rsi_low=_ranked(rsi_low),
    )


def get_sector_overview(sector: str) -> SectorOverview:
    latest = load_latest_market_frame()
    if latest.empty:
        raise ValueError("No market data available for sector view")

    sector_frame = latest[latest["Sector"] == sector].copy()
    if sector_frame.empty:
        raise ValueError(f"No data available for sector {sector}")

    avg_change = sector_frame["change_pct"].dropna().mean()
    avg_return_20d = sector_frame["Ticker_Return_20D"].dropna().mean()
    avg_rsi = sector_frame["Ticker_RSI"].dropna().mean()
    pct_above_200 = (
        ((sector_frame["Close"] > sector_frame["Ticker_SMA_200"]).fillna(False).mean()) * 100
        if not sector_frame.empty
        else 0.0
    )

    summary = [
        TerminalStat(label="Members", value=str(len(sector_frame)), tone="neutral"),
        TerminalStat(
            label="Day Avg",
            value="—" if avg_change is None else f"{float(avg_change):+.2f}%",
            tone="positive" if (avg_change or 0) >= 0 else "negative",
        ),
        TerminalStat(
            label="20D Avg",
            value="—" if avg_return_20d is None else f"{float(avg_return_20d):+.2f}%",
            tone="positive" if (avg_return_20d or 0) >= 0 else "negative",
        ),
        TerminalStat(
            label="Avg RSI",
            value="—" if avg_rsi is None else f"{float(avg_rsi):.1f}",
            tone="neutral",
        ),
        TerminalStat(
            label="Above 200D",
            value=f"{pct_above_200:.0f}%",
            tone="positive" if pct_above_200 >= 50 else "warning",
        ),
    ]

    leaders = sector_frame.sort_values("Ticker_Return_20D", ascending=False, na_position="last")
    laggards = sector_frame.sort_values("Ticker_Return_20D", ascending=True, na_position="last")
    member_sort = ["Ticker_Tech_Score", "Ticker_Return_20D"]
    ascending = [False, False]
    if "MarketCap" in sector_frame.columns:
        member_sort.append("MarketCap")
        ascending.append(False)
    members = sector_frame.sort_values(member_sort, ascending=ascending, na_position="last")

    return SectorOverview(
        generated_at=utc_now(),
        sector=sector,
        summary=summary,
        leaders=[row_to_security_list_item(row) for _, row in leaders.head(8).iterrows()],
        laggards=[row_to_security_list_item(row) for _, row in laggards.head(8).iterrows()],
        members=[row_to_security_list_item(row) for _, row in members.head(40).iterrows()],
    )
