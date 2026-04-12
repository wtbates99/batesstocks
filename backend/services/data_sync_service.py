from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

from backend.core.duckdb import duckdb_connection
from backend.models import SyncResponse

DEFAULT_UNIVERSE = [
    "SPY",
    "QQQ",
    "IWM",
    "AAPL",
    "MSFT",
    "NVDA",
    "AMZN",
    "META",
    "GOOGL",
    "TSLA",
    "JPM",
    "XOM",
]

LOOKBACK_BUFFER_DAYS = 60
YFINANCE_CACHE_DIR = Path("/tmp/yfinance-cache")

if hasattr(yf, "set_tz_cache_location"):
    YFINANCE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    yf.set_tz_cache_location(str(YFINANCE_CACHE_DIR))


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _normalize_tickers(tickers: list[str] | None) -> list[str]:
    values = tickers or DEFAULT_UNIVERSE
    return sorted({ticker.strip().upper() for ticker in values if ticker.strip()})


def has_market_data() -> bool:
    with duckdb_connection(read_only=True) as conn:
        row = conn.execute("SELECT COUNT(*) FROM ticker_data").fetchone()
    return bool(row and row[0] > 0)


def get_missing_tickers(tickers: list[str] | None = None) -> list[str]:
    universe = _normalize_tickers(tickers)
    if not universe:
        return []

    placeholders = ", ".join(["?"] * len(universe))
    with duckdb_connection(read_only=True) as conn:
        rows = conn.execute(
            f"""
            SELECT DISTINCT Ticker
            FROM ticker_data
            WHERE Ticker IN ({placeholders})
            """,
            universe,
        ).fetchall()
    present = {str(row[0]).upper() for row in rows}
    return [ticker for ticker in universe if ticker not in present]


def ensure_market_data(tickers: list[str] | None = None, years: int = 5) -> SyncResponse | None:
    missing = get_missing_tickers(tickers)
    if not missing:
        return None
    return sync_market_data(missing, years=years)


def _download_ohlcv(tickers: list[str], years: int) -> pd.DataFrame:
    start_date = (_utc_now() - timedelta(days=max(365 * years, 180))).date().isoformat()
    frame = yf.download(
        tickers=tickers,
        start=start_date,
        interval="1d",
        auto_adjust=False,
        group_by="ticker",
        progress=False,
        threads=True,
    )
    if frame is None or frame.empty:
        return pd.DataFrame()

    if len(tickers) == 1:
        ticker = tickers[0]
        flat = frame.reset_index()
        flat.insert(1, "Ticker", ticker)
    else:
        flat = (
            frame.stack(level=0, future_stack=True)
            .reset_index()
            .rename(columns={"level_1": "Ticker"})
        )

    rename_map = {
        "Date": "Date",
        "Open": "Open",
        "High": "High",
        "Low": "Low",
        "Close": "Close",
        "Adj Close": "AdjClose",
        "Volume": "Volume",
    }
    flat = flat.rename(columns=rename_map)
    keep = ["Date", "Ticker", "Open", "High", "Low", "Close", "AdjClose", "Volume"]
    flat = flat[[column for column in keep if column in flat.columns]].copy()
    flat["Date"] = pd.to_datetime(flat["Date"])
    flat["Ticker"] = flat["Ticker"].str.upper()
    for column in ["Open", "High", "Low", "Close", "AdjClose", "Volume"]:
        if column not in flat.columns:
            flat[column] = np.nan
    return flat.sort_values(["Ticker", "Date"]).reset_index(drop=True)


def _compute_indicator_frame(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return frame

    def per_ticker(group: pd.DataFrame) -> pd.DataFrame:
        ordered = group.sort_values("Date").copy()
        close = ordered["Close"].astype(float)
        high = ordered["High"].astype(float)
        low = ordered["Low"].astype(float)
        volume = ordered["Volume"].astype(float).fillna(0)

        delta = close.diff()
        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)
        avg_gain = gain.rolling(window=14, min_periods=14).mean()
        avg_loss = loss.rolling(window=14, min_periods=14).mean()
        rs = avg_gain / avg_loss.replace(0, np.nan)
        rsi = 100 - (100 / (1 + rs))

        ema_10 = close.ewm(span=10, adjust=False).mean()
        ema_12 = close.ewm(span=12, adjust=False).mean()
        ema_26 = close.ewm(span=26, adjust=False).mean()
        macd = ema_12 - ema_26
        macd_signal = macd.ewm(span=9, adjust=False).mean()
        macd_diff = macd - macd_signal

        sma_10 = close.rolling(window=10, min_periods=10).mean()
        sma_30 = close.rolling(window=30, min_periods=30).mean()
        bb_mid = close.rolling(window=20, min_periods=20).mean()
        bb_std = close.rolling(window=20, min_periods=20).std()
        bb_high = bb_mid + (bb_std * 2)
        bb_low = bb_mid - (bb_std * 2)
        bb_pband = (close - bb_low) / (bb_high - bb_low)

        typical_price = (high + low + close) / 3
        raw_money_flow = typical_price * volume
        positive_flow = raw_money_flow.where(typical_price >= typical_price.shift(1), 0.0)
        negative_flow = raw_money_flow.where(typical_price < typical_price.shift(1), 0.0)
        positive_sum = positive_flow.rolling(window=14, min_periods=14).sum()
        negative_sum = negative_flow.rolling(window=14, min_periods=14).sum()
        money_ratio = positive_sum / negative_sum.replace(0, np.nan)
        mfi = 100 - (100 / (1 + money_ratio))

        vwap = (typical_price * volume).rolling(window=14, min_periods=1).sum() / volume.rolling(
            window=14,
            min_periods=1,
        ).sum().replace(0, np.nan)

        tech_score = (
            rsi.clip(0, 100).fillna(50) * 0.30
            + ((macd > macd_signal).astype(float) * 100) * 0.25
            + ((close > sma_10).astype(float) * 100) * 0.20
            + bb_pband.clip(0, 1).fillna(0.5) * 100 * 0.15
            + mfi.clip(0, 100).fillna(50) * 0.10
        )

        ordered["Ticker_SMA_10"] = sma_10
        ordered["Ticker_EMA_10"] = ema_10
        ordered["Ticker_SMA_30"] = sma_30
        ordered["Ticker_EMA_30"] = close.ewm(span=30, adjust=False).mean()
        ordered["Ticker_RSI"] = rsi
        ordered["Ticker_MACD"] = macd
        ordered["Ticker_MACD_Signal"] = macd_signal
        ordered["Ticker_MACD_Diff"] = macd_diff
        ordered["Ticker_Bollinger_PBand"] = bb_pband
        ordered["Ticker_MFI"] = mfi
        ordered["Ticker_VWAP"] = vwap
        ordered["Ticker_Tech_Score"] = tech_score.round(2)
        return ordered

    computed = frame.groupby("Ticker", group_keys=False).apply(per_ticker)
    return computed.reset_index(drop=True)


def _fetch_company_metadata(tickers: list[str]) -> pd.DataFrame:
    def fetch_one(ticker: str) -> dict[str, object]:
        row: dict[str, object] = {"Ticker": ticker}
        try:
            info = yf.Ticker(ticker).info
            row.update(
                {
                    "FullName": info.get("longName") or info.get("shortName") or ticker,
                    "ShortName": info.get("shortName"),
                    "Sector": info.get("sector"),
                    "Subsector": info.get("industry"),
                    "MarketCap": info.get("marketCap"),
                    "Exchange": info.get("exchange"),
                    "Currency": info.get("currency"),
                    "Website": info.get("website"),
                    "QuoteType": info.get("quoteType"),
                }
            )
        except Exception:
            row["FullName"] = ticker
        return row

    with ThreadPoolExecutor(max_workers=min(8, max(1, len(tickers)))) as executor:
        rows = list(executor.map(fetch_one, tickers))
    return pd.DataFrame(rows)


def sync_market_data(tickers: list[str] | None = None, years: int = 5) -> SyncResponse:
    started_at = _utc_now()
    universe = _normalize_tickers(tickers)
    raw = _download_ohlcv(universe, years=years)
    if raw.empty:
        return SyncResponse(
            started_at=started_at.isoformat(),
            finished_at=_utc_now().isoformat(),
            tickers=universe,
            rows_written=0,
            metadata_rows=0,
        )

    indicator_frame = _compute_indicator_frame(raw)
    metadata = _fetch_company_metadata(universe)
    rows_written = 0

    with duckdb_connection() as conn:
        for ticker in universe:
            if ticker not in indicator_frame["Ticker"].values:
                continue

            subset = indicator_frame[indicator_frame["Ticker"] == ticker].copy()
            cutoff = subset["Date"].max() - pd.Timedelta(days=LOOKBACK_BUFFER_DAYS)
            subset = subset[subset["Date"] >= cutoff].copy()
            raw_subset = raw[(raw["Ticker"] == ticker) & (raw["Date"] >= cutoff)].copy()

            conn.register("raw_subset", raw_subset)
            conn.execute(
                "DELETE FROM ohlcv_daily WHERE Ticker = ? AND Date >= ?",
                [ticker, cutoff.to_pydatetime()],
            )
            conn.execute("INSERT INTO ohlcv_daily SELECT * FROM raw_subset")
            conn.unregister("raw_subset")

            write_subset = subset[
                [
                    "Date",
                    "Ticker",
                    "Open",
                    "High",
                    "Low",
                    "Close",
                    "Volume",
                    "Ticker_SMA_10",
                    "Ticker_EMA_10",
                    "Ticker_SMA_30",
                    "Ticker_EMA_30",
                    "Ticker_RSI",
                    "Ticker_MACD",
                    "Ticker_MACD_Signal",
                    "Ticker_MACD_Diff",
                    "Ticker_Bollinger_PBand",
                    "Ticker_MFI",
                    "Ticker_VWAP",
                    "Ticker_Tech_Score",
                ]
            ].copy()
            conn.register("ticker_subset", write_subset)
            conn.execute(
                "DELETE FROM ticker_data WHERE Ticker = ? AND Date >= ?",
                [ticker, cutoff.to_pydatetime()],
            )
            conn.execute("INSERT INTO ticker_data SELECT * FROM ticker_subset")
            conn.unregister("ticker_subset")
            rows_written += len(write_subset)

        if not metadata.empty:
            conn.register("metadata_frame", metadata)
            conn.execute("""
                INSERT OR REPLACE INTO stock_information
                SELECT
                    Ticker,
                    FullName,
                    ShortName,
                    Sector,
                    Subsector,
                    MarketCap,
                    Exchange,
                    Currency,
                    Website,
                    QuoteType
                FROM metadata_frame
            """)
            conn.unregister("metadata_frame")

    finished_at = _utc_now()
    return SyncResponse(
        started_at=started_at.isoformat(),
        finished_at=finished_at.isoformat(),
        tickers=universe,
        rows_written=rows_written,
        metadata_rows=len(metadata),
    )
