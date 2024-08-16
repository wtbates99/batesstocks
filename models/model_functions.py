import pandas as pd
import sqlite3
from typing import List, Tuple


def prepare_single_stock(
    ticker: str,
    features: List[str],
    conn: sqlite3.Connection,
    lags: List[int] = [1, 5, 10],
    target_value: str = "Ticker_Close",
) -> Tuple[pd.DataFrame, pd.Series, pd.DataFrame]:
    """
    Args:
        ticker (str): The stock ticker symbol to query data for.
        features (List[str]): A list of feature column names to use for prediction.
        conn (sqlite3.Connection): A connection to the SQLite database.
        lags (List[int], optional): A list of lag periods for creating lagged features.
                                    Defaults to [1, 5, 10].
        target_value (str, optional): The name of the target column to predict.
                                      Defaults to "Ticker_Close".

    Returns:
        Tuple[pd.DataFrame, pd.Series, pd.DataFrame]: A tuple containing:
            - X (pd.DataFrame): The feature matrix, including lagged features.
            - y (pd.Series): The target variable series.
            - df (pd.DataFrame): The original dataframe with added lagged features.

    Raises:
        ValueError: If the features list is empty or if no database connection is provided.

    Note:
        This function assumes that the 'combined_stock_data' table exists in the database
        and contains columns for 'Ticker', 'Date', and all specified features.
    """

    if not features:
        raise ValueError("Features list cannot be empty")
    if conn is None:
        raise ValueError("Database connection must be provided")

    query = f"SELECT * FROM combined_stock_data WHERE Ticker = '{ticker}' ORDER BY Date"
    df = pd.read_sql_query(query, conn)
    df["Date"] = pd.to_datetime(df["Date"])
    df = df.set_index("Date")

    for feature in features + [target_value]:
        for lag in lags:
            df[f"{feature}_lag_{lag}"] = df[feature].shift(lag)

    X = df[
        features
        + [
            f"{feature}_lag_{lag}"
            for feature in features + [target_value]
            for lag in lags
        ]
    ]
    y = df[target_value]

    return X, y, df
