import pandas as pd
import sqlite3
from xgboost import XGBRegressor
from model_functions import (
    prepare_single_stock,
    time_series_split,
    evaluate_model,
    plot_predictions,
    plot_feature_importance,
)

conn = sqlite3.connect("../_stock_data.db")
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
X, y, df = prepare_single_stock(ticker="TSLA", features=features, conn=conn)

X = X.ffill().fillna(0)
y = y.ffill()
X = X.dropna()
y = y.loc[X.index]

X_train_scaled, X_test_scaled, y_train, y_test, scaler = time_series_split(X, y)

model = XGBRegressor(
    n_estimators=100,
    learning_rate=0.01,
    max_depth=6,
    min_child_weight=1,
    subsample=0.8,
    colsample_bytree=0.8,
    verbosity=1,
)

window_size = pd.Timedelta(days=252)  # Approximately one year of trading days
step_size = pd.Timedelta(days=30)  # Retrain every 30 days

y_pred = []
for i in range(0, len(X_test_scaled), len(X_test_scaled) // 10):  # Predict in 10 steps
    end_train = X_train_scaled.index[-1]
    start_window = end_train - window_size
    current_date = X_test_scaled.index[i]
    X_window = pd.concat(
        [X_train_scaled.loc[start_window:end_train], X_test_scaled.loc[:current_date]]
    )
    y_window = pd.concat(
        [y_train.loc[start_window:end_train], y_test.loc[:current_date]]
    )

    model.fit(X_window, y_window, verbose=False)
    next_step = min(i + len(X_test_scaled) // 10, len(X_test_scaled))
    X_pred = X_test_scaled.iloc[i:next_step]
    y_pred.extend(model.predict(X_pred))

y_pred = pd.Series(y_pred, index=y_test.index)

print(evaluate_model(y_test, y_pred))

plot_predictions(y_train, y_test, y_pred)

plot_feature_importance(model=model, feature_names=X.columns)
