import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, cross_val_score, GridSearchCV
from sklearn.metrics import mean_squared_error
from sklearn.impute import SimpleImputer
from xgboost import XGBRegressor


def create_xgb_model(model_data):
    data = model_data

    # Prepare the dataset
    X = data.drop(
        columns=["Date", "Close", "Ticker"]
    )  # Drop non-numeric and target columns
    y = data["Close"]

    # Replace 'inf' values with 'NaN'
    X.replace([np.inf, -np.inf], np.nan, inplace=True)

    # Impute 'NaN' values with the median of each column
    imputer = SimpleImputer(strategy="median")
    X_imputed = imputer.fit_transform(X)
    X = pd.DataFrame(X_imputed, columns=X.columns)

    # Split the dataset into training and testing sets
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    # Initialize the XGBoost Regressor with default parameters
    xgb_model = XGBRegressor(random_state=42)

    # Train the model
    xgb_model.fit(X_train, y_train)

    # Predict and evaluate
    y_pred = xgb_model.predict(X_test)
    rmse_test = np.sqrt(mean_squared_error(y_test, y_pred))
    print(f"Baseline RMSE: {rmse_test}")

    # Perform cross-validation
    cv_scores = cross_val_score(xgb_model, X, y, cv=5, scoring="neg_mean_squared_error")
    cv_rmse_scores = np.sqrt(-cv_scores)
    print(f"CV RMSE: {cv_rmse_scores.mean()} ± {cv_rmse_scores.std()}")

    # Hyperparameter tuning (example grid)
    param_grid = {
        "n_estimators": [100, 200],
        "max_depth": [3, 6, 9],
        "learning_rate": [0.01, 0.1],
    }

    grid_search = GridSearchCV(
        xgb_model, param_grid, cv=5, scoring="neg_mean_squared_error"
    )
    grid_search.fit(X_train, y_train)

    # Best parameters and RMSE after tuning
    best_model = grid_search.best_estimator_
    y_pred_optimized = best_model.predict(X_test)
    rmse_optimized = np.sqrt(mean_squared_error(y_test, y_pred_optimized))
    print(f"Optimized RMSE: {rmse_optimized}")
    print("Best parameters:", grid_search.best_params_)
