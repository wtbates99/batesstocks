import sqlite3
from financial_data.data_pull import fetch_write_financial_data
from financial_data.data_manipulation import process_stock_data

conn = sqlite3.connect("_stock_data.db")
fetch_write_financial_data(conn)
process_stock_data(conn)
