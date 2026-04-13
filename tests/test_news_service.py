from backend.core import duckdb as duckdb_module
from backend.core.duckdb import ensure_schema
from backend.services.news_service import get_news


def _reset_schema(monkeypatch, tmp_path):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "news.duckdb"))
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "backups"))
    duckdb_module._SCHEMA_READY = False
    duckdb_module._SCHEMA_DB_PATH = None
    ensure_schema()


def test_get_news_fetches_and_caches_items(monkeypatch, tmp_path):
    _reset_schema(monkeypatch, tmp_path)

    class FakeTicker:
        def __init__(self, ticker: str):
            self.ticker = ticker

        @property
        def news(self):
            return [
                {
                    "uuid": f"{self.ticker}-1",
                    "title": f"{self.ticker} headline",
                    "publisher": "Wire",
                    "link": f"https://example.com/{self.ticker}",
                    "providerPublishTime": 1760000000,
                    "relatedTickers": [self.ticker, "SPY"],
                    "summary": "News summary",
                }
            ]

    monkeypatch.setattr("backend.services.news_service.yf.Ticker", FakeTicker)

    first = get_news(scope="security", tickers=["AAPL"], limit=5)
    second = get_news(scope="security", tickers=["AAPL"], limit=5)

    assert len(first.items) == 1
    assert first.items[0].title == "AAPL headline"
    assert len(second.items) == 1
    assert second.items[0].id == "AAPL-1"
