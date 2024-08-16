import pandas as pd
import sqlite3
from typing import List, Tuple
import numpy as np
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import matplotlib.pyplot as plt
import matplotlib.dates as mdates


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

    lagged_features = []

    for feature in features + [target_value]:
        for lag in lags:
            lagged_features.append(
                df[feature].shift(lag).rename(f"{feature}_lag_{lag}")
            )

    df_with_lags = pd.concat([df] + lagged_features, axis=1)

    X_columns = features + [
        f"{feature}_lag_{lag}" for feature in features + [target_value] for lag in lags
    ]
    X = df_with_lags[X_columns]
    y = df_with_lags[target_value]

    return X, y, df_with_lags


def time_series_split(X: pd.DataFrame, y: pd.Series, train_size: float = 0.8):
    """
    Splits the data into train and test sets, and scales the features.

    Args:
        X (pd.DataFrame): Feature matrix
        y (pd.Series): Target variable
        train_size (float): Proportion of data to use for training

    Returns:
        tuple: X_train_scaled, X_test_scaled, y_train, y_test, scaler
    """
    from sklearn.preprocessing import StandardScaler

    train_size = int(len(X) * train_size)
    X_train, X_test = X.iloc[:-train_size], X.iloc[-train_size:]
    y_train, y_test = y.iloc[:-train_size], y.iloc[-train_size:]

    scaler = StandardScaler()
    X_train_scaled = pd.DataFrame(
        scaler.fit_transform(X_train), columns=X_train.columns, index=X_train.index
    )
    X_test_scaled = pd.DataFrame(
        scaler.transform(X_test), columns=X_test.columns, index=X_test.index
    )

    return X_train_scaled, X_test_scaled, y_train, y_test, scaler


def evaluate_model(y_test: pd.Series, y_pred: pd.Series):
    """
    Calculates and prints evaluation metrics for the model.

    Args:
        y_true (pd.Series): True values
        y_pred (pd.Series): Predicted values

    Returns:
        dict: Dictionary containing the evaluation metrics
    """
    mse = mean_squared_error(y_test, y_pred)
    rmse = np.sqrt(mse)
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)

    return {"mse": mse, "rmse": rmse, "mae": mae, "r2": r2}


def plot_predictions(y_train: pd.Series, y_test: pd.Series, y_pred: pd.Series):
    """
    Plots the actual vs predicted values.

    Args:
        y_train (pd.Series): Training data
        y_test (pd.Series): Test data
        y_pred (pd.Series): Predicted values
    """
    plt.figure(figsize=(15, 7))
    plt.plot(y_train.index, y_train.values, label="Train Actual", color="blue")
    plt.plot(y_test.index, y_test.values, label="Test Actual", color="green")
    plt.plot(y_test.index, y_pred, label="Test Predicted", color="red")

    plt.axvline(
        x=y_train.index[-1], color="purple", linestyle="--", label="Train/Test Split"
    )

    plt.title("Actual vs Predicted Values")
    plt.xlabel("Date")
    plt.ylabel("Value")
    plt.legend()

    plt.gca().xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m-%d"))
    plt.gca().xaxis.set_major_locator(mdates.AutoDateLocator())
    plt.gcf().autofmt_xdate()

    plt.tight_layout()
    plt.show()


def plot_feature_importance(model, feature_names: list):
    """
    Plots the top 20 feature importances.

    Args:
        model: Trained model with feature_importances_ attribute
        feature_names (list): List of feature names
    """
    feature_importance = pd.DataFrame(
        {"feature": feature_names, "importance": model.feature_importances_}
    )
    feature_importance = feature_importance.sort_values("importance", ascending=False)

    plt.figure(figsize=(12, 8))
    plt.bar(feature_importance["feature"][:20], feature_importance["importance"][:20])
    plt.title("Top 20 Feature Importance")
    plt.xlabel("Features")
    plt.ylabel("Importance")
    plt.xticks(rotation=90)
    plt.tight_layout()
    plt.show()
