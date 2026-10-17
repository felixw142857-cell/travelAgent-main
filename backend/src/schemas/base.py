"""健康、版本和入口接口的响应字段。"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class HealthInfo(BaseModel):
    status: Literal["healthy"] = "healthy"
    timestamp: datetime
    environment: str
    service: str
    uptime_seconds: float


class VersionInfo(BaseModel):
    app_title: str
    project_name: str
    version: str
    api_version: Literal["v1"] = "v1"
    python_version: str


class EntryInfo(BaseModel):
    service: str
    docs: str | None
    health: str
    version: str
