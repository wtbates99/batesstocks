from __future__ import annotations

from functools import lru_cache
from pathlib import Path

STATIC_SP500_PATH = Path(__file__).resolve().parent.parent / "data" / "sp500_constituents.txt"

INDEX_AND_SECTOR_FUNDS = [
    "SPY",
    "IVV",
    "VOO",
    "SPLG",
    "QQQ",
    "QQQM",
    "DIA",
    "IWM",
    "VTI",
    "ITOT",
    "SCHB",
    "VV",
    "VUG",
    "VTV",
    "IWF",
    "IWD",
    "IJH",
    "IJR",
    "VB",
    "VXF",
    "MDY",
    "RSP",
    "SPYG",
    "SPYV",
    "VO",
    "VOE",
    "VBR",
    "XLF",
    "XLE",
    "XLK",
    "XLV",
    "XLY",
    "XLI",
    "XLP",
    "XLU",
    "XLB",
    "XLRE",
    "XLC",
    "SMH",
    "SOXX",
    "IGV",
    "IYR",
    "VNQ",
    "XBI",
    "TLT",
    "IEF",
    "SHY",
    "LQD",
    "HYG",
    "GLD",
    "SLV",
    "USO",
]

FALLBACK_LARGE_CAPS = [
    "AAPL",
    "MSFT",
    "NVDA",
    "AMZN",
    "META",
    "GOOGL",
    "BRK-B",
    "LLY",
    "JPM",
    "XOM",
]


def _normalize_symbol(symbol: str) -> str:
    return symbol.strip().upper().replace(".", "-")


def _load_static_sp500_constituents() -> tuple[str, ...]:
    if not STATIC_SP500_PATH.is_file():
        return tuple(_normalize_symbol(symbol) for symbol in FALLBACK_LARGE_CAPS)

    symbols = tuple(
        sorted(
            {
                _normalize_symbol(line)
                for line in STATIC_SP500_PATH.read_text(encoding="utf-8").splitlines()
                if line.strip()
            }
        )
    )
    return symbols or tuple(_normalize_symbol(symbol) for symbol in FALLBACK_LARGE_CAPS)


@lru_cache(maxsize=1)
def get_sp500_constituents() -> tuple[str, ...]:
    """Return the S&P 500 constituents from the bundled static list.

    The previous implementation scraped Wikipedia on every cold start with no timeout,
    which could stall the first sync by tens of seconds and silently fall back to the
    static file anyway. Refresh by replacing data/sp500_constituents.txt.
    """
    return _load_static_sp500_constituents()


def normalize_universe(tickers: list[str] | None = None) -> list[str]:
    if tickers is not None:
        return sorted({_normalize_symbol(ticker) for ticker in tickers if ticker.strip()})

    symbols = set(get_sp500_constituents())
    symbols.update(_normalize_symbol(symbol) for symbol in INDEX_AND_SECTOR_FUNDS)
    return sorted(symbols)
