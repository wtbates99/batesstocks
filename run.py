from stock_data import pull_stocks
from model_create import creation_of_the_gods, prediction_of_the_gods

if __name__ == "__main__":
    # stocks = ["MSFT", "AAPL", "TSLA"]  # Example list of pull_stocks
    stocks = ["KO"]
    model_data, model_input = pull_stocks(stocks)
    model = creation_of_the_gods(model_data)
    preds = prediction_of_the_gods(model_input, model)
    print(preds)
