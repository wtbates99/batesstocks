from predictions.run_preds import run_stock_predictions

if __name__ == "__main__":
    stocks = ["MSFT", "AAPL", "TSLA"]  # Example list of stocks
    ultimate_choice = input("Choices: xgb || linear_regression || random_forest\n")
    run_stock_predictions(stocks, ultimate_choice)
