"""可独立测试的系统信息服务，不依赖 HTTP 传输细节。"""

import platform
from datetime import UTC, datetime
from time import monotonic

from src.core.exceptions import BusinessError
from src.schemas.base import HealthInfo, VersionInfo
from src.settings.config import Settings


class SystemService:
    def __init__(self, settings: Settings, ready: bool, started_at: float | None):
        self.settings = settings
        self.ready = ready
        self.started_at = started_at

    def get_health(self) -> HealthInfo:
        if not self.ready or self.started_at is None:
            raise BusinessError("应用尚未完成启动", status_code=503)
        return HealthInfo(
            timestamp=datetime.now(UTC),
            environment=self.settings.APP_ENV,
            service=self.settings.PROJECT_NAME,
            uptime_seconds=round(monotonic() - self.started_at, 3),
        )

    def get_version(self) -> VersionInfo:
        return VersionInfo(
            app_title=self.settings.APP_TITLE,
            project_name=self.settings.PROJECT_NAME,
            version=self.settings.VERSION,
            python_version=platform.python_version(),
        )
