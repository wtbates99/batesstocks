import sqlite3
from backend.data_pull import fetch_write_financial_data
from backend.data_manipulation import process_stock_data

conn = sqlite3.connect("stock_data.db")
fetch_write_financial_data(conn)
process_stock_data(conn)

cursor = conn.cursor()

cursor.executescript(
    """
DROP VIEW IF EXISTS signals_view;
CREATE VIEW signals_view AS
WITH signals AS (
    SELECT
        Date,
        Ticker,
        'Bullish' AS Signal,
        Ticker_MACD,
        Ticker_MACD_Signal,
        Ticker_RSI,
        Ticker_Stochastic_K,
        Ticker_Stochastic_D,
        Ticker_Close,
        LEAD(Ticker_Close, 1) OVER (PARTITION BY Ticker ORDER BY Date) AS Next_Close
    FROM
        combined_stock_data
    WHERE
        Ticker_MACD > Ticker_MACD_Signal
        AND Ticker_MACD - Ticker_MACD_Signal > 0.01
        AND Ticker_RSI < 30
        AND Ticker_Stochastic_K > Ticker_Stochastic_D

    UNION ALL

    SELECT
        Date,
        Ticker,
        'Bearish' AS Signal,
        Ticker_MACD,
        Ticker_MACD_Signal,
        Ticker_RSI,
        Ticker_Stochastic_K,
        Ticker_Stochastic_D,
        Ticker_Close,
        LEAD(Ticker_Close, 1) OVER (PARTITION BY Ticker ORDER BY Date) AS Next_Close
    FROM
        combined_stock_data
    WHERE
        Ticker_MACD < Ticker_MACD_Signal
        AND Ticker_MACD_Signal - Ticker_MACD > 0.01
        AND Ticker_RSI > 70
        AND Ticker_Stochastic_K < Ticker_Stochastic_D
)
SELECT
    Date,
    Ticker,
    Signal,
    Ticker_MACD,
    Ticker_MACD_Signal,
    Ticker_RSI,
    Ticker_Stochastic_K,
    Ticker_Stochastic_D,
    Ticker_Close,
    Next_Close,
    CASE
        WHEN Next_Close IS NOT NULL THEN ROUND(((Next_Close - Ticker_Close) / Ticker_Close) * 100, 2)
        ELSE NULL
    END AS Performance
FROM signals;
"""
)

# 2. Golden Cross and Death Cross Signals View (golden_death_cross_view)
cursor.executescript(
    """
DROP VIEW IF EXISTS golden_death_cross_view;
CREATE VIEW golden_death_cross_view AS
WITH cross_signals AS (
  SELECT
    Date,
    Ticker,
    Ticker_SMA_10,
    LAG(Ticker_SMA_10, 1) OVER (PARTITION BY Ticker ORDER BY Date) AS Prev_SMA_10,
    Ticker_EMA_10,
    LAG(Ticker_EMA_10, 1) OVER (PARTITION BY Ticker ORDER BY Date) AS Prev_EMA_10,
    Ticker_Close,
    LEAD(Ticker_Close, 1) OVER (PARTITION BY Ticker ORDER BY Date) AS Next_Close
  FROM combined_stock_data
)
SELECT
  Date,
  Ticker,
  CASE
    WHEN Ticker_SMA_10 > Ticker_EMA_10 AND Prev_SMA_10 <= Prev_EMA_10 THEN 'Golden Cross (Buy)'
    WHEN Ticker_SMA_10 < Ticker_EMA_10 AND Prev_SMA_10 >= Prev_EMA_10 THEN 'Death Cross (Sell)'
  END AS CrossSignal,
  Ticker_Close,
  Next_Close,
  CASE
    WHEN Next_Close IS NOT NULL THEN ROUND(((Next_Close - Ticker_Close) / Ticker_Close) * 100, 2)
    ELSE NULL
  END AS Performance
FROM cross_signals
WHERE CrossSignal IS NOT NULL;
"""
)

# 3. Bollinger Band Breakout Signals View (bollinger_breakouts_view)
cursor.executescript(
    """
DROP VIEW IF EXISTS bollinger_breakouts_view;
CREATE VIEW bollinger_breakouts_view AS
WITH bollinger_data AS (
    SELECT
      Date,
      Ticker,
      Ticker_Close,
      Ticker_Bollinger_High,
      Ticker_Bollinger_Low,
      LEAD(Ticker_Close, 1) OVER (PARTITION BY Ticker ORDER BY Date) AS Next_Close,
      CASE
        WHEN Ticker_Close > Ticker_Bollinger_High THEN 'Breakout Above (Potential Buy)'
        WHEN Ticker_Close < Ticker_Bollinger_Low THEN 'Breakout Below (Potential Sell)'
      END AS BollingerSignal
    FROM combined_stock_data
)
SELECT
  Date,
  Ticker,
  Ticker_Close,
  Ticker_Bollinger_High,
  Ticker_Bollinger_Low,
  BollingerSignal,
  Next_Close,
  CASE
    WHEN Next_Close IS NOT NULL THEN ROUND(((Next_Close - Ticker_Close) / Ticker_Close) * 100, 2)
    ELSE NULL
  END AS Performance
FROM bollinger_data
WHERE BollingerSignal IS NOT NULL;
"""
)

# 4. Volume Breakout Signals View (volume_breakout_view)
cursor.executescript(
    """
DROP VIEW IF EXISTS volume_breakout_view;
CREATE VIEW volume_breakout_view AS
WITH volume_data AS (
  SELECT
    Date,
    Ticker,
    Ticker_Volume,
    AVG(Ticker_Volume) OVER (PARTITION BY Ticker ORDER BY Date ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING) AS Avg_Volume,
    Ticker_Close,
    LEAD(Ticker_Close, 1) OVER (PARTITION BY Ticker ORDER BY Date) AS Next_Close
  FROM combined_stock_data
)
SELECT
  Date,
  Ticker,
  Ticker_Volume,
  Avg_Volume,
  'Volume Breakout (Potential Signal)' AS VolumeSignal,
  Ticker_Close,
  Next_Close,
  CASE
    WHEN Next_Close IS NOT NULL THEN ROUND(((Next_Close - Ticker_Close) / Ticker_Close) * 100, 2)
    ELSE NULL
  END AS Performance
FROM volume_data
WHERE Ticker_Volume > Avg_Volume * 2;
"""
)

# 5. MACD Histogram Reversal Signals View (macd_histogram_reversal_view)
cursor.executescript(
    """
DROP VIEW IF EXISTS macd_histogram_reversal_view;
CREATE VIEW macd_histogram_reversal_view AS
WITH macd_data AS (
  SELECT
    Date,
    Ticker,
    Ticker_MACD_Diff,
    LAG(Ticker_MACD_Diff, 1) OVER (PARTITION BY Ticker ORDER BY Date) AS Prev_MACD_Diff,
    Ticker_Close,
    LEAD(Ticker_Close, 1) OVER (PARTITION BY Ticker ORDER BY Date) AS Next_Close
  FROM combined_stock_data
)
SELECT
  Date,
  Ticker,
  Ticker_MACD_Diff,
  CASE
    WHEN Ticker_MACD_Diff > 0 AND Prev_MACD_Diff <= 0 THEN 'MACD Histogram Reversal (Potential Buy)'
    WHEN Ticker_MACD_Diff < 0 AND Prev_MACD_Diff >= 0 THEN 'MACD Histogram Reversal (Potential Sell)'
  END AS MACDReversal,
  Ticker_Close,
  Next_Close,
  CASE
    WHEN Next_Close IS NOT NULL THEN ROUND(((Next_Close - Ticker_Close) / Ticker_Close) * 100, 2)
    ELSE NULL
  END AS Performance
FROM macd_data
WHERE MACDReversal IS NOT NULL;
"""
)

conn.commit()
conn.close()
