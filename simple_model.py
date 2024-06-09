import sqlite3
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.impute import KNNImputer
import torch
import torch.nn as nn
import torch.optim as optim
import os
import numpy as np
import matplotlib.pyplot as plt

# torch stuff
torch.set_num_threads(1)
if torch.backends.mps.is_available():
    device = torch.device("mps")
else:
    device = torch.device("cpu")


# Function to preprocess data
def fetch_preprocess(ticker):
    db_path = os.path.expanduser(
        "~/personal_git/stock_price_predictor/db/stock_data.db"
    )
    conn = sqlite3.connect(db_path)
    query = f"SELECT * FROM stock_data_with_indicators WHERE Ticker = '{ticker}' ORDER BY Date"
    df = pd.read_sql_query(query, conn)
    conn.close()

    df["Date"] = pd.to_datetime(df["Date"])
    df["Date_ordinal"] = df["Date"].apply(lambda x: x.toordinal())
    non_numeric_cols = ["Date"]
    numeric_cols = df.columns.difference(non_numeric_cols)
    df = df.sort_values("Date")

    label_encoders = {}
    for column in ["Ticker", "Sector", "Subsector"]:
        le = LabelEncoder()
        df[column] = le.fit_transform(df[column])
        label_encoders[column] = le
    imputer = KNNImputer(n_neighbors=3)
    df_numeric_imputed = pd.DataFrame(
        imputer.fit_transform(df[numeric_cols]), columns=numeric_cols
    )
    df_imputed = pd.concat(
        [df_numeric_imputed, df[non_numeric_cols].reset_index(drop=True)], axis=1
    )
    X = df_imputed.drop(
        columns=["Date", "Close"]
    )  # Assuming 'Close' is the target variable
    y = df_imputed["Close"]

    scaler = StandardScaler()
    X = scaler.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, shuffle=False
    )

    return X_train, X_test, y_train, y_test, scaler, label_encoders


class SimpleNN(nn.Module):
    def __init__(self, input_size):
        super(SimpleNN, self).__init__()
        self.fc1 = nn.Linear(input_size, 128)
        self.fc2 = nn.Linear(128, 64)
        self.fc3 = nn.Linear(64, 1)
        self.relu = nn.ReLU()

    def forward(self, x):
        x = self.relu(self.fc1(x))
        x = self.relu(self.fc2(x))
        x = self.fc3(x)
        return x


def train_model(X_train, y_train, input_size, epochs=50, batch_size=2):
    model = SimpleNN(input_size)
    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)

    X_train = np.ascontiguousarray(X_train)
    y_train = np.ascontiguousarray(y_train.values)

    assert not np.isnan(X_train).any(), "X_train contains NaN values"
    assert not np.isinf(X_train).any(), "X_train contains infinite values"
    assert not np.isnan(y_train).any(), "y_train contains NaN values"
    assert not np.isinf(y_train).any(), "y_train contains infinite values"

    X_train_tensor = torch.from_numpy(X_train).float()
    y_train_tensor = torch.from_numpy(y_train).float().view(-1, 1)

    dataset = torch.utils.data.TensorDataset(X_train_tensor, y_train_tensor)
    dataloader = torch.utils.data.DataLoader(
        dataset, batch_size=batch_size, shuffle=True
    )

    for epoch in range(epochs):
        model.train()
        for i, (inputs, targets) in enumerate(dataloader):
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()

        if (epoch + 1) % 10 == 0:
            print(f"Epoch [{epoch + 1}/{epochs}], Loss: {loss.item():.4f}")

    return model


def predict(model, X_test, batch_size=32):
    model.eval()
    X_test_tensor = torch.from_numpy(np.ascontiguousarray(X_test)).float()
    dataset = torch.utils.data.TensorDataset(X_test_tensor)
    dataloader = torch.utils.data.DataLoader(
        dataset, batch_size=batch_size, shuffle=False
    )

    predictions = []
    with torch.no_grad():
        for inputs in dataloader:
            outputs = model(inputs[0])
            predictions.append(outputs.numpy())

    predictions = np.concatenate(predictions).flatten()
    return predictions


def plot_predictions(y_test, predictions):
    plt.figure(figsize=(12, 6))
    plt.plot(y_test.values, label="Actual Values", color="blue")
    plt.plot(predictions, label="Predictions", color="red", linestyle="dashed")
    plt.title("Stock Price Predictions vs Actual Values")
    plt.xlabel("Time")
    plt.ylabel("Stock Price")
    plt.legend()
    plt.show()


def evaluate_predictions(y_test: pd.Series, predictions: np.ndarray, error_period: int):
    y_test = y_test.reset_index(drop=True)
    periods = [7, 30, 90]

    for period in periods:
        if len(y_test) >= period:
            y_true_period = y_test[-period:]
            y_pred_period = predictions[-period:]
            mse = np.mean((y_true_period - y_pred_period) ** 2)
            print(f"Mean Squared Error over last {period} days: {mse:.4f}")

    if len(y_test) >= error_period:
        y_true = y_test[-error_period:]
        y_pred = predictions[-error_period:]
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

        print(f"\nMetrics for the last {error_period} days:")
        print(f"Mean Squared Error: {mse:.4f}")
        print(f"Mean Absolute Error: {mae:.4f}")
        print(f"Mean Absolute Percentage Error: {mape:.2f}%")


if __name__ == "__main__":
    ticker = input("Enter the Ticker symbol: ")
    X_train, X_test, y_train, y_test, scaler, label_encoders = fetch_preprocess(ticker)
    model = train_model(X_train, y_train, input_size=X_train.shape[1])
    predictions = predict(model, X_test)
    evaluate_predictions(y_test, predictions, 30)
    plot_predictions(y_test, predictions)
