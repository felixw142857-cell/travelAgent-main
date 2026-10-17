"""应用工厂：把配置、生命周期和基础组件组合为 FastAPI 应用。"""

from contextlib import asynccontextmanager
from time import monotonic

from fastapi import FastAPI

from src.core.init_app import (
    make_middlewares,
    register_exceptions,
    register_routers,
)
from src.log import configure_logging, logger
from src.settings.config import Settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.started_at = monotonic()
    app.state.ready = True
    logger.info("Application started: %s", app.state.settings.PROJECT_NAME)
    try:
        yield
    finally:
        app.state.ready = False
        logger.info("Application stopped: %s", app.state.settings.PROJECT_NAME)


def create_app(settings: Settings | None = None) -> FastAPI:
    """显式传入配置时可创建独立的测试实例。"""
    config = settings if settings is not None else Settings()
    configure_logging(config.LOG_LEVEL)

    application = FastAPI(
        title=config.APP_TITLE,
        description=config.APP_DESCRIPTION,
        version=config.VERSION,
        docs_url="/docs" if config.DOCS_ENABLED else None,
        redoc_url="/redoc" if config.DOCS_ENABLED else None,
        openapi_url="/openapi.json" if config.DOCS_ENABLED else None,
        lifespan=lifespan,
        middleware=make_middlewares(config),
    )
    application.state.settings = config
    application.state.ready = False
    application.state.started_at = None

    register_exceptions(application)
    register_routers(application)
    return application


app = create_app()
