import pandas as pd
import numpy as np
import sqlite3
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.feature_selection import RFE
from sklearn.ensemble import RandomForestRegressor
from pmdarima import auto_arima
from xgboost import XGBRegressor
from lightgbm import LGBMRegressor
from prophet import Prophet
import optuna

print("Starting stock prediction script...")

conn = sqlite3.connect("../_stock_data.db")
print("Connected to the database.")


def prepare_data(ticker, features, conn):
    print(f"Preparing data for ticker: {ticker}")
    query = f"""
    SELECT Date, Ticker_Close as Close, {', '.join(features)}
    FROM combined_stock_data
    WHERE Ticker = '{ticker}'
    ORDER BY Date
    """
    df = pd.read_sql_query(query, conn)
    df["Date"] = pd.to_datetime(df["Date"])
    df.set_index("Date", inplace=True)
    print(f"Data prepared. Shape: {df.shape}")
    return df


def add_time_features(df):
    print("Adding time-based features...")
    df["DayOfWeek"] = df.index.dayofweek
    df["Month"] = df.index.month
    df["Year"] = df.index.year
    df["Quarter"] = df.index.quarter
    print("Time-based features added.")
    return df


def feature_selection(X, y, n_features=20):
    print(f"Performing feature selection. Selecting top {n_features} features...")
    rf = RandomForestRegressor(n_estimators=100, random_state=42)
    selector = RFE(estimator=rf, n_features_to_select=n_features, step=1)
    selector = selector.fit(X, y)
    selected_features = X.columns[selector.support_]
    print(f"Feature selection completed. Selected features: {selected_features}")
    return selected_features


def train_test_split(df, train_size=0.8):
    print(
        f"Splitting data into train and test sets based on date. Train size: {train_size}"
    )
    df = df.sort_index()
    split_date = df.index[int(len(df) * train_size)]
    train = df[df.index <= split_date]
    test = df[df.index > split_date]
    print(f"Train set date range: {train.index.min()} to {train.index.max()}")
    print(f"Test set date range: {test.index.min()} to {test.index.max()}")
    print(f"Train set shape: {train.shape}, Test set shape: {test.shape}")
    return train, test


def evaluate_model(y_true, y_pred):
    print("Evaluating model performance...")
    mae = mean_absolute_error(y_true, y_pred)
    mse = mean_squared_error(y_true, y_pred)
    rmse = np.sqrt(mse)
    r2 = r2_score(y_true, y_pred)
    print(f"MAE: {mae:.4f}, MSE: {mse:.4f}, RMSE: {rmse:.4f}, R2: {r2:.4f}")
    return {"MAE": mae, "MSE": mse, "RMSE": rmse, "R2": r2}


def plot_predictions(train, test, predictions, title):
    print(f"Plotting predictions: {title}")
    plt.figure(figsize=(12, 6))
    plt.plot(train.index, train["Close"], label="Training Data")
    plt.plot(test.index, test["Close"], label="Actual Test Data")
    plt.plot(test.index, predictions, label="Predictions", color="red")
    plt.title(title)
    plt.xlabel("Date")
    plt.ylabel("Price")
    plt.legend()
    plt.show()
    print("Plot displayed.")


def plot_feature_importance(feature_importance, title):
    print(f"Plotting feature importance: {title}")
    plt.figure(figsize=(12, 6))
    sns.barplot(x="importance", y="feature", data=feature_importance)
    plt.title(title)
    plt.xlabel("Importance")
    plt.ylabel("Features")
    plt.tight_layout()
    plt.show()
    print("Feature importance plot displayed.")


def sarima_model(train, test):
    print("Training SARIMA model...")
    model = auto_arima(
        train["Close"],
        seasonal=True,
        m=5,
        suppress_warnings=True,
        stepwise=True,
        trace=1,
    )
    fitted_model = model.fit(train["Close"])
    print("SARIMA model trained. Making predictions...")
    forecast = fitted_model.predict(n_periods=len(test))
    print("SARIMA predictions completed.")
    return pd.Series(forecast, index=test.index)


def prophet_model(train, test, features):
    print("Preparing data for Prophet model...")
    train_prophet = train.reset_index().rename(columns={"Date": "ds", "Close": "y"})
    test_prophet = test.reset_index().rename(columns={"Date": "ds", "Close": "y"})

    print("Training Prophet model...")
    model = Prophet(
        daily_seasonality=True, weekly_seasonality=True, yearly_seasonality=True
    )
    for feature in features:
        model.add_regressor(feature)

    model.fit(train_prophet)
    print("Prophet model trained. Making predictions...")
    future = test_prophet[["ds"] + list(features)]
    forecast = model.predict(future)
    print("Prophet predictions completed.")
    return pd.Series(forecast["yhat"].values, index=test.index)


def xgboost_model(train, test, features):
    print("Training XGBoost model...")
    model = XGBRegressor(
        n_estimators=1000, learning_rate=0.01, max_depth=5, random_state=42
    )
    model.fit(train[features], train["Close"])
    print("XGBoost model trained. Making predictions...")
    predictions = model.predict(test[features])
    print("XGBoost predictions completed.")
    return pd.Series(predictions, index=test.index)


def lightgbm_model(train, test, features):
    print("Training LightGBM model...")
    model = LGBMRegressor(
        n_estimators=1000, learning_rate=0.01, max_depth=5, random_state=42
    )
    model.fit(train[features], train["Close"])
    print("LightGBM model trained. Making predictions...")
    predictions = model.predict(test[features])
    print("LightGBM predictions completed.")
    return pd.Series(predictions, index=test.index)


def optimize_ensemble(train, test, features):
    print("Optimizing ensemble weights...")

    def objective(trial):
        w1 = trial.suggest_float("w1", 0, 1)
        w2 = trial.suggest_float("w2", 0, 1)
        w3 = trial.suggest_float("w3", 0, 1)
        w4 = trial.suggest_float("w4", 0, 1)

        weights = [w1, w2, w3, w4]
        weights = [w / sum(weights) for w in weights]

        sarima_pred = sarima_model(train, test)
        prophet_pred = prophet_model(train, test, features)
        xgb_pred = xgboost_model(train, test, features)
        lgbm_pred = lightgbm_model(train, test, features)

        ensemble_pred = (
            weights[0] * sarima_pred
            + weights[1] * prophet_pred
            + weights[2] * xgb_pred
            + weights[3] * lgbm_pred
        )

        mae = mean_absolute_error(test["Close"], ensemble_pred)
        return mae

    study = optuna.create_study(direction="minimize")
    study.optimize(objective, n_trials=100)

    best_weights = [study.best_params[f"w{i+1}"] for i in range(4)]
    best_weights = [w / sum(best_weights) for w in best_weights]
    print(f"Optimal ensemble weights found: {best_weights}")
    return best_weights


# Main execution
print("Starting main execution...")
ticker = "TSLA"
print(f"Selected ticker: {ticker}")
features = [
    "Ticker_Open",
    "Ticker_High",
    "Ticker_Low",
    "Ticker_Volume",
    "Ticker_SMA_10",
    "Ticker_EMA_10",
    "Ticker_RSI",
    "Ticker_Stochastic_K",
    "Ticker_Stochastic_D",
    "Ticker_MACD",
    "Ticker_MACD_Signal",
    "Ticker_MACD_Diff",
    "Ticker_TSI",
    "Ticker_UO",
    "Ticker_ROC",
    "Ticker_Williams_R",
    "Ticker_Bollinger_High",
    "Ticker_Bollinger_Low",
    "Ticker_Bollinger_Mid",
    "Ticker_Bollinger_PBand",
    "Ticker_Bollinger_WBand",
    "Ticker_On_Balance_Volume",
    "Ticker_Chaikin_MF",
    "Ticker_Force_Index",
    "Ticker_MFI",
    "Sector_Open",
    "Sector_High",
    "Sector_Low",
    "Sector_Volume",
    "Subsector_Open",
    "Subsector_High",
    "Subsector_Low",
    "Subsector_Volume",
    "Subsector_EMA_10",
]
print(f"Number of initial features: {len(features)}")

# Prepare data
print("Preparing and preprocessing data...")
df = prepare_data(ticker, features, conn)
df = add_time_features(df)

# Feature selection
selected_features = feature_selection(df.drop("Close", axis=1), df["Close"])
print("Selected features:", selected_features)

# Split data
print("Splitting data into train and test sets...")
train, test = train_test_split(df)

# Scale features
print("Scaling features...")
scaler = StandardScaler()
train_scaled = pd.DataFrame(
    scaler.fit_transform(train), columns=train.columns, index=train.index
)
test_scaled = pd.DataFrame(
    scaler.transform(test), columns=test.columns, index=test.index
)
print("Feature scaling completed.")

# Train individual models and make predictions
print("Training individual models and making predictions...")
sarima_pred = sarima_model(train_scaled, test_scaled)
prophet_pred = prophet_model(train_scaled, test_scaled, selected_features)
xgb_pred = xgboost_model(train_scaled, test_scaled, selected_features)
lgbm_pred = lightgbm_model(train_scaled, test_scaled, selected_features)
print("Individual model training and predictions completed.")

# Optimize ensemble weights
print("Optimizing ensemble weights...")
best_weights = optimize_ensemble(train_scaled, test_scaled, selected_features)

# Create ensemble predictions
print("Creating ensemble predictions...")
ensemble_pred = (
    best_weights[0] * sarima_pred
    + best_weights[1] * prophet_pred
    + best_weights[2] * xgb_pred
    + best_weights[3] * lgbm_pred
)

# Evaluate models
print("Evaluating all models...")
models = {
    "SARIMA": sarima_pred,
    "Prophet": prophet_pred,
    "XGBoost": xgb_pred,
    "LightGBM": lgbm_pred,
    "Ensemble": ensemble_pred,
}

for name, pred in models.items():
    print(f"\nEvaluating {name} model...")
    metrics = evaluate_model(test["Close"], pred)
    print(f"{name} Model Performance Metrics:")
    print(metrics)
    plot_predictions(train, test, pred, f"{name} Model Predictions")

# Feature importance (using XGBoost as an example)
print("\nCalculating feature importance using XGBoost...")
xgb_model = XGBRegressor(
    n_estimators=1000, learning_rate=0.01, max_depth=5, random_state=42
)
xgb_model.fit(train_scaled[selected_features], train_scaled["Close"])
feature_importance = pd.DataFrame(
    {"feature": selected_features, "importance": xgb_model.feature_importances_}
)
feature_importance = feature_importance.sort_values("importance", ascending=False)
plot_feature_importance(feature_importance, "XGBoost Feature Importance")

# Cross-validation
print("\nPerforming cross-validation...")
tscv = TimeSeriesSplit(n_splits=5)
cv_scores = []

for i, (train_index, val_index) in enumerate(tscv.split(df)):
    print(f"Fold {i+1}/5")
    cv_train, cv_val = df.iloc[train_index], df.iloc[val_index]
    cv_train_scaled = pd.DataFrame(
        scaler.fit_transform(cv_train), columns=cv_train.columns, index=cv_train.index
    )
    cv_val_scaled = pd.DataFrame(
        scaler.transform(cv_val), columns=cv_val.columns, index=cv_val.index
    )

    cv_sarima_pred = sarima_model(cv_train_scaled, cv_val_scaled)
    cv_prophet_pred = prophet_model(cv_train_scaled, cv_val_scaled, selected_features)
    cv_xgb_pred = xgboost_model(cv_train_scaled, cv_val_scaled, selected_features)
    cv_lgbm_pred = lightgbm_model(cv_train_scaled, cv_val_scaled, selected_features)

    cv_ensemble_pred = (
        best_weights[0] * cv_sarima_pred
        + best_weights[1] * cv_prophet_pred
        + best_weights[2] * cv_xgb_pred
        + best_weights[3] * cv_lgbm_pred
    )

    cv_score = evaluate_model(cv_val["Close"], cv_ensemble_pred)
    cv_scores.append(cv_score)

print("\nCross-validation Metrics:")
cv_metrics = pd.DataFrame(cv_scores)
print(cv_metrics.mean())

print("Closing database connection...")
conn.close()

print("Script execution completed.")
