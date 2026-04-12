from backend.core import duckdb as duckdb_module
from backend.core.duckdb import duckdb_connection, ensure_schema
from backend.models import StrategyDefinition, StrategyLeg
from backend.services.terminal_service import screen_strategy


def _reset_schema(monkeypatch, tmp_path):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "terminal.duckdb"))
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "backups"))
    duckdb_module._SCHEMA_READY = False
    ensure_schema()


def test_screen_strategy_supports_metric_thresholds_and_universe_override(monkeypatch, tmp_path):
    _reset_schema(monkeypatch, tmp_path)

    with duckdb_connection() as conn:
        conn.execute(
            """
            INSERT INTO stock_information (Ticker, FullName, Sector)
            VALUES
                ('AAPL', 'Apple Inc.', 'Technology'),
                ('MSFT', 'Microsoft Corp.', 'Technology'),
                ('XLF', 'Financial Select Sector SPDR Fund', 'ETF')
            """
        )
        conn.execute(
            """
            INSERT INTO ticker_data (
                Date, Ticker, Open, High, Low, Close, Volume,
                Ticker_SMA_100, Ticker_SMA_250, Ticker_RSI,
                Ticker_Tech_Score, Ticker_Return_20D
            )
            VALUES
                ('2026-04-10', 'AAPL', 190, 193, 189, 191, 1000000, 186, 192, 58, 67, 6),
                ('2026-04-11', 'AAPL', 192, 198, 191, 197, 1400000, 187, 193, 63, 79, 9),
                ('2026-04-10', 'MSFT', 400, 402, 397, 399, 900000, 392, 395, 61, 71, 4),
                ('2026-04-11', 'MSFT', 399, 401, 396, 394, 850000, 393, 396, 48, 55, -1),
                ('2026-04-10', 'XLF', 45, 46, 44, 45, 500000, 44, 44.5, 52, 60, 2),
                ('2026-04-11', 'XLF', 45.2, 46.4, 45, 46.1, 650000, 44.2, 44.8, 57, 66, 3)
            """
        )

    strategy = StrategyDefinition(
        name="Metric Compare",
        universe=["AAPL", "MSFT"],
        entry=StrategyLeg(metric="Close", condition="above", compare_to_metric="Ticker_SMA_250"),
        exit=StrategyLeg(metric="Close", condition="below", compare_to_metric="Ticker_SMA_100"),
    )

    matches = screen_strategy(strategy)

    assert [match.ticker for match in matches] == ["AAPL"]
    assert matches[0].signal_state == "entry"


def test_ensure_schema_adds_long_horizon_indicator_columns(monkeypatch, tmp_path):
    _reset_schema(monkeypatch, tmp_path)

    with duckdb_connection(read_only=True) as conn:
        columns = {row[0] for row in conn.execute("DESCRIBE ticker_data").fetchall()}

    assert "Ticker_SMA_250" in columns
    assert "Ticker_SMA_200" in columns
    assert "Ticker_Return_252D" in columns
    assert "Ticker_52W_Range_Pct" in columns
