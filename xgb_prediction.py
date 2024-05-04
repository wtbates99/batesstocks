import pandas as pd
import yfinance as yf
import numpy as np
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from sklearn.impute import SimpleImputer


def run_stock_prediction(ticker):
    # Pull stock data
    stock = yf.Ticker(ticker)
    hist = stock.history(period="max", interval="1d")
    hist["Prev_Day_Close"] = hist["Close"].shift(1)
    hist["Daily Returns"] = hist["Close"].pct_change()
    hist.reset_index(inplace=True)
    hist.dropna(inplace=True)
    hist["Ticker"] = ticker

    # Prepare data
    X = hist.drop(columns=["Date", "Close", "Ticker"])
    y = hist["Close"]
    X.replace([np.inf, -np.inf], np.nan, inplace=True)
    imputer = SimpleImputer(strategy="median")
    X_imputed = imputer.fit_transform(X)
    X = pd.DataFrame(X_imputed, columns=X.columns)

    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    # Setup and tune XGBoost Model
    baseline_model = XGBRegressor(random_state=42)
    baseline_model.fit(X_train, y_train)
    param_grid = {
        "n_estimators": [100, 200],
        "max_depth": [3, 6, 9],
        "learning_rate": [0.01, 0.1],
    }
    grid_search = GridSearchCV(
        baseline_model, param_grid, cv=5, scoring="neg_mean_squared_error"
    )
    grid_search.fit(X_train, y_train)
    best_model = grid_search.best_estimator_

    # Evaluate model performance
    y_pred = best_model.predict(X_test)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)

    # Predict next day price
    latest_data = X.iloc[-1]  # Fetch the most recent data
    medians = latest_data.median()
    latest_data_imputed = latest_data.fillna(medians)
    next_day_pred = best_model.predict(latest_data_imputed.values.reshape(1, -1))[0]

    current_price = y.iloc[-1]
    predicted_price_change = next_day_pred - current_price
    predicted_price_change_pct = predicted_price_change / current_price
    historical_price_change_pct = hist.iloc[-1]["Daily Returns"]

    results_df = pd.DataFrame(
        {
            "RMSE": [rmse],
            "MAE": [mae],
            "R2": [r2],
            "current_price": [current_price],
            "predicted_close": [next_day_pred],
            "predicted_absolute_change": [predicted_price_change],
            "predicted_percentage_change": [predicted_price_change_pct],
            "prev_day_percentage_change": [historical_price_change_pct],
        },
        index=[ticker],
    )
    results_df = results_df.reset_index().to_json(orient="records", date_format="iso")

    return results_df


# Example usage:
result = run_stock_prediction("AAPL")
print(result)
