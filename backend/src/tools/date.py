"""相对日期以配置时区计算，避免继续使用提示词中的旧年份。"""

from datetime import datetime
from zoneinfo import ZoneInfo

DATE_TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "get_current_date",
        "description": "获取当前日期，用来计算明天、后天等相对日期",
        "parameters": {"type": "object", "properties": {}},
    },
}


def current_date(timezone: str) -> str:
    return datetime.now(ZoneInfo(timezone)).date().isoformat()
