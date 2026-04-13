from backend.core import duckdb as duckdb_module
from backend.core.duckdb import duckdb_connection, ensure_schema
from backend.models import StrategyBacktestRequest, StrategyDefinition, StrategyLeg
from backend.services.terminal_service import run_strategy_backtest, screen_strategy


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


def test_backtest_applies_composite_rules_and_cost_drag(monkeypatch, tmp_path):
    _reset_schema(monkeypatch, tmp_path)

    with duckdb_connection() as conn:
        conn.execute(
            """
            INSERT INTO stock_information (Ticker, FullName, Sector)
            VALUES ('SPY', 'SPDR S&P 500 ETF', 'ETF')
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
                ('2026-04-07', 'SPY', 500, 502, 498, 500, 1000000, 490, 495, 48, 58, 1),
                ('2026-04-08', 'SPY', 501, 506, 500, 505, 1100000, 491, 496, 57, 63, 2),
                ('2026-04-09', 'SPY', 505, 511, 504, 510, 1200000, 492, 497, 61, 69, 3),
                ('2026-04-10', 'SPY', 510, 514, 503, 504, 1150000, 493, 498, 43, 51, -1)
            """
        )

    request = StrategyDefinition(
        name="Composite Test",
        entry=StrategyLeg(metric="Close", condition="above", compare_to_metric="Ticker_SMA_250"),
        exit=StrategyLeg(metric="Close", condition="below", compare_to_metric="Ticker_SMA_100"),
        entry_filters=[StrategyLeg(metric="Ticker_RSI", condition="above", threshold=55)],
        exit_filters=[StrategyLeg(metric="Ticker_RSI", condition="below", threshold=45)],
        fee_bps=5,
        slippage_bps=5,
    )

    response = run_strategy_backtest(
        StrategyBacktestRequest(ticker="SPY", strategy=request)
    )

    assert response.summary.gross_return_pct >= response.summary.total_return_pct
    assert response.summary.cost_drag_pct >= 0
    assert response.summary.total_fees_paid > 0
