"""Strategy evaluation — shared logic for screener and backtest modules."""

from __future__ import annotations

import pandas as pd

from backend.models import StrategyDefinition, StrategyMatch
from backend.queries.common import load_screen_frame, to_float

SUPPORTED_CONDITIONS = {"above", "below", "crosses_above", "crosses_below"}
SUPPORTED_OPERATORS = {"and", "or"}


def resolve_threshold(
    frame: pd.DataFrame, metric: str | None, threshold: float | None
) -> pd.Series:
    if metric:
        if metric not in frame.columns:
            raise ValueError(f"Unsupported comparison metric: {metric}")
        return frame[metric]
    if threshold is None:
        raise ValueError("Strategy leg requires either threshold or compare_to_metric")
    return pd.Series(threshold, index=frame.index, dtype="float64")


def evaluate_leg(
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


def evaluate_rule(frame: pd.DataFrame, leg: object) -> pd.Series:
    threshold = resolve_threshold(
        frame,
        getattr(leg, "compare_to_metric", None),
        getattr(leg, "threshold", None),
    )
    return evaluate_leg(
        frame,
        getattr(leg, "metric"),
        getattr(leg, "condition"),
        threshold,
    ).fillna(False)


def combine_rule_stack(
    frame: pd.DataFrame,
    base_leg: object,
    filters: list,
    operator: str,
) -> pd.Series:
    op = operator.lower()
    if op not in SUPPORTED_OPERATORS:
        raise ValueError(f"Unsupported logical operator: {operator}")

    signals = [evaluate_rule(frame, base_leg)]
    signals.extend(evaluate_rule(frame, rule) for rule in filters)
    combined = signals[0].copy()
    for signal in signals[1:]:
        combined = combined & signal if op == "and" else combined | signal
    return combined.fillna(False)


def trade_cost_rate(strategy: StrategyDefinition) -> float:
    fee_rate = max(strategy.fee_bps, 0.0) / 10000.0
    slippage_rate = max(strategy.slippage_bps, 0.0) / 10000.0
    return fee_rate + slippage_rate


def evaluate_strategy_matches(
    frame: pd.DataFrame, strategy: StrategyDefinition
) -> list[StrategyMatch]:
    if frame.empty:
        return []

    ordered = frame.sort_values(["Ticker", "Date"]).copy()
    candidates: list[dict[str, object]] = []

    for ticker, ticker_frame in ordered.groupby("Ticker", sort=False):
        if ticker_frame.empty:
            continue

        entry_signal = combine_rule_stack(
            ticker_frame,
            strategy.entry,
            strategy.entry_filters,
            strategy.entry_operator,
        )
        if not bool(entry_signal.iloc[-1]):
            continue

        signal_state = "entry"
        exit_signal = combine_rule_stack(
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
    return [
        StrategyMatch(
            ticker=row["Ticker"],
            name=row.get("FullName"),
            sector=row.get("Sector"),
            last_price=to_float(row.get("Close")),
            rsi=to_float(row.get("Ticker_RSI")),
            tech_score=to_float(row.get("Ticker_Tech_Score")),
            signal_state=str(row.get("signal_state") or "entry"),
        )
        for _, row in matched.iterrows()
    ]


def screen_strategy(strategy: StrategyDefinition) -> list[StrategyMatch]:
    return evaluate_strategy_matches(load_screen_frame(strategy.universe), strategy)
