import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
import yfinance as yf
from sklearn.metrics import mean_squared_error
from sklearn.impute import KNNImputer
from sklearn.preprocessing import StandardScaler
from sklearn.feature_selection import RFE
from sklearn.linear_model import LinearRegression

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset


class StockPredictor(nn.Module):
    def __init__(self, num_features):
        super(StockPredictor, self).__init__()
        self.layer1 = nn.Linear(num_features, 128)
        self.layer2 = nn.Linear(128, 64)
        self.layer3 = nn.Linear(64, 32)
        self.output_layer = nn.Linear(32, 1)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(0.2)

    def forward(self, x):
        x = self.relu(self.layer1(x))
        x = self.dropout(x)
        x = self.relu(self.layer2(x))
        x = self.dropout(x)
        x = self.relu(self.layer3(x))
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
    optimizer = optim.AdamW(model.parameters(), lr=0.001)

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
    # Exponential Moving Averages (EMA)
    hist["EMA_5"] = hist["Close"].ewm(span=5, adjust=False).mean()
    hist["EMA_10"] = hist["Close"].ewm(span=10, adjust=False).mean()
    hist["EMA_15"] = hist["Close"].ewm(span=15, adjust=False).mean()
    hist["EMA_20"] = hist["Close"].ewm(span=20, adjust=False).mean()
    hist["EMA_50"] = hist["Close"].ewm(span=50, adjust=False).mean()
    hist["EMA_100"] = hist["Close"].ewm(span=100, adjust=False).mean()
    hist["EMA_200"] = hist["Close"].ewm(span=200, adjust=False).mean()

    # Relative Strength Index (RSI)
    delta = hist["Close"].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / loss
    hist["RSI_7"] = 100 - (100 / (1 + rs))
    hist["RSI_14"] = 100 - (100 / (1 + rs))
    hist["RSI_21"] = 100 - (100 / (1 + rs))

    # Moving Average Convergence Divergence (MACD)
    ema_fast = hist["Close"].ewm(span=12, adjust=False).mean()
    ema_slow = hist["Close"].ewm(span=26, adjust=False).mean()
    macd = ema_fast - ema_slow
    hist["MACD"] = macd
    hist["MACD_Signal_9"] = macd.ewm(span=9, adjust=False).mean()
    hist["MACD_Hist"] = hist["MACD"] - hist["MACD_Signal_9"]

    # Average True Range (ATR)
    high_low = hist["High"] - hist["Low"]
    high_close = np.abs(hist["High"] - hist["Close"].shift())
    low_close = np.abs(hist["Low"] - hist["Close"].shift())
    tr = pd.DataFrame(
        {"high_low": high_low, "high_close": high_close, "low_close": low_close}
    ).max(axis=1)
    hist["ATR_7"] = tr.rolling(window=7).mean()
    hist["ATR_14"] = tr.rolling(window=14).mean()
    hist["ATR_21"] = tr.rolling(window=21).mean()

    # Bollinger Bands
    for i in [10, 20, 50]:
        sma = hist["Close"].rolling(i).mean()
        rstd = hist["Close"].rolling(i).std()
        hist[f"Upper_BB_{i}"] = sma + 2 * rstd
        hist[f"Middle_BB_{i}"] = sma
        hist[f"Lower_BB_{i}"] = sma - 2 * rstd

    # On-Balance Volume (OBV)
    direction = hist["Close"].diff()
    hist["OBV"] = (hist["Volume"] * np.sign(direction)).fillna(0).cumsum()

    # Volume Weighted Average Price (VWAP)
    typical_price = (hist["High"] + hist["Low"] + hist["Close"]) / 3
    hist["VWAP"] = (typical_price * hist["Volume"]).cumsum() / hist["Volume"].cumsum()

    # Commodity Channel Index (CCI)
    tp = (hist["High"] + hist["Low"] + hist["Close"]) / 3
    ma = tp.rolling(20).mean()
    md = (tp - ma).rolling(20).apply(lambda x: np.abs(x - x.mean()).mean(), raw=True)
    hist["CCI"] = (tp - ma) / (0.015 * md)

    # Chaikin Money Flow (CMF)
    mfv = ((hist["Close"] - hist["Low"]) - (hist["High"] - hist["Close"])) / (
        hist["High"] - hist["Low"]
    )
    hist["CMF"] = mfv.rolling(20).sum() / hist["Volume"].rolling(20).sum()

    # Price Rate of Change (ROC)
    hist["ROC_5"] = hist["Close"].pct_change(5)
    hist["ROC_10"] = hist["Close"].pct_change(10)
    hist["ROC_20"] = hist["Close"].pct_change(20)

    # Williams %R
    highest_high = hist["High"].rolling(14).max()
    lowest_low = hist["Low"].rolling(14).min()
    hist["WilliamsR"] = (
        (highest_high - hist["Close"]) / (highest_high - lowest_low)
    ) * -100

    # Stochastic Oscillator
    hist["%K"] = ((hist["Close"] - lowest_low) / (highest_high - lowest_low)) * 100
    hist["%D"] = hist["%K"].rolling(3).mean()

    # Momentum
    hist["Momentum_1"] = hist["Close"].diff(1)
    hist["Momentum_5"] = hist["Close"].diff(5)
    hist["Momentum_10"] = hist["Close"].diff(10)

    # Price Volume Trend (PVT)
    hist["PVT"] = (
        (hist["Close"] - hist["Close"].shift(1)) / hist["Close"].shift(1)
    ) * hist["Volume"]
    hist["PVT"] = hist["PVT"].cumsum()

    # Normalized Average True Range (NATR)
    hist["NATR"] = (hist["ATR_14"] / hist["Close"]) * 100

    # Average Directional Index (ADX)
    # Calculate True Range
    high_low = hist["High"] - hist["Low"]
    high_close = np.abs(hist["High"] - hist["Close"].shift())
    low_close = np.abs(hist["Low"] - hist["Close"].shift())
    true_range = pd.DataFrame(
        {"high_low": high_low, "high_close": high_close, "low_close": low_close}
    ).max(axis=1)
    # Calculate +DM and -DM
    plus_dm = np.where(
        (hist["High"] - hist["High"].shift(1)) > (hist["Low"].shift(1) - hist["Low"]),
        hist["High"] - hist["High"].shift(1),
        0,
    )
    minus_dm = np.where(
        (hist["Low"].shift(1) - hist["Low"]) > (hist["High"] - hist["High"].shift(1)),
        hist["Low"].shift(1) - hist["Low"],
        0,
    )
    # Calculate Smoothed True Range, +DM, and -DM
    smooth_true_range = true_range.ewm(span=14, adjust=False).mean()
    smooth_plus_dm = pd.Series(plus_dm).ewm(span=14, adjust=False).mean()
    smooth_minus_dm = pd.Series(minus_dm).ewm(span=14, adjust=False).mean()
    # Calculate +DI and -DI
    plus_di = (smooth_plus_dm / smooth_true_range) * 100
    minus_di = (smooth_minus_dm / smooth_true_range) * 100
    # Calculate Directional Movement Index (DX)
    dx = (np.abs(plus_di - minus_di) / (plus_di + minus_di)) * 100
    # Calculate Average Directional Index (ADX)
    hist["ADX"] = dx.ewm(span=14, adjust=False).mean()

    # Ichimoku Cloud
    high_9 = hist["High"].rolling(window=9).max()
    low_9 = hist["Low"].rolling(window=9).min()
    hist["Tenkan_Sen"] = (high_9 + low_9) / 2

    high_26 = hist["High"].rolling(window=26).max()
    low_26 = hist["Low"].rolling(window=26).min()
    hist["Kijun_Sen"] = (high_26 + low_26) / 2

    hist["Senkou_Span_A"] = ((hist["Tenkan_Sen"] + hist["Kijun_Sen"]) / 2).shift(26)
    hist["Senkou_Span_B"] = (
        (hist["High"].rolling(window=52).max() + hist["Low"].rolling(window=52).min())
        / 2
    ).shift(26)
    hist["Chikou_Span"] = hist["Close"].shift(-26)

    # Additional features
    hist["Lagged_Return"] = hist["Close"].pct_change(1)
    hist["Volatility_5"] = hist["Close"].pct_change().rolling(window=5).std()
    hist["Volatility_10"] = hist["Close"].pct_change().rolling(window=10).std()
    hist["Volatility_20"] = hist["Close"].pct_change().rolling(window=20).std()

    # Price Gap
    hist["Gap"] = (hist["Open"] - hist["Close"].shift(1)) / hist["Close"].shift(1)

    # Features and target setup
    X = hist.drop(columns=["Close"])
    y = hist["Close"]

    # Impute any remaining missing values using KNNImputer
    imputer = KNNImputer(n_neighbors=5)
    X_clean = pd.DataFrame(imputer.fit_transform(X), columns=X.columns)

    # Feature selection using Recursive Feature Elimination (RFE)
    estimator = LinearRegression()
    selector = RFE(estimator, n_features_to_select=10)  # Select top 15 features
    selector = selector.fit(X_clean, y)
    selected_features = X_clean.columns[selector.support_]
    X_clean = X_clean[selected_features]

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
    mape = np.mean(np.abs((actuals - predictions) / actuals)) * 100

    # Plot results
    plt.figure(figsize=(12, 6))
    plt.plot(actuals.index, actuals, label="Actual Close")
    plt.plot(actuals.index, predictions, label="Predicted Close", linestyle="--")
    plt.title(f"Backtesting Model for {ticker} - RMSE: {rmse:.2f}, MAPE: {mape:.2f}%")
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

    return rmse, mape


ticker = input("Enter the ticker symbol for the stock (e.g., 'AAPL', 'GOOGL', 'NKE'): ")
stock = yf.Ticker(ticker)
hist_data = stock.history(period="max", interval="1d")

# Compute financial indicators
X_clean, y = compute_financial_indicators(hist_data)

# Train the model with computed data
model, scaler = train_model(X_clean, y, epochs=200)  # Increased epochs

# Run backtesting
rmse, mape = run_backtest(ticker, model, scaler)
print(f"RMSE of the backtest: {rmse:.2f}")
print(f"MAPE of the backtest: {mape:.2f}%")
