"""
Terminal service — public re-export facade.

All query logic lives in backend/queries/*.  This module re-exports the
public API so existing callers (api layer, tests) require no changes.
"""

from __future__ import annotations

# Re-export everything callers currently import from this module.
from backend.queries.backtest import run_strategy_backtest as run_strategy_backtest
from backend.queries.dashboard import (
    get_terminal_overview as get_terminal_overview,
)
from backend.queries.dashboard import (
    get_terminal_snapshots as get_terminal_snapshots,
)
from backend.queries.monitor import (
    get_market_monitor as get_market_monitor,
)
from backend.queries.monitor import (
    get_sector_overview as get_sector_overview,
)
from backend.queries.security import get_security_overview as get_security_overview
from backend.queries.strategy import screen_strategy as screen_strategy

__all__ = [
    "get_market_monitor",
    "get_sector_overview",
    "get_security_overview",
    "get_terminal_overview",
    "get_terminal_snapshots",
    "run_strategy_backtest",
    "screen_strategy",
]
