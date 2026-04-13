from __future__ import annotations

from datetime import UTC, datetime

import pandas as pd

from backend.core.duckdb import duckdb_connection
from backend.models import (
    MarketMonitorOverview,
    MonitorSector,
    SectorOverview,
    SecurityBar,
    SecurityListItem,
    SecurityOverview,
    SecuritySignal,
    SecuritySnapshot,
    SecuritySnapshotResponse,
    StrategyBacktestPoint,
    StrategyBacktestRequest,
    StrategyBacktestResponse,
    StrategyBacktestSummary,
    StrategyDefinition,
    StrategyMatch,
    TerminalMover,
    TerminalOverview,
    TerminalStat,
)

SUPPORTED_CONDITIONS = {"above", "below", "crosses_above", "crosses_below"}
SUPPORTED_OPERATORS = {"and", "or"}


def _to_float(value: float | int | None) -> float | None:
    return None if value is None or pd.isna(value) else float(value)


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _row_to_mover(row: pd.Series) -> TerminalMover:
    return TerminalMover(
        ticker=row["Ticker"],
        name=row.get("FullName"),
        last_price=_to_float(row.get("Close")),
        change_pct=_to_float(row.get("change_pct")),
        volume=_to_float(row.get("Volume")),
        tech_score=_to_float(row.get("Ticker_Tech_Score")),
    )


def _row_to_security_list_item(row: pd.Series) -> SecurityListItem:
    close = _to_float(row.get("Close"))
    sma_200 = _to_float(row.get("Ticker_SMA_200"))
    return SecurityListItem(
        ticker=row["Ticker"],
        name=row.get("FullName"),
        sector=row.get("Sector"),
        close=close,
        change_pct=_to_float(row.get("change_pct")),
        volume=_to_float(row.get("Volume")),
        avg_volume_20d=_to_float(row.get("Ticker_Avg_Volume_20D")),
        rsi=_to_float(row.get("Ticker_RSI")),
        tech_score=_to_float(row.get("Ticker_Tech_Score")),
        return_20d=_to_float(row.get("Ticker_Return_20D")),
        return_63d=_to_float(row.get("Ticker_Return_63D")),
        return_126d=_to_float(row.get("Ticker_Return_126D")),
        return_252d=_to_float(row.get("Ticker_Return_252D")),
        market_cap=_to_float(row.get("MarketCap")),
        above_sma_200=bool(
            close is not None and sma_200 is not None and float(close) > float(sma_200)
        ),
    )


def _load_focus_frame(
    ticker: str, start_date: str | None = None, end_date: str | None = None
) -> pd.DataFrame:
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


def _load_screen_frame(universe: list[str] | None = None) -> pd.DataFrame:
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


def _load_latest_market_frame(universe: list[str] | None = None) -> pd.DataFrame:
    frame = _load_screen_frame(universe)
    if frame.empty:
        return frame

    frame = frame.sort_values(["Ticker", "Date"]).copy()
    frame["change_pct"] = frame.groupby("Ticker")["Close"].pct_change() * 100
    latest = frame.groupby("Ticker", group_keys=False).tail(1).copy()
    latest["volume_ratio"] = latest["Volume"] / latest["Ticker_Avg_Volume_20D"].replace(0, pd.NA)
    return latest


def _resolve_threshold(
    frame: pd.DataFrame, metric: str | None, threshold: float | None
) -> pd.Series:
    if metric:
        if metric not in frame.columns:
            raise ValueError(f"Unsupported comparison metric: {metric}")
        return frame[metric]
    if threshold is None:
        raise ValueError("Strategy leg requires either threshold or compare_to_metric")
    return pd.Series(threshold, index=frame.index, dtype="float64")


def _evaluate_leg(
    frame: pd.DataFrame, metric: str, condition: str, threshold: pd.Series
) -> pd.Series:
    if metric not in frame.columns:
        raise ValueError(f"Unsupported metric: {metric}")
    if condition not in SUPPORTED_CONDITIONS:
        raise ValueError(f"Unsupported condition: {condition}")

    left = frame[metric].astype("float64")
    right = threshold.astype("float64")
    prev_left = left.shift(1)
    prev_right = right.shift(1)

    if condition == "above":
        return left > right
    if condition == "below":
        return left < right
    if condition == "crosses_above":
        return (left > right) & (prev_left <= prev_right)
    return (left < right) & (prev_left >= prev_right)


def _evaluate_rule(frame: pd.DataFrame, leg: object) -> pd.Series:
    threshold = _resolve_threshold(
        frame,
        getattr(leg, "compare_to_metric", None),
        getattr(leg, "threshold", None),
    )
    return _evaluate_leg(
        frame,
        getattr(leg, "metric"),
        getattr(leg, "condition"),
        threshold,
    ).fillna(False)


def _combine_rule_stack(
    frame: pd.DataFrame,
    base_leg,
    filters,
    operator: str,
) -> pd.Series:
    op = operator.lower()
    if op not in SUPPORTED_OPERATORS:
        raise ValueError(f"Unsupported logical operator: {operator}")

    signals = [_evaluate_rule(frame, base_leg)]
    signals.extend(_evaluate_rule(frame, rule) for rule in filters)
    combined = signals[0].copy()
    for signal in signals[1:]:
        combined = combined & signal if op == "and" else combined | signal
    return combined.fillna(False)


def _trade_cost_rate(strategy: StrategyDefinition) -> float:
    fee_rate = max(strategy.fee_bps, 0.0) / 10000.0
    slippage_rate = max(strategy.slippage_bps, 0.0) / 10000.0
    return fee_rate + slippage_rate


def _evaluate_strategy_matches(
    frame: pd.DataFrame, strategy: StrategyDefinition
) -> list[StrategyMatch]:
    if frame.empty:
        return []

    ordered = frame.sort_values(["Ticker", "Date"]).copy()
    candidates: list[dict[str, object]] = []

    for ticker, ticker_frame in ordered.groupby("Ticker", sort=False):
        if ticker_frame.empty:
            continue

        entry_signal = _combine_rule_stack(
            ticker_frame,
            strategy.entry,
            strategy.entry_filters,
            strategy.entry_operator,
        )
        if not bool(entry_signal.iloc[-1]):
            continue

        signal_state = "entry"
        exit_signal = _combine_rule_stack(
            ticker_frame,
            strategy.exit,
            strategy.exit_filters,
            strategy.exit_operator,
        )
        if bool(exit_signal.iloc[-1]):
            signal_state = "entry / exit overlap"

        latest_row = ticker_frame.iloc[-1]
        candidates.append(
            {
                "Ticker": ticker,
                "FullName": latest_row.get("FullName"),
                "Sector": latest_row.get("Sector"),
                "Close": latest_row.get("Close"),
                "Ticker_RSI": latest_row.get("Ticker_RSI"),
                "Ticker_Tech_Score": latest_row.get("Ticker_Tech_Score"),
                "Ticker_Return_20D": latest_row.get("Ticker_Return_20D"),
                "Volume": latest_row.get("Volume"),
                "signal_state": signal_state,
            }
        )

    if not candidates:
        return []

    matched = pd.DataFrame(candidates).sort_values(
        ["Ticker_Return_20D", "Ticker_Tech_Score", "Volume"],
        ascending=[False, False, False],
        na_position="last",
    )
    result: list[StrategyMatch] = []
    for _, row in matched.iterrows():
        result.append(
            StrategyMatch(
                ticker=row["Ticker"],
                name=row.get("FullName"),
                sector=row.get("Sector"),
                last_price=_to_float(row.get("Close")),
                rsi=_to_float(row.get("Ticker_RSI")),
                tech_score=_to_float(row.get("Ticker_Tech_Score")),
                signal_state=str(row.get("signal_state") or "entry"),
            )
        )
    return result


def _load_security_bars(ticker: str, limit: int = 180) -> pd.DataFrame:
    with duckdb_connection(read_only=True) as conn:
        return conn.execute(
            """
            SELECT *
            FROM (
                SELECT
                    Date,
                    Ticker,
                    Open,
                    High,
                    Low,
                    Close,
                    Volume,
                    Ticker_SMA_10,
                    Ticker_SMA_30,
                    Ticker_SMA_50,
                    Ticker_SMA_100,
                    Ticker_SMA_200,
                    Ticker_SMA_250,
                    Ticker_EMA_10,
                    Ticker_EMA_50,
                    Ticker_EMA_100,
                    Ticker_EMA_200,
                    Ticker_RSI,
                    Ticker_MACD,
                    Ticker_MACD_Signal,
                    Ticker_Tech_Score,
                    ROW_NUMBER() OVER (PARTITION BY Ticker ORDER BY Date DESC) AS rn
                FROM ticker_data
                WHERE Ticker = ?
            ) ranked
            WHERE rn <= ?
            ORDER BY Date
            """,
            [ticker.upper(), limit],
        ).df()


def get_security_overview(ticker: str, limit: int = 180) -> SecurityOverview:
    symbol = ticker.upper()
    with duckdb_connection(read_only=True) as conn:
        snapshot = conn.execute(
            """
            WITH ranked AS (
                SELECT
                    td.Date,
                    td.Ticker,
                    td.Open,
                    td.High,
                    td.Low,
                    td.Close,
                    td.Volume,
                    td.Ticker_SMA_10,
                    td.Ticker_SMA_30,
                    td.Ticker_SMA_200,
                    td.Ticker_SMA_250,
                    td.Ticker_EMA_10,
                    td.Ticker_RSI,
                    td.Ticker_MACD,
                    td.Ticker_MACD_Signal,
                    td.Ticker_Tech_Score,
                    td.Ticker_Return_20D,
                    td.Ticker_Return_63D,
                    td.Ticker_Return_126D,
                    td.Ticker_Return_252D,
                    LAG(td.Close) OVER (PARTITION BY td.Ticker ORDER BY td.Date) AS prev_close,
                    ROW_NUMBER() OVER (PARTITION BY td.Ticker ORDER BY td.Date DESC) AS rn
                FROM ticker_data td
                WHERE td.Ticker = ?
            )
            SELECT
                r.Ticker,
                si.FullName,
                si.Sector,
                si.Subsector,
                si.MarketCap,
                r.Close,
                r.Volume,
                r.Ticker_RSI,
                r.Ticker_Tech_Score,
                r.Ticker_MACD,
                r.Ticker_MACD_Signal,
                r.Ticker_Return_20D,
                r.Ticker_Return_63D,
                r.Ticker_Return_126D,
                r.Ticker_Return_252D,
                r.Ticker_SMA_10,
                r.Ticker_SMA_30,
                r.Ticker_SMA_200,
                r.Ticker_SMA_250,
                CASE WHEN r.prev_close IS NULL OR r.prev_close = 0 THEN NULL
                     ELSE ((r.Close / r.prev_close) - 1) * 100
                END AS change_pct
            FROM ranked r
            LEFT JOIN stock_information si ON si.Ticker = r.Ticker
            WHERE r.rn = 1
            """,
            [symbol],
        ).fetchone()

        if snapshot is None:
            raise ValueError(f"No security data available for {symbol}")

        related = conn.execute(
            """
            WITH latest AS (
                SELECT
                    td.Ticker,
                    si.FullName,
                    si.Sector,
                    td.Close,
                    td.Volume,
                    td.Ticker_Tech_Score,
                    ((td.Close / NULLIF(LAG(td.Close) OVER (PARTITION BY td.Ticker ORDER BY td.Date), 0)) - 1) * 100 AS change_pct,
                    ROW_NUMBER() OVER (PARTITION BY td.Ticker ORDER BY td.Date DESC) AS rn
                FROM ticker_data td
                LEFT JOIN stock_information si ON si.Ticker = td.Ticker
            )
            SELECT Ticker, FullName, Close, Volume, Ticker_Tech_Score, change_pct
            FROM latest
            WHERE rn = 1
              AND Sector = (
                SELECT Sector FROM stock_information WHERE Ticker = ?
              )
              AND Ticker <> ?
            ORDER BY Ticker_Tech_Score DESC NULLS LAST, change_pct DESC NULLS LAST
            LIMIT 8
            """,
            [symbol, symbol],
        ).df()

    (
        _ticker,
        full_name,
        sector,
        subsector,
        market_cap,
        close,
        volume,
        rsi,
        tech_score,
        macd,
        macd_signal,
        return_20d,
        return_63d,
        return_126d,
        return_252d,
        sma_10,
        sma_30,
        sma_200,
        sma_250,
        change_pct,
    ) = snapshot
    bars_frame = _load_security_bars(symbol, limit=limit)
    bars = [
        SecurityBar(
            date=str(row["Date"])[:10],
            open=float(row["Open"]),
            high=float(row["High"]),
            low=float(row["Low"]),
            close=float(row["Close"]),
            volume=float(row["Volume"] or 0),
            sma_10=_to_float(row.get("Ticker_SMA_10")),
            sma_30=_to_float(row.get("Ticker_SMA_30")),
            sma_50=_to_float(row.get("Ticker_SMA_50")),
            sma_100=_to_float(row.get("Ticker_SMA_100")),
            sma_200=_to_float(row.get("Ticker_SMA_200")),
            sma_250=_to_float(row.get("Ticker_SMA_250")),
            ema_10=_to_float(row.get("Ticker_EMA_10")),
            ema_50=_to_float(row.get("Ticker_EMA_50")),
            ema_100=_to_float(row.get("Ticker_EMA_100")),
            ema_200=_to_float(row.get("Ticker_EMA_200")),
            tech_score=_to_float(row.get("Ticker_Tech_Score")),
            rsi=_to_float(row.get("Ticker_RSI")),
            macd=_to_float(row.get("Ticker_MACD")),
            macd_signal=_to_float(row.get("Ticker_MACD_Signal")),
        )
        for _, row in bars_frame.iterrows()
    ]
    snapshot_model = SecuritySnapshot(
        ticker=symbol,
        name=full_name,
        sector=sector,
        subsector=subsector,
        close=_to_float(close),
        change_pct=_to_float(change_pct),
        volume=_to_float(volume),
        market_cap=_to_float(market_cap),
        rsi=_to_float(rsi),
        tech_score=_to_float(tech_score),
        macd=_to_float(macd),
        macd_signal=_to_float(macd_signal),
        return_20d=_to_float(return_20d),
        return_63d=_to_float(return_63d),
        return_126d=_to_float(return_126d),
        return_252d=_to_float(return_252d),
        above_sma_10=bool(
            close is not None and sma_10 is not None and float(close) > float(sma_10)
        ),
        above_sma_30=bool(
            close is not None and sma_30 is not None and float(close) > float(sma_30)
        ),
        above_sma_200=bool(
            close is not None and sma_200 is not None and float(close) > float(sma_200)
        ),
        above_sma_250=bool(
            close is not None and sma_250 is not None and float(close) > float(sma_250)
        ),
    )
    signals = [
        SecuritySignal(
            label="Tech Score",
            value="—" if snapshot_model.tech_score is None else f"{snapshot_model.tech_score:.0f}",
            tone="positive" if (snapshot_model.tech_score or 0) >= 65 else "warning",
        ),
        SecuritySignal(
            label="RSI",
            value="—" if snapshot_model.rsi is None else f"{snapshot_model.rsi:.1f}",
            tone="negative"
            if (snapshot_model.rsi or 50) >= 70
            else "positive"
            if (snapshot_model.rsi or 50) <= 30
            else "neutral",
        ),
        SecuritySignal(
            label="MACD Bias",
            value="Bullish"
            if snapshot_model.macd is not None
            and snapshot_model.macd_signal is not None
            and snapshot_model.macd > snapshot_model.macd_signal
            else "Bearish",
            tone="positive"
            if snapshot_model.macd is not None
            and snapshot_model.macd_signal is not None
            and snapshot_model.macd > snapshot_model.macd_signal
            else "negative",
        ),
        SecuritySignal(
            label="Trend",
            value="Above 200 / 250 DMA"
            if snapshot_model.above_sma_200 and snapshot_model.above_sma_250
            else "Below long-term trend",
            tone="positive"
            if snapshot_model.above_sma_200 and snapshot_model.above_sma_250
            else "warning",
        ),
    ]
    return SecurityOverview(
        generated_at=_utc_now(),
        snapshot=snapshot_model,
        signals=signals,
        bars=bars,
        related=[_row_to_mover(row) for _, row in related.iterrows()],
    )


def get_terminal_overview(focus_ticker: str) -> TerminalOverview:
    market_frame = _load_screen_frame()
    if market_frame.empty:
        raise ValueError("No market data available for terminal overview")

    market_frame = market_frame.sort_values(["Ticker", "Date"]).copy()
    market_frame["change_pct"] = market_frame.groupby("Ticker")["Close"].pct_change() * 100
    latest = market_frame.groupby("Ticker", group_keys=False).tail(1).copy()
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

    focus_frame = _load_focus_frame(focus_ticker)
    focus_change = None
    focus_price = None
    focus_score = None
    focus_rsi = None
    if not focus_frame.empty:
        focus = focus_frame.iloc[-1]
        focus_price = _to_float(focus["Close"])
        focus_rsi = _to_float(focus.get("Ticker_RSI"))
        focus_score = _to_float(focus.get("Ticker_Tech_Score"))
        if len(focus_frame) > 1:
            prev_close = focus_frame.iloc[-2]["Close"]
            if prev_close not in (None, 0):
                focus_change = ((float(focus["Close"]) / float(prev_close)) - 1) * 100
        macd = focus.get("Ticker_MACD")
        macd_signal = focus.get("Ticker_MACD_Signal")
        macd_bias = (
            "Bullish MACD"
            if _to_float(macd) and _to_float(macd_signal) and float(macd) > float(macd_signal)
            else "Weak MACD"
        )
    else:
        macd_bias = "No focus signal"

    stats = [
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

    def _movers(frame: pd.DataFrame) -> list[TerminalMover]:
        return [_row_to_mover(row) for _, row in frame.iterrows()]

    return TerminalOverview(
        generated_at=_utc_now(),
        focus_ticker=focus_ticker.upper(),
        universe_size=universe_size,
        stats=stats,
        momentum_leaders=_movers(leaders),
        reversal_candidates=_movers(reversals),
        breakouts=_movers(breakouts),
    )


def get_terminal_snapshots(tickers: list[str]) -> SecuritySnapshotResponse:
    latest = _load_latest_market_frame(tickers)
    items = [_row_to_security_list_item(row) for _, row in latest.iterrows()]
    return SecuritySnapshotResponse(generated_at=_utc_now(), items=items)


def get_market_monitor(universe: list[str] | None = None) -> MarketMonitorOverview:
    latest = _load_latest_market_frame(universe)
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
                    ((close > latest.loc[close.index, "Ticker_SMA_200"]).fillna(False).mean()) * 100
                ),
            ),
        )
        .sort_values("avg_return_20d", ascending=False, na_position="last")
    )

    sectors = [
        MonitorSector(
            sector=str(row["Sector"]),
            members=int(row["members"]),
            avg_change_pct=_to_float(row.get("avg_change_pct")),
            avg_return_20d=_to_float(row.get("avg_return_20d")),
            avg_rsi=_to_float(row.get("avg_rsi")),
            pct_above_200d=_to_float(row.get("pct_above_200d")),
        )
        for _, row in sectors_frame.head(12).iterrows()
    ]

    def _ranked(frame: pd.DataFrame) -> list[SecurityListItem]:
        return [_row_to_security_list_item(row) for _, row in frame.head(12).iterrows()]

    leaders = latest.sort_values("Ticker_Return_20D", ascending=False, na_position="last")
    laggards = latest.sort_values("Ticker_Return_20D", ascending=True, na_position="last")
    most_active = latest.sort_values("Volume", ascending=False, na_position="last")
    volume_surge = latest.sort_values("volume_ratio", ascending=False, na_position="last")
    rsi_high = latest.sort_values("Ticker_RSI", ascending=False, na_position="last")
    rsi_low = latest.sort_values("Ticker_RSI", ascending=True, na_position="last")

    return MarketMonitorOverview(
        generated_at=_utc_now(),
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
    latest = _load_latest_market_frame()
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
        generated_at=_utc_now(),
        sector=sector,
        summary=summary,
        leaders=[_row_to_security_list_item(row) for _, row in leaders.head(8).iterrows()],
        laggards=[_row_to_security_list_item(row) for _, row in laggards.head(8).iterrows()],
        members=[_row_to_security_list_item(row) for _, row in members.head(40).iterrows()],
    )


def run_strategy_backtest(request: StrategyBacktestRequest) -> StrategyBacktestResponse:
    frame = _load_focus_frame(
        request.ticker,
        start_date=request.strategy.start_date,
        end_date=request.strategy.end_date,
    )
    if frame.empty:
        raise ValueError(f"No ticker data available for {request.ticker.upper()}")

    frame["Date"] = pd.to_datetime(frame["Date"])
    entry_signal = _combine_rule_stack(
        frame,
        request.strategy.entry,
        request.strategy.entry_filters,
        request.strategy.entry_operator,
    )
    exit_signal = _combine_rule_stack(
        frame,
        request.strategy.exit,
        request.strategy.exit_filters,
        request.strategy.exit_operator,
    )

    initial_capital = max(request.strategy.initial_capital, 1.0)
    size_fraction = min(max(request.strategy.position_size_pct / 100.0, 0.01), 1.0)
    cash = initial_capital
    gross_cash = initial_capital
    shares = 0.0
    gross_shares = 0.0
    entry_price = 0.0
    entry_date = None
    equity_points: list[StrategyBacktestPoint] = []
    trades = []
    peak_equity = initial_capital
    max_drawdown = 0.0
    total_fees_paid = 0.0
    cost_rate = _trade_cost_rate(request.strategy)

    for idx, row in frame.iterrows():
        close = float(row["Close"])
        date = row["Date"]
        should_exit = bool(exit_signal.iloc[idx])
        if shares > 0 and request.strategy.stop_loss_pct is not None:
            stop_price = entry_price * (1 - request.strategy.stop_loss_pct / 100.0)
            should_exit = should_exit or close <= stop_price

        if shares == 0 and bool(entry_signal.iloc[idx]):
            deployable_cash = cash * size_fraction
            gross_deployable_cash = gross_cash * size_fraction
            shares = deployable_cash / (close * (1 + cost_rate)) if close > 0 else 0.0
            gross_shares = gross_deployable_cash / close if close > 0 else 0.0
            entry_cost = shares * close * cost_rate
            cash -= shares * close + entry_cost
            gross_cash -= gross_shares * close
            total_fees_paid += entry_cost
            entry_price = close
            entry_date = date
        elif shares > 0 and should_exit:
            exit_value = shares * close
            gross_exit_value = gross_shares * close
            exit_cost = exit_value * cost_rate
            cash += exit_value - exit_cost
            gross_cash += gross_exit_value
            total_fees_paid += exit_cost
            pnl = (close - entry_price) * shares
            trades.append(
                {
                    "entry_date": entry_date.date().isoformat()
                    if entry_date is not None
                    else date.date().isoformat(),
                    "entry_price": entry_price,
                    "exit_date": date.date().isoformat(),
                    "exit_price": close,
                    "return_pct": ((close / entry_price) - 1) * 100 if entry_price else 0.0,
                    "pnl": pnl,
                }
            )
            shares = 0.0
            gross_shares = 0.0
            entry_price = 0.0
            entry_date = None

        equity = cash + shares * close
        peak_equity = max(peak_equity, equity)
        drawdown = 0.0 if peak_equity == 0 else (equity / peak_equity - 1) * 100
        max_drawdown = min(max_drawdown, drawdown)
        benchmark = initial_capital * (close / float(frame.iloc[0]["Close"]))
        equity_points.append(
            StrategyBacktestPoint(
                date=date.date().isoformat(),
                equity=round(equity, 2),
                benchmark=round(benchmark, 2),
                exposure=1.0 if shares > 0 else 0.0,
            )
        )

    if shares > 0:
        close = float(frame.iloc[-1]["Close"])
        exit_value = shares * close
        gross_exit_value = gross_shares * close
        exit_cost = exit_value * cost_rate
        cash += exit_value - exit_cost
        gross_cash += gross_exit_value
        total_fees_paid += exit_cost
        pnl = (close - entry_price) * shares
        trades.append(
            {
                "entry_date": entry_date.date().isoformat()
                if entry_date is not None
                else frame.iloc[-1]["Date"].date().isoformat(),
                "entry_price": entry_price,
                "exit_date": frame.iloc[-1]["Date"].date().isoformat(),
                "exit_price": close,
                "return_pct": ((close / entry_price) - 1) * 100 if entry_price else 0.0,
                "pnl": pnl,
            }
        )

    total_return_pct = ((cash / initial_capital) - 1) * 100
    gross_return_pct = ((gross_cash / initial_capital) - 1) * 100
    cost_drag_pct = gross_return_pct - total_return_pct
    buy_hold_return_pct = (
        (float(frame.iloc[-1]["Close"]) / float(frame.iloc[0]["Close"])) - 1
    ) * 100
    trade_returns = [trade["return_pct"] for trade in trades]
    wins = [r for r in trade_returns if r > 0]
    avg_return = sum(trade_returns) / len(trade_returns) if trade_returns else 0.0
    win_rate = (len(wins) / len(trade_returns) * 100) if trade_returns else 0.0

    equity_series = pd.Series([point.equity for point in equity_points], dtype="float64")
    returns = equity_series.pct_change().dropna()
    sharpe = None
    if not returns.empty and returns.std() > 0:
        sharpe = float((returns.mean() / returns.std()) * (252**0.5))
    downside_returns = returns[returns < 0]
    sortino = None
    if not returns.empty and not downside_returns.empty and downside_returns.std() > 0:
        sortino = float((returns.mean() / downside_returns.std()) * (252**0.5))

    benchmark_series = pd.Series(
        [point.benchmark for point in equity_points if point.benchmark is not None],
        dtype="float64",
    )
    benchmark_returns = benchmark_series.pct_change().dropna()
    beta = None
    if len(returns) > 1 and len(benchmark_returns) > 1 and benchmark_returns.var() > 0:
        aligned = pd.concat(
            [returns.reset_index(drop=True), benchmark_returns.reset_index(drop=True)], axis=1
        ).dropna()
        if len(aligned) > 1 and aligned.iloc[:, 1].var() > 0:
            beta = float(aligned.iloc[:, 0].cov(aligned.iloc[:, 1]) / aligned.iloc[:, 1].var())

    days = max((frame.iloc[-1]["Date"] - frame.iloc[0]["Date"]).days, 1)
    annualized = ((cash / initial_capital) ** (365 / days) - 1) * 100 if days > 0 else None
    summary = StrategyBacktestSummary(
        total_return_pct=round(total_return_pct, 2),
        gross_return_pct=round(gross_return_pct, 2),
        cost_drag_pct=round(cost_drag_pct, 2),
        buy_hold_return_pct=round(buy_hold_return_pct, 2),
        max_drawdown_pct=round(abs(max_drawdown), 2),
        win_rate=round(win_rate, 2),
        num_trades=len(trades),
        avg_return_pct=round(avg_return, 2),
        annualized_return_pct=None if annualized is None else round(float(annualized), 2),
        sharpe_ratio=None if sharpe is None else round(sharpe, 2),
        sortino_ratio=None if sortino is None else round(sortino, 2),
        beta=None if beta is None else round(beta, 2),
        total_fees_paid=round(total_fees_paid, 2),
    )

    screen_matches = _evaluate_strategy_matches(
        _load_screen_frame(request.strategy.universe),
        request.strategy,
    )
    return StrategyBacktestResponse(
        ticker=request.ticker.upper(),
        strategy_name=request.strategy.name,
        summary=summary,
        equity_curve=equity_points,
        trades=trades,
        current_matches=screen_matches[:25],
    )


def screen_strategy(strategy: StrategyDefinition):
    return _evaluate_strategy_matches(_load_screen_frame(strategy.universe), strategy)
