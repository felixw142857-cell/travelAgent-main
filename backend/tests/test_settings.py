"""配置文件、环境变量优先级和应用实例隔离。"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from src import create_app
from src.settings.config import BACKEND_ROOT, Settings


def test_env_file_is_resolved_relative_to_backend() -> None:
    assert Path(Settings.model_config["env_file"]) == BACKEND_ROOT / ".env"


def test_process_environment_overrides_env_file(tmp_path: Path, monkeypatch) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("PROJECT_NAME=from-file\n", encoding="utf-8")
    monkeypatch.setenv("PROJECT_NAME", "from-environment")
    assert Settings(_env_file=env_file).PROJECT_NAME == "from-environment"


def test_secret_is_not_in_settings_representation() -> None:
    settings = Settings(_env_file=None, DEEPSEEK_API_KEY="private-key-for-test")
    assert "private-key-for-test" not in repr(settings)
    assert settings.DEEPSEEK_API_KEY.get_secret_value() == "private-key-for-test"


def test_cors_origins_are_normalized() -> None:
    settings = Settings(
        _env_file=None,
        CORS_ORIGINS=" http://localhost:5173/, http://localhost:5173, https://example.com ",
    )
    assert settings.CORS_ORIGINS_LIST == [
        "http://localhost:5173",
        "https://example.com",
    ]


@pytest.mark.parametrize("origin", ["*", "localhost:5173", "https://example.com/path"])
def test_invalid_cors_configuration_is_rejected(origin: str) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, CORS_ORIGINS=origin)


def test_application_instances_do_not_share_configuration() -> None:
    app_one = create_app(
        Settings(_env_file=None, PROJECT_NAME="one", LOG_LEVEL="ERROR")
    )
    app_two = create_app(
        Settings(_env_file=None, PROJECT_NAME="two", LOG_LEVEL="ERROR")
    )
    with TestClient(app_one) as first, TestClient(app_two) as second:
        assert first.get("/api/v1/base/health").json()["data"]["service"] == "one"
        assert second.get("/api/v1/base/health").json()["data"]["service"] == "two"
