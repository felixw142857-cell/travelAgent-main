"""每日行程生成和跨字段校验。"""

import json

from pydantic import TypeAdapter

from src.agents.prompts import PLANNER_PROMPT
from src.core.exceptions import BusinessError
from src.schemas.travel import AnalysisResult, DayPlan, WeatherDay
from src.services.llm import LLMClient
from src.services.progress import ProgressReporter


async def plan_trip(
    analysis: AnalysisResult,
    weather: list[WeatherDay],
    prepared: str,
    llm: LLMClient,
    progress: ProgressReporter,
) -> list[DayPlan]:
    await progress.emit(
        "PlannerAgent",
        "开始生成每日行程...",
        {"destination": analysis.destination, "duration": analysis.duration},
    )
    plan = await llm.json_result(
        PLANNER_PROMPT,
        json.dumps(
            {
                "analysis": analysis.model_dump(mode="json"),
                "weather": [day.model_dump(mode="json") for day in weather],
                "prepared": prepared,
            },
            ensure_ascii=False,
        ),
        TypeAdapter(list[DayPlan]),
    )
    if [day.date for day in plan] != analysis.allDates:
        raise BusinessError("模型生成的行程日期与旅行日期不一致，请重新提交", 502)
    await progress.emit(
        "PlannerAgent", "行程规划完成", [day.model_dump(mode="json") for day in plan]
    )
    return plan


def planner_text(plan: list[DayPlan]) -> str:
    return "\n\n".join(
        f"第{index + 1}天（{day.date}）\n"
        + "\n".join(
            f"{activity.time}：{activity.activity}\n注意：{activity.notes}"
            for activity in day.plan
        )
        + f"\n当日建议：{day.generalTips}"
        for index, day in enumerate(plan)
    )
