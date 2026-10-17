"""测试使用独立配置，不读取本机 .env 或访问外部服务。"""

from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src import create_app
from src.settings.config import Settings


@pytest.fixture
def settings() -> Settings:
    return Settings(_env_file=None, APP_ENV="testing", LOG_LEVEL="ERROR")


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    return create_app(settings)


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
