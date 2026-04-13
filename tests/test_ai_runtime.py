import pytest

import main


class _FakeStreamResponse:
    def __init__(self, *, lines: list[str], status_code: int = 200):
        self._lines = lines
        self.status_code = status_code

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    async def aiter_lines(self):
        for line in self._lines:
            yield line


class _FakeAsyncClient:
    def __init__(self, *args, **kwargs):
        self.calls: list[dict[str, object]] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    def stream(self, method: str, url: str, *, headers: dict[str, str], json: dict[str, object]):
        self.calls.append(
            {
                "method": method,
                "url": url,
                "headers": headers,
                "json": json,
            }
        )
        return _FakeStreamResponse(
            lines=[
                '{"message":{"content":"<think>hidden</think>"}}',
                '{"message":{"content":"Visible answer"},"done":true}',
            ]
        )


@pytest.mark.asyncio
async def test_call_ollama_uses_bearer_auth_and_streaming(monkeypatch):
    fake_client = _FakeAsyncClient()

    def factory(*args, **kwargs):
        return fake_client

    monkeypatch.setattr(main.httpx, "AsyncClient", factory)
    monkeypatch.setenv("OLLAMA_HOST", "https://ollama.com/api")
    monkeypatch.setenv("OLLAMA_MODEL", "gemini-3-flash-preview")
    monkeypatch.setenv("OLLAMA_API_KEY", "secret-token")

    payload = main.AiChatRequest(messages=[main.AiMessage(role="user", content="hello")])
    content = await main._call_ollama(payload)

    assert content == "Visible answer"
    assert fake_client.calls == [
        {
            "method": "POST",
            "url": "https://ollama.com/api/chat",
            "headers": {"Authorization": "Bearer secret-token"},
            "json": {
                "model": "gemini-3-flash-preview",
                "stream": True,
                "think": False,
                "messages": [{"role": "user", "content": "hello"}],
            },
        }
    ]
