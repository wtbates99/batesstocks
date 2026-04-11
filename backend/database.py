import os

import duckdb
from dotenv import load_dotenv

load_dotenv()

DB_PATH = os.getenv("DB_PATH", "stock_data.duckdb")  # override in prod via DB_PATH env var


def get_conn() -> duckdb.DuckDBPyConnection:
    """Return a new DuckDB connection with memory/thread limits applied.

    Each caller is responsible for closing the connection when done.
    DuckDB supports multiple concurrent connections to the same file.
    """
    conn = duckdb.connect(DB_PATH)
    conn.execute("SET memory_limit='2GB'")
    conn.execute("SET threads=4")
    conn.execute("SET temp_directory='/tmp'")
    return conn
