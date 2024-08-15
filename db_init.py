import sqlite3


def create_tables(conn):
    """Create necessary tables in the SQLite database."""
    try:
        with conn:
            conn.execute("""
            CREATE TABLE IF NOT EXISTS stock_data (
                Date TEXT,
                Ticker TEXT,
                Open REAL,
                High REAL,
                Low REAL,
                Close REAL,
                Adj_Close REAL,
                Volume INTEGER
            )
            """)
            conn.execute("""
            CREATE TABLE IF NOT EXISTS stock_information (
                Ticker TEXT,
                Sector TEXT,
                Subsector TEXT,
                FullName TEXT,
                MarketCap REAL,
                Country TEXT,
                Website TEXT,
                Description TEXT,
                CEO TEXT,
                Employees INTEGER,
                City TEXT,
                State TEXT,
                Zip TEXT,
                Address TEXT,
                Phone TEXT,
                Exchange TEXT,
                Currency TEXT,
                QuoteType TEXT,
                ShortName TEXT,
                Price REAL,
                "52WeekHigh" REAL,
                "52WeekLow" REAL,
                DividendRate REAL,
                DividendYield REAL,
                PayoutRatio REAL,
                Beta REAL,
                PE REAL,
                EPS REAL,
                Revenue REAL,
                GrossProfit REAL,
                FreeCashFlow REAL
            )
            """)
        print("Tables created successfully.")
    except sqlite3.Error as e:
        print(f"An error occurred while creating tables: {e}")


def main():
    """Main function to set up the SQLite database with required tables and views."""
    try:
        with sqlite3.connect("_stock_data.db") as conn:
            create_tables(conn)
    except sqlite3.Error as e:
        print(f"An error occurred while connecting to the database: {e}")


if __name__ == "__main__":
    main()
