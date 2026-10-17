"""v1 路由：后续旅行接口在这里注册。"""

from fastapi import APIRouter

from src.api.v1.base import base_router
from src.api.v1.travel import travel_router

v1_router = APIRouter()
v1_router.include_router(base_router, prefix="/base")
v1_router.include_router(travel_router, prefix="/travel")
