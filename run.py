from stock_data import pull_stocks

if __name__ == "__main__":
    stocks = ["MSFT", "AAPL", "TSLA"]  # Example list of stocks
    combined_stock_data = pull_stocks(stocks)
    combined_stock_data.to_csv("x.csv")
    print(combined_stock_data.columns)
