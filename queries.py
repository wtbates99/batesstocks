import sqlite3
from typing import List, Tuple
import json


def get_connection():
    return sqlite3.connect("stock_data.db")


def execute_query(query: str) -> List[Tuple[str]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query)
        return cursor.fetchall()


def get_bullish_momentum():
    query = """
    SELECT Ticker
    FROM combined_stock_data
    WHERE Date = (SELECT MAX(Date) FROM combined_stock_data)
    AND Ticker_Close > Ticker_SMA_10
    AND Ticker_SMA_10 > Ticker_SMA_30
    AND Ticker_RSI > 50
    AND Ticker_MACD > Ticker_MACD_Signal
    ORDER BY (Ticker_Close / Ticker_SMA_10) DESC
    LIMIT 9
    """
    return [ticker[0] for ticker in execute_query(query)]


def get_bullish_breakout():
    query = """
    SELECT Ticker
    FROM combined_stock_data
    WHERE Date = (SELECT MAX(Date) FROM combined_stock_data)
    AND Ticker_Close > Ticker_Bollinger_High
    AND Ticker_Volume > Ticker_SMA_30 * 1.5
    AND Ticker_Williams_R > -20
    ORDER BY (Ticker_Close / Ticker_Bollinger_High) DESC
    LIMIT 9
    """
    return [ticker[0] for ticker in execute_query(query)]


def get_bullish_trend_strength():
    query = """
    SELECT Ticker
    FROM combined_stock_data
    WHERE Date = (SELECT MAX(Date) FROM combined_stock_data)
    AND Ticker_TSI > 0
    AND Ticker_UO > 50
    AND Ticker_MFI > 50
    AND Ticker_Chaikin_MF > 0
    ORDER BY (Ticker_TSI + Ticker_UO + Ticker_MFI) DESC
    LIMIT 9
    """
    return [ticker[0] for ticker in execute_query(query)]


def get_all_bullish_groups():
    bullish_groups = {
        "momentum": get_bullish_momentum(),
        "breakout": get_bullish_breakout(),
        "trend_strength": get_bullish_trend_strength(),
    }

    # Save to JSON file
    with open("bullish_groups.json", "w") as f:
        json.dump(bullish_groups, f)


def load_bullish_groups():
    with open("bullish_groups.json", "r") as f:
        return json.load(f)

get_all_bullish_groups()
