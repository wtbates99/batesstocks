import sqlite3
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
import os


def fetch_preprocess(ticker):
    db_path = os.path.expanduser(
        "~/personal_git/stock_price_predictor/db/stock_data.db"
    )
    conn = sqlite3.connect(db_path)
    query = f"SELECT * FROM stock_data_with_indicators WHERE Ticker = '{ticker}' ORDER BY Date"
    df = pd.read_sql_query(query, conn)
    conn.close()

    df["Date"] = pd.to_datetime(df["Date"])
    non_numeric_cols = ["Date"]
    numeric_cols = df.columns.difference(non_numeric_cols)

    label_encoders = {}
    for column in ["Ticker", "Sector", "Subsector"]:
        le = LabelEncoder()
        df[column] = le.fit_transform(df[column])
        label_encoders[column] = le

    # Drop rows with any missing values across all columns
    df_cleaned = df.dropna()

    # Select features and target variable
    X = df_cleaned.drop(columns=["Date", "Close"])  # Assuming 'Close' is the target
    y = df_cleaned["Close"]

    scaler = StandardScaler()
    X = scaler.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, shuffle=False
    )

    return X_train, X_test, y_train, y_test, scaler, label_encoders


# Preprocess data
ticker = "TSLA"
X_train, X_test, y_train, y_test, scaler, label_encoders = fetch_preprocess(ticker)

print("X_train shape:", X_train.shape)
print("y_train shape:", y_train.shape)
print("X_test shape:", X_test.shape)
print("y_test shape:", y_test.shape)
