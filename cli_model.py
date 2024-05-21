import argparse
import logging
import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
import yfinance as yf
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split, KFold
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
from rich.console import Console
from rich.table import Table
from rich.progress import track
from rich import box

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

console = Console()

class StockPredictor(nn.Module):
    def __init__(self, num_features):
        super(StockPredictor, self).__init__()
        self.layer1 = nn.Linear(num_features, 128)
        self.layer2 = nn.Linear(128, 64)
        self.output_layer = nn.Linear(64, 1)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(0.3)
        self.batch_norm1 = nn.BatchNorm1d(128)
        self.batch_norm2 = nn.BatchNorm1d(64)

    def forward(self, x):
        x = self.relu(self.batch_norm1(self.layer1(x)))
        x = self.dropout(x)
        x = self.relu(self.batch_norm2(self.layer2(x)))
        x = self.dropout(x)
        x = self.output_layer(x)
        return x

def train_model(X, y, epochs=100, batch_size=32, lr=0.001):
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
    optimizer = optim.Adam(model.parameters(), lr=lr)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, 'min', patience=5, verbose=True)

    # Training loop with early stopping and model checkpointing
    model.train()
    min_loss = np.inf
    patience = 10
    patience_counter = 0

    for epoch in track(range(epochs), description="Training Model..."):
        epoch_loss = 0
        for features, targets in dataloader:
            optimizer.zero_grad()
            outputs = model(features)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item()
        epoch_loss /= len(dataloader)
        scheduler.step(epoch_loss)

        logging.info(f"Epoch {epoch+1}/{epochs}, Loss: {epoch_loss:.4f}")

        # Early stopping and model checkpointing
        if epoch_loss < min_loss:
            min_loss = epoch_loss
            patience_counter = 0
            best_model = model.state_dict()
            torch.save(best_model, 'best_model.pt')
        else:
            patience_counter += 1
            if patience_counter >= patience:
                logging.info("Early stopping triggered")
                model.load_state_dict(best_model)
                break

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
    mae = mean_absolute_error(actuals, predictions)
    r2 = r2_score(actuals, predictions)

    # Plot results
    plt.figure(figsize=(12, 6))
    plt.plot(actuals.index, actuals, label="Actual Close")
    plt.plot(actuals.index, predictions, label="Predicted Close", linestyle="--")
    plt.title(f"Backtesting Model for {ticker} - RMSE: {rmse:.2f}, MAE: {mae:.2f}, R²: {r2:.2f}")
    plt.xlabel("Date")
    plt.ylabel("Close Price")
    plt.legend()
    plt.grid(True)
    plt.show()

    # Output the results in a TUI table
    table = Table(title="Backtest Results", box=box.MINIMAL_DOUBLE_HEAD)
    table.add_column("Metric", justify="right", style="cyan", no_wrap=True)
    table.add_column("Value", style="magenta")
    table.add_row("Initial Capital", f"${initial_capital:.2f}")
    table.add_row("Final Capital", f"${capital:.2f}")
    table.add_row("Profit Days", str(profit_days))
    table.add_row("Loss Days", str(loss_days))
    table.add_row("Not Taken Days", str(not_taken))
    table.add_row("RMSE", f"{rmse:.4f}")
    table.add_row("MAE", f"{mae:.4f}")
    table.add_row("R²", f"{r2:.4f}")

    console.print(table)

    return rmse, mae, r2

def main(ticker):
    stock = yf.Ticker(ticker)
    hist_data = stock.history(period="max", interval="1d")

    # Compute financial indicators
    X_clean, y = compute_financial_indicators(hist_data)

    # Train the model with computed data
    model, scaler = train_model(X_clean, y)

    # Run backtesting
    rmse, mae, r2 = run_backtest(ticker, model, scaler)
    logging.info(f"RMSE of the backtest: {rmse}")
    logging.info(f"MAE of the backtest: {mae}")
    logging.info(f"R² of the backtest: {r2}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Stock Price Prediction and Backtesting')
    parser.add_argument('ticker', type=str, help='Ticker symbol of the stock (e.g., AAPL, GOOGL)')
    args = parser.parse_args()
    main(args.ticker)
