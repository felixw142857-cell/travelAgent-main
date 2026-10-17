"""保留模板的 code/msg/data 格式，并加入请求追踪 ID。"""

from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class ResponseBase(BaseModel, Generic[T]):
    code: int = Field(default=200, description="HTTP 状态码")
    msg: str = Field(default="OK", description="响应消息")
    data: T | None = Field(default=None, description="响应数据")
    request_id: str = Field(description="与 X-Request-ID 响应头一致的追踪 ID")


class ErrorResponse(ResponseBase[Any]):
    code: int = Field(description="错误状态码")
    msg: str = Field(description="错误原因")
