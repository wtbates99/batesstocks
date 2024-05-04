import pandas as pd
import yfinance as yf
import numpy as np
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from sklearn.impute import SimpleImputer


def run_pred(ticker):
    stock = yf.Ticker(ticker)
    hist = stock.history(period="max", interval="1d")
    hist["Prev_Close"] = hist["Close"].shift(1)
    hist["Day_Ret"] = hist["Close"].pct_change()
    hist = hist.dropna()
    hist["Ticker"] = ticker
    X = hist.drop(columns=["Close", "Ticker"])
    y = hist["Close"]
    X.replace([np.inf, -np.inf], np.nan)
    imputer = SimpleImputer(strategy="median")
    X = pd.DataFrame(imputer.fit_transform(X), columns=X.columns)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    model = XGBRegressor(random_state=42)
    grid = GridSearchCV(
        model,
        {
            "n_estimators": [100, 200],
            "max_depth": [3, 6, 9],
            "learning_rate": [0.01, 0.1],
            "reg_alpha": [0.01, 0.1],  # L1 regularization
            "reg_lambda": [1, 10],  # L2 regularization
        },
        cv=5,
        scoring="neg_mean_squared_error",
    )
    grid.fit(X_train, y_train)
    best_model = grid.best_estimator_
    y_pred = best_model.predict(X_test)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)
    latest_data = X.iloc[-1]
    latest_data["Prev_Close"] = y.iloc[
        -1
    ]  # Using the last actual close price as prev_close for the prediction
    next_day_pred = best_model.predict([latest_data])[0]
    current_price = y.iloc[-1]
    pred_change = next_day_pred - current_price
    pred_pct_chg = pred_change / current_price
    hist_pct_chg = hist.iloc[-1]["Day_Ret"]
    results = pd.DataFrame(
        {
            "RMSE": [rmse],
            "MAE": [mae],
            "R2": [r2],
            "current_price": [current_price],
            "predicted_close": [next_day_pred],
            "predicted_abs_change": [pred_change],
            "predicted_pct_change": [pred_pct_chg],
            "prev_day_pct_change": [hist_pct_chg],
        },
        index=[ticker],
    )

    return results


# Example usage:
result = run_pred("AAPL")
