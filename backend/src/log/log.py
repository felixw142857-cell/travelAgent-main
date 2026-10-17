"""标准日志配置：让每一条业务日志带上当前请求 ID。"""

import logging

from src.log.context import request_id_var

logger = logging.getLogger("travel_agent")


class RequestContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


def configure_logging(level: str) -> None:
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.addFilter(RequestContextFilter())
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s [%(request_id)s] %(message)s")
        )
        logger.addHandler(handler)
    logger.setLevel(level)
    logger.propagate = False
