import datetime
import sqlite3
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pandas as pd
import ta

# Lookback needed so rolling indicators (TSI=38, SMA30=30, BB20=20) are stable
_INDICATOR_LOOKBACK_DAYS = 90


def _calc_indicators(df: pd.DataFrame, prefix: str) -> pd.DataFrame:
    """Compute all technical indicators for a time-ordered OHLCV DataFrame."""
    close = df["Close"]
    high = df["High"]
    low = df["Low"]
    volume = df["Volume"]

    indicators = {
        f"{prefix}_SMA_10": ta.trend.sma_indicator(close, window=10),
        f"{prefix}_EMA_10": ta.trend.ema_indicator(close, window=10),
        f"{prefix}_SMA_30": ta.trend.sma_indicator(close, window=30),
        f"{prefix}_EMA_30": ta.trend.ema_indicator(close, window=30),
        f"{prefix}_RSI": ta.momentum.rsi(close, window=14),
        f"{prefix}_Stochastic_K": ta.momentum.stoch(
            high, low, close, window=14, smooth_window=3
        ),
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
        f"{prefix}_Bollinger_High": ta.volatility.bollinger_hband(
            close, window=20, window_dev=2
        ),
        f"{prefix}_Bollinger_Low": ta.volatility.bollinger_lband(
            close, window=20, window_dev=2
        ),
        f"{prefix}_Bollinger_Mid": ta.volatility.bollinger_mavg(close, window=20),
        f"{prefix}_Bollinger_PBand": ta.volatility.bollinger_pband(
            close, window=20, window_dev=2
        ),
        f"{prefix}_Bollinger_WBand": ta.volatility.bollinger_wband(
            close, window=20, window_dev=2
        ),
        f"{prefix}_On_Balance_Volume": ta.volume.on_balance_volume(close, volume),
        f"{prefix}_Chaikin_MF": ta.volume.chaikin_money_flow(
            high, low, close, volume, window=20
        ),
        f"{prefix}_Force_Index": ta.volume.force_index(close, volume, window=13),
        f"{prefix}_MFI": ta.volume.money_flow_index(high, low, close, volume, window=14),
    }

    typical_price = (high + low + close) / 3
    vwap_num = (typical_price * volume).rolling(window=14, min_periods=1).sum()
    vwap_den = volume.rolling(window=14, min_periods=1).sum()
    indicators[f"{prefix}_VWAP"] = vwap_num / vwap_den.replace(0, np.nan)

    return pd.DataFrame(indicators).replace([np.inf, -np.inf], np.nan).ffill()


def _add_ticker_data_indexes(conn: sqlite3.Connection):
    """Ensure ticker_data is always indexed after writes (to_sql replace drops them)."""
    conn.executescript("""
        CREATE INDEX IF NOT EXISTS idx_ticker_data_ticker_date ON ticker_data (Ticker, Date);
        CREATE INDEX IF NOT EXISTS idx_ticker_data_date        ON ticker_data (Date);
        CREATE INDEX IF NOT EXISTS idx_ticker_data_ticker      ON ticker_data (Ticker);
        CREATE INDEX IF NOT EXISTS idx_stock_data_ticker       ON stock_data  (Ticker);
    """)
    conn.commit()


def process_stock_data(conn: sqlite3.Connection):
    def process_data(query: str, table_name: str, prefix: str):
        df = pd.read_sql_query(query, conn)
        df["Date"] = pd.to_datetime(df["Date"])
        indicators_df = _calc_indicators(df, prefix)
        result_df = pd.concat([df, indicators_df], axis=1)
        result_df.to_sql(table_name, conn, if_exists="replace", index=False)

    def create_combined_view():
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
            t.Ticker_RSI, t.Ticker_Stochastic_K, t.Ticker_Stochastic_D,
            t.Ticker_MACD, t.Ticker_MACD_Signal, t.Ticker_MACD_Diff,
            t.Ticker_TSI, t.Ticker_UO, t.Ticker_ROC, t.Ticker_Williams_R,
            t.Ticker_Bollinger_High, t.Ticker_Bollinger_Low, t.Ticker_Bollinger_Mid,
            t.Ticker_Bollinger_PBand, t.Ticker_Bollinger_WBand,
            t.Ticker_On_Balance_Volume, t.Ticker_Chaikin_MF, t.Ticker_Force_Index, t.Ticker_MFI,
            t.Ticker_VWAP, t.Ticker_Tech_Score,
            s.Open   AS Sector_Open,
            s.Close  AS Sector_Close,
            s.High   AS Sector_High,
            s.Low    AS Sector_Low,
            s.Volume AS Sector_Volume,
            s.Sector_SMA_10, s.Sector_EMA_10, s.Sector_SMA_30, s.Sector_EMA_30,
            s.Sector_RSI, s.Sector_Stochastic_K, s.Sector_Stochastic_D,
            s.Sector_MACD, s.Sector_MACD_Signal, s.Sector_MACD_Diff,
            s.Sector_TSI, s.Sector_UO, s.Sector_ROC, s.Sector_Williams_R,
            s.Sector_Bollinger_High, s.Sector_Bollinger_Low, s.Sector_Bollinger_Mid,
            s.Sector_Bollinger_PBand, s.Sector_Bollinger_WBand,
            s.Sector_On_Balance_Volume, s.Sector_Chaikin_MF, s.Sector_Force_Index, s.Sector_MFI,
            ss.Open   AS Subsector_Open,
            ss.Close  AS Subsector_Close,
            ss.High   AS Subsector_High,
            ss.Low    AS Subsector_Low,
            ss.Volume AS Subsector_Volume,
            ss.Subsector_SMA_10, ss.Subsector_EMA_10, ss.Subsector_SMA_30, ss.Subsector_EMA_30,
            ss.Subsector_RSI, ss.Subsector_Stochastic_K, ss.Subsector_Stochastic_D,
            ss.Subsector_MACD, ss.Subsector_MACD_Signal, ss.Subsector_MACD_Diff,
            ss.Subsector_TSI, ss.Subsector_UO, ss.Subsector_ROC, ss.Subsector_Williams_R,
            ss.Subsector_Bollinger_High, ss.Subsector_Bollinger_Low, ss.Subsector_Bollinger_Mid,
            ss.Subsector_Bollinger_PBand, ss.Subsector_Bollinger_WBand,
            ss.Subsector_On_Balance_Volume, ss.Subsector_Chaikin_MF, ss.Subsector_Force_Index, ss.Subsector_MFI,
            si.Sector, si.Subsector, si.FullName, si.MarketCap, si.Country, si.Website,
            si.Description, si.CEO, si.Employees, si.City, si.State, si.Zip, si.Address, si.Phone,
            si.Exchange, si.Currency, si.QuoteType, si.ShortName, si.Price,
            si."52WeekHigh", si."52WeekLow",
            si.DividendRate, si.DividendYield, si.PayoutRatio, si.Beta,
            si.PE, si.EPS, si.Revenue, si.GrossProfit, si.FreeCashFlow
        FROM ticker_data t
        JOIN stock_information si ON t.Ticker = si.Ticker
        JOIN sector_data    s  ON t.Date = s.Date    AND si.Sector    = s.Sector
        JOIN subsector_data ss ON t.Date = ss.Date   AND si.Subsector = ss.Subsector
        """)
        conn.commit()

    # Per-ticker: one OHLCV row per (Ticker, Date)
    ticker_query = """
    SELECT sd.Date, sd.Ticker,
        AVG(sd.Open)   AS Open,
        AVG(sd.Close)  AS Close,
        AVG(sd.High)   AS High,
        AVG(sd.Low)    AS Low,
        SUM(sd.Volume) AS Volume
    FROM stock_data sd
    GROUP BY sd.Ticker, sd.Date
    ORDER BY sd.Ticker, sd.Date
    """

    sector_query = """
    SELECT sd.Date, si.Sector,
        AVG(sd.Open)   AS Open,
        AVG(sd.Close)  AS Close,
        AVG(sd.High)   AS High,
        AVG(sd.Low)    AS Low,
        SUM(sd.Volume) AS Volume
    FROM stock_data sd
    JOIN stock_information si ON sd.Ticker = si.Ticker
    GROUP BY si.Sector, sd.Date
    ORDER BY si.Sector, sd.Date
    """

    subsector_query = """
    SELECT sd.Date, si.Subsector,
        AVG(sd.Open)   AS Open,
        AVG(sd.Close)  AS Close,
        AVG(sd.High)   AS High,
        AVG(sd.Low)    AS Low,
        SUM(sd.Volume) AS Volume
    FROM stock_data sd
    JOIN stock_information si ON sd.Ticker = si.Ticker
    GROUP BY si.Subsector, sd.Date
    ORDER BY si.Subsector, sd.Date
    """

    process_data(ticker_query, "ticker_data", "Ticker")
    compute_technical_scores(conn)
    process_data(sector_query, "sector_data", "Sector")
    process_data(subsector_query, "subsector_data", "Subsector")
    create_combined_view()
    # Recreate indexes dropped by to_sql(replace)
    _add_ticker_data_indexes(conn)


def update_today_indicators(conn: sqlite3.Connection):
    """Fast incremental update: only recompute today's indicator row per ticker.

    Uses the last _INDICATOR_LOOKBACK_DAYS of OHLCV data as a rolling window so
    all indicators are accurate, but only writes today's rows to ticker_data.
    This is ~20x faster than a full process_stock_data() call.
    """
    today = datetime.date.today().isoformat()
    cutoff = (datetime.date.today() - datetime.timedelta(days=_INDICATOR_LOOKBACK_DAYS)).isoformat()

    df_raw = pd.read_sql_query(
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
        conn,
        params=(cutoff,),
    )
    if df_raw.empty:
        return

    df_raw["Date"] = pd.to_datetime(df_raw["Date"])
    today_ts = pd.Timestamp(today)

    # Pre-split groups so each thread gets a plain DataFrame (no shared state)
    groups = [(ticker, grp) for ticker, grp in df_raw.groupby("Ticker")]

    def _compute_one(ticker_grp):
        _, grp = ticker_grp
        grp = grp.sort_values("Date").reset_index(drop=True)
        if today_ts not in grp["Date"].values:
            return None
        indicators = _calc_indicators(grp, "Ticker")
        result = pd.concat([grp, indicators], axis=1)
        today_slice = result[result["Date"] == today_ts]
        return today_slice if not today_slice.empty else None

    with ThreadPoolExecutor(max_workers=8) as pool:
        today_rows = [r for r in pool.map(_compute_one, groups) if r is not None]

    if not today_rows:
        return

    new_rows = pd.concat(today_rows, ignore_index=True)

    # Compute tech scores for today's rows only
    rsi_score = new_rows["Ticker_RSI"].clip(0, 100) / 100
    macd_score = (new_rows["Ticker_MACD"] > new_rows["Ticker_MACD_Signal"]).astype(float)
    sma_score = (new_rows["Close"] > new_rows["Ticker_SMA_10"]).astype(float)
    bb_score = new_rows["Ticker_Bollinger_PBand"].clip(0, 1)
    mfi_score = new_rows["Ticker_MFI"].clip(0, 100) / 100
    raw = rsi_score * 0.25 + macd_score * 0.25 + sma_score * 0.20 + bb_score * 0.15 + mfi_score * 0.15
    new_rows["Ticker_Tech_Score"] = (raw * 100).round(1).clip(0, 100)

    # Wipe only today's rows then insert fresh
    conn.execute("DELETE FROM ticker_data WHERE Date >= ?", (today,))
    new_rows.to_sql("ticker_data", conn, if_exists="append", index=False)
    conn.commit()


def update_today_sector_subsector(conn: sqlite3.Connection):
    """Incremental update: compute today's sector and subsector aggregate rows + all indicators.

    The combined_stock_data view INNER JOINs sector_data and subsector_data on Date, so if
    today's date is missing from either table the view returns zero rows for today —
    meaning every ticker shows yesterday's data and all indicators (VWAP, RSI, etc.) are stale.

    Mirrors update_today_indicators but for sector/subsector aggregates.
    Also parallelised with a thread pool for speed.
    """
    today = datetime.date.today().isoformat()
    cutoff = (datetime.date.today() - datetime.timedelta(days=_INDICATOR_LOOKBACK_DAYS)).isoformat()

    # ── Sector ──────────────────────────────────────────────────────────────────
    df_sector = pd.read_sql_query(
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
        conn,
        params=(cutoff,),
    )

    # ── Subsector ────────────────────────────────────────────────────────────────
    df_sub = pd.read_sql_query(
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
        conn,
        params=(cutoff,),
    )

    def _compute_group(group_col, df_agg, prefix):
        """Return today's computed rows for all groups in df_agg."""
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

    sector_today = _compute_group("Sector", df_sector, "Sector")
    subsector_today = _compute_group("Subsector", df_sub, "Subsector")

    if sector_today is not None and not sector_today.empty:
        conn.execute("DELETE FROM sector_data WHERE Date >= ?", (today,))
        sector_today.to_sql("sector_data", conn, if_exists="append", index=False)

    if subsector_today is not None and not subsector_today.empty:
        conn.execute("DELETE FROM subsector_data WHERE Date >= ?", (today,))
        subsector_today.to_sql("subsector_data", conn, if_exists="append", index=False)

    conn.commit()


def compute_technical_scores(conn: sqlite3.Connection):
    """Compute a 0-100 composite technical score per ticker and store in ticker_data."""
    df = pd.read_sql_query("SELECT * FROM ticker_data", conn)
    if df.empty:
        return

    rsi_score = df["Ticker_RSI"].clip(0, 100) / 100
    macd_score = (df["Ticker_MACD"] > df["Ticker_MACD_Signal"]).astype(float)
    sma_score = (df["Close"] > df["Ticker_SMA_10"]).astype(float)
    bb_score = df["Ticker_Bollinger_PBand"].clip(0, 1)
    mfi_score = df["Ticker_MFI"].clip(0, 100) / 100

    raw = (
        rsi_score * 0.25 + macd_score * 0.25 + sma_score * 0.20 + bb_score * 0.15 + mfi_score * 0.15
    )
    df["Ticker_Tech_Score"] = (raw * 100).round(1).clip(0, 100)
    df.to_sql("ticker_data", conn, if_exists="replace", index=False)
    _add_ticker_data_indexes(conn)


def detect_patterns(conn: sqlite3.Connection):
    """Detect chart patterns for all tickers using last 90 days of data."""
    try:
        tickers = [r[0] for r in conn.execute("SELECT DISTINCT Ticker FROM ticker_data").fetchall()]
    except Exception:
        return

    today_str = pd.Timestamp.today().normalize().strftime("%Y-%m-%d")
    cutoff = (pd.Timestamp.today() - pd.Timedelta(days=90)).strftime("%Y-%m-%d")

    # Bulk-fetch all tickers at once instead of 500 individual queries
    try:
        df_all = pd.read_sql_query(
            "SELECT Ticker, Date, Close, High, Low FROM ticker_data "
            "WHERE Date >= ? ORDER BY Ticker, Date",
            conn,
            params=(cutoff,),
        )
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

        # Pivot highs (resistance) and pivot lows (support)
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

        # Double Top
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

        # Double Bottom
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
        placeholders = ",".join("?" * len(affected))
        try:
            conn.execute(
                f"DELETE FROM pattern_signals WHERE detected_at=? AND ticker IN ({placeholders})",
                [today_str] + affected,
            )
            conn.executemany(
                "INSERT INTO pattern_signals "
                "(ticker, detected_at, pattern_type, level, confidence, notes) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                results,
            )
            conn.commit()
        except Exception as e:
            import logging

            logging.getLogger(__name__).error("detect_patterns insert error: %s", e)
