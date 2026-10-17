"""需求分析：模型负责语义提取，程序负责类型与日期一致性。"""

from typing import Any

from pydantic import TypeAdapter

from src.agents.prompts import ANALYZER_PROMPT
from src.core.exceptions import BusinessError
from src.schemas.travel import AnalysisResult
from src.services.llm import LLMClient
from src.services.progress import ProgressReporter
from src.settings.config import Settings
from src.tools.date import DATE_TOOL_SCHEMA, current_date


async def analyze(
    query: str,
    prepared: str,
    llm: LLMClient,
    progress: ProgressReporter,
    settings: Settings,
) -> AnalysisResult:
    await progress.emit("AnalyzerAgent", "开始分析旅行需求...", query)

    async def execute_date(name: str, arguments: dict[str, Any]) -> str:
        if name != "get_current_date" or arguments:
            raise BusinessError("日期工具参数无效", 502)
        today = current_date(settings.APP_TIMEZONE)
        await progress.emit(name, "获取当前日期完成", today, "tool")
        return f"当前日期是 {today}，时区 {settings.APP_TIMEZONE}"

    result = await llm.json_result(
        ANALYZER_PROMPT
        + f"\n当前日期：{current_date(settings.APP_TIMEZONE)}；时区：{settings.APP_TIMEZONE}",
        query + (f"\n参数整理参考：{prepared}" if prepared else ""),
        TypeAdapter(AnalysisResult),
        [DATE_TOOL_SCHEMA],
        execute_date,
    )
    await progress.emit("AnalyzerAgent", "需求分析完成", result.model_dump(mode="json"))
    return result


def analysis_text(result: AnalysisResult) -> str:
    return (
        f"目的地：{result.destination}\n旅行天数：{result.duration}天\n"
        f"出发时间：{result.startDate}\n所有日期：{'、'.join(map(str, result.allDates))}\n"
        f"偏好：{'、'.join(result.preferences) or '观光'}\n预算：{result.budget}\n"
        f"出行人数：{result.travelers}人\n额外要求：{result.extraRequirements or '无'}"
    )
