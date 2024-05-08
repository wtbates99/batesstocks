import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
import yfinance as yf
from sklearn.metrics import mean_squared_error
from sklearn.impute import SimpleImputer

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
from sklearn.preprocessing import StandardScaler


class StockPredictor(nn.Module):
    def __init__(self, num_features):
        super(StockPredictor, self).__init__()
        self.layer1 = nn.Linear(num_features, 64)
        self.layer2 = nn.Linear(64, 32)
        self.output_layer = nn.Linear(32, 1)
        self.relu = nn.ReLU()

    def forward(self, x):
        x = self.relu(self.layer1(x))
        x = self.relu(self.layer2(x))
        x = self.output_layer(x)
        return x


def train_model(X, y, epochs=100, batch_size=32):
    # Normalize features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Convert to PyTorch tensors
    X_torch = torch.tensor(X_scaled, dtype=torch.float32)
    y_torch = torch.tensor(y.values, dtype=torch.float32).view(-1, 1)

    dataset = TensorDataset(X_torch, y_torch)
    dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

    # Model
    model = StockPredictor(X.shape[1])
    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)

    # Training loop
    model.train()
    for epoch in range(epochs):
        for features, targets in dataloader:
            optimizer.zero_grad()
            outputs = model(features)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()

    return model, scaler


def compute_financial_indicators(hist):
    # Exponential Moving Average (EMA)
    hist["EMA_15"] = hist["Close"].ewm(span=15, adjust=False).mean()
    hist["EMA_50"] = hist["Close"].ewm(span=50, adjust=False).mean()

    # Relative Strength Index (RSI)
    delta = hist["Close"].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / loss
    hist["RSI_14"] = 100 - (100 / (1 + rs))

    # Moving Average Convergence Divergence (MACD)
    ema_fast = hist["Close"].ewm(span=12, adjust=False).mean()
    ema_slow = hist["Close"].ewm(span=26, adjust=False).mean()
    macd = ema_fast - ema_slow
    hist["MACD"] = macd
    hist["MACD_Signal"] = macd.ewm(span=9, adjust=False).mean()
    hist["MACD_Hist"] = hist["MACD"] - hist["MACD_Signal"]

    # Average True Range (ATR)
    high_low = hist["High"] - hist["Low"]
    high_close = np.abs(hist["High"] - hist["Close"].shift())
    low_close = np.abs(hist["Low"] - hist["Close"].shift())
    tr = pd.DataFrame(
        {"high_low": high_low, "high_close": high_close, "low_close": low_close}
    ).max(axis=1)
    hist["ATR_14"] = tr.rolling(window=14).mean()

    # Bollinger Bands
    sma = hist["Close"].rolling(20).mean()
    rstd = hist["Close"].rolling(20).std()
    hist["Upper_BB"] = sma + 2 * rstd
    hist["Middle_BB"] = sma
    hist["Lower_BB"] = sma - 2 * rstd

    # On-Balance Volume (OBV)
    direction = hist["Close"].diff()
    hist["OBV"] = (hist["Volume"] * np.sign(direction)).fillna(0).cumsum()

    # Volume Weighted Average Price (VWAP)
    typical_price = (hist["High"] + hist["Low"] + hist["Close"]) / 3
    hist["VWAP"] = (typical_price * hist["Volume"]).cumsum() / hist["Volume"].cumsum()

    # Clean up and drop NaNs
    hist = hist.dropna()

    # Features and target setup
    X = hist.drop(columns=["Close"])
    y = hist["Close"]

    # Impute any remaining missing values
    imputer = SimpleImputer(strategy="median")
    X_clean = pd.DataFrame(imputer.fit_transform(X), columns=X.columns, index=X.index)

    return X_clean, y


def run_backtest(ticker, model, scaler, backtest_period=31):
    stock = yf.Ticker(ticker)
    hist = stock.history(period="max", interval="1d")
    X_clean, y = compute_financial_indicators(hist)

    # Preprocessing for the entire dataset
    X_scaled = scaler.transform(X_clean)
    X_torch = torch.tensor(X_scaled, dtype=torch.float32)

    # Evaluate model to generate all predictions
    model.eval()
    with torch.no_grad():
        predictions = model(X_torch).view(-1).numpy()

    # Select actual values and predictions for the backtest period
    actuals = y[-backtest_period:]
    predictions = predictions[-backtest_period:]

    initial_capital = 100
    capital = initial_capital
    profit_days = 0
    loss_days = 0
    not_taken = 0

    # Starting shares based on initial capital and first actual close
    shares_held = initial_capital / actuals.iloc[0]
    previous_close = actuals.iloc[0]

    for i in range(backtest_period):
        predicted_close = predictions[i]
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
# Fetch historical stock data
ticker = "NKE"  # Example ticker symbol for Nike
stock = yf.Ticker(ticker)
hist_data = stock.history(period="max", interval="1d")

# Compute financial indicators
X_clean, y = compute_financial_indicators(hist_data)

# Train the model with computed data
model, scaler = train_model(X_clean, y)

# Run backtesting
rmse = run_backtest(ticker, model, scaler)
print(f"RMSE of the backtest: {rmse}")
