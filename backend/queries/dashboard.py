"""Dashboard / workspace query — owns the /terminal/workspace and /terminal/snapshots routes."""

from __future__ import annotations

from backend.models import (
    SecuritySnapshotResponse,
    TerminalMover,
    TerminalOverview,
    TerminalStat,
)
from backend.queries.common import (
    load_focus_frame,
    load_latest_market_frame,
    row_to_mover,
    row_to_security_list_item,
    to_float,
    utc_now,
)


def get_terminal_overview(focus_ticker: str) -> TerminalOverview:
    latest = load_latest_market_frame()
    if latest.empty:
        raise ValueError("No market data available for terminal overview")

    universe_size = len(latest)

    advancers = int((latest["change_pct"] > 0).sum())
    decliners = int((latest["change_pct"] < 0).sum())
    avg_rsi = latest["Ticker_RSI"].dropna().mean()
    pct_above_200 = (
        ((latest["Close"] > latest["Ticker_SMA_200"]).fillna(False).mean()) * 100
        if not latest.empty
        else 0.0
    )
    pct_above_250 = (
        ((latest["Close"] > latest["Ticker_SMA_250"]).fillna(False).mean()) * 100
        if not latest.empty
        else 0.0
    )

    leaders = latest.sort_values(
        ["Ticker_Return_20D", "Ticker_Tech_Score", "Volume"],
        ascending=[False, False, False],
        na_position="last",
    ).head(8)
    reversals = (
        latest[
            (latest["Ticker_RSI"].between(25, 45, inclusive="both"))
            & (latest["Close"] > latest["Ticker_SMA_200"])
        ]
        .sort_values(
            ["change_pct", "Volume"],
            ascending=[False, False],
            na_position="last",
        )
        .head(8)
    )
    breakouts = (
        latest[
            (latest["Close"] >= latest["Ticker_SMA_250"]) & (latest["Ticker_52W_Range_Pct"] >= 85)
        ]
        .sort_values(
            ["Ticker_52W_Range_Pct", "Ticker_Return_20D", "Ticker_Tech_Score"],
            ascending=[False, False, False],
            na_position="last",
        )
        .head(8)
    )

    sector_lead = (
        latest.dropna(subset=["Sector"])
        .groupby("Sector", as_index=False)
        .agg(
            avg_return_20d=("Ticker_Return_20D", "mean"),
            constituents=("Ticker", "count"),
        )
        .sort_values("avg_return_20d", ascending=False, na_position="last")
    )
    strongest_sector = None if sector_lead.empty else sector_lead.iloc[0]

    focus_frame = load_focus_frame(focus_ticker)
    focus_change = None
    focus_price = None
    focus_score = None
    focus_rsi = None
    if not focus_frame.empty:
        focus = focus_frame.iloc[-1]
        focus_price = to_float(focus["Close"])
        focus_rsi = to_float(focus.get("Ticker_RSI"))
        focus_score = to_float(focus.get("Ticker_Tech_Score"))
        if len(focus_frame) > 1:
            prev_close = focus_frame.iloc[-2]["Close"]
            if prev_close not in (None, 0):
                focus_change = ((float(focus["Close"]) / float(prev_close)) - 1) * 100
        macd = focus.get("Ticker_MACD")
        macd_signal = focus.get("Ticker_MACD_Signal")
        macd_bias = (
            "Bullish MACD"
            if to_float(macd) and to_float(macd_signal) and float(macd) > float(macd_signal)
            else "Weak MACD"
        )
    else:
        macd_bias = "No focus signal"

    stats: list[TerminalStat] = [
        TerminalStat(label="Advancers", value=str(advancers), tone="positive"),
        TerminalStat(label="Decliners", value=str(decliners), tone="negative"),
        TerminalStat(
            label="Above 200D",
            value=f"{pct_above_200:.0f}%",
            tone="positive" if pct_above_200 >= 50 else "warning",
        ),
        TerminalStat(
            label=f"{focus_ticker.upper()} PX",
            value="—" if focus_price is None else f"{focus_price:,.2f}",
            change=None if focus_change is None else f"{focus_change:+.2f}%",
            tone="positive" if (focus_change or 0) >= 0 else "negative",
        ),
        TerminalStat(
            label="Avg RSI",
            value="—" if avg_rsi is None else f"{float(avg_rsi):.1f}",
            tone="neutral",
        ),
        TerminalStat(
            label="Above 250D",
            value=f"{pct_above_250:.0f}%",
            change=macd_bias,
            tone="positive" if pct_above_250 >= 50 else "warning",
        ),
    ]
    if strongest_sector is not None:
        stats.append(
            TerminalStat(
                label="Lead Sector",
                value=str(strongest_sector["Sector"])[:12],
                change=f"{float(strongest_sector['avg_return_20d'] or 0):+.1f}% / 20D",
                tone="positive",
            )
        )
    else:
        stats.append(
            TerminalStat(
                label=f"{focus_ticker.upper()} Score",
                value="—" if focus_score is None else f"{focus_score:.0f}",
                change=None if focus_rsi is None else f"RSI {focus_rsi:.1f}",
                tone="positive" if (focus_score or 0) >= 65 else "warning",
            )
        )

    def _movers(frame) -> list[TerminalMover]:
        return [row_to_mover(row) for _, row in frame.iterrows()]

    return TerminalOverview(
        generated_at=utc_now(),
        focus_ticker=focus_ticker.upper(),
        universe_size=universe_size,
        stats=stats,
        momentum_leaders=_movers(leaders),
        reversal_candidates=_movers(reversals),
        breakouts=_movers(breakouts),
    )


def get_terminal_snapshots(tickers: list[str]) -> SecuritySnapshotResponse:
    latest = load_latest_market_frame(tickers)
    items = [row_to_security_list_item(row) for _, row in latest.iterrows()]
    return SecuritySnapshotResponse(generated_at=utc_now(), items=items)
