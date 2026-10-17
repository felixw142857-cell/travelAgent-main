"""路由只处理 HTTP 输入输出，基础信息由 Service 提供。"""

from fastapi import APIRouter, Request

from src.core.dependency import SystemServiceDep
from src.schemas.base import HealthInfo, VersionInfo
from src.schemas.response import ErrorResponse, ResponseBase

router = APIRouter(tags=["基础信息"])


@router.get(
    "/health",
    summary="应用健康检查",
    response_model=ResponseBase[HealthInfo],
    responses={503: {"model": ErrorResponse}},
)
async def health_check(
    request: Request, service: SystemServiceDep
) -> ResponseBase[HealthInfo]:
    """检查应用生命周期状态；不代表模型、天气或数据库已接通。"""
    return ResponseBase(data=service.get_health(), request_id=request.state.request_id)


@router.get("/version", summary="版本信息", response_model=ResponseBase[VersionInfo])
async def get_version(
    request: Request, service: SystemServiceDep
) -> ResponseBase[VersionInfo]:
    return ResponseBase(data=service.get_version(), request_id=request.state.request_id)
