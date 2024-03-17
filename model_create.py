from model_functions import prepare_data
from model_functions import split_data
from model_functions import grid_s_cv
from model_functions import random_s_cv
from model_functions import select_best_model

from model_types import pick_model_type
from model_types import xgb


def creation_of_the_gods(data):
    # Prepare the Data
    X, y = prepare_data(
        data, target_column="Close", columns_to_drop=["Date", "Close", "Ticker"]
    )

    # Split the data
    X_train, X_test, y_train, y_test = split_data(X, y)

    # Train Baseline
    base, p_grid, p_dist = pick_model_type(X_train, y_train)

    # Grid Search and Random Search
    grid, grid_score = grid_s_cv(X_train, y_train, base, p_grid)
    random, random_score = random_s_cv(X_train, y_train, base, p_dist)

    # Pick Best
    best_model = select_best_model(
        base, grid, grid_score, random, random_score, X_test, y_test
    )

    return best_model


def prediction_of_the_gods(prediction_input, dankest_model):
    # Assuming new_data is a DataFrame containing new observations
    predictions = dankest_model.predict(prediction_input)
    return predictions
