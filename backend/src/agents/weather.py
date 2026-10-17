"""真实天气先查询，模型仅补充出行建议，避免伪造实时天气。"""

import json

from pydantic import TypeAdapter

from src.agents.prompts import WEATHER_PROMPT
from src.core.exceptions import BusinessError
from src.schemas.travel import AnalysisResult, WeatherAdvice, WeatherDay
from src.services.llm import LLMClient, ModelOutputError
from src.services.progress import ProgressReporter
from src.settings.config import Settings
from src.tools.weather import WeatherTools, unavailable_weather


async def collect_weather(
    analysis: AnalysisResult,
    prepared: str,
    tools: WeatherTools,
    llm: LLMClient,
    progress: ProgressReporter,
    settings: Settings,
) -> list[WeatherDay]:
    await progress.emit(
        "WeatherAgent",
        "开始收集天气信息...",
        {"destination": analysis.destination, "dates": analysis.allDates},
    )
    try:
        location = await tools.get_location(analysis.destination)
        weather = await tools.get_forecast(location, analysis.allDates)
    except BusinessError as exc:
        await progress.emit("WeatherAgent", "天气查询未完成", exc.message)
        if settings.WEATHER_FAILURE_MODE == "error":
            raise
        weather = unavailable_weather(analysis.allDates, exc.message)
    if any(day.source == "qweather" for day in weather):
        try:
            advice = await llm.json_result(
                WEATHER_PROMPT,
                json.dumps(
                    {
                        "analysis": analysis.model_dump(mode="json"),
                        "weather": [day.model_dump(mode="json") for day in weather],
                        "prepared": prepared,
                    },
                    ensure_ascii=False,
                ),
                TypeAdapter(list[WeatherAdvice]),
            )
            advice_by_date = {item.date: item.recommendations for item in advice}
            for day in weather:
                if day.source == "qweather":
                    day.recommendations = advice_by_date.get(
                        day.date, "请根据实际预报准备衣物、雨具和室内备选安排。"
                    )
        except ModelOutputError:
            # 有真实预报时保留数据，建议格式出错不应抹掉天气事实。
            for day in weather:
                if day.source == "qweather":
                    day.recommendations = "请根据实际预报准备衣物、雨具和室内备选安排。"
            await progress.emit("WeatherAgent", "天气建议格式异常，已保留真实预报")
    await progress.emit(
        "WeatherAgent",
        "天气信息整理完成",
        [day.model_dump(mode="json") for day in weather],
    )
    return weather


def weather_text(weather: list[WeatherDay]) -> str:
    return "\n\n".join(
        f"{day.date}：{day.weather}，{day.low}～{day.high}\n出行建议：{day.recommendations}"
        for day in weather
    )
