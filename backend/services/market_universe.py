from __future__ import annotations

from functools import lru_cache

import pandas as pd

SP500_SOURCE_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"

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


@lru_cache(maxsize=1)
def get_sp500_constituents() -> tuple[str, ...]:
    try:
        tables = pd.read_html(SP500_SOURCE_URL)
    except Exception:
        tables = []

    for table in tables:
        if "Symbol" not in table.columns:
            continue
        symbols = tuple(
            sorted(
                {
                    _normalize_symbol(str(value))
                    for value in table["Symbol"].dropna().tolist()
                    if str(value).strip()
                }
            )
        )
        if symbols:
            return symbols

    return tuple(_normalize_symbol(symbol) for symbol in FALLBACK_LARGE_CAPS)


def normalize_universe(tickers: list[str] | None = None) -> list[str]:
    if tickers is not None:
        return sorted({_normalize_symbol(ticker) for ticker in tickers if ticker.strip()})

    symbols = set(get_sp500_constituents())
    symbols.update(_normalize_symbol(symbol) for symbol in INDEX_AND_SECTOR_FUNDS)
    return sorted(symbols)
