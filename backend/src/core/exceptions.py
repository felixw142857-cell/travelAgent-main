"""把业务异常、HTTP 异常和参数错误转换成统一响应。"""

from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from src.log import logger
from src.schemas.response import ResponseBase


class BusinessError(Exception):
    """可向调用者展示的业务错误；后续 Agent/天气服务可使用。"""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def error_response(
    request: Request,
    status_code: int,
    message: str,
    data: Any = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "-")
    response_headers = dict(headers or {})
    response_headers["X-Request-ID"] = request_id
    content = ResponseBase[Any](
        code=status_code, msg=message, data=data, request_id=request_id
    )
    return JSONResponse(
        status_code=status_code,
        content=content.model_dump(mode="json"),
        headers=response_headers,
    )


async def business_error_handler(request: Request, exc: BusinessError) -> JSONResponse:
    return error_response(request, exc.status_code, exc.message)


async def http_error_handler(request: Request, exc: HTTPException) -> JSONResponse:
    message = exc.detail if isinstance(exc.detail, str) else "HTTP 请求失败"
    return error_response(request, exc.status_code, message, headers=exc.headers)


async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    errors = [
        {"location": list(item["loc"]), "message": item["msg"], "type": item["type"]}
        for item in exc.errors()
    ]
    return error_response(request, 422, "请求参数校验失败", {"errors": errors})


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "Unhandled request error: %s %s",
        request.method,
        request.url.path,
        exc_info=(type(exc), exc, exc.__traceback__),
    )
    return error_response(
        request, 500, "服务器内部错误，请根据 request_id 查看服务端日志"
    )
