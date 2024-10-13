import pandas as pd
import sqlite3
from prophet import Prophet
from prophet.diagnostics import cross_validation, performance_metrics
from sklearn.preprocessing import StandardScaler
from sklearn.feature_selection import mutual_info_regression
from model_functions import prepare_single_stock, evaluate_model
import matplotlib.pyplot as plt

# Connect to the database
conn = sqlite3.connect("../stock_data.db")

# Define features
features = [
    "Ticker_Open",
    "Ticker_High",
    "Ticker_Low",
    "Ticker_Volume",
    "Ticker_SMA_10",
    "Ticker_EMA_10",
    "Ticker_SMA_30",
    "Ticker_EMA_30",
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
    "Subsector_EMA_30",
]

# Prepare data
X, y, df = prepare_single_stock(ticker="AAPL", features=features, conn=conn)
X = X.ffill().fillna(0)
y = y.ffill()
X = X.dropna()
y = y.loc[X.index]

# Feature selection using mutual information
mi_scores = mutual_info_regression(X, y)
mi_scores = pd.Series(mi_scores, index=X.columns)
top_features = (
    mi_scores.sort_values(ascending=False).head(2).index.tolist()
)  # Reduce to top 5 features

# Use only top features
X = X[top_features]

# Normalize features
scaler = StandardScaler()
X_scaled = pd.DataFrame(scaler.fit_transform(X), columns=X.columns, index=X.index)

# Combine features and target
data = pd.concat([y, X_scaled], axis=1)
data = data.reset_index()
data.columns = ["ds", "y"] + list(X_scaled.columns)

# 60/40 train/test split
train_size = int(len(data) * 0.4)
train_data = data[:train_size]
test_data = data[train_size:]

# Initialize and fit Prophet model
model = Prophet(
    daily_seasonality=False,
    weekly_seasonality=True,
    yearly_seasonality=True,
    changepoint_prior_scale=0.0001,  # Further reduce flexibility
    seasonality_prior_scale=0.1,  # Further reduce seasonality impact
    holidays_prior_scale=0.1,  # Further reduce holiday effect
    changepoint_range=0.8,  # Limit changepoints to first 80% of the training data
    interval_width=0.95,  # 95% prediction intervals
    mcmc_samples=0,  # Disable MCMC sampling for faster fitting
)

# Add relevant features as regressors
for feature in top_features:
    model.add_regressor(feature, standardize=False)  # Features are already standardized

model.fit(train_data)

# Make predictions on train and test sets
train_forecast = model.predict(train_data)
test_forecast = model.predict(test_data)

# Evaluate model
train_metrics = evaluate_model(train_data["y"], train_forecast["yhat"])
test_metrics = evaluate_model(test_data["y"], test_forecast["yhat"])

print("Train Metrics:")
print(train_metrics)
print("\nTest Metrics:")
print(test_metrics)

# Plot predictions
plt.figure(figsize=(12, 6))
plt.plot(train_data["ds"], train_data["y"], label="Training Data")
plt.plot(test_data["ds"], test_data["y"], label="Test Data")
plt.plot(test_data["ds"], test_forecast["yhat"], label="Predictions", color="red")
plt.fill_between(
    test_data["ds"], test_forecast["yhat_lower"], test_forecast["yhat_upper"], alpha=0.3
)
plt.title("Stock Price Prediction")
plt.xlabel("Date")
plt.ylabel("Price")
plt.legend()
plt.show()

# Cross-validation
cv_results = cross_validation(
    model, initial="365 days", period="180 days", horizon="90 days"
)
cv_metrics = performance_metrics(cv_results)
print("\nCross-validation Metrics:")
print(cv_metrics)

# Plot cross-validation results
fig = model.plot(test_forecast)
plt.title("Forecast")
plt.show()

# Analyze components
fig = model.plot_components(test_forecast)
plt.show()
