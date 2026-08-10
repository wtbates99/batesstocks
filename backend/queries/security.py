"""Security detail query — owns everything for the /terminal/security/{ticker} route."""

from __future__ import annotations

import pandas as pd

from backend.core.duckdb import duckdb_connection
from backend.models import (
    SecurityBar,
    SecurityOverview,
    SecuritySignal,
    SecuritySnapshot,
)
from backend.queries.common import load_focus_frame, row_to_mover, to_float, utc_now


def _load_security_bars(ticker: str, limit: int = 180) -> pd.DataFrame:
    with duckdb_connection(read_only=True) as conn:
        return conn.execute(
            """
            SELECT * EXCLUDE (sort_date)
            FROM (
                SELECT
                    Date,
                    Open,
                    High,
                    Low,
                    Close,
                    Volume,
                    Ticker_SMA_10,
                    Ticker_SMA_30,
                    Ticker_SMA_50,
                    Ticker_EMA_10,
                    Ticker_RSI,
                    Date AS sort_date
                FROM ticker_data
                WHERE Ticker = ?
                ORDER BY Date DESC
                LIMIT ?
            ) ranked
            ORDER BY sort_date
            """,
            [ticker.upper(), limit],
        ).df()


def get_security_overview(ticker: str, limit: int = 180) -> SecurityOverview:
    symbol = ticker.upper()
    with duckdb_connection(read_only=True) as conn:
        # Use v_latest_security which pre-computes change_pct, volume_ratio, and joins company info
        snapshot = conn.execute(
            """
            SELECT
                Ticker,
                FullName,
                Sector,
                Subsector,
                MarketCap,
                Close,
                Volume,
                Ticker_RSI,
                Ticker_Tech_Score,
                Ticker_MACD,
                Ticker_MACD_Signal,
                Ticker_Return_20D,
                Ticker_Return_63D,
                Ticker_Return_126D,
                Ticker_Return_252D,
                Ticker_SMA_10,
                Ticker_SMA_30,
                Ticker_SMA_200,
                Ticker_SMA_250,
                change_pct
            FROM v_latest_security
            WHERE Ticker = ?
            """,
            [symbol],
        ).fetchone()

        if snapshot is None:
            raise ValueError(f"No security data available for {symbol}")

        # Filter to the peer set before applying window functions. Querying the general
        # v_latest_security view here used to rank every historical row in the database
        # just to return eight related names.
        related = conn.execute(
            """
            WITH peers AS (
                SELECT Ticker, FullName
                FROM stock_information
                WHERE Sector = (SELECT Sector FROM stock_information WHERE Ticker = ?)
                  AND Ticker <> ?
            ), ranked AS (
                SELECT
                    td.Ticker,
                    td.Close,
                    td.Volume,
                    td.Ticker_Tech_Score,
                    LAG(td.Close) OVER (
                        PARTITION BY td.Ticker ORDER BY td.Date
                    ) AS prev_close,
                    ROW_NUMBER() OVER (
                        PARTITION BY td.Ticker ORDER BY td.Date DESC
                    ) AS rn
                FROM ticker_data td
                JOIN peers ON peers.Ticker = td.Ticker
            )
            SELECT
                peers.Ticker,
                peers.FullName,
                ranked.Close,
                ranked.Volume,
                ranked.Ticker_Tech_Score,
                CASE
                    WHEN ranked.prev_close IS NULL OR ranked.prev_close = 0 THEN NULL
                    ELSE ((ranked.Close / ranked.prev_close) - 1) * 100
                END AS change_pct
            FROM peers
            JOIN ranked ON ranked.Ticker = peers.Ticker AND ranked.rn = 1
            ORDER BY
                ranked.Ticker_Tech_Score DESC NULLS LAST,
                change_pct DESC NULLS LAST
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
            sma_10=to_float(row.get("Ticker_SMA_10")),
            sma_30=to_float(row.get("Ticker_SMA_30")),
            sma_50=to_float(row.get("Ticker_SMA_50")),
            ema_10=to_float(row.get("Ticker_EMA_10")),
            rsi=to_float(row.get("Ticker_RSI")),
        )
        for row in bars_frame.to_dict("records")
    ]

    snapshot_model = SecuritySnapshot(
        ticker=symbol,
        name=full_name,
        sector=sector,
        subsector=subsector,
        close=to_float(close),
        change_pct=to_float(change_pct),
        volume=to_float(volume),
        market_cap=to_float(market_cap),
        rsi=to_float(rsi),
        tech_score=to_float(tech_score),
        macd=to_float(macd),
        macd_signal=to_float(macd_signal),
        return_20d=to_float(return_20d),
        return_63d=to_float(return_63d),
        return_126d=to_float(return_126d),
        return_252d=to_float(return_252d),
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

    signals = _build_signals(snapshot_model)

    return SecurityOverview(
        generated_at=utc_now(),
        snapshot=snapshot_model,
        signals=signals,
        bars=bars,
        related=[row_to_mover(row) for row in related.to_dict("records")],
    )


def _build_signals(snap: SecuritySnapshot) -> list[SecuritySignal]:
    return [
        SecuritySignal(
            label="Tech Score",
            value="—" if snap.tech_score is None else f"{snap.tech_score:.0f}",
            tone="positive" if (snap.tech_score or 0) >= 65 else "warning",
        ),
        SecuritySignal(
            label="RSI",
            value="—" if snap.rsi is None else f"{snap.rsi:.1f}",
            tone="negative"
            if (snap.rsi or 50) >= 70
            else "positive"
            if (snap.rsi or 50) <= 30
            else "neutral",
        ),
        SecuritySignal(
            label="MACD Bias",
            value="Bullish"
            if snap.macd is not None
            and snap.macd_signal is not None
            and snap.macd > snap.macd_signal
            else "Bearish",
            tone="positive"
            if snap.macd is not None
            and snap.macd_signal is not None
            and snap.macd > snap.macd_signal
            else "negative",
        ),
        SecuritySignal(
            label="Trend",
            value="Above 200 / 250 DMA"
            if snap.above_sma_200 and snap.above_sma_250
            else "Below long-term trend",
            tone="positive" if snap.above_sma_200 and snap.above_sma_250 else "warning",
        ),
        SecuritySignal(
            label="52W Position",
            value="Near 52W High"
            if snap.return_252d is not None and snap.return_252d >= 0
            else "Below 52W Avg",
            tone="positive"
            if snap.return_252d is not None and snap.return_252d >= 0
            else "warning",
        ),
    ]


def get_security_focus_frame(
    ticker: str, start_date: str | None = None, end_date: str | None = None
) -> pd.DataFrame:
    """Expose load_focus_frame for use by other modules (e.g. backtest)."""
    return load_focus_frame(ticker, start_date=start_date, end_date=end_date)
