"""路由通过依赖注入获取配置和服务，便于测试及替换实现。"""

from typing import Annotated

from fastapi import Depends, Request

from src.services.system_service import SystemService
from src.settings.config import Settings


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_system_service(request: Request, settings: SettingsDep) -> SystemService:
    return SystemService(
        settings=settings,
        ready=request.app.state.ready,
        started_at=request.app.state.started_at,
    )


SystemServiceDep = Annotated[SystemService, Depends(get_system_service)]
