from backend.core import duckdb as duckdb_module
from backend.core.duckdb import duckdb_connection, ensure_schema
from backend.models import StrategyBacktestRequest, StrategyDefinition, StrategyLeg
from backend.services.terminal_service import (
    get_market_monitor,
    get_sector_overview,
    get_terminal_snapshots,
    run_strategy_backtest,
    screen_strategy,
)


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


def test_market_monitor_and_snapshots_return_ranked_views(monkeypatch, tmp_path):
    _reset_schema(monkeypatch, tmp_path)

    with duckdb_connection() as conn:
        conn.execute(
            """
            INSERT INTO stock_information (Ticker, FullName, Sector, MarketCap)
            VALUES
                ('AAPL', 'Apple Inc.', 'Technology', 3000000000000),
                ('MSFT', 'Microsoft Corp.', 'Technology', 3100000000000),
                ('XLF', 'Financial ETF', 'Financials', 50000000000)
            """
        )
        conn.execute(
            """
            INSERT INTO ticker_data (
                Date, Ticker, Open, High, Low, Close, Volume,
                Ticker_SMA_200, Ticker_RSI, Ticker_Tech_Score,
                Ticker_Return_20D, Ticker_Return_63D, Ticker_Return_126D, Ticker_Return_252D,
                Ticker_Avg_Volume_20D
            )
            VALUES
                ('2026-04-10', 'AAPL', 190, 193, 189, 191, 1000000, 180, 58, 67, 6, 9, 15, 23, 800000),
                ('2026-04-11', 'AAPL', 192, 198, 191, 197, 1400000, 181, 63, 79, 9, 14, 18, 25, 850000),
                ('2026-04-10', 'MSFT', 400, 402, 397, 399, 900000, 392, 61, 71, 4, 6, 10, 15, 880000),
                ('2026-04-11', 'MSFT', 399, 401, 396, 394, 850000, 393, 48, 55, -1, 2, 4, 9, 870000),
                ('2026-04-10', 'XLF', 45, 46, 44, 45, 500000, 44, 52, 60, 2, 3, 5, 8, 450000),
                ('2026-04-11', 'XLF', 45.2, 46.4, 45, 46.1, 650000, 44.2, 57, 66, 3, 4, 6, 9, 470000)
            """
        )

    monitor = get_market_monitor()
    snapshots = get_terminal_snapshots(["AAPL", "MSFT"])

    assert monitor.universe_size == 3
    assert monitor.leaders[0].ticker == "AAPL"
    assert len(monitor.sectors) >= 2
    assert {item.ticker for item in snapshots.items} == {"AAPL", "MSFT"}


def test_sector_overview_returns_ranked_members(monkeypatch, tmp_path):
    _reset_schema(monkeypatch, tmp_path)

    with duckdb_connection() as conn:
        conn.execute(
            """
            INSERT INTO stock_information (Ticker, FullName, Sector, MarketCap)
            VALUES
                ('AAPL', 'Apple Inc.', 'Technology', 3000000000000),
                ('MSFT', 'Microsoft Corp.', 'Technology', 3100000000000),
                ('NVDA', 'NVIDIA Corp.', 'Technology', 2800000000000),
                ('XLF', 'Financial ETF', 'Financials', 50000000000)
            """
        )
        conn.execute(
            """
            INSERT INTO ticker_data (
                Date, Ticker, Open, High, Low, Close, Volume,
                Ticker_SMA_200, Ticker_RSI, Ticker_Tech_Score,
                Ticker_Return_20D, Ticker_Return_63D, Ticker_Return_126D, Ticker_Return_252D,
                Ticker_Avg_Volume_20D
            )
            VALUES
                ('2026-04-10', 'AAPL', 190, 193, 189, 191, 1000000, 180, 58, 67, 6, 9, 15, 23, 800000),
                ('2026-04-11', 'AAPL', 192, 198, 191, 197, 1400000, 181, 63, 79, 9, 14, 18, 25, 850000),
                ('2026-04-10', 'MSFT', 400, 402, 397, 399, 900000, 392, 61, 71, 4, 6, 10, 15, 880000),
                ('2026-04-11', 'MSFT', 399, 401, 396, 394, 850000, 393, 48, 55, -1, 2, 4, 9, 870000),
                ('2026-04-10', 'NVDA', 850, 875, 840, 870, 2200000, 760, 66, 92, 14, 22, 36, 61, 1800000),
                ('2026-04-11', 'NVDA', 872, 905, 870, 901, 2600000, 765, 71, 95, 19, 28, 42, 66, 1850000),
                ('2026-04-10', 'XLF', 45, 46, 44, 45, 500000, 44, 52, 60, 2, 3, 5, 8, 450000),
                ('2026-04-11', 'XLF', 45.2, 46.4, 45, 46.1, 650000, 44.2, 57, 66, 3, 4, 6, 9, 470000)
            """
        )

    overview = get_sector_overview("Technology")

    assert overview.sector == "Technology"
    assert overview.summary[0].value == "3"
    assert overview.leaders[0].ticker == "NVDA"
    assert {item.ticker for item in overview.members} == {"AAPL", "MSFT", "NVDA"}
