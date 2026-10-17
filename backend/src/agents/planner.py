"""每日行程生成：候选景点约束 + 跨字段校验。

设计要点
--------
* 候选景点由本地景点库按城市/偏好筛出，随提示词一起给模型，模型只能从中挑选。
* 校验分两级：景点 id 与重复安排属于硬约束（违反则重试一次，再失败返回 502）；
  单日时长只是估计值，超出上限仅告警，不阻断。
* 城市不在景点库内时自动降级为原有的自由生成，不报错；此时 source 标为 model。
"""

from __future__ import annotations

import json

from pydantic import TypeAdapter

from src.agents.prompts import PLANNER_PROMPT
from src.core.exceptions import BusinessError
from src.schemas.travel import AnalysisResult, DayPlan, WeatherDay
from src.services.llm import LLMClient
from src.services.progress import ProgressReporter
from src.tools.attraction import (
    Attraction,
    AttractionDataError,
    build_candidates,
)

MAX_DAY_MINUTES = 720  # 单日景点停留上限 12 小时，超出只告警
SOURCE_MODEL = "model（未使用景点库，待核实）"
SOURCE_UNVERIFIED = "model（未指定候选景点，待核实）"
REPAIR_HINT = "上次结果违反了下列约束，请严格修正后重新输出合法 JSON：\n"


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
    candidates = await _collect_candidates(analysis, progress)
    base_payload = {
        "analysis": analysis.model_dump(mode="json"),
        "weather": [day.model_dump(mode="json") for day in weather],
        "prepared": prepared,
        "candidates": [item.brief() for item in candidates],
    }

    adapter = TypeAdapter(list[DayPlan])
    violation = ""
    plan: list[DayPlan] = []
    warnings: list[str] = []
    for attempt in range(2):
        payload = dict(base_payload)
        if violation:
            payload["violations"] = violation
        plan = await llm.json_result(
            PLANNER_PROMPT,
            json.dumps(payload, ensure_ascii=False),
            adapter,
        )
        try:
            warnings = _validate(plan, analysis, candidates)
            break
        except BusinessError as exc:
            if attempt or not candidates:
                raise
            # 硬约束失败：带上违规原因重问一次，避免整单失败
            violation = REPAIR_HINT + exc.message
            await progress.emit(
                "PlannerAgent", "行程未通过校验，正在按约束重新生成", exc.message
            )

    if warnings:
        await progress.emit("PlannerAgent", "行程存在待确认项", warnings)
    await progress.emit(
        "PlannerAgent",
        "行程规划完成",
        [day.model_dump(mode="json") for day in plan],
    )
    return plan


async def _collect_candidates(
    analysis: AnalysisResult, progress: ProgressReporter
) -> list[Attraction]:
    """城市不在景点库内时降级为自由生成，不阻断主流程。"""
    try:
        candidates = build_candidates(
            analysis.destination,
            analysis.preferences,
            days=analysis.duration,
        )
    except AttractionDataError as exc:
        await progress.emit(
            "search_attractions", "未使用景点库，行程由模型自由生成", str(exc), "tool"
        )
        return []
    await progress.emit(
        "search_attractions",
        f"命中 {len(candidates)} 个候选景点",
        {
            "city": analysis.destination,
            "items": [
                {"id": item.id, "name": item.name, "category": item.category_label}
                for item in candidates
            ],
        },
        "tool",
    )
    return candidates


def _validate(
    plan: list[DayPlan],
    analysis: AnalysisResult,
    candidates: list[Attraction],
) -> list[str]:
    """硬约束抛 BusinessError；软约束收集成告警返回。

    attractionId 是可选的：用餐、交通、休息等时段本来就不对应景点，
    留空即标记为「未校验」。一旦填了，就必须是候选库内的 id 且全程不重复。
    """
    if [day.date for day in plan] != analysis.allDates:
        raise BusinessError("模型生成的行程日期与旅行日期不一致，请重新提交", 502)

    by_id = {item.id: item for item in candidates}
    if not by_id:
        for day in plan:
            for activity in day.plan:
                activity.source = SOURCE_MODEL
                activity.attractionId = ""
        return []

    seen: set[str] = set()
    warnings: list[str] = []
    for day in plan:
        minutes = 0
        for activity in day.plan:
            key = activity.attractionId.strip()
            if not key:
                activity.source = SOURCE_UNVERIFIED
                continue
            if key not in by_id:
                raise BusinessError(
                    f"行程含景点库之外的景点（{day.date}：{activity.activity[:24]}）",
                    502,
                )
            if key in seen:
                raise BusinessError(f"景点「{by_id[key].name}」在行程中重复安排", 502)
            seen.add(key)
            candidate = by_id[key]
            activity.attractionId = key
            # 来源由服务端按 id 覆写，不采信模型自述
            activity.source = (
                f"{candidate.source.provider} · {candidate.source.license}"
            )
            minutes += candidate.suggested_minutes
        if minutes > MAX_DAY_MINUTES:
            warnings.append(
                f"{day.date} 景点停留约 {minutes // 60} 小时，超过单日上限 "
                f"{MAX_DAY_MINUTES // 60} 小时，建议删减"
            )
    return warnings


def planner_text(plan: list[DayPlan]) -> str:
    body = "\n\n".join(
        f"第{index + 1}天（{day.date}）\n"
        + "\n".join(
            f"{activity.time}：{activity.activity}\n注意：{activity.notes}"
            for activity in day.plan
        )
        + f"\n当日建议：{day.generalTips}"
        for index, day in enumerate(plan)
    )
    sources = {
        activity.source for day in plan for activity in day.plan if activity.source
    }
    if not sources:
        return body
    return body + "\n\n资料来源：" + "；".join(sorted(sources))
