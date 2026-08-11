from __future__ import annotations

import ipaddress
import os
from collections import OrderedDict
from dataclasses import dataclass
from threading import Lock
from time import monotonic

from fastapi import Request
from starlette.datastructures import MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

CONTENT_SECURITY_POLICY = "; ".join(
    [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: https:",
        "connect-src 'self'",
    ]
)

SECURITY_HEADERS = {
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
}


def apply_security_headers(headers: MutableHeaders) -> None:
    for name, value in SECURITY_HEADERS.items():
        headers[name] = value


class RequestBodyLimitMiddleware:
    """Enforce the body limit while streaming, including requests without Content-Length."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") not in {"POST", "PUT", "PATCH"}:
            await self.app(scope, receive, send)
            return

        received = 0
        messages: list[Message] = []
        while True:
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > max_request_body_bytes():
                    response = JSONResponse(
                        status_code=413,
                        content={"detail": "Request body too large"},
                    )
                    apply_security_headers(response.headers)
                    await response(scope, receive, send)
                    return
            messages.append(message)
            if message["type"] == "http.disconnect" or not message.get("more_body", False):
                break

        message_index = 0

        async def receive_buffered() -> Message:
            nonlocal message_index
            if message_index < len(messages):
                message = messages[message_index]
                message_index += 1
                return message
            return {"type": "http.request", "body": b"", "more_body": False}

        await self.app(scope, receive_buffered, send)


def request_client_ip(request: Request) -> str:
    if os.getenv("TRUST_CLOUDFLARE_CONNECTING_IP", "false").lower() == "true":
        forwarded = request.headers.get("cf-connecting-ip", "").strip()
        try:
            return str(ipaddress.ip_address(forwarded))
        except ValueError:
            pass
    return request.client.host if request.client else "unknown"


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    limit: int
    remaining: int
    retry_after: int


class FixedWindowRateLimiter:
    """Small, process-local limiter for the single-worker DuckDB deployment."""

    def __init__(self, max_keys: int = 10_000) -> None:
        self._max_keys = max_keys
        self._lock = Lock()
        self._windows: OrderedDict[tuple[str, str], tuple[int, float]] = OrderedDict()

    def check(
        self,
        client: str,
        bucket: str,
        limit: int,
        window_seconds: int = 60,
    ) -> RateLimitResult:
        now = monotonic()
        key = (client, bucket)
        with self._lock:
            count, window_start = self._windows.pop(key, (0, now))
            elapsed = now - window_start
            if elapsed >= window_seconds:
                count = 0
                window_start = now
                elapsed = 0

            allowed = count < limit
            if allowed:
                count += 1
            self._windows[key] = (count, window_start)
            while len(self._windows) > self._max_keys:
                self._windows.popitem(last=False)

        remaining = max(limit - count, 0)
        retry_after = max(1, int(window_seconds - elapsed + 0.999))
        return RateLimitResult(allowed, limit, remaining, retry_after)

    def reset(self) -> None:
        with self._lock:
            self._windows.clear()


request_limiter = FixedWindowRateLimiter()


def rate_limit_policy(path: str, method: str) -> tuple[str, int] | None:
    if os.getenv("RATE_LIMIT_ENABLED", "true").lower() != "true":
        return None

    if path in {"/health/live", "/health/ready"} or path.startswith(("/assets/", "/brand/")):
        return None

    if path.startswith("/system/"):
        return "system", int(os.getenv("RATE_LIMIT_SYSTEM_PER_MINUTE", "20"))

    if path.startswith("/ai/"):
        return "ai", int(os.getenv("RATE_LIMIT_AI_PER_MINUTE", "10"))

    if method == "POST" and path.startswith("/strategies/"):
        return "strategy", int(os.getenv("RATE_LIMIT_STRATEGY_PER_MINUTE", "10"))

    provider_route = (
        path == "/live-prices"
        or path.startswith("/api/news")
        or path.startswith("/api/earnings")
        or path.endswith("/intraday")
        or path.endswith("/fundamentals")
    )
    if provider_route:
        return "provider", int(os.getenv("RATE_LIMIT_PROVIDER_PER_MINUTE", "30"))

    api_prefixes = (
        "/ai/",
        "/api/",
        "/live-prices",
        "/search",
        "/strategies/",
        "/terminal/",
    )
    if path.startswith(api_prefixes):
        return "api", int(os.getenv("RATE_LIMIT_API_PER_MINUTE", "120"))
    return None


def max_request_body_bytes() -> int:
    return int(os.getenv("MAX_REQUEST_BODY_BYTES", "262144"))
