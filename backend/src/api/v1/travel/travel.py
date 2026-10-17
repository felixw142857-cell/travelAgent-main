"""普通 JSON 和逐行事件流共用同一套 Python 业务逻辑。"""

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import suppress
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from src.core.dependency import SettingsDep
from src.core.exceptions import BusinessError
from src.log import logger
from src.schemas.response import ErrorResponse, ResponseBase
from src.schemas.travel import PlanOutcome, PlanRequest, ProgressRecord
from src.services.travel_service import TravelService

router = APIRouter(tags=["旅行规划"])


def get_travel_service(settings: SettingsDep) -> TravelService:
    return TravelService(settings)


TravelServiceDep = Annotated[TravelService, Depends(get_travel_service)]


@router.post(
    "/plan",
    summary="生成完整旅行计划",
    response_model=ResponseBase[PlanOutcome],
    responses={
        503: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        504: {"model": ErrorResponse},
    },
)
async def create_plan(
    payload: PlanRequest, request: Request, service: TravelServiceDep
) -> ResponseBase[PlanOutcome]:
    outcome = await service.execute(payload)
    return ResponseBase(data=outcome, request_id=request.state.request_id)


@router.post(
    "/plan/stream",
    summary="生成计划并实时推送执行记录",
    response_class=StreamingResponse,
    responses={
        200: {"content": {"application/x-ndjson": {"schema": {"type": "string"}}}},
        503: {"model": ErrorResponse},
    },
)
async def stream_plan(
    payload: PlanRequest, request: Request, service: TravelServiceDep
) -> StreamingResponse:
    # 配置问题在发送响应头之前返回正常 HTTP 错误。
    service.validate_configuration()
    request_id = request.state.request_id

    async def events() -> AsyncIterator[str]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=64)

        async def on_record(record: ProgressRecord) -> None:
            await queue.put({"event": "record", "data": record.model_dump(mode="json")})

        async def produce() -> None:
            try:
                outcome = await service.execute(payload, on_record)
                await queue.put(
                    {
                        "event": "result",
                        "data": outcome.result.model_dump(mode="json", by_alias=True),
                    }
                )
            except BusinessError as exc:
                await queue.put(
                    {
                        "event": "error",
                        "data": {
                            "message": exc.message,
                            "code": exc.status_code,
                            "request_id": request_id,
                        },
                    }
                )
            except Exception:
                logger.exception("Travel stream failed")
                await queue.put(
                    {
                        "event": "error",
                        "data": {
                            "message": "旅行规划失败，请根据 request_id 查看后端日志",
                            "code": 500,
                            "request_id": request_id,
                        },
                    }
                )

        task = asyncio.create_task(produce())
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=10)
                except TimeoutError:
                    event = {"event": "heartbeat", "data": None}
                yield json.dumps(event, ensure_ascii=False) + "\n"
                if event["event"] in {"result", "error"}:
                    break
        finally:
            # 浏览器取消或断开时，取消该请求的模型调用，避免后台继续工作。
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    return StreamingResponse(
        events(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
