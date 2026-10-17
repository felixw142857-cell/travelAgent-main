"""沿用模板的集中注册方式，入口文件只负责组合应用。"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware

from src.api import api_router
from src.core.exceptions import (
    BusinessError,
    business_error_handler,
    http_error_handler,
    unhandled_error_handler,
    validation_error_handler,
)
from src.core.middlewares import RequestLoggingMiddleware
from src.schemas.base import EntryInfo
from src.schemas.response import ResponseBase
from src.settings.config import Settings


def make_middlewares(settings: Settings) -> list[Middleware]:
    return [
        Middleware(
            CORSMiddleware,
            allow_origins=settings.CORS_ORIGINS_LIST,
            allow_credentials=False,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
            expose_headers=["X-Request-ID", "X-Process-Time-Ms"],
        ),
        Middleware(RequestLoggingMiddleware),
    ]


def register_exceptions(app: FastAPI) -> None:
    app.add_exception_handler(BusinessError, business_error_handler)
    app.add_exception_handler(HTTPException, http_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)


def register_routers(app: FastAPI) -> None:
    app.include_router(api_router, prefix="/api")

    @app.get("/", tags=["基础信息"], summary="服务入口")
    async def index(request: Request) -> ResponseBase[EntryInfo]:
        settings = request.app.state.settings
        return ResponseBase(
            data=EntryInfo(
                service=settings.PROJECT_NAME,
                docs="/docs" if settings.DOCS_ENABLED else None,
                health="/api/v1/base/health",
                version="/api/v1/base/version",
            ),
            request_id=request.state.request_id,
        )
