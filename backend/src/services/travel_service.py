"""请求级旅行编排；不保存全局任务状态，也不在浏览器中执行 Agent。"""

import asyncio
from typing import Any

import httpx

from src.agents import analyzer, gatekeeper, planner, supervisor, weather
from src.core.exceptions import BusinessError
from src.schemas.travel import (
    AgentResult,
    AgentResults,
    AnalysisResult,
    PlanOutcome,
    PlanRequest,
)
from src.services.llm import LLMClient
from src.services.progress import ProgressReporter, RecordCallback
from src.settings.config import Settings
from src.tools.weather import WeatherTools, unavailable_weather


class TravelService:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        self.settings = settings
        self.client = client

    def validate_configuration(self) -> None:
        if not self.settings.DEEPSEEK_API_KEY.get_secret_value().strip():
            raise BusinessError(
                "请先在 backend/.env 填写 DEEPSEEK_API_KEY，然后重启 Python 后端", 503
            )

    async def execute(
        self, request: PlanRequest, callback: RecordCallback | None = None
    ) -> PlanOutcome:
        self.validate_configuration()
        progress = ProgressReporter(callback)
        try:
            async with asyncio.timeout(self.settings.PLAN_TIMEOUT_SECONDS):
                if self.client is not None:
                    result = await self._run(request, self.client, progress)
                else:
                    async with httpx.AsyncClient(follow_redirects=False) as client:
                        result = await self._run(request, client, progress)
        except TimeoutError as exc:
            raise BusinessError(
                "旅行规划超过总时间限制，请缩短旅行天数或稍后重试", 504
            ) from exc
        return PlanOutcome(result=result, records=progress.records)

    async def _run(
        self,
        request: PlanRequest,
        client: httpx.AsyncClient,
        progress: ProgressReporter,
    ) -> AgentResults:
        llm = LLMClient(client, self.settings)
        tools = WeatherTools(client, self.settings, progress)
        steps = (
            await supervisor.make_plan(request.query, llm, progress)
            if request.mode == "smart"
            else supervisor.standard_steps()
        )
        analysis: AnalysisResult | None = None
        weather_days = []
        daily_plan = []
        context: dict[str, Any] = {"originalQuery": request.query}
        for step in steps:
            await progress.emit(
                "SmartSupervisor" if request.mode == "smart" else "AgentCoordinator",
                f"执行 {step.agentName}",
                step.reason,
                "supervisor",
            )
            prepared = (
                await gatekeeper.prepare_input(step.agentName, context, llm, progress)
                if request.mode == "smart"
                else ""
            )
            if step.agentName == "AnalyzerAgent":
                analysis = await analyzer.analyze(
                    request.query, prepared, llm, progress, self.settings
                )
                context["analysis"] = analysis.model_dump(mode="json")
            elif step.agentName == "WeatherAgent":
                if analysis is None:
                    raise BusinessError("执行计划缺少需求分析结果", 500)
                weather_days = await weather.collect_weather(
                    analysis, prepared, tools, llm, progress, self.settings
                )
                context["weather"] = [
                    day.model_dump(mode="json") for day in weather_days
                ]
            else:
                if analysis is None:
                    raise BusinessError("执行计划缺少需求分析结果", 500)
                if not weather_days:
                    weather_days = unavailable_weather(
                        analysis.allDates, "智能编排未执行天气查询"
                    )
                    await progress.emit(
                        "WeatherAgent", "已跳过天气查询", "报告将标记天气信息不可用"
                    )
                daily_plan = await planner.plan_trip(
                    analysis, weather_days, prepared, llm, progress
                )
        if analysis is None or not daily_plan:
            raise BusinessError("旅行规划未生成完整结果", 502)
        result = AgentResults(
            analysis=AgentResult(
                text=analyzer.analysis_text(analysis), json_data=analysis
            ),
            weather=AgentResult(
                text=weather.weather_text(weather_days), json_data=weather_days
            ),
            planner=AgentResult(
                text=planner.planner_text(daily_plan), json_data=daily_plan
            ),
        )
        await progress.emit("旅行规划", "全部任务完成", kind="supervisor")
        return result
