"""Backtest query — owns the /strategies/backtest route logic."""

from __future__ import annotations

import pandas as pd

from backend.models import (
    StrategyBacktestPoint,
    StrategyBacktestRequest,
    StrategyBacktestResponse,
    StrategyBacktestSummary,
)
from backend.queries.common import load_screen_frame
from backend.queries.security import get_security_focus_frame
from backend.queries.strategy import combine_rule_stack, evaluate_strategy_matches, trade_cost_rate


def run_strategy_backtest(request: StrategyBacktestRequest) -> StrategyBacktestResponse:
    frame = get_security_focus_frame(
        request.ticker,
        start_date=request.strategy.start_date,
        end_date=request.strategy.end_date,
    )
    if frame.empty:
        raise ValueError(f"No ticker data available for {request.ticker.upper()}")

    frame["Date"] = pd.to_datetime(frame["Date"])
    entry_signal = combine_rule_stack(
        frame,
        request.strategy.entry,
        request.strategy.entry_filters,
        request.strategy.entry_operator,
    )
    exit_signal = combine_rule_stack(
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
    cost_rate = trade_cost_rate(request.strategy)

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

    summary = _build_summary(
        frame=frame,
        equity_points=equity_points,
        trades=trades,
        cash=cash,
        gross_cash=gross_cash,
        initial_capital=initial_capital,
        total_fees_paid=total_fees_paid,
    )

    screen_matches = evaluate_strategy_matches(
        load_screen_frame(request.strategy.universe),
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


def _build_summary(
    frame: pd.DataFrame,
    equity_points: list[StrategyBacktestPoint],
    trades: list[dict],
    cash: float,
    gross_cash: float,
    initial_capital: float,
    total_fees_paid: float,
) -> StrategyBacktestSummary:
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

    # Compute max_drawdown from equity_points
    peak = initial_capital
    max_dd = 0.0
    for pt in equity_points:
        peak = max(peak, pt.equity)
        dd = 0.0 if peak == 0 else (pt.equity / peak - 1) * 100
        max_dd = min(max_dd, dd)

    return StrategyBacktestSummary(
        total_return_pct=round(total_return_pct, 2),
        gross_return_pct=round(gross_return_pct, 2),
        cost_drag_pct=round(cost_drag_pct, 2),
        buy_hold_return_pct=round(buy_hold_return_pct, 2),
        max_drawdown_pct=round(abs(max_dd), 2),
        win_rate=round(win_rate, 2),
        num_trades=len(trades),
        avg_return_pct=round(avg_return, 2),
        annualized_return_pct=None if annualized is None else round(float(annualized), 2),
        sharpe_ratio=None if sharpe is None else round(sharpe, 2),
        sortino_ratio=None if sortino is None else round(sortino, 2),
        beta=None if beta is None else round(beta, 2),
        total_fees_paid=round(total_fees_paid, 2),
    )
