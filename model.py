# stock_price_predictor.py

import os
import sqlite3
import pandas as pd
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.impute import KNNImputer
from torch.utils.data import DataLoader, TensorDataset

device = (
    torch.device("mps") if torch.backends.mps.is_available() else torch.device("cpu")
)
torch.set_num_threads(torch.get_num_threads())


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


def fetch_and_preprocess(ticker: str):
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
        col: LabelEncoder().fit(df[col]) for col in ["Ticker", "Sector", "Subsector"]
    }
    for col, le in label_encoders.items():
        df[col] = le.transform(df[col])

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
    return X_train, X_test, y_train, y_test, scaler, df_imputed, X.columns


def create_table():
    db_path = os.path.expanduser(
        "~/personal_git/stock_price_predictor/db/stock_data.db"
    )
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS stock_predictions")
    cursor.execute("""
        CREATE TABLE stock_predictions (
            Ticker TEXT,
            Date TEXT,
            Type TEXT,
            Actual_Close REAL,
            Predicted_Close REAL
        )
    """)
    conn.commit()
    conn.close()


def save_predictions(ticker: str, df: pd.DataFrame, prediction_type: str):
    db_path = os.path.expanduser(
        "~/personal_git/stock_price_predictor/db/stock_data.db"
    )
    conn = sqlite3.connect(db_path)
    df["Ticker"] = ticker
    df["Type"] = prediction_type
    df.to_sql("stock_predictions", conn, if_exists="append", index=False)
    conn.close()


def train_and_predict(ticker: str):
    create_table()
    X_train, X_test, y_train, y_test, scaler, df_imputed, feature_names = (
        fetch_and_preprocess(ticker)
    )

    model = SimpleNN(X_train.shape[1]).to(device)
    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)

    dataset = DataLoader(
        TensorDataset(
            torch.from_numpy(X_train).float().to(device),
            torch.from_numpy(y_train.values).float().view(-1, 1).to(device),
        ),
        batch_size=32,
        shuffle=True,
    )

    for epoch in range(50):
        model.train()
        for inputs, targets in dataset:
            optimizer.zero_grad()
            loss = criterion(model(inputs), targets)
            loss.backward()
            optimizer.step()
        if (epoch + 1) % 10 == 0:
            print(f"Epoch [{epoch + 1}/50], Loss: {loss.item():.4f}")

    model.eval()
    test_dataset = DataLoader(
        TensorDataset(torch.from_numpy(X_test).float().to(device)),
        batch_size=32,
        shuffle=False,
    )

    predictions = np.concatenate(
        [model(inputs[0]).cpu().detach().numpy() for inputs in test_dataset]
    ).flatten()
    prediction_df = pd.DataFrame(
        {
            "Date": df_imputed.iloc[-len(predictions) :]["Date"].values,
            "Actual_Close": y_test.values,
            "Predicted_Close": predictions,
        }
    )
    save_predictions(ticker, prediction_df, "backtest")

    future_predictions = predict_next_5_days(model, df_imputed, scaler, feature_names)
    save_predictions(ticker, future_predictions, "future")

    return predictions, future_predictions


def predict_next_5_days(
    model: nn.Module, df_imputed: pd.DataFrame, scaler: StandardScaler, feature_names
):
    last_row = df_imputed.iloc[-1].copy()
    future_dates = [last_row["Date"] + pd.Timedelta(days=i) for i in range(1, 6)]
    future_data = [last_row.copy() for _ in future_dates]

    predictions = []

    for i, date in enumerate(future_dates):
        if i == 0:
            current_data = last_row.copy()
        else:
            current_data = future_data[i - 1].copy()
            current_data["Close"] = predictions[-1]

        current_data["Date"] = date
        current_data["Date_ordinal"] = date.toordinal()
        future_data[i] = current_data

        current_X = pd.DataFrame(
            current_data.drop(["Date", "Close"]).values.reshape(1, -1),
            columns=feature_names,
        )
        current_X_scaled = scaler.transform(current_X)
        current_X_tensor = torch.from_numpy(current_X_scaled).float().to(device)

        prediction = model(current_X_tensor).cpu().detach().numpy().flatten()[0]
        predictions.append(prediction)

    future_df = pd.DataFrame(future_data)
    future_df["Predicted_Close"] = predictions
    return future_df[["Date", "Predicted_Close"]]


if __name__ == "__main__":
    ticker = input("Enter the Ticker symbol: ")
    predictions, future_predictions = train_and_predict(ticker)
