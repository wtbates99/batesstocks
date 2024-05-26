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

### IMPORTANT
# Check if Metal is available
if torch.backends.mps.is_available():
    device = torch.device("mps")
    print("Using Metal device")
else:
    device = torch.device("cpu")
    print("Using CPU device")


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


class AdvancedNN(nn.Module):
    def __init__(self, input_size):
        super(AdvancedNN, self).__init__()
        self.fc1 = nn.Linear(input_size, 256)
        self.bn1 = nn.BatchNorm1d(256)
        self.fc2 = nn.Linear(256, 128)
        self.bn2 = nn.BatchNorm1d(128)
        self.fc3 = nn.Linear(128, 64)
        self.bn3 = nn.BatchNorm1d(64)
        self.fc4 = nn.Linear(64, 1)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(0.5)

    def forward(self, x):
        x = self.relu(self.bn1(self.fc1(x)))
        x = self.dropout(x)
        x = self.relu(self.bn2(self.fc2(x)))
        x = self.dropout(x)
        x = self.relu(self.bn3(self.fc3(x)))
        x = self.dropout(x)
        x = self.fc4(x)
        return x


def train_model(
    X_train,
    y_train,
    input_size,
    X_val=None,
    y_val=None,
    epochs=100,
    patience=10,
    verbose=True,
):
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    model = AdvancedNN(input_size).to(device)
    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)

    X_train_tensor = torch.tensor(X_train, dtype=torch.float32).to(device)
    y_train_tensor = (
        torch.tensor(y_train.values, dtype=torch.float32).view(-1, 1).to(device)
    )

    if X_val is not None and y_val is not None:
        X_val_tensor = torch.tensor(X_val, dtype=torch.float32).to(device)
        y_val_tensor = (
            torch.tensor(y_val.values, dtype=torch.float32).view(-1, 1).to(device)
        )

    best_loss = float("inf")
    patience_counter = 0

    for epoch in range(epochs):
        model.train()
        optimizer.zero_grad()
        outputs = model(X_train_tensor)
        loss = criterion(outputs, y_train_tensor)
        loss.backward()
        optimizer.step()

        if verbose and (epoch + 1) % 10 == 0:
            print(f"Epoch [{epoch + 1}/{epochs}], Loss: {loss.item():.4f}")

        if X_val is not None and y_val is not None:
            model.eval()
            with torch.no_grad():
                val_outputs = model(X_val_tensor)
                val_loss = criterion(val_outputs, y_val_tensor).item()
                if verbose and (epoch + 1) % 10 == 0:
                    print(f"Validation Loss: {val_loss:.4f}")

                if val_loss < best_loss:
                    best_loss = val_loss
                    best_model = model.state_dict()
                    patience_counter = 0
                else:
                    patience_counter += 1

                if patience_counter >= patience:
                    print("Early stopping triggered")
                    break

    if X_val is not None and y_val is not None:
        model.load_state_dict(best_model)

    return model


def predict(model, X_test):
    model.eval()
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    X_test_tensor = torch.tensor(X_test, dtype=torch.float32).to(device)
    predictions = model(X_test_tensor).detach().cpu().numpy()
    return predictions.flatten()


def plot_predictions(y_test, predictions):
    plt.figure(figsize=(12, 6))
    plt.plot(y_test.values, label="Actual Values", color="blue")
    plt.plot(predictions, label="Predictions", color="red", linestyle="dashed")
    plt.title("Stock Price Predictions vs Actual Values")
    plt.xlabel("Time")
    plt.ylabel("Stock Price")
    plt.legend()
    plt.show()


def evaluate_predictions(y_test: pd.Series, predictions: np.ndarray):
    y_test = y_test.reset_index(drop=True)
    periods = [7, 30, 90]
    for period in periods:
        if len(y_test) >= period:
            y_true_period = y_test[-period:]
            y_pred_period = predictions[-period:]
            mse = np.mean((y_true_period - y_pred_period) ** 2)
            print(f"Mean Squared Error over last {period} days: {mse:.4f}")

    # Additional code to show a table of metrics for the last 7 days
    if len(y_test) >= 7:
        y_true_7 = y_test[-7:]
        y_pred_7 = predictions[-7:]
        mse_7 = np.mean((y_true_7 - y_pred_7) ** 2)
        mae_7 = np.mean(np.abs(y_true_7 - y_pred_7))
        mape_7 = np.mean(np.abs((y_true_7 - y_pred_7) / y_true_7)) * 100

        metrics = {
            "Date": y_true_7.index,
            "Actual": y_true_7.values,
            "Predicted": y_pred_7,
            "Difference": y_true_7.values - y_pred_7,
            "Squared Error": (y_true_7.values - y_pred_7) ** 2,
            "Absolute Error": np.abs(y_true_7.values - y_pred_7),
            "Absolute Percentage Error": np.abs(
                (y_true_7.values - y_pred_7) / y_true_7.values
            )
            * 100,
        }
        metrics_df = pd.DataFrame(metrics)
        print(metrics_df)

        print("\nMetrics for the last 7 days:")
        print(f"Mean Squared Error: {mse_7:.4f}")
        print(f"Mean Absolute Error: {mae_7:.4f}")
        print(f"Mean Absolute Percentage Error: {mape_7:.2f}%")


if __name__ == "__main__":
    # ticker = input("Enter the Ticker symbol: ")
    ticker = "TSLA"
    X_train, X_test, y_train, y_test, scaler, label_encoders = fetch_preprocess(ticker)
    model = train_model(X_train, y_train, input_size=X_train.shape[1])
    predictions = predict(model, X_test)
    evaluate_predictions(y_test, predictions)
    plot_predictions(y_test, predictions)
