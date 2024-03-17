from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
from xgboost import XGBRegressor


def pick_model_type(train_data_x, train_data_y):
    choice = input("Choices: xgb || linear_regression || random_forest\n")
    if choice == "xgb":
        baseline, param_grid, param_dist = xgb(train_data_x, train_data_y)
    elif choice == "linear_regression":
        baseline, param_grid, param_dist = linear_regression(train_data_x, train_data_y)
    elif choice == "random_forest":
        baseline, param_grid, param_dist = random_forest(train_data_x, train_data_y)
    else:
        print("Model choice not available")
        return None, {}, {}
    return baseline, param_grid, param_dist


def linear_regression(train_x, train_y):
    baseline_model = LinearRegression()
    baseline_model.fit(train_x, train_y)

    # Linear Regression doesn't have many hyperparameters to tune
    param_grid = {}
    param_distributions = {}

    return baseline_model, param_grid, param_distributions


def xgb(train_x, train_y):
    baseline_model = XGBRegressor(random_state=42)
    baseline_model.fit(train_x, train_y)

    param_grid = {
        "n_estimators": [100, 200],
        "max_depth": [3, 6, 9],
        "learning_rate": [0.01, 0.1],
    }

    param_distributions = {
        "n_estimators": [50, 100, 200, 300],
        "max_depth": [3, 4, 5, 6, 7],
        "learning_rate": [0.01, 0.05, 0.1, 0.2],
    }

    return baseline_model, param_grid, param_distributions


def random_forest(train_x, train_y):
    baseline_model = RandomForestRegressor(random_state=42)
    baseline_model.fit(train_x, train_y)

    param_grid = {
        "n_estimators": [100, 200, 300],
        "max_depth": [None, 10, 20, 30],
        "min_samples_split": [2, 5, 10],
    }

    param_distributions = {
        "n_estimators": [100, 200, 300, 400],
        "max_depth": [None, 5, 10, 15, 20],
        "min_samples_split": [2, 5, 10, 15],
    }

    return baseline_model, param_grid, param_distributions
