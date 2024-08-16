import pandas as pd
import numpy as np
import sqlite3
from xgboost import XGBRegressor
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from sklearn.preprocessing import StandardScaler
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from model_functions import prepare_single_stock

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

X = X.fillna(method="ffill").fillna(0)
y = y.fillna(method="ffill")
X = X.dropna()
y = y.loc[X.index]

train_size = int(len(X) * 0.8)
X_train, X_test = X.iloc[:-train_size], X.iloc[-train_size:]
y_train, y_test = y.iloc[:-train_size], y.iloc[-train_size:]

scaler = StandardScaler()
X_train_scaled = pd.DataFrame(
    scaler.fit_transform(X_train), columns=X_train.columns, index=X_train.index
)
X_test_scaled = pd.DataFrame(
    scaler.transform(X_test), columns=X_test.columns, index=X_test.index
)

model = XGBRegressor(
    n_estimators=500,
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
mse = mean_squared_error(y_test, y_pred)
rmse = np.sqrt(mse)
mae = mean_absolute_error(y_test, y_pred)
r2 = r2_score(y_test, y_pred)

print(f"Mean Squared Error: {mse}")
print(f"Root Mean Squared Error: {rmse}")
print(f"Mean Absolute Error: {mae}")
print(f"R-squared Score: {r2}")

plt.figure(figsize=(15, 7))
plt.plot(y_train.index, y_train.values, label="Train Actual", color="blue")
plt.plot(y_test.index, y_test.values, label="Test Actual", color="green")
plt.plot(y_test.index, y_pred, label="Test Predicted", color="red")

plt.axvline(
    x=y_train.index[-1], color="purple", linestyle="--", label="Train/Test Split"
)

plt.title("Actual vs Predicted Ticker_Close")
plt.xlabel("Date")
plt.ylabel("Ticker_Close")
plt.legend()

plt.gca().xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m-%d"))
plt.gca().xaxis.set_major_locator(mdates.AutoDateLocator())
plt.gcf().autofmt_xdate()

plt.tight_layout()
plt.show()

feature_importance = model.feature_importances_
feature_importance = pd.DataFrame(
    {"feature": X.columns, "importance": feature_importance}
)
feature_importance = feature_importance.sort_values("importance", ascending=False)
print("Top 20 Important Features:")
print(feature_importance.head(20))

plt.figure(figsize=(12, 8))
plt.bar(feature_importance["feature"][:20], feature_importance["importance"][:20])
plt.title("Top 20 Feature Importance")
plt.xlabel("Features")
plt.ylabel("Importance")
plt.xticks(rotation=90)
plt.tight_layout()
plt.show()

test_data = pd.DataFrame({"Actual": y_test, "Predicted": y_pred})
test_data["Daily_Return"] = test_data["Actual"].pct_change()
test_data["Strategy_Return"] = np.where(
    test_data["Predicted"].shift() > test_data["Actual"].shift(),
    test_data["Daily_Return"],
    -test_data["Daily_Return"],
)

total_days = len(test_data)
profitable_days = sum(test_data["Strategy_Return"] > 0)
unprofitable_days = sum(test_data["Strategy_Return"] < 0)
total_return = (test_data["Strategy_Return"] + 1).prod() - 1
cumulative_returns = (test_data["Strategy_Return"] + 1).cumprod() - 1

print("\nFinancial Performance Metrics:")
print(f"Total trading days: {total_days}")
print(f"Profitable days: {profitable_days}")
print(f"Unprofitable days: {unprofitable_days}")
print(f"Total return: {total_return:.2%}")
print(
    f"Final cumulative return: ${10000 * (1 + total_return):.2f} (starting with $10,000)"
)

plt.figure(figsize=(12, 6))
plt.plot(cumulative_returns.index, cumulative_returns.values)
plt.title("Cumulative Returns of Trading Strategy")
plt.xlabel("Date")
plt.ylabel("Cumulative Return")

plt.gca().xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m-%d"))
plt.gca().xaxis.set_major_locator(mdates.AutoDateLocator())
plt.gcf().autofmt_xdate()  # Rotation

plt.tight_layout()
plt.show()
