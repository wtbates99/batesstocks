import pandas as pd
from predictions.run_preds import run_stock_predictions

ticker_dataframe = pd.read_csv("top_etfs_by_sector.csv")
if __name__ == "__main__":
    # stocks = ["MSFT", "AAPL", "TSLA"]  # Example list of stocks
    stocks = ticker_dataframe["TICKER"].tolist()
    ultimate_choice = input("Choices: xgb || linear_regression || random_forest\n")
    run_stock_predictions(stocks, ultimate_choice)
