"""使用 ASGI 中间件记录请求，保持后续流式响应的兼容性。"""

import re
from time import perf_counter
from uuid import uuid4

from starlette.datastructures import Headers, MutableHeaders
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from src.core.exceptions import unhandled_error_handler
from src.log import logger
from src.log.context import request_id_var

REQUEST_ID_PATTERN = re.compile(r"[A-Za-z0-9._-]{1,64}")


class RequestLoggingMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming_id = Headers(scope=scope).get("X-Request-ID", "")
        request_id = (
            incoming_id if REQUEST_ID_PATTERN.fullmatch(incoming_id) else uuid4().hex
        )
        scope.setdefault("state", {})["request_id"] = request_id
        token = request_id_var.set(request_id)
        started_at = perf_counter()
        response_started = False
        status_code = 500

        async def send_response(message: Message) -> None:
            nonlocal status_code, response_started
            if message["type"] == "http.response.start":
                response_started = True
                status_code = message["status"]
                headers = MutableHeaders(scope=message)
                headers["X-Request-ID"] = request_id
                headers["X-Process-Time-Ms"] = (
                    f"{(perf_counter() - started_at) * 1000:.2f}"
                )
            await send(message)

        try:
            try:
                await self.app(scope, receive, send_response)
            except Exception as exc:
                # 发送响应前兜底，使 500 响应也能经过外层 CORS 中间件。
                if response_started:
                    raise
                response = await unhandled_error_handler(Request(scope), exc)
                await response(scope, receive, send_response)
        finally:
            logger.info(
                "%s %s status=%s duration_ms=%.2f",
                scope["method"],
                scope["path"],
                status_code,
                (perf_counter() - started_at) * 1000,
            )
            request_id_var.reset(token)
