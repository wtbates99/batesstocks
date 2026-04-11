import datetime
from concurrent.futures import ThreadPoolExecutor

import duckdb
import numpy as np
import pandas as pd
import ta

# Lookback needed so rolling indicators are stable.
# SMA_250W has the longest window at 1250 trading days (~5 years).
_INDICATOR_LOOKBACK_DAYS = 1300

# Chunk size for full rebuilds — keeps peak RAM under ~1GB per batch.
_TICKER_CHUNK_SIZE = 100


def _calc_indicators(df: pd.DataFrame, prefix: str) -> pd.DataFrame:
    """Compute all technical indicators for a time-ordered OHLCV DataFrame.

    Must be called on a single-group (one ticker / sector / subsector) DataFrame
    so rolling windows never cross group boundaries.
    """
    close = df["Close"]
    high = df["High"]
    low = df["Low"]
    volume = df["Volume"]

    # Bollinger Bands with strict min_periods so warm-up is NaN, not skewed.
    _bb_win = 20
    _bb_dev = 2
    _bb_mean = close.rolling(window=_bb_win, min_periods=_bb_win).mean()
    _bb_std = close.rolling(window=_bb_win, min_periods=_bb_win).std()
    _bb_high = _bb_mean + _bb_dev * _bb_std
    _bb_low = _bb_mean - _bb_dev * _bb_std

    indicators = {
        f"{prefix}_SMA_10": ta.trend.sma_indicator(close, window=10),
        f"{prefix}_EMA_10": ta.trend.ema_indicator(close, window=10),
        f"{prefix}_SMA_30": ta.trend.sma_indicator(close, window=30),
        f"{prefix}_EMA_30": ta.trend.ema_indicator(close, window=30),
        f"{prefix}_SMA_200W": close.rolling(window=1000, min_periods=1000).mean(),
        f"{prefix}_SMA_250W": close.rolling(window=1250, min_periods=1250).mean(),
        f"{prefix}_RSI": ta.momentum.rsi(close, window=14),
        f"{prefix}_Stochastic_K": ta.momentum.stoch(high, low, close, window=14, smooth_window=3),
        f"{prefix}_Stochastic_D": ta.momentum.stoch_signal(
            high, low, close, window=14, smooth_window=3
        ),
        f"{prefix}_MACD": ta.trend.macd(close),
        f"{prefix}_MACD_Signal": ta.trend.macd_signal(close),
        f"{prefix}_MACD_Diff": ta.trend.macd_diff(close),
        f"{prefix}_TSI": ta.momentum.tsi(close),
        f"{prefix}_UO": ta.momentum.ultimate_oscillator(high, low, close),
        f"{prefix}_ROC": ta.momentum.roc(close, window=12),
        f"{prefix}_Williams_R": ta.momentum.williams_r(high, low, close, lbp=14),
        f"{prefix}_Bollinger_High": _bb_high,
        f"{prefix}_Bollinger_Low": _bb_low,
        f"{prefix}_Bollinger_Mid": _bb_mean,
        f"{prefix}_Bollinger_PBand": (close - _bb_low) / (_bb_high - _bb_low),
        f"{prefix}_Bollinger_WBand": (_bb_high - _bb_low) / _bb_mean,
        f"{prefix}_On_Balance_Volume": ta.volume.on_balance_volume(close, volume),
        f"{prefix}_Chaikin_MF": ta.volume.chaikin_money_flow(high, low, close, volume, window=20),
        f"{prefix}_Force_Index": ta.volume.force_index(close, volume, window=13),
        f"{prefix}_MFI": ta.volume.money_flow_index(high, low, close, volume, window=14),
    }

    typical_price = (high + low + close) / 3
    vwap_num = (typical_price * volume).rolling(window=14, min_periods=1).sum()
    vwap_den = volume.rolling(window=14, min_periods=1).sum()
    indicators[f"{prefix}_VWAP"] = vwap_num / vwap_den.replace(0, np.nan)

    return pd.DataFrame(indicators).replace([np.inf, -np.inf], np.nan).ffill().bfill()


def _add_tech_score(df: pd.DataFrame) -> pd.DataFrame:
    """Compute 0–100 composite technical score and add as Ticker_Tech_Score column."""
    rsi_score = df["Ticker_RSI"].clip(0, 100) / 100
    macd_score = (df["Ticker_MACD"] > df["Ticker_MACD_Signal"]).astype(float)
    sma_score = (df["Close"] > df["Ticker_SMA_10"]).astype(float)
    bb_score = df["Ticker_Bollinger_PBand"].clip(0, 1)
    mfi_score = df["Ticker_MFI"].clip(0, 100) / 100
    raw = (
        rsi_score * 0.25 + macd_score * 0.25 + sma_score * 0.20 + bb_score * 0.15 + mfi_score * 0.15
    )
    df = df.copy()
    df["Ticker_Tech_Score"] = (raw * 100).round(1).clip(0, 100)
    return df


def _ensure_ticker_data_table(conn: duckdb.DuckDBPyConnection) -> None:
    """Create ticker_data if it doesn't exist (first run before any data is written)."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ticker_data (
            Date TIMESTAMP, Ticker TEXT,
            Open DOUBLE, Close DOUBLE, High DOUBLE, Low DOUBLE, Volume DOUBLE,
            Ticker_SMA_10 DOUBLE, Ticker_EMA_10 DOUBLE,
            Ticker_SMA_30 DOUBLE, Ticker_EMA_30 DOUBLE,
            Ticker_SMA_200W DOUBLE, Ticker_SMA_250W DOUBLE,
            Ticker_RSI DOUBLE, Ticker_Stochastic_K DOUBLE, Ticker_Stochastic_D DOUBLE,
            Ticker_MACD DOUBLE, Ticker_MACD_Signal DOUBLE, Ticker_MACD_Diff DOUBLE,
            Ticker_TSI DOUBLE, Ticker_UO DOUBLE, Ticker_ROC DOUBLE, Ticker_Williams_R DOUBLE,
            Ticker_Bollinger_High DOUBLE, Ticker_Bollinger_Low DOUBLE,
            Ticker_Bollinger_Mid DOUBLE, Ticker_Bollinger_PBand DOUBLE,
            Ticker_Bollinger_WBand DOUBLE,
            Ticker_On_Balance_Volume DOUBLE, Ticker_Chaikin_MF DOUBLE,
            Ticker_Force_Index DOUBLE, Ticker_MFI DOUBLE,
            Ticker_VWAP DOUBLE, Ticker_Tech_Score DOUBLE
        )
    """)


def _add_ticker_data_indexes(conn: duckdb.DuckDBPyConnection) -> None:
    """Ensure ticker_data is indexed after writes."""
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ticker_data_ticker_date ON ticker_data (Ticker, Date)"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ticker_data_date ON ticker_data (Date)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ticker_data_ticker ON ticker_data (Ticker)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_stock_data_ticker ON stock_data (Ticker)")


def _write_df_to_table(
    conn: duckdb.DuckDBPyConnection, df: pd.DataFrame, table: str, mode: str = "replace"
) -> None:
    """Write a DataFrame to a DuckDB table (replace or append)."""
    conn.register("_tmp_df", df)
    if mode == "replace":
        conn.execute(f"CREATE OR REPLACE TABLE {table} AS SELECT * FROM _tmp_df")
    else:
        conn.execute(f"INSERT INTO {table} SELECT * FROM _tmp_df")
    conn.unregister("_tmp_df")


def process_stock_data(conn: duckdb.DuckDBPyConnection) -> None:
    """Full rebuild: compute indicators for all tickers/sectors/subsectors.

    Processes tickers in chunks of _TICKER_CHUNK_SIZE to keep peak RAM under ~1GB.
    Tech scores are computed inline — no second pass over the table.
    """

    # ── Ticker data (chunked) ─────────────────────────────────────────────────
    all_tickers = [
        r[0]
        for r in conn.execute("SELECT DISTINCT Ticker FROM stock_data ORDER BY Ticker").fetchall()
    ]

    first_chunk = True
    for i in range(0, len(all_tickers), _TICKER_CHUNK_SIZE):
        chunk = all_tickers[i : i + _TICKER_CHUNK_SIZE]
        placeholders = ", ".join(f"'{t}'" for t in chunk)
        df_raw = conn.execute(f"""
            SELECT Date, Ticker,
                AVG(Open)   AS Open,
                AVG(Close)  AS Close,
                AVG(High)   AS High,
                AVG(Low)    AS Low,
                SUM(Volume) AS Volume
            FROM stock_data
            WHERE Ticker IN ({placeholders})
            GROUP BY Ticker, Date
            ORDER BY Ticker, Date
        """).df()

        df_raw["Date"] = pd.to_datetime(df_raw["Date"])
        parts = []
        for _, grp in df_raw.groupby("Ticker", sort=False):
            grp = grp.sort_values("Date").reset_index(drop=True)
            inds = _calc_indicators(grp, "Ticker")
            combined = pd.concat([grp, inds], axis=1)
            combined = _add_tech_score(combined)
            parts.append(combined)

        if not parts:
            continue

        chunk_df = pd.concat(parts, ignore_index=True)
        mode = "replace" if first_chunk else "append"
        _write_df_to_table(conn, chunk_df, "ticker_data", mode=mode)
        first_chunk = False
        del df_raw, parts, chunk_df

    # ── Sector data ───────────────────────────────────────────────────────────
    _process_aggregate(conn, "sector_data", "Sector", "Sector")

    # ── Subsector data ────────────────────────────────────────────────────────
    _process_aggregate(conn, "subsector_data", "Subsector", "Subsector")

    # ── Rebuild view and indexes ──────────────────────────────────────────────
    _create_combined_view(conn)
    _add_ticker_data_indexes(conn)


def _process_aggregate(
    conn: duckdb.DuckDBPyConnection, table: str, group_col: str, prefix: str
) -> None:
    """Compute and write aggregate (sector / subsector) indicator data."""
    join_col = "GICS Sector" if group_col == "Sector" else "GICS Sub-Industry"
    df_raw = conn.execute(f"""
        SELECT sd.Date, si.{group_col},
            AVG(sd.Open)   AS Open,
            AVG(sd.Close)  AS Close,
            AVG(sd.High)   AS High,
            AVG(sd.Low)    AS Low,
            SUM(sd.Volume) AS Volume
        FROM stock_data sd
        JOIN stock_information si ON sd.Ticker = si.Ticker
        GROUP BY si.{group_col}, sd.Date
        ORDER BY si.{group_col}, sd.Date
    """).df()

    df_raw["Date"] = pd.to_datetime(df_raw["Date"])
    parts = []
    for _, grp in df_raw.groupby(group_col, sort=False):
        grp = grp.sort_values("Date").reset_index(drop=True)
        inds = _calc_indicators(grp, prefix)
        parts.append(pd.concat([grp, inds], axis=1))

    if parts:
        result = pd.concat(parts, ignore_index=True)
        _write_df_to_table(conn, result, table, mode="replace")


def _create_combined_view(conn: duckdb.DuckDBPyConnection) -> None:
    conn.execute("DROP VIEW IF EXISTS combined_stock_data")
    conn.execute("""
    CREATE VIEW combined_stock_data AS
    SELECT
        t.Date,
        t.Ticker,
        t.Open  AS Ticker_Open,
        t.Close AS Ticker_Close,
        t.High  AS Ticker_High,
        t.Low   AS Ticker_Low,
        t.Volume AS Ticker_Volume,
        t.Ticker_SMA_10, t.Ticker_EMA_10, t.Ticker_SMA_30, t.Ticker_EMA_30,
        t.Ticker_SMA_200W, t.Ticker_SMA_250W,
        t.Ticker_RSI, t.Ticker_Stochastic_K, t.Ticker_Stochastic_D,
        t.Ticker_MACD, t.Ticker_MACD_Signal, t.Ticker_MACD_Diff,
        t.Ticker_TSI, t.Ticker_UO, t.Ticker_ROC, t.Ticker_Williams_R,
        t.Ticker_Bollinger_High, t.Ticker_Bollinger_Low, t.Ticker_Bollinger_Mid,
        t.Ticker_Bollinger_PBand, t.Ticker_Bollinger_WBand,
        t.Ticker_On_Balance_Volume, t.Ticker_Chaikin_MF,
        t.Ticker_Force_Index, t.Ticker_MFI,
        t.Ticker_VWAP, t.Ticker_Tech_Score,
        s.Open   AS Sector_Open, s.Close  AS Sector_Close,
        s.High   AS Sector_High, s.Low    AS Sector_Low, s.Volume AS Sector_Volume,
        s.Sector_SMA_10, s.Sector_EMA_10, s.Sector_SMA_30, s.Sector_EMA_30,
        s.Sector_RSI, s.Sector_Stochastic_K, s.Sector_Stochastic_D,
        s.Sector_MACD, s.Sector_MACD_Signal, s.Sector_MACD_Diff,
        s.Sector_TSI, s.Sector_UO, s.Sector_ROC, s.Sector_Williams_R,
        s.Sector_Bollinger_High, s.Sector_Bollinger_Low, s.Sector_Bollinger_Mid,
        s.Sector_Bollinger_PBand, s.Sector_Bollinger_WBand,
        s.Sector_On_Balance_Volume, s.Sector_Chaikin_MF,
        s.Sector_Force_Index, s.Sector_MFI,
        ss.Open   AS Subsector_Open, ss.Close  AS Subsector_Close,
        ss.High   AS Subsector_High, ss.Low    AS Subsector_Low,
        ss.Volume AS Subsector_Volume,
        ss.Subsector_SMA_10, ss.Subsector_EMA_10, ss.Subsector_SMA_30, ss.Subsector_EMA_30,
        ss.Subsector_RSI, ss.Subsector_Stochastic_K, ss.Subsector_Stochastic_D,
        ss.Subsector_MACD, ss.Subsector_MACD_Signal, ss.Subsector_MACD_Diff,
        ss.Subsector_TSI, ss.Subsector_UO, ss.Subsector_ROC, ss.Subsector_Williams_R,
        ss.Subsector_Bollinger_High, ss.Subsector_Bollinger_Low, ss.Subsector_Bollinger_Mid,
        ss.Subsector_Bollinger_PBand, ss.Subsector_Bollinger_WBand,
        ss.Subsector_On_Balance_Volume, ss.Subsector_Chaikin_MF,
        ss.Subsector_Force_Index, ss.Subsector_MFI,
        si.Sector, si.Subsector, si.FullName, si.MarketCap, si.Country, si.Website,
        si.Description, si.CEO, si.Employees, si.City, si.State, si.Zip,
        si.Address, si.Phone, si.Exchange, si.Currency, si.QuoteType, si.ShortName,
        si.Price, si."52WeekHigh", si."52WeekLow",
        si.DividendRate, si.DividendYield, si.PayoutRatio, si.Beta,
        si.PE, si.EPS, si.Revenue, si.GrossProfit, si.FreeCashFlow
    FROM ticker_data t
    JOIN stock_information si ON t.Ticker = si.Ticker
    JOIN sector_data    s  ON t.Date = s.Date    AND si.Sector    = s.Sector
    JOIN subsector_data ss ON t.Date = ss.Date   AND si.Subsector = ss.Subsector
    """)


def update_today_indicators(conn: duckdb.DuckDBPyConnection) -> None:
    """Fast incremental update: only recompute today's indicator row per ticker.

    Uses the last _INDICATOR_LOOKBACK_DAYS of OHLCV data as a rolling window so
    all indicators are accurate, but only writes today's rows to ticker_data.
    This is ~20x faster than a full process_stock_data() call.
    """
    import pytz as _pytz

    _et = _pytz.timezone("US/Eastern")
    today = datetime.datetime.now(_et).date().isoformat()
    cutoff = (datetime.date.today() - datetime.timedelta(days=_INDICATOR_LOOKBACK_DAYS)).isoformat()

    df_raw = conn.execute(
        """
        SELECT sd.Date, sd.Ticker,
            AVG(sd.Open)   AS Open,
            AVG(sd.Close)  AS Close,
            AVG(sd.High)   AS High,
            AVG(sd.Low)    AS Low,
            SUM(sd.Volume) AS Volume
        FROM stock_data sd
        WHERE sd.Date >= ?
        GROUP BY sd.Ticker, sd.Date
        ORDER BY sd.Ticker, sd.Date
    """,
        [cutoff],
    ).df()

    if df_raw.empty:
        return

    df_raw["Date"] = pd.to_datetime(df_raw["Date"])
    today_ts = pd.Timestamp(today)
    groups = [(ticker, grp) for ticker, grp in df_raw.groupby("Ticker")]

    def _compute_one(ticker_grp):
        _, grp = ticker_grp
        grp = grp.sort_values("Date").reset_index(drop=True)
        if today_ts not in grp["Date"].values:
            return None
        indicators = _calc_indicators(grp, "Ticker")
        result = pd.concat([grp, indicators], axis=1)
        result = _add_tech_score(result)
        today_slice = result[result["Date"] == today_ts]
        return today_slice if not today_slice.empty else None

    with ThreadPoolExecutor(max_workers=8) as pool:
        today_rows = [r for r in pool.map(_compute_one, groups) if r is not None]

    if not today_rows:
        return

    new_rows = pd.concat(today_rows, ignore_index=True)
    new_rows = new_rows[new_rows["Close"].notna()]
    if new_rows.empty:
        return

    tickers_with_data = new_rows["Ticker"].tolist()
    placeholders = ", ".join(f"'{t}'" for t in tickers_with_data)
    conn.execute(f"DELETE FROM ticker_data WHERE Date >= ? AND Ticker IN ({placeholders})", [today])
    conn.register("_today_rows", new_rows)
    conn.execute("INSERT INTO ticker_data SELECT * FROM _today_rows")
    conn.unregister("_today_rows")


def update_today_sector_subsector(conn: duckdb.DuckDBPyConnection) -> None:
    """Incremental update: compute today's sector and subsector aggregate rows."""
    import pytz as _pytz

    _et = _pytz.timezone("US/Eastern")
    today = datetime.datetime.now(_et).date().isoformat()
    cutoff = (datetime.date.today() - datetime.timedelta(days=_INDICATOR_LOOKBACK_DAYS)).isoformat()

    df_sector = conn.execute(
        """
        SELECT sd.Date, si.Sector,
            AVG(sd.Open)   AS Open,
            AVG(sd.Close)  AS Close,
            AVG(sd.High)   AS High,
            AVG(sd.Low)    AS Low,
            SUM(sd.Volume) AS Volume
        FROM stock_data sd
        JOIN stock_information si ON sd.Ticker = si.Ticker
        WHERE sd.Date >= ?
        GROUP BY si.Sector, sd.Date
        ORDER BY si.Sector, sd.Date
    """,
        [cutoff],
    ).df()

    df_sub = conn.execute(
        """
        SELECT sd.Date, si.Subsector,
            AVG(sd.Open)   AS Open,
            AVG(sd.Close)  AS Close,
            AVG(sd.High)   AS High,
            AVG(sd.Low)    AS Low,
            SUM(sd.Volume) AS Volume
        FROM stock_data sd
        JOIN stock_information si ON sd.Ticker = si.Ticker
        WHERE sd.Date >= ?
        GROUP BY si.Subsector, sd.Date
        ORDER BY si.Subsector, sd.Date
    """,
        [cutoff],
    ).df()

    def _compute_today(group_col: str, df_agg: pd.DataFrame, prefix: str):
        if df_agg.empty:
            return None
        df_agg = df_agg.copy()
        df_agg["Date"] = pd.to_datetime(df_agg["Date"])
        today_ts = pd.Timestamp(today)
        groups = [(name, grp) for name, grp in df_agg.groupby(group_col)]

        def _one(name_grp):
            _, grp = name_grp
            grp = grp.sort_values("Date").reset_index(drop=True)
            if today_ts not in grp["Date"].values:
                return None
            indicators = _calc_indicators(grp, prefix)
            result = pd.concat([grp, indicators], axis=1)
            today_slice = result[result["Date"] == today_ts]
            return today_slice if not today_slice.empty else None

        with ThreadPoolExecutor(max_workers=4) as pool:
            rows = [r for r in pool.map(_one, groups) if r is not None]
        return pd.concat(rows, ignore_index=True) if rows else None

    sector_today = _compute_today("Sector", df_sector, "Sector")
    subsector_today = _compute_today("Subsector", df_sub, "Subsector")

    if sector_today is not None and not sector_today.empty:
        sector_today = sector_today[sector_today["Close"].notna()]
        if not sector_today.empty:
            conn.execute("DELETE FROM sector_data WHERE Date >= ?", [today])
            conn.register("_sect", sector_today)
            conn.execute("INSERT INTO sector_data SELECT * FROM _sect")
            conn.unregister("_sect")

    if subsector_today is not None and not subsector_today.empty:
        subsector_today = subsector_today[subsector_today["Close"].notna()]
        if not subsector_today.empty:
            conn.execute("DELETE FROM subsector_data WHERE Date >= ?", [today])
            conn.register("_sub", subsector_today)
            conn.execute("INSERT INTO subsector_data SELECT * FROM _sub")
            conn.unregister("_sub")


def detect_patterns(conn: duckdb.DuckDBPyConnection) -> None:
    """Detect chart patterns for all tickers using last 90 days of data."""
    try:
        conn.execute("SELECT 1 FROM ticker_data LIMIT 1").fetchone()
    except Exception:
        return

    import pytz as _pytz

    _et = _pytz.timezone("US/Eastern")
    today_str = datetime.datetime.now(_et).date().isoformat()
    cutoff = (datetime.date.today() - datetime.timedelta(days=90)).isoformat()

    try:
        df_all = conn.execute(
            "SELECT Ticker, Date, Close, High, Low FROM ticker_data "
            "WHERE Date >= ? ORDER BY Ticker, Date",
            [cutoff],
        ).df()
    except Exception:
        return

    results = []
    for ticker, df in df_all.groupby("Ticker"):
        df = df.sort_values("Date").reset_index(drop=True)
        if len(df) < 20:
            continue
        closes = df["Close"].values.astype(float)
        highs = df["High"].values.astype(float)
        lows = df["Low"].values.astype(float)
        n = len(df)

        pivot_h_idx = [i for i in range(2, n - 2) if highs[i] == max(highs[max(0, i - 2) : i + 3])]
        pivot_l_idx = [i for i in range(2, n - 2) if lows[i] == min(lows[max(0, i - 2) : i + 3])]

        for i in pivot_h_idx[-4:]:
            results.append(
                (ticker, today_str, "resistance", float(highs[i]), 0.70, f"pivot high idx={i}")
            )
        for i in pivot_l_idx[-4:]:
            results.append(
                (ticker, today_str, "support", float(lows[i]), 0.70, f"pivot low idx={i}")
            )

        if len(pivot_h_idx) >= 2:
            h1i, h2i = pivot_h_idx[-2], pivot_h_idx[-1]
            if abs(highs[h1i] - highs[h2i]) / max(highs[h1i], 1) < 0.03:
                trough = float(min(closes[h1i : h2i + 1]))
                if closes[-1] < trough:
                    results.append(
                        (
                            ticker,
                            today_str,
                            "double_top",
                            float(highs[h1i]),
                            0.80,
                            f"neckline={trough:.2f}",
                        )
                    )

        if len(pivot_l_idx) >= 2:
            l1i, l2i = pivot_l_idx[-2], pivot_l_idx[-1]
            if abs(lows[l1i] - lows[l2i]) / max(lows[l1i], 1) < 0.03:
                peak = float(max(closes[l1i : l2i + 1]))
                if closes[-1] > peak:
                    results.append(
                        (
                            ticker,
                            today_str,
                            "double_bottom",
                            float(lows[l1i]),
                            0.80,
                            f"neckline={peak:.2f}",
                        )
                    )

    if results:
        affected = list({r[0] for r in results})
        placeholders = ", ".join(f"'{t}'" for t in affected)
        try:
            conn.execute(
                f"DELETE FROM pattern_signals WHERE detected_at=? AND ticker IN ({placeholders})",
                [today_str],
            )
            conn.executemany(
                "INSERT INTO pattern_signals "
                "(ticker, detected_at, pattern_type, level, confidence, notes) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                results,
            )
        except Exception as e:
            import logging

            logging.getLogger(__name__).error("detect_patterns insert error: %s", e)
