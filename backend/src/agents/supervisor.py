"""智能编排保留必要依赖，防止跳过分析后报告缺少字段。"""

from pydantic import TypeAdapter

from src.agents.prompts import SUPERVISOR_PROMPT
from src.schemas.travel import PlanStep
from src.services.llm import LLMClient, ModelOutputError
from src.services.progress import ProgressReporter


def standard_steps() -> list[PlanStep]:
    return [
        PlanStep(agentName=name)
        for name in ("AnalyzerAgent", "WeatherAgent", "PlannerAgent")
    ]


async def make_plan(
    query: str, llm: LLMClient, progress: ProgressReporter
) -> list[PlanStep]:
    await progress.emit("SmartSupervisor", "开始智能编排...", query, "supervisor")
    try:
        proposed = await llm.json_result(
            SUPERVISOR_PROMPT, query, TypeAdapter(list[PlanStep])
        )
        if not proposed:
            raise ModelOutputError("执行计划为空", 502)
        by_name = {step.agentName: step for step in proposed}
        # 分析和最终规划始终保留；天气是否查询由主管选择。
        steps = [
            by_name.get(
                "AnalyzerAgent",
                PlanStep(agentName="AnalyzerAgent", reason="补齐需求分析依赖"),
            )
        ]
        if "WeatherAgent" in by_name:
            steps.append(by_name["WeatherAgent"])
        steps.append(
            by_name.get(
                "PlannerAgent",
                PlanStep(agentName="PlannerAgent", reason="生成最终旅行报告"),
            )
        )
    except ModelOutputError:
        await progress.emit(
            "SmartSupervisor", "智能计划格式异常，使用标准流程", kind="supervisor"
        )
        steps = standard_steps()
    await progress.emit(
        "SmartSupervisor",
        "执行计划已确定",
        [step.model_dump() for step in steps],
        "supervisor",
    )
    return steps
