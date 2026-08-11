import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

import main
from backend.api import terminal
from backend.core.security import request_limiter
from backend.models import (
    StrategyBacktestPoint,
    StrategyBacktestRequest,
    StrategyBacktestResponse,
    StrategyBacktestSummary,
    StrategyDefinition,
    StrategyLeg,
)


@pytest.fixture(autouse=True)
def reset_rate_limiter(monkeypatch):
    request_limiter.reset()
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "true")


def test_security_headers_are_added_to_responses():
    response = TestClient(main.app).get("/health/live")

    assert response.status_code == 200
    assert response.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
def test_api_documentation_is_not_public(path):
    response = TestClient(main.app).get(path)

    assert response.status_code == 404


def test_system_read_routes_fail_closed_without_admin_token(monkeypatch):
    monkeypatch.delenv("SYSTEM_ADMIN_TOKEN", raising=False)

    response = TestClient(main.app).get("/system/backups")

    assert response.status_code == 503
    assert "available_backups" not in response.text


def test_public_sync_status_removes_internal_error(monkeypatch):
    tracker_snapshot = terminal.sync_status_tracker.get()
    monkeypatch.setattr(
        terminal.sync_status_tracker,
        "get",
        lambda: tracker_snapshot.__class__(
            **{
                **tracker_snapshot.__dict__,
                "state": "error",
                "detail": "/app/data/internal failure",
                "last_error": "secret provider detail",
            }
        ),
    )

    response = TestClient(main.app).get("/terminal/sync-status")

    assert response.status_code == 200
    assert response.json()["detail"] == "Market data refresh needs attention."
    assert response.json()["last_error"] is None
    assert "/app/data" not in response.text


def test_api_rate_limit_returns_429(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_API_PER_MINUTE", "2")
    client = TestClient(main.app)

    assert client.get("/search").status_code == 422
    assert client.get("/search").status_code == 422
    response = client.get("/search")

    assert response.status_code == 429
    assert response.headers["retry-after"]
    assert response.headers["x-ratelimit-remaining"] == "0"


def test_large_declared_request_body_is_rejected(monkeypatch):
    monkeypatch.setenv("MAX_REQUEST_BODY_BYTES", "32")

    response = TestClient(main.app).post(
        "/live-prices",
        content=b"x" * 33,
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 413


def test_large_streamed_request_body_is_rejected(monkeypatch):
    monkeypatch.setenv("MAX_REQUEST_BODY_BYTES", "32")

    response = TestClient(main.app).post(
        "/live-prices",
        content=iter([b"x" * 20, b"y" * 20]),
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 413


def test_public_models_bound_tickers_and_strategy_filters():
    leg = StrategyLeg(metric="Close", condition="above", threshold=1)

    with pytest.raises(ValidationError):
        main.PriceRequest(tickers=["AAPL"] * 26)
    with pytest.raises(ValidationError):
        StrategyBacktestRequest(
            ticker="not a ticker",
            strategy=StrategyDefinition(entry=leg, exit=leg),
        )
    with pytest.raises(ValidationError):
        StrategyDefinition(entry=leg, exit=leg, entry_filters=[leg] * 11)


def test_anonymous_backtest_is_not_persisted(monkeypatch):
    leg = StrategyLeg(metric="Close", condition="above", threshold=1)
    request = StrategyBacktestRequest(
        ticker="SPY",
        strategy=StrategyDefinition(entry=leg, exit=leg),
    )
    expected = StrategyBacktestResponse(
        ticker="SPY",
        strategy_name="Custom Strategy",
        summary=StrategyBacktestSummary(
            total_return_pct=0,
            gross_return_pct=0,
            cost_drag_pct=0,
            buy_hold_return_pct=0,
            max_drawdown_pct=0,
            win_rate=0,
            num_trades=0,
            avg_return_pct=0,
        ),
        equity_curve=[StrategyBacktestPoint(date="2026-08-10", equity=100_000, exposure=0)],
        trades=[],
        current_matches=[],
    )
    monkeypatch.setenv("PERSIST_STRATEGY_RUNS", "false")
    monkeypatch.setattr(terminal, "ensure_schema", lambda: None)
    monkeypatch.setattr(terminal, "run_strategy_backtest", lambda _request: expected)
    monkeypatch.setattr(
        terminal,
        "duckdb_connection",
        lambda *args, **kwargs: pytest.fail("anonymous backtests must not write to DuckDB"),
    )

    assert terminal.strategy_backtest(request) is expected
