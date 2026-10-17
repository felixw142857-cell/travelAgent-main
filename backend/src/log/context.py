"""每个请求独立的追踪 ID，异步任务之间不会共用一个变量。"""

from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")
