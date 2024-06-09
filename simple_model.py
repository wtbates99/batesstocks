# stock_price_predictor.py

import os
import sqlite3
import pandas as pd
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
import matplotlib.pyplot as plt

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.impute import KNNImputer
from torch.utils.data import DataLoader, TensorDataset

# Set the torch device
device = (
    torch.device("mps") if torch.backends.mps.is_available() else torch.device("cpu")
)
torch.set_num_threads(torch.get_num_threads())


# Function to preprocess data
def fetch_preprocess(ticker: str):
    db_path = os.path.expanduser(
        "~/personal_git/stock_price_predictor/db/stock_data.db"
    )
    conn = sqlite3.connect(db_path)
    query = "SELECT * FROM stock_data_with_indicators WHERE Ticker = ? ORDER BY Date"
    df = pd.read_sql_query(query, conn, params=(ticker,))
    conn.close()

    df["Date"] = pd.to_datetime(df["Date"])
    df["Date_ordinal"] = df["Date"].apply(lambda x: x.toordinal())
    df = df.sort_values("Date")

    label_encoders = {
        column: LabelEncoder().fit(df[column])
        for column in ["Ticker", "Sector", "Subsector"]
    }
    for column, le in label_encoders.items():
        df[column] = le.transform(df[column])

    imputer = KNNImputer(n_neighbors=3)
    df_numeric = df.drop(columns=["Date", "Close"])
    df_numeric_imputed = pd.DataFrame(
        imputer.fit_transform(df_numeric), columns=df_numeric.columns
    )
    df_imputed = pd.concat(
        [df_numeric_imputed, df[["Date", "Close"]].reset_index(drop=True)], axis=1
    )

    X = df_imputed.drop(columns=["Date", "Close"])
    y = df_imputed["Close"]

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y, test_size=0.2, shuffle=False
    )

    return X_train, X_test, y_train, y_test, scaler, label_encoders, df_imputed


# Define the neural network
class SimpleNN(nn.Module):
    def __init__(self, input_size: int):
        super(SimpleNN, self).__init__()
        self.fc1 = nn.Linear(input_size, 128)
        self.fc2 = nn.Linear(128, 64)
        self.fc3 = nn.Linear(64, 1)
        self.relu = nn.ReLU()

    def forward(self, x: torch.Tensor):
        x = self.relu(self.fc1(x))
        x = self.relu(self.fc2(x))
        x = self.fc3(x)
        return x


# Function to train the model
def train_model(
    X_train: np.ndarray,
    y_train: np.ndarray,
    input_size: int,
    epochs: int = 50,
    batch_size: int = 32,
):
    model = SimpleNN(input_size).to(device)
    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)

    X_train_tensor = torch.from_numpy(np.ascontiguousarray(X_train)).float().to(device)
    y_train_tensor = (
        torch.from_numpy(np.ascontiguousarray(y_train.values))
        .float()
        .view(-1, 1)
        .to(device)
    )

    dataset = TensorDataset(X_train_tensor, y_train_tensor)
    dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

    for epoch in range(epochs):
        model.train()
        for inputs, targets in dataloader:
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()

        if (epoch + 1) % 10 == 0:
            print(f"Epoch [{epoch + 1}/{epochs}], Loss: {loss.item():.4f}")

    return model


# Function to make predictions
def predict(model: nn.Module, X: np.ndarray, batch_size: int = 32):
    model.eval()
    X_tensor = torch.from_numpy(np.ascontiguousarray(X)).float().to(device)
    dataloader = DataLoader(
        TensorDataset(X_tensor), batch_size=batch_size, shuffle=False
    )

    predictions = []
    with torch.no_grad():
        for inputs in dataloader:
            outputs = model(inputs[0])
            predictions.append(outputs.cpu().numpy())

    return np.concatenate(predictions).flatten()


# Function to predict the next 5 days
def predict_next_5_days(
    model: nn.Module, df_imputed: pd.DataFrame, scaler: StandardScaler
):
    last_row = df_imputed.iloc[-1].copy()
    future_dates = [last_row["Date"] + pd.Timedelta(days=i) for i in range(1, 6)]
    future_data = [last_row.copy() for _ in future_dates]

    for date, row in zip(future_dates, future_data):
        row["Date"] = date
        row["Date_ordinal"] = date.toordinal()

    future_df = pd.DataFrame(future_data)
    future_X = future_df.drop(columns=["Date", "Close"])
    future_X_scaled = scaler.transform(future_X)

    future_X_tensor = torch.from_numpy(future_X_scaled).float().to(device)
    future_predictions = model(future_X_tensor).cpu().detach().numpy()

    future_df["Predicted_Close"] = future_predictions.flatten()
    return future_df[["Date", "Predicted_Close"]]


# Function to plot predictions
def plot_predictions(y_test: pd.Series, predictions: np.ndarray):
    plt.figure(figsize=(12, 6))
    plt.plot(y_test.values, label="Actual Values", color="blue")
    plt.plot(predictions, label="Predictions", color="red", linestyle="dashed")
    plt.title("Stock Price Predictions vs Actual Values")
    plt.xlabel("Time")
    plt.ylabel("Stock Price")
    plt.legend()
    plt.show()


# Function to evaluate predictions
def evaluate_predictions(y_test: pd.Series, predictions: np.ndarray, periods: list):
    y_test = y_test.reset_index(drop=True)

    for period in periods:
        if len(y_test) >= period:
            y_true_period = y_test[-period:]
            y_pred_period = predictions[-period:]
            mse = np.mean((y_true_period - y_pred_period) ** 2)
            print(f"Mean Squared Error over last {period} days: {mse:.4f}")

    if len(y_test) >= periods[-1]:
        y_true = y_test[-periods[-1] :]
        y_pred = predictions[-periods[-1] :]
        mse = np.mean((y_true - y_pred) ** 2)
        mae = np.mean(np.abs(y_true - y_pred))
        mape = np.mean(np.abs((y_true - y_pred) / y_true)) * 100

        pct_change_true = y_true.pct_change().fillna(0) * 100
        pct_change_pred = pd.Series(y_pred).pct_change().fillna(0) * 100

        metrics = {
            "Date": y_true.index,
            "Actual": y_true.values,
            "Predicted": y_pred,
            "Difference": y_true.values - y_pred,
            "Squared Error": (y_true.values - y_pred) ** 2,
            "Absolute Error": np.abs(y_true.values - y_pred),
            "Absolute Percentage Error": np.abs(
                (y_true.values - y_pred) / y_true.values
            )
            * 100,
            "Pct Change Actual": pct_change_true.values,
            "Pct Change Predicted": pct_change_pred.values,
        }

        metrics_df = pd.DataFrame(metrics)
        print(metrics_df)

        print(f"\nMetrics for the last {periods[-1]} days:")
        print(f"Mean Squared Error: {mse:.4f}")
        print(f"Mean Absolute Error: {mae:.4f}")
        print(f"Mean Absolute Percentage Error: {mape:.2f}%")


# Main execution
if __name__ == "__main__":
    ticker = input("Enter the Ticker symbol: ")
    X_train, X_test, y_train, y_test, scaler, label_encoders, df_imputed = (
        fetch_preprocess(ticker)
    )
    model = train_model(X_train, y_train, input_size=X_train.shape[1])
    predictions = predict(model, X_test)
    evaluate_predictions(y_test, predictions, [7, 30, 90])
    plot_predictions(y_test, predictions)

    future_predictions = predict_next_5_days(model, df_imputed, scaler)
    print("\nNext 5 days stock price predictions:")
    print(future_predictions)
