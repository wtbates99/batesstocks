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
    hist["Lag_366"] = hist["Close"].shift(366)
    hist["MA_7"] = hist["Close"].rolling(window=7).mean()
    high_9 = hist["High"].rolling(window=9).max()
    low_9 = hist["Low"].rolling(window=9).min()
    hist["Conversion_Line"] = (high_9 + low_9) / 2

    high_26 = hist["High"].rolling(window=26).max()
    low_26 = hist["Low"].rolling(window=26).min()
    hist["Base_Line"] = (high_26 + low_26) / 2

    hist["Leading_Span_A"] = ((hist["Conversion_Line"] + hist["Base_Line"]) / 2).shift(
        26
    )
    hist["Leading_Span_B"] = (
        (hist["High"].rolling(window=52).max() + hist["Low"].rolling(window=52).min())
        / 2
    ).shift(26)

    hist["Lagging_Span"] = hist["Close"].shift(-26)
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
    print("Hello World")
    return grid.best_estimator_


def run_backtest(ticker, backtest_period=14):
    """Executes backtesting for a specified period using the trained model, calculates changes in capital, and counts profitable days."""
    stock = yf.Ticker(ticker)
    hist = stock.history(period="max", interval="1d")
    X_clean, y = prepare_data(hist)
    model = train_model(X_clean, y)

    predictions = []
    actuals = y[-backtest_period:]
    initial_capital = 100
    capital = initial_capital
    profit_days = 0
    loss_days = 0
    not_taken = 0

    # Starting shares based on initial capital and first actual close
    shares_held = initial_capital / actuals.iloc[0]
    previous_close = actuals.iloc[0]

    # Predict using actual previous day's data
    for i in range(backtest_period):
        index = -backtest_period + i - 1
        prev_day_data = X_clean.iloc[index : index + 1]
        predicted_close = model.predict(prev_day_data)[0]
        predictions.append(predicted_close)

        # Determine if we should 'buy' based on prediction being higher than previous close
        if predicted_close > previous_close:
            new_capital = shares_held * predicted_close
            if new_capital > capital:
                profit_days += 1
            elif new_capital < capital:
                loss_days += 1
            capital = new_capital
        else:
            # Do not update capital, shares held or profit/loss days count
            not_taken += 1
        # Update previous_close for next day's comparison
        previous_close = actuals.iloc[i]

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

    # Output the results
    print(f"Initial investment of $100 would have resulted in: ${capital:.2f}")
    print(f"Number of days with profit: {profit_days}")
    print(f"Number of days with loss: {loss_days}")
    print(f"Numbers of days not taken: {not_taken}")

    return rmse


# Example usage
rmse = run_backtest("INTC")
