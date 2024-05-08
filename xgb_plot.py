import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
import yfinance as yf
from xgboost import XGBRegressor
from sklearn.model_selection import GridSearchCV
from sklearn.metrics import mean_squared_error
from sklearn.impute import SimpleImputer


def calculate_ema(prices, span):
    return prices.ewm(span=span, adjust=False).mean()


def calculate_rsi(prices, n=14):
    delta = prices.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=n).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=n).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))


def calculate_macd(prices, n_fast=12, n_slow=26):
    ema_fast = calculate_ema(prices, n_fast)
    ema_slow = calculate_ema(prices, n_slow)
    macd = ema_fast - ema_slow
    signal = calculate_ema(macd, 9)
    return macd, signal, macd - signal


def calculate_atr(high, low, close, n=14):
    high_low = high - low
    high_close = np.abs(high - close.shift())
    low_close = np.abs(low - close.shift())
    tr = high_low.combine(high_close, max).combine(low_close, max)
    atr = tr.rolling(window=n).mean()
    return atr


def calculate_bollinger_bands(prices, n=20, std_dev=2):
    sma = prices.rolling(n).mean()
    rstd = prices.rolling(n).std()
    upper_band = sma + std_dev * rstd
    lower_band = sma - std_dev * rstd
    return upper_band, sma, lower_band


def calculate_obv(close, volume):
    direction = close.diff()
    obv = (volume * np.sign(direction)).fillna(0).cumsum()
    return obv


def calculate_vwap(high, low, close, volume):
    typical_price = (high + low + close) / 3
    vwap = (typical_price * volume).cumsum() / volume.cumsum()
    return vwap


def prepare_data(hist):
    """Prepares and cleans the data for model training with manually calculated features."""
    # Basic historical data and lag features
    hist["Prev_Close"] = hist["Close"].shift(1)
    hist["Lag_180"] = hist["Close"].shift(180)
    hist["Lag_30"] = hist["Close"].shift(30)

    # Moving averages
    hist["MA_31"] = hist["Close"].rolling(window=31).mean()
    hist["MA_7"] = hist["Close"].rolling(window=7).mean()
    hist["EMA_15"] = calculate_ema(hist["Close"], 15)
    hist["EMA_50"] = calculate_ema(hist["Close"], 50)

    # Momentum indicators
    hist["RSI_14"] = calculate_rsi(hist["Close"], 14)
    hist["MACD"], hist["MACD_Signal"], hist["MACD_Hist"] = calculate_macd(hist["Close"])

    # Volatility measures
    hist["ATR_14"] = calculate_atr(hist["High"], hist["Low"], hist["Close"])
    hist["Upper_BB"], hist["Middle_BB"], hist["Lower_BB"] = calculate_bollinger_bands(
        hist["Close"]
    )

    # Volume indicators
    hist["OBV"] = calculate_obv(hist["Close"], hist["Volume"])
    hist["VWAP"] = calculate_vwap(
        hist["High"], hist["Low"], hist["Close"], hist["Volume"]
    )

    # Cleanup and final features
    hist = hist.dropna()
    X = hist[
        [
            "Open",
            "High",
            "Low",
            "Volume",
            "Prev_Close",
            "EMA_15",
            "EMA_50",
            "RSI_14",
            "MACD",
            "ATR_14",
            "Upper_BB",
            "Lower_BB",
            "OBV",
            "VWAP",
        ]
    ]
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

        # Determicene if we should 'buy' based on prediction being higher than previous close
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
