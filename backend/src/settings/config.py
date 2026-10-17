"""沿用模板的 pydantic-settings 配置方式，配置与启动目录解耦。"""

from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import AnyHttpUrl, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    APP_TITLE: str = "Travel Agent API"
    APP_DESCRIPTION: str = "旅行规划助手：需求分析、天气查询、多代理编排与行程生成"
    PROJECT_NAME: str = "travel-agent-backend"
    VERSION: str = "0.1.0"
    APP_ENV: Literal["development", "testing", "production"] = "development"
    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    DOCS_ENABLED: bool = True
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    DEEPSEEK_API_KEY: SecretStr = SecretStr("")
    DEEPSEEK_BASE_URL: AnyHttpUrl = "https://api.deepseek.com"
    DEEPSEEK_MODEL: str = "deepseek-flash"
    APP_TIMEZONE: str = "Asia/Shanghai"
    LLM_TIMEOUT_SECONDS: float = Field(default=60, gt=0, le=300)
    PLAN_TIMEOUT_SECONDS: float = Field(default=240, gt=0, le=900)
    MAX_TOOL_ROUNDS: int = Field(default=6, ge=1, le=12)
    WEATHER_TIMEOUT_SECONDS: float = Field(default=10, gt=0, le=60)
    WEATHER_FAILURE_MODE: Literal["continue", "error"] = "continue"
    QWEATHER_API_KEY: SecretStr = SecretStr("")
    QWEATHER_API_HOST: str = ""
    QWEATHER_API_VERSION: Literal["v1", "v7"] = "v1"
    QWEATHER_FORECAST_DAYS: Literal["3d", "7d", "10d", "15d", "30d"] = "30d"

    @field_validator("QWEATHER_API_HOST")
    @classmethod
    def validate_weather_host(cls, value: str) -> str:
        host = value.strip().removeprefix("https://").rstrip("/")
        if host and not host.endswith(".qweatherapi.com"):
            raise ValueError(
                "QWEATHER_API_HOST 应为控制台提供的 *.qweatherapi.com 域名"
            )
        if any(character in host for character in "/?#@:"):
            raise ValueError("QWEATHER_API_HOST 只填写域名，不带路径和端口")
        return host

    @field_validator("APP_TIMEZONE")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("APP_TIMEZONE 必须是有效时区，例如 Asia/Shanghai") from exc
        return value

    @field_validator("CORS_ORIGINS")
    @classmethod
    def validate_cors_origins(cls, value: str) -> str:
        origins = []
        for item in value.split(","):
            origin = item.strip().rstrip("/")
            if not origin:
                continue
            url = urlsplit(origin)
            if (
                url.scheme not in {"http", "https"}
                or not url.hostname
                or url.username is not None
                or url.password is not None
                or url.path
                or url.query
                or url.fragment
            ):
                raise ValueError(
                    "CORS_ORIGINS 应为完整的 http/https 来源地址，不带路径"
                )
            # 访问 port 属性会校验端口格式和范围。
            _ = url.port
            if origin not in origins:
                origins.append(origin)
        return ",".join(origins)

    @property
    def CORS_ORIGINS_LIST(self) -> list[str]:
        return self.CORS_ORIGINS.split(",") if self.CORS_ORIGINS else []
