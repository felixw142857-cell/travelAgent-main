"""每次规划独立收集记录，并可逐条推送到浏览器。"""

import json
from collections.abc import Awaitable, Callable
from time import time
from typing import Any, Literal
from uuid import uuid4

from src.schemas.travel import ProgressRecord

RecordCallback = Callable[[ProgressRecord], Awaitable[None]]


class ProgressReporter:
    def __init__(self, callback: RecordCallback | None = None):
        self.records: list[ProgressRecord] = []
        self.callback = callback

    async def emit(
        self,
        name: str,
        description: str,
        content: Any = "",
        kind: Literal["supervisor", "agent", "tool"] = "agent",
    ) -> None:
        is_json = not isinstance(content, str)
        record = ProgressRecord(
            id=uuid4().hex,
            name=name,
            type=kind,
            desc=description,
            content=json.dumps(content, ensure_ascii=False, default=str)
            if is_json
            else content,
            contentType="json" if is_json else "text",
            createdAt=int(time() * 1000),
        )
        self.records.append(record)
        if self.callback is not None:
            await self.callback(record)
