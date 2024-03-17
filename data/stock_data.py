import yfinance as yf
import pandas as pd
from metric.metrics import calculate_metrics


def pull_single_stock(ticker):
    stock = yf.Ticker(ticker)
    hist = stock.history(period="max", interval="1d")
    hist["Prev_Day_Close"] = hist["Close"].shift(1)
    hist.reset_index(inplace=True)
    hist = calculate_metrics(hist)
    hist.dropna(inplace=True)
    hist["Ticker"] = f"{ticker}"
    return hist


def pull_stocks(tickers):
    # List to hold stock_data for all stocks
    all_stocks = []

    for tick_x in tickers:
        stock_data = pull_single_stock(tick_x)
        input_value = stock_data.iloc[-1:]
        input_value["Prev_Day_Close"] = input_value["Close"]
        input_value = input_value.drop(columns=["Date", "Close", "Ticker"])
        all_stocks.append(stock_data)

    # Concatenate all stock_data into a single stock_dataFrame
    concatenated_stock_data = pd.concat(all_stocks)
    return concatenated_stock_data, input_value
