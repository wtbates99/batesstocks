from stock_data import pull_stocks
from model_create import create_xgb_model

if __name__ == "__main__":
    # stocks = ["MSFT", "AAPL", "TSLA"]  # Example list of pull_stocks
    stocks = ["KO"]
    model_data, input = pull_stocks(stocks)
    model_data.to_csv("model_data.csv")
    print(model_data.columns)

    create_xgb_model(model_data)
