import sqlite3
import pandas as pd


def check_view_exists(conn, view_name):
    cursor = conn.cursor()
    cursor.execute(
        f"SELECT name FROM sqlite_master WHERE type='view' AND name='{view_name}';"
    )
    return cursor.fetchone() is not None


def run_test_query(conn, query, test_name):
    try:
        cursor = conn.cursor()
        cursor.execute(query)
        result = cursor.fetchall()
        print(f"Test: {test_name}")
        print(f"Result: {result}")
    except sqlite3.Error as e:
        print(f"Test: {test_name}")
        print(f"Error: {e}")
    print("------------------------")


def run_comparison_test(conn, query1, query2, test_name):
    try:
        df1 = pd.read_sql_query(query1, conn)
        df2 = pd.read_sql_query(query2, conn)
        is_equal = df1.equals(df2)
        print(f"Test: {test_name}")
        print(f"Result: {'Pass' if is_equal else 'Fail'}")
        if not is_equal:
            print(f"Differences:\n{pd.concat([df1, df2]).drop_duplicates(keep=False)}")
    except sqlite3.Error as e:
        print(f"Test: {test_name}")
        print(f"Error: {e}")
    print("------------------------")


def validate_view():
    conn = sqlite3.connect("stock_data.db")

    if not check_view_exists(conn, "combined_stock_data"):
        print("Error: The view 'combined_stock_data' does not exist in the database.")
        print(
            "Please ensure that you have created the view before running this script."
        )
        conn.close()
        return

    tests = [
        ("Check if view returns results", "SELECT COUNT(*) FROM combined_stock_data;"),
        (
            "Check for NULL values in key columns",
            """
         SELECT COUNT(*)
         FROM combined_stock_data
         WHERE Date IS NULL OR Ticker IS NULL OR Sector IS NULL OR Subsector IS NULL;
         """,
        ),
        (
            "Check for data consistency across tables",
            """
         SELECT COUNT(*)
         FROM combined_stock_data
         WHERE Ticker_Open != Open OR Sector_Open != "Open:1" OR Subsector_Open != "Open:2";
         """,
        ),
        ("Verify date ranges", "SELECT MIN(Date), MAX(Date) FROM combined_stock_data;"),
        (
            "Check for duplicate entries",
            """
         SELECT COUNT(*)
         FROM (
             SELECT Date, Ticker, COUNT(*)
             FROM combined_stock_data
             GROUP BY Date, Ticker
             HAVING COUNT(*) > 1
         );
         """,
        ),
        (
            "Verify that all tickers in the original data are present in the view",
            """
         SELECT COUNT(*)
         FROM (
             SELECT Ticker FROM ticker_data
             EXCEPT
             SELECT Ticker FROM combined_stock_data
         );
         """,
        ),
        (
            "Check if the number of rows in the view matches the number of rows in ticker_data",
            """
         SELECT
             (SELECT COUNT(*) FROM ticker_data) -
             (SELECT COUNT(*) FROM combined_stock_data) AS row_count_difference;
         """,
        ),
        (
            "Verify that calculated fields are not NULL",
            """
         SELECT COUNT(*)
         FROM combined_stock_data
         WHERE Ticker_SMA_10 IS NULL OR Sector_RSI IS NULL OR Subsector_MACD IS NULL;
         """,
        ),
        (
            "Check for any mismatches in Date joins",
            """
         SELECT COUNT(*)
         FROM combined_stock_data c
         LEFT JOIN ticker_data t ON c.Date = t."Date:1"
         LEFT JOIN sector_data s ON c.Date = s."Date:2"
         LEFT JOIN subsector_data ss ON c.Date = ss."Date:3"
         WHERE t."Date:1" IS NULL OR s."Date:2" IS NULL OR ss."Date:3" IS NULL;
         """,
        ),
        (
            "Verify that Volume columns are always non-negative",
            """
         SELECT COUNT(*)
         FROM combined_stock_data
         WHERE Ticker_Volume < 0 OR Sector_Volume < 0 OR Subsector_Volume < 0;
         """,
        ),
        (
            "Check for any gaps in the date sequence",
            """
         WITH date_sequence AS (
             SELECT Date
             FROM combined_stock_data
             GROUP BY Date
             ORDER BY Date
         )
         SELECT COUNT(*)
         FROM (
             SELECT Date, LEAD(Date) OVER (ORDER BY Date) AS next_date
             FROM date_sequence
         )
         WHERE JULIANDAY(next_date) - JULIANDAY(Date) > 1;
         """,
        ),
        (
            "Verify that all sectors in sector_data are present in combined_stock_data",
            """
         SELECT COUNT(*)
         FROM (
             SELECT DISTINCT Sector FROM sector_data
             EXCEPT
             SELECT DISTINCT Sector FROM combined_stock_data
         );
         """,
        ),
        (
            "Check for any inconsistencies in Ticker-Sector-Subsector relationships",
            """
         SELECT COUNT(*)
         FROM (
             SELECT DISTINCT Ticker, Sector, Subsector
             FROM combined_stock_data
             GROUP BY Ticker
             HAVING COUNT(DISTINCT Sector) > 1 OR COUNT(DISTINCT Subsector) > 1
         );
         """,
        ),
        (
            "Verify that all technical indicators are within expected ranges",
            """
         SELECT COUNT(*)
         FROM combined_stock_data
         WHERE Ticker_RSI < 0 OR Ticker_RSI > 100
            OR Sector_RSI < 0 OR Sector_RSI > 100
            OR Subsector_RSI < 0 OR Subsector_RSI > 100;
         """,
        ),
        (
            "Check for extreme outliers in price data",
            """
         SELECT COUNT(*)
         FROM combined_stock_data
         WHERE Ticker_Close > 10 * Ticker_Open
            OR Ticker_Close < 0.1 * Ticker_Open;
         """,
        ),
        # New tests
        (
            "Check for consistency in date formats",
            """
         SELECT COUNT(*)
         FROM combined_stock_data
         WHERE Date != date(Date);
         """,
        ),
        (
            "Verify that all subsectors in subsector_data are present in combined_stock_data",
            """
         SELECT COUNT(*)
         FROM (
             SELECT DISTINCT Subsector FROM subsector_data
             EXCEPT
             SELECT DISTINCT Subsector FROM combined_stock_data
         );
         """,
        ),
        (
            "Check for any negative prices",
            """
         SELECT COUNT(*)
         FROM combined_stock_data
         WHERE Ticker_Open < 0 OR Ticker_Close < 0 OR Ticker_High < 0 OR Ticker_Low < 0
            OR Sector_Open < 0 OR Sector_Close < 0 OR Sector_High < 0 OR Sector_Low < 0
            OR Subsector_Open < 0 OR Subsector_Close < 0 OR Subsector_High < 0 OR Subsector_Low < 0;
         """,
        ),
        (
            "Verify that High is always greater than or equal to Low",
            """
         SELECT COUNT(*)
         FROM combined_stock_data
         WHERE Ticker_High < Ticker_Low
            OR Sector_High < Sector_Low
            OR Subsector_High < Subsector_Low;
         """,
        ),
        (
            "Check for any duplicate Date-Ticker combinations",
            """
         SELECT COUNT(*)
         FROM (
             SELECT Date, Ticker, COUNT(*)
             FROM combined_stock_data
             GROUP BY Date, Ticker
             HAVING COUNT(*) > 1
         );
         """,
        ),
    ]

    for test_name, query in tests:
        run_test_query(conn, query, test_name)

    # Comparison tests
    comparison_tests = [
        (
            "Verify Ticker totals match between original and combined data",
            """
         SELECT Date, SUM(Close) as Total_Close
         FROM ticker_data
         GROUP BY Date
         ORDER BY Date
         """,
            """
         SELECT Date, SUM(Ticker_Close) as Total_Close
         FROM combined_stock_data
         GROUP BY Date
         ORDER BY Date
         """,
        ),
        (
            "Verify Sector totals match between original and combined data",
            """
         SELECT Date, SUM(Close) as Total_Close
         FROM sector_data
         GROUP BY Date
         ORDER BY Date
         """,
            """
         SELECT Date, SUM(Sector_Close) as Total_Close
         FROM combined_stock_data
         GROUP BY Date
         ORDER BY Date
         """,
        ),
        # New comparison test
        (
            "Verify Subsector totals match between original and combined data",
            """
         SELECT Date, SUM(Close) as Total_Close
         FROM subsector_data
         GROUP BY Date
         ORDER BY Date
         """,
            """
         SELECT Date, SUM(Subsector_Close) as Total_Close
         FROM combined_stock_data
         GROUP BY Date
         ORDER BY Date
         """,
        ),
    ]

    for test_name, query1, query2 in comparison_tests:
        run_comparison_test(conn, query1, query2, test_name)

    conn.close()


if __name__ == "__main__":
    validate_view()
