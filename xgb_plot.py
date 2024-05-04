import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
import yfinance as yf
from xgboost import XGBRegressor
from sklearn.model_selection import GridSearchCV
from sklearn.metrics import mean_squared_error
from sklearn.impute import SimpleImputer


def prepare_data(hist):
    """Prepares and cleans the data for model training."""
    hist["Prev_Close"] = hist["Close"].shift(1)
    hist = hist.dropna()

    X = hist[["Open", "High", "Low", "Volume", "Prev_Close"]]
    X = X.replace([np.inf, -np.inf], np.nan)

    imputer = SimpleImputer(strategy="median")
    X_clean = pd.DataFrame(imputer.fit_transform(X), columns=X.columns, index=X.index)
    y = hist["Close"]

    return X_clean, y


def train_model(X, y):
    """Trains the XGBoost model using grid search for hyperparameter tuning."""
    model = XGBRegressor(random_state=42)
    grid = GridSearchCV(
        model,
        {
            "n_estimators": [100, 200],
            "max_depth": [3, 6, 9],
            "learning_rate": [0.01, 0.1],
            "reg_alpha": [0.01, 0.1],
            "reg_lambda": [1, 10],
        },
        cv=5,
        scoring="neg_mean_squared_error",
    )
    grid.fit(X, y)
    return grid.best_estimator_


def run_backtest(ticker, backtest_period=60):
    """Executes backtesting for a specified period using the trained model."""
    stock = yf.Ticker(ticker)
    hist = stock.history(period="7d", interval="1m")
    X_clean, y = prepare_data(hist)
    model = train_model(X_clean, y)

    predictions = []
    actuals = y[-backtest_period:]

    # Predict using actual previous day's data
    for i in range(backtest_period):
        index = -backtest_period + i - 1
        prev_day_data = X_clean.iloc[index : index + 1]
        predicted_close = model.predict(prev_day_data)[0]
        predictions.append(predicted_close)

    # Calculate metrics
    rmse = np.sqrt(mean_squared_error(actuals, predictions))

    # Plot results
    plt.figure(figsize=(12, 6))
    plt.plot(actuals.index, actuals, label="Actual Close")
    plt.plot(actuals.index, predictions, label="Predicted Close", linestyle="--")
    plt.title(f"Backtesting Model for {ticker} - RMSE: {rmse:.2f}")
    plt.xlabel("Date")
    plt.ylabel("Close Price")
    plt.legend()
    plt.grid(True)
    plt.show()

    return rmse


# Example usage
rmse = run_backtest("IYM")
