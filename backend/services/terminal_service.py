from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd

from backend.core.duckdb import duckdb_connection
from backend.models import (
    SecurityBar,
    SecurityOverview,
    SecuritySignal,
    SecuritySnapshot,
    StrategyBacktestPoint,
    StrategyBacktestRequest,
    StrategyBacktestResponse,
    StrategyBacktestSummary,
    StrategyDefinition,
    StrategyMatch,
    TerminalHeadline,
    TerminalMover,
    TerminalOverview,
    TerminalStat,
)


SUPPORTED_CONDITIONS = {"above", "below", "crosses_above", "crosses_below"}


def _to_float(value: float | int | None) -> float | None:
    return None if value is None or pd.isna(value) else float(value)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_mover(row: pd.Series) -> TerminalMover:
    return TerminalMover(
        ticker=row["Ticker"],
        name=row.get("FullName"),
        last_price=_to_float(row.get("Close")),
        change_pct=_to_float(row.get("change_pct")),
        volume=_to_float(row.get("Volume")),
        tech_score=_to_float(row.get("Ticker_Tech_Score")),
    )


def _load_focus_frame(ticker: str, start_date: str | None = None, end_date: str | None = None) -> pd.DataFrame:
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


def _load_screen_frame() -> pd.DataFrame:
    with duckdb_connection(read_only=True) as conn:
        return conn.execute("""
            WITH latest AS (
                SELECT
                    td.*,
                    ROW_NUMBER() OVER (PARTITION BY td.Ticker ORDER BY td.Date DESC) AS rn,
                    LAG(td.Ticker_RSI) OVER (PARTITION BY td.Ticker ORDER BY td.Date) AS prev_rsi,
                    LAG(td.Ticker_MACD) OVER (PARTITION BY td.Ticker ORDER BY td.Date) AS prev_macd,
                    LAG(td.Ticker_MACD_Signal) OVER (PARTITION BY td.Ticker ORDER BY td.Date) AS prev_macd_signal,
                    LAG(td.Ticker_Tech_Score) OVER (PARTITION BY td.Ticker ORDER BY td.Date) AS prev_tech_score
                FROM ticker_data td
            )
            SELECT
                latest.Date,
                latest.Ticker,
                si.FullName,
                si.Sector,
                latest.Close,
                latest.Volume,
                latest.Ticker_RSI,
                latest.Ticker_MACD,
                latest.Ticker_MACD_Signal,
                latest.Ticker_Tech_Score,
                latest.prev_rsi,
                latest.prev_macd,
                latest.prev_macd_signal,
                latest.prev_tech_score
            FROM latest
            LEFT JOIN stock_information si ON si.Ticker = latest.Ticker
            WHERE latest.rn = 1
        """).df()


def _resolve_threshold(frame: pd.DataFrame, metric: str | None, threshold: float | None) -> pd.Series:
    if metric:
        if metric not in frame.columns:
            raise ValueError(f"Unsupported comparison metric: {metric}")
        return frame[metric]
    if threshold is None:
        raise ValueError("Strategy leg requires either threshold or compare_to_metric")
    return pd.Series(threshold, index=frame.index, dtype="float64")


def _evaluate_leg(frame: pd.DataFrame, metric: str, condition: str, threshold: pd.Series) -> pd.Series:
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


def _evaluate_strategy_matches(frame: pd.DataFrame, strategy: StrategyDefinition) -> list[StrategyMatch]:
    threshold = _resolve_threshold(
        frame,
        strategy.entry.compare_to_metric,
        strategy.entry.threshold,
    )
    matches = _evaluate_leg(frame, strategy.entry.metric, strategy.entry.condition, threshold)
    matched = frame.loc[matches].copy()
    if matched.empty:
        return []

    matched = matched.sort_values(["Ticker_Tech_Score", "Volume"], ascending=[False, False])
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
                signal_state="entry",
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
                    Ticker_EMA_10,
                    Ticker_SMA_30,
                    Ticker_EMA_30,
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
                    td.Ticker_EMA_10,
                    td.Ticker_RSI,
                    td.Ticker_MACD,
                    td.Ticker_MACD_Signal,
                    td.Ticker_Tech_Score,
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
                r.Ticker_SMA_10,
                r.Ticker_SMA_30,
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
                    td.Ticker_RSI,
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
        sma_10,
        sma_30,
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
            ema_10=_to_float(row.get("Ticker_EMA_10")),
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
        above_sma_10=bool(close is not None and sma_10 is not None and float(close) > float(sma_10)),
        above_sma_30=bool(close is not None and sma_30 is not None and float(close) > float(sma_30)),
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
            tone="negative" if (snapshot_model.rsi or 50) >= 70 else "positive" if (snapshot_model.rsi or 50) <= 30 else "neutral",
        ),
        SecuritySignal(
            label="MACD Bias",
            value="Bullish" if snapshot_model.macd is not None and snapshot_model.macd_signal is not None and snapshot_model.macd > snapshot_model.macd_signal else "Bearish",
            tone="positive" if snapshot_model.macd is not None and snapshot_model.macd_signal is not None and snapshot_model.macd > snapshot_model.macd_signal else "negative",
        ),
        SecuritySignal(
            label="Trend",
            value="Above 10 / 30 DMA" if snapshot_model.above_sma_10 and snapshot_model.above_sma_30 else "Below trend filters",
            tone="positive" if snapshot_model.above_sma_10 and snapshot_model.above_sma_30 else "warning",
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
    with duckdb_connection(read_only=True) as conn:
        stats_row = conn.execute("""
            WITH latest AS (
                SELECT *,
                    ROW_NUMBER() OVER (PARTITION BY Ticker ORDER BY Date DESC) AS rn
                FROM ticker_data
            ),
            prior AS (
                SELECT *,
                    ROW_NUMBER() OVER (PARTITION BY Ticker ORDER BY Date DESC) AS rn
                FROM ticker_data
            )
            SELECT
                COUNT(*) FILTER (WHERE l.Close > p.Close) AS advancers,
                COUNT(*) FILTER (WHERE l.Close < p.Close) AS decliners,
                AVG(l.Ticker_RSI) AS avg_rsi,
                AVG(l.Ticker_Tech_Score) AS avg_score
            FROM latest l
            JOIN prior p ON p.Ticker = l.Ticker AND p.rn = 2
            WHERE l.rn = 1
        """).fetchone()

        leaders = conn.execute("""
            WITH ranked AS (
                SELECT
                    td.Ticker,
                    si.FullName,
                    td.Close,
                    td.Volume,
                    td.Ticker_RSI,
                    td.Ticker_Tech_Score,
                    ((td.Close / NULLIF(LAG(td.Close) OVER (PARTITION BY td.Ticker ORDER BY td.Date), 0)) - 1) * 100 AS change_pct,
                    ROW_NUMBER() OVER (PARTITION BY td.Ticker ORDER BY td.Date DESC) AS rn
                FROM ticker_data td
                LEFT JOIN stock_information si ON si.Ticker = td.Ticker
            )
            SELECT *
            FROM ranked
            WHERE rn = 1
            ORDER BY Ticker_Tech_Score DESC NULLS LAST, change_pct DESC NULLS LAST
            LIMIT 8
        """).df()

        reversals = conn.execute("""
            WITH ranked AS (
                SELECT
                    td.Ticker,
                    si.FullName,
                    td.Close,
                    td.Volume,
                    td.Ticker_RSI,
                    td.Ticker_Tech_Score,
                    ((td.Close / NULLIF(LAG(td.Close) OVER (PARTITION BY td.Ticker ORDER BY td.Date), 0)) - 1) * 100 AS change_pct,
                    ROW_NUMBER() OVER (PARTITION BY td.Ticker ORDER BY td.Date DESC) AS rn
                FROM ticker_data td
                LEFT JOIN stock_information si ON si.Ticker = td.Ticker
            )
            SELECT *
            FROM ranked
            WHERE rn = 1 AND Ticker_RSI BETWEEN 25 AND 45
            ORDER BY change_pct DESC NULLS LAST, Volume DESC NULLS LAST
            LIMIT 8
        """).df()

        breakouts = conn.execute("""
            WITH ranked AS (
                SELECT
                    td.Ticker,
                    si.FullName,
                    td.Close,
                    td.Volume,
                    td.Ticker_RSI,
                    td.Ticker_Tech_Score,
                    ((td.Close / NULLIF(LAG(td.Close) OVER (PARTITION BY td.Ticker ORDER BY td.Date), 0)) - 1) * 100 AS change_pct,
                    ROW_NUMBER() OVER (PARTITION BY td.Ticker ORDER BY td.Date DESC) AS rn
                FROM ticker_data td
                LEFT JOIN stock_information si ON si.Ticker = td.Ticker
            )
            SELECT *
            FROM ranked
            WHERE rn = 1 AND Ticker_RSI >= 60 AND Ticker_Tech_Score >= 65
            ORDER BY change_pct DESC NULLS LAST, Ticker_Tech_Score DESC NULLS LAST
            LIMIT 8
        """).df()

        focus = conn.execute("""
            WITH ranked AS (
                SELECT
                    td.Date,
                    td.Ticker,
                    td.Close,
                    td.Ticker_RSI,
                    td.Ticker_MACD,
                    td.Ticker_MACD_Signal,
                    td.Ticker_Tech_Score,
                    LAG(td.Close) OVER (PARTITION BY td.Ticker ORDER BY td.Date) AS prev_close,
                    ROW_NUMBER() OVER (PARTITION BY td.Ticker ORDER BY td.Date DESC) AS rn
                FROM ticker_data td
                WHERE td.Ticker = ?
            )
            SELECT *
            FROM ranked
            WHERE rn = 1
        """, [focus_ticker.upper()]).fetchone()

    advancers, decliners, avg_rsi, avg_score = stats_row or (0, 0, None, None)
    focus_change = None
    focus_price = None
    focus_score = None
    focus_rsi = None
    if focus:
        _, _, close, rsi, macd, macd_signal, tech_score, prev_close, _ = focus
        focus_price = _to_float(close)
        focus_rsi = _to_float(rsi)
        focus_score = _to_float(tech_score)
        if prev_close not in (None, 0):
            focus_change = ((float(close) / float(prev_close)) - 1) * 100
        macd_bias = "Bullish MACD" if _to_float(macd) and _to_float(macd_signal) and float(macd) > float(macd_signal) else "Weak MACD"
    else:
        macd_bias = "No focus signal"

    stats = [
        TerminalStat(label="Advancers", value=str(int(advancers or 0)), tone="positive"),
        TerminalStat(label="Decliners", value=str(int(decliners or 0)), tone="negative"),
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
            label=f"{focus_ticker.upper()} Score",
            value="—" if focus_score is None else f"{focus_score:.0f}",
            change=None if focus_rsi is None else f"RSI {focus_rsi:.1f}",
            tone="positive" if (focus_score or 0) >= 65 else "warning",
        ),
        TerminalStat(
            label="Composite",
            value="—" if avg_score is None else f"{float(avg_score):.0f}",
            change=macd_bias,
            tone="positive" if (avg_score or 0) >= 60 else "neutral",
        ),
    ]

    def _movers(frame: pd.DataFrame) -> list[TerminalMover]:
        return [_row_to_mover(row) for _, row in frame.iterrows()]

    headlines = [
        TerminalHeadline(
            ticker=focus_ticker.upper(),
            headline=f"{focus_ticker.upper()} remains the active focus instrument",
            detail="Terminal workspace is wired to the new DuckDB analytics surface.",
            tone="positive",
        ),
        TerminalHeadline(
            ticker="SCREEN",
            headline="Strategy screening is now directly coupled to the backtest engine",
            detail="Same strategy definition powers both historical simulation and live candidate selection.",
            tone="warning",
        ),
        TerminalHeadline(
            ticker="BACKUP",
            headline="DuckDB backup flow uses checkpoint-safe snapshot copies",
            detail="Retention and optional compression are exposed through the new system endpoints.",
            tone="neutral",
        ),
    ]

    return TerminalOverview(
        generated_at=_utc_now(),
        focus_ticker=focus_ticker.upper(),
        stats=stats,
        momentum_leaders=_movers(leaders),
        reversal_candidates=_movers(reversals),
        breakouts=_movers(breakouts),
        headlines=headlines,
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
    entry_threshold = _resolve_threshold(
        frame,
        request.strategy.entry.compare_to_metric,
        request.strategy.entry.threshold,
    )
    exit_threshold = _resolve_threshold(
        frame,
        request.strategy.exit.compare_to_metric,
        request.strategy.exit.threshold,
    )
    entry_signal = _evaluate_leg(
        frame, request.strategy.entry.metric, request.strategy.entry.condition, entry_threshold
    ).fillna(False)
    exit_signal = _evaluate_leg(
        frame, request.strategy.exit.metric, request.strategy.exit.condition, exit_threshold
    ).fillna(False)

    initial_capital = max(request.strategy.initial_capital, 1.0)
    size_fraction = min(max(request.strategy.position_size_pct / 100.0, 0.01), 1.0)
    cash = initial_capital
    shares = 0.0
    entry_price = 0.0
    entry_date = None
    equity_points: list[StrategyBacktestPoint] = []
    trades = []
    peak_equity = initial_capital
    max_drawdown = 0.0

    for idx, row in frame.iterrows():
        close = float(row["Close"])
        date = row["Date"]
        should_exit = bool(exit_signal.iloc[idx])
        if shares > 0 and request.strategy.stop_loss_pct is not None:
            stop_price = entry_price * (1 - request.strategy.stop_loss_pct / 100.0)
            should_exit = should_exit or close <= stop_price

        if shares == 0 and bool(entry_signal.iloc[idx]):
            deployable_cash = cash * size_fraction
            shares = deployable_cash / close if close > 0 else 0.0
            cash -= shares * close
            entry_price = close
            entry_date = date
        elif shares > 0 and should_exit:
            cash += shares * close
            pnl = (close - entry_price) * shares
            trades.append(
                {
                    "entry_date": entry_date.date().isoformat() if entry_date is not None else date.date().isoformat(),
                    "entry_price": entry_price,
                    "exit_date": date.date().isoformat(),
                    "exit_price": close,
                    "return_pct": ((close / entry_price) - 1) * 100 if entry_price else 0.0,
                    "pnl": pnl,
                }
            )
            shares = 0.0
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
        cash += shares * close
        pnl = (close - entry_price) * shares
        trades.append(
            {
                "entry_date": entry_date.date().isoformat() if entry_date is not None else frame.iloc[-1]["Date"].date().isoformat(),
                "entry_price": entry_price,
                "exit_date": frame.iloc[-1]["Date"].date().isoformat(),
                "exit_price": close,
                "return_pct": ((close / entry_price) - 1) * 100 if entry_price else 0.0,
                "pnl": pnl,
            }
        )

    total_return_pct = ((cash / initial_capital) - 1) * 100
    buy_hold_return_pct = ((float(frame.iloc[-1]["Close"]) / float(frame.iloc[0]["Close"])) - 1) * 100
    trade_returns = [trade["return_pct"] for trade in trades]
    wins = [r for r in trade_returns if r > 0]
    avg_return = sum(trade_returns) / len(trade_returns) if trade_returns else 0.0
    win_rate = (len(wins) / len(trade_returns) * 100) if trade_returns else 0.0

    equity_series = pd.Series([point.equity for point in equity_points], dtype="float64")
    returns = equity_series.pct_change().dropna()
    sharpe = None
    if not returns.empty and returns.std() > 0:
        sharpe = float((returns.mean() / returns.std()) * (252**0.5))

    days = max((frame.iloc[-1]["Date"] - frame.iloc[0]["Date"]).days, 1)
    annualized = ((cash / initial_capital) ** (365 / days) - 1) * 100 if days > 0 else None
    summary = StrategyBacktestSummary(
        total_return_pct=round(total_return_pct, 2),
        buy_hold_return_pct=round(buy_hold_return_pct, 2),
        max_drawdown_pct=round(abs(max_drawdown), 2),
        win_rate=round(win_rate, 2),
        num_trades=len(trades),
        avg_return_pct=round(avg_return, 2),
        annualized_return_pct=None if annualized is None else round(float(annualized), 2),
        sharpe_ratio=None if sharpe is None else round(sharpe, 2),
    )

    screen_matches = _evaluate_strategy_matches(_load_screen_frame(), request.strategy)
    return StrategyBacktestResponse(
        ticker=request.ticker.upper(),
        strategy_name=request.strategy.name,
        summary=summary,
        equity_curve=equity_points,
        trades=trades,
        current_matches=screen_matches[:25],
    )


def screen_strategy(strategy: StrategyDefinition):
    matches = _evaluate_strategy_matches(_load_screen_frame(), strategy)
    return matches
