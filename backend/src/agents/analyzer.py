"""需求分析：模型负责语义提取，程序负责类型与日期一致性。"""

import json
from typing import Any

from pydantic import TypeAdapter

from src.agents.prompts import ANALYZER_PROMPT
from src.core.exceptions import BusinessError
from src.schemas.travel import (
    AnalysisDraft,
    AnalysisResult,
    Clarification,
    ConversationMessage,
)
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
    history: list[ConversationMessage] | None = None,
) -> AnalysisResult | Clarification:
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
        json.dumps(
            {
                "history": [message.model_dump() for message in history or []],
                "currentMessage": query,
                "prepared": prepared,
            },
            ensure_ascii=False,
        ),
        TypeAdapter(AnalysisDraft),
        [DATE_TOOL_SCHEMA],
        execute_date,
    )
    if result.missing_fields:
        questions = {
            "destination": "想去哪个城市或地区？",
            "startDate": "计划什么时候出发？可以说具体日期，也可以说“明天”。",
            "duration": "准备玩几天？目前支持 1–30 天。",
            "budget": "这次旅行的总预算大约是多少？也可以告诉我“预算不限”或“暂未确定”。",
        }
        known = []
        if result.destination:
            known.append(f"目的地是{result.destination}")
        if result.startDate:
            known.append(f"{result.startDate}出发")
        if result.duration:
            known.append(f"游玩{result.duration}天")
        if result.budget:
            known.append(f"预算：{result.budget}")
        opening = (
            "已记下：" + "，".join(known) + "。"
            if known
            else "可以，我来帮你规划旅行。"
        )
        message = (
            opening
            + "\n还需要确认：\n"
            + "\n".join(
                f"{index + 1}. {questions[field]}"
                for index, field in enumerate(result.missing_fields)
            )
        )
        clarification = Clarification(
            message=message, missingFields=result.missing_fields, draft=result
        )
        await progress.emit(
            "AnalyzerAgent", "等待补充旅行信息", clarification.model_dump(mode="json")
        )
        return clarification
    analysis = AnalysisResult.model_validate(result.model_dump())
    await progress.emit(
        "AnalyzerAgent", "需求分析完成", analysis.model_dump(mode="json")
    )
    return analysis


def analysis_text(result: AnalysisResult) -> str:
    return (
        f"目的地：{result.destination}\n旅行天数：{result.duration}天\n"
        f"出发时间：{result.startDate}\n所有日期：{'、'.join(map(str, result.allDates))}\n"
        f"偏好：{'、'.join(result.preferences) or '观光'}\n预算：{result.budget}\n"
        f"出行人数：{result.travelers}人\n额外要求：{result.extraRequirements or '无'}"
    )
