from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Lock

import numpy as np
import pandas as pd
import yfinance as yf

from backend.core.duckdb import duckdb_connection
from backend.models import SyncResponse
from backend.services.market_universe import normalize_universe
from backend.services.sync_status import sync_status_tracker

LOOKBACK_BUFFER_DAYS = 60
YFINANCE_CACHE_DIR = Path("/tmp/yfinance-cache")
DEFAULT_UNIVERSE_MIN_SIZE = 400
MIN_INDICATOR_LOOKBACK_YEARS = 2
_SYNC_WRITE_LOCK = Lock()
TICKER_DATA_COLUMNS = [
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
    "Ticker_SMA_50",
    "Ticker_SMA_100",
    "Ticker_SMA_200",
    "Ticker_SMA_250",
    "Ticker_EMA_50",
    "Ticker_EMA_100",
    "Ticker_EMA_200",
    "Ticker_Return_20D",
    "Ticker_Return_63D",
    "Ticker_Return_126D",
    "Ticker_Return_252D",
    "Ticker_52W_High",
    "Ticker_52W_Low",
    "Ticker_52W_Range_Pct",
    "Ticker_Avg_Volume_20D",
]

if hasattr(yf, "set_tz_cache_location"):
    YFINANCE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    yf.set_tz_cache_location(str(YFINANCE_CACHE_DIR))


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _normalize_tickers(tickers: list[str] | None) -> list[str]:
    return normalize_universe(tickers)


def _normalize_years(years: int) -> int:
    return max(int(years), MIN_INDICATOR_LOOKBACK_YEARS)


def has_market_data() -> bool:
    with duckdb_connection(read_only=True) as conn:
        row = conn.execute("SELECT COUNT(*) FROM ticker_data").fetchone()
    return bool(row and row[0] > 0)


def get_data_staleness_days() -> int | None:
    """Returns how many calendar days since the latest market data row, or None if no data."""
    with duckdb_connection(read_only=True) as conn:
        row = conn.execute("SELECT MAX(Date) FROM ticker_data").fetchone()
    if not row or row[0] is None:
        return None
    from datetime import date as _date

    latest = pd.to_datetime(row[0]).date()
    return (_date.today() - latest).days


def get_tracked_ticker_count() -> int:
    with duckdb_connection(read_only=True) as conn:
        row = conn.execute("SELECT COUNT(DISTINCT Ticker) FROM ticker_data").fetchone()
    return int(row[0]) if row and row[0] is not None else 0


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


def get_ticker_latest_dates(tickers: list[str] | None = None) -> dict[str, str]:
    """Return a mapping of ticker → ISO date string for the latest data row."""
    universe = _normalize_tickers(tickers) if tickers else []
    if universe:
        placeholders = ", ".join(["?"] * len(universe))
        query = f"""
            SELECT Ticker, MAX(Date)::TEXT AS latest
            FROM ticker_data
            WHERE Ticker IN ({placeholders})
            GROUP BY Ticker
        """
        params = universe
    else:
        query = "SELECT Ticker, MAX(Date)::TEXT AS latest FROM ticker_data GROUP BY Ticker"
        params = []
    with duckdb_connection(read_only=True) as conn:
        rows = conn.execute(query, params).fetchall()
    return {str(row[0]).upper(): str(row[1]) for row in rows if row[1] is not None}


def ensure_market_data(
    tickers: list[str] | None = None, years: int = 5, source: str = "hydrate"
) -> SyncResponse | None:
    missing = get_missing_tickers(tickers)
    if not missing:
        return None
    return sync_market_data(missing, years=_normalize_years(years), source=source)


def ensure_default_universe_data(years: int = 5) -> SyncResponse | None:
    if get_tracked_ticker_count() >= DEFAULT_UNIVERSE_MIN_SIZE:
        return None
    return ensure_market_data(None, years=_normalize_years(years), source="bootstrap")


def _download_ohlcv(tickers: list[str], years: int, start_date: str | None = None) -> pd.DataFrame:
    years = _normalize_years(years)
    if start_date is None:
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

    # yfinance now always returns a MultiIndex (Ticker, Price) regardless of ticker count.
    # stack(level=0) moves the Ticker level into the index, giving flat (Date, Ticker) rows.
    if isinstance(frame.columns, pd.MultiIndex):
        flat = frame.stack(level=0, future_stack=True).reset_index()
        # level name is already "Ticker" in recent yfinance versions
        if "Ticker" not in flat.columns and "level_1" in flat.columns:
            flat = flat.rename(columns={"level_1": "Ticker"})
    else:
        # Fallback for older yfinance that returned flat columns for single tickers
        flat = frame.reset_index()
        if len(tickers) == 1:
            flat.insert(1, "Ticker", tickers[0])

    flat = flat.rename(columns={"Adj Close": "AdjClose"})
    keep = ["Date", "Ticker", "Open", "High", "Low", "Close", "AdjClose", "Volume"]
    flat = flat[[col for col in keep if col in flat.columns]].copy()
    flat["Date"] = pd.to_datetime(flat["Date"])
    flat["Ticker"] = flat["Ticker"].astype(str).str.upper()
    for col in ["Open", "High", "Low", "Close", "AdjClose", "Volume"]:
        if col not in flat.columns:
            flat[col] = np.nan
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
        ema_30 = close.ewm(span=30, adjust=False).mean()
        ema_50 = close.ewm(span=50, adjust=False).mean()
        ema_100 = close.ewm(span=100, adjust=False).mean()
        ema_200 = close.ewm(span=200, adjust=False).mean()
        ema_12 = close.ewm(span=12, adjust=False).mean()
        ema_26 = close.ewm(span=26, adjust=False).mean()
        macd = ema_12 - ema_26
        macd_signal = macd.ewm(span=9, adjust=False).mean()
        macd_diff = macd - macd_signal

        sma_10 = close.rolling(window=10, min_periods=10).mean()
        sma_30 = close.rolling(window=30, min_periods=30).mean()
        sma_50 = close.rolling(window=50, min_periods=50).mean()
        sma_100 = close.rolling(window=100, min_periods=100).mean()
        sma_200 = close.rolling(window=200, min_periods=200).mean()
        sma_250 = close.rolling(window=250, min_periods=250).mean()
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

        avg_volume_20 = volume.rolling(window=20, min_periods=20).mean()
        return_20d = close.pct_change(periods=20, fill_method=None) * 100
        return_63d = close.pct_change(periods=63, fill_method=None) * 100
        return_126d = close.pct_change(periods=126, fill_method=None) * 100
        return_252d = close.pct_change(periods=252, fill_method=None) * 100
        high_52w = high.rolling(window=252, min_periods=20).max()
        low_52w = low.rolling(window=252, min_periods=20).min()
        range_52w = (close - low_52w) / (high_52w - low_52w)

        tech_score = (
            rsi.clip(0, 100).fillna(50) * 0.30
            + ((macd > macd_signal).astype(float) * 100) * 0.20
            + ((close > sma_50).astype(float) * 100) * 0.15
            + ((close > sma_200).astype(float) * 100) * 0.15
            + bb_pband.clip(0, 1).fillna(0.5) * 100 * 0.10
            + mfi.clip(0, 100).fillna(50) * 0.05
            + return_63d.clip(-25, 25).fillna(0).add(25) * 2
            + range_52w.clip(0, 1).fillna(0.5) * 5
        )

        ordered["Ticker_SMA_10"] = sma_10
        ordered["Ticker_EMA_10"] = ema_10
        ordered["Ticker_SMA_30"] = sma_30
        ordered["Ticker_SMA_50"] = sma_50
        ordered["Ticker_SMA_100"] = sma_100
        ordered["Ticker_SMA_200"] = sma_200
        ordered["Ticker_SMA_250"] = sma_250
        ordered["Ticker_EMA_30"] = ema_30
        ordered["Ticker_EMA_50"] = ema_50
        ordered["Ticker_EMA_100"] = ema_100
        ordered["Ticker_EMA_200"] = ema_200
        ordered["Ticker_RSI"] = rsi
        ordered["Ticker_MACD"] = macd
        ordered["Ticker_MACD_Signal"] = macd_signal
        ordered["Ticker_MACD_Diff"] = macd_diff
        ordered["Ticker_Bollinger_PBand"] = bb_pband
        ordered["Ticker_MFI"] = mfi
        ordered["Ticker_VWAP"] = vwap
        ordered["Ticker_Return_20D"] = return_20d
        ordered["Ticker_Return_63D"] = return_63d
        ordered["Ticker_Return_126D"] = return_126d
        ordered["Ticker_Return_252D"] = return_252d
        ordered["Ticker_52W_High"] = high_52w
        ordered["Ticker_52W_Low"] = low_52w
        ordered["Ticker_52W_Range_Pct"] = range_52w * 100
        ordered["Ticker_Avg_Volume_20D"] = avg_volume_20
        ordered["Ticker_Tech_Score"] = tech_score.round(2)
        return ordered

    computed = frame.groupby("Ticker", group_keys=False).apply(per_ticker)
    return computed.reset_index(drop=True)


def _prepare_ticker_data_frame(frame: pd.DataFrame) -> pd.DataFrame:
    return frame[TICKER_DATA_COLUMNS].copy()


def rebuild_indicator_cache(tickers: list[str] | None = None) -> int:
    universe = _normalize_tickers(tickers)

    # Read and compute outside the lock — indicator math is CPU-only, no DB needed.
    with duckdb_connection() as conn:
        raw = conn.execute(
            """
            SELECT Date, Ticker, Open, High, Low, Close, AdjClose, Volume
            FROM ohlcv_daily
            ORDER BY Ticker, Date
            """
        ).df()

    if raw.empty:
        return 0
    if universe:
        raw = raw[raw["Ticker"].isin(universe)].copy()
        if raw.empty:
            return 0

    indicator_frame = _compute_indicator_frame(raw)
    write_frame = _prepare_ticker_data_frame(indicator_frame)

    # Write phase — acquire lock only for the actual table swap.
    with duckdb_connection() as conn:
        conn.register("rebuilt_ticker_data", write_frame)
        if universe:
            placeholders = ", ".join(["?"] * len(universe))
            conn.execute("DROP TABLE IF EXISTS ticker_data_rebuilt")
            conn.execute(
                f"""
                CREATE TABLE ticker_data_rebuilt AS
                SELECT * FROM ticker_data
                WHERE Ticker NOT IN ({placeholders})
                """,
                universe,
            )
            conn.execute(
                f"""
                INSERT INTO ticker_data_rebuilt ({", ".join(TICKER_DATA_COLUMNS)})
                SELECT {", ".join(TICKER_DATA_COLUMNS)}
                FROM rebuilt_ticker_data
                """
            )
            conn.execute("DROP TABLE ticker_data")
            conn.execute("ALTER TABLE ticker_data_rebuilt RENAME TO ticker_data")
        else:
            conn.execute("DROP TABLE ticker_data")
            conn.execute(
                f"""
                CREATE TABLE ticker_data AS
                SELECT {", ".join(TICKER_DATA_COLUMNS)}
                FROM rebuilt_ticker_data
                """
            )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_ticker_data_ticker_date ON ticker_data (Ticker, Date)"
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_ticker_data_date ON ticker_data (Date)")
        conn.unregister("rebuilt_ticker_data")
    return len(write_frame)


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


# Sources that should use incremental (skip-fresh) logic instead of full re-download
_INCREMENTAL_SOURCES = frozenset({"scheduled", "startup"})
# Minimum indicator lookback needed for long-window indicators (SMA_250 = ~1 year)
_INDICATOR_LOOKBACK_DAYS = 270
# Tickers with data this many days old (or newer) are considered fresh and skipped
_FRESH_THRESHOLD_DAYS = 2


def sync_market_data(
    tickers: list[str] | None = None, years: int = 5, source: str = "manual"
) -> SyncResponse:
    years = _normalize_years(years)
    with _SYNC_WRITE_LOCK:
        started_at = _utc_now()
        universe = _normalize_tickers(tickers)

        # Incremental sources: skip already-fresh tickers and use a tight download window
        incremental_start: str | None = None
        if source in _INCREMENTAL_SOURCES and universe:
            fresh_cutoff = (_utc_now() - timedelta(days=_FRESH_THRESHOLD_DAYS)).date()
            latest_dates = get_ticker_latest_dates(universe)
            stale = [
                t
                for t in universe
                if pd.to_datetime(latest_dates.get(t, "2000-01-01")).date() < fresh_cutoff
            ]
            if not stale:
                sync_status_tracker.begin(
                    source=source, target_tickers=0, detail="All tickers are up to date."
                )
                sync_status_tracker.succeed(
                    rows_written=0, metadata_rows=0, detail="All tickers are up to date."
                )
                return SyncResponse(
                    started_at=started_at.isoformat(),
                    finished_at=_utc_now().isoformat(),
                    tickers=[],
                    rows_written=0,
                    metadata_rows=0,
                )
            universe = stale
            # Download only enough history to recompute long-window indicators correctly
            stale_dates = [pd.to_datetime(latest_dates[t]) for t in stale if t in latest_dates]
            if stale_dates:
                oldest_stale = min(stale_dates).date()
                incremental_start = (
                    oldest_stale - timedelta(days=_INDICATOR_LOOKBACK_DAYS)
                ).isoformat()

        sync_status_tracker.begin(
            source=source,
            target_tickers=len(universe),
            detail=f"Loading {len(universe)} tickers"
            + (
                f" (incremental from {incremental_start})"
                if incremental_start
                else f" with {years} years of history"
            ),
        )
        try:
            raw = _download_ohlcv(universe, years=years, start_date=incremental_start)
        except Exception as exc:
            sync_status_tracker.fail(f"Download failed: {exc}")
            raise

        if raw.empty:
            response = SyncResponse(
                started_at=started_at.isoformat(),
                finished_at=_utc_now().isoformat(),
                tickers=universe,
                rows_written=0,
                metadata_rows=0,
            )
            sync_status_tracker.succeed(
                rows_written=0,
                metadata_rows=0,
                detail="No new rows returned by the data provider.",
            )
            return response

        try:
            sync_status_tracker.update(
                phase="calculating",
                detail="Recomputing indicators and long-horizon trend metrics.",
            )
            indicator_frame = _compute_indicator_frame(raw)
        except Exception as exc:
            sync_status_tracker.fail(f"Indicator computation failed: {exc}")
            raise

        sync_status_tracker.update(
            phase="metadata",
            detail="Refreshing company and fund metadata.",
        )
        metadata = _fetch_company_metadata(universe)
        rows_written = 0

        try:
            # DuckDB has a known bug: DELETE on a table with secondary indexes can raise
            # "Failed to delete all rows from index" when the index was left in an
            # inconsistent state by a previously interrupted write (e.g. a container kill).
            # Fix: drop all secondary indexes before any DELETE so DuckDB only has to
            # maintain the heap. Rebuild the indexes once at the very end.
            with duckdb_connection() as conn:
                conn.execute("CHECKPOINT")  # flush WAL first
                conn.execute("DROP INDEX IF EXISTS idx_ticker_data_ticker_date")
                conn.execute("DROP INDEX IF EXISTS idx_ticker_data_date")
                conn.execute("DROP INDEX IF EXISTS idx_ohlcv_daily_ticker_date")

            # Write one ticker at a time — releases _CONN_LOCK between tickers so
            # API reads can proceed during the bulk sync (they just use table scans
            # without indexes until the rebuild at the end).
            for index, ticker in enumerate(universe, start=1):
                if ticker not in indicator_frame["Ticker"].values:
                    continue

                sync_status_tracker.update(
                    phase="writing",
                    detail=f"Writing {ticker} to local market cache.",
                    completed_tickers=index - 1,
                    rows_written=rows_written,
                )

                subset = indicator_frame[indicator_frame["Ticker"] == ticker].copy()
                cutoff = subset["Date"].max() - pd.Timedelta(days=LOOKBACK_BUFFER_DAYS)
                subset = subset[subset["Date"] >= cutoff].copy()
                raw_subset = raw[(raw["Ticker"] == ticker) & (raw["Date"] >= cutoff)].copy()
                write_subset = _prepare_ticker_data_frame(subset)

                with duckdb_connection() as conn:
                    conn.register("raw_subset", raw_subset)
                    conn.execute(
                        "DELETE FROM ohlcv_daily WHERE Ticker = ? AND Date >= ?",
                        [ticker, cutoff.to_pydatetime()],
                    )
                    conn.execute(
                        "INSERT INTO ohlcv_daily (Date, Ticker, Open, High, Low, Close, AdjClose, Volume)"
                        " SELECT Date, Ticker, Open, High, Low, Close, AdjClose, Volume FROM raw_subset"
                    )
                    conn.unregister("raw_subset")

                    conn.register("ticker_subset", write_subset)
                    conn.execute(
                        "DELETE FROM ticker_data WHERE Ticker = ? AND Date >= ?",
                        [ticker, cutoff.to_pydatetime()],
                    )
                    conn.execute(
                        f"""
                        INSERT INTO ticker_data ({", ".join(TICKER_DATA_COLUMNS)})
                        SELECT {", ".join(TICKER_DATA_COLUMNS)}
                        FROM ticker_subset
                        """
                    )
                    conn.unregister("ticker_subset")

                rows_written += len(write_subset)

            if not metadata.empty:
                sync_status_tracker.update(
                    phase="metadata",
                    detail="Writing refreshed metadata and sector mappings.",
                    completed_tickers=len(universe),
                    rows_written=rows_written,
                    metadata_rows=len(metadata),
                )
                with duckdb_connection() as conn:
                    conn.register("metadata_frame", metadata)
                    conn.execute("""
                        INSERT OR REPLACE INTO stock_information
                            (Ticker, FullName, ShortName, Sector, Subsector, MarketCap,
                             Exchange, Currency, Website, QuoteType)
                        SELECT
                            Ticker, FullName, ShortName, Sector, Subsector, MarketCap,
                            Exchange, Currency, Website, QuoteType
                        FROM metadata_frame
                    """)
                    conn.unregister("metadata_frame")

            # Rebuild the indexes now that all writes are complete.
            sync_status_tracker.update(
                phase="indexing",
                detail="Rebuilding indexes after write.",
                completed_tickers=len(universe),
                rows_written=rows_written,
            )
            with duckdb_connection() as conn:
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_ticker_data_ticker_date"
                    " ON ticker_data (Ticker, Date)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_ticker_data_date ON ticker_data (Date)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_ohlcv_daily_ticker_date"
                    " ON ohlcv_daily (Ticker, Date)"
                )

        except Exception as exc:
            sync_status_tracker.fail(str(exc))
            raise

        finished_at = _utc_now()
        response = SyncResponse(
            started_at=started_at.isoformat(),
            finished_at=finished_at.isoformat(),
            tickers=universe,
            rows_written=rows_written,
            metadata_rows=len(metadata),
        )
        sync_status_tracker.succeed(
            rows_written=rows_written,
            metadata_rows=len(metadata),
            detail=f"Wrote {rows_written:,} rows across {len(universe)} tickers.",
        )
        return response
