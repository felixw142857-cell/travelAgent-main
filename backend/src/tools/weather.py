"""和风天气服务端适配；真实预报数据不会交给模型改写。"""

from datetime import date
from typing import Any

import httpx
from pydantic import BaseModel, Field, ValidationError

from src.core.exceptions import BusinessError
from src.schemas.travel import WeatherDay
from src.services.progress import ProgressReporter
from src.settings.config import Settings


class Location(BaseModel):
    id: str
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


def unavailable_weather(dates: list[date], reason: str) -> list[WeatherDay]:
    return [
        WeatherDay(
            date=day,
            recommendations=f"{reason}；暂无实际预报，请在出发前再次查询天气。",
        )
        for day in dates
    ]


class WeatherTools:
    def __init__(
        self, client: httpx.AsyncClient, settings: Settings, progress: ProgressReporter
    ):
        self.client = client
        self.settings = settings
        self.progress = progress

    async def request(self, path: str, params: dict[str, str]) -> dict[str, Any]:
        if (
            not self.settings.QWEATHER_API_KEY.get_secret_value()
            or not self.settings.QWEATHER_API_HOST
        ):
            raise BusinessError(
                "未配置和风天气，请在 backend/.env 填写 QWEATHER_API_KEY 和 QWEATHER_API_HOST",
                503,
            )
        try:
            response = await self.client.get(
                f"https://{self.settings.QWEATHER_API_HOST}{path}",
                params=params,
                headers={
                    "X-QW-Api-Key": self.settings.QWEATHER_API_KEY.get_secret_value()
                },
                timeout=self.settings.WEATHER_TIMEOUT_SECONDS,
            )
        except httpx.TimeoutException as exc:
            raise BusinessError(
                "和风天气请求超时，请检查天气 API Host 和网络", 504
            ) from exc
        except httpx.RequestError as exc:
            raise BusinessError(
                "无法连接和风天气，请检查 API Host 和网络", 502
            ) from exc
        try:
            data = response.json()
        except ValueError as exc:
            raise BusinessError(
                "和风天气未返回 JSON 数据，请检查 API Host", 502
            ) from exc
        if not isinstance(data, dict):
            raise BusinessError("和风天气返回的数据格式无效", 502)
        code = str(data.get("code", response.status_code))
        if response.status_code >= 400 or code != "200":
            hints = {
                "401": "认证失败，请检查天气 Key",
                "402": "余额或额度不足",
                "403": "没有接口权限，请检查 Key、Host 和订阅",
                "404": "未找到地点或接口",
                "429": "请求过于频繁，请稍后重试",
            }
            raise BusinessError(
                f"和风天气（{code}）：{hints.get(code, '接口请求失败')}", 502
            )
        return data

    async def get_location(self, address: str) -> Location:
        await self.progress.emit(
            "get_location_id", "开始获取 LocationId...", {"address": address}, "tool"
        )
        data = await self.request(
            "/geo/v2/city/lookup", {"location": address, "lang": "zh"}
        )
        locations = data.get("location")
        if not isinstance(locations, list) or not locations:
            raise BusinessError(f"未找到地点“{address}”，请提供城市或区县名称", 422)
        try:
            location = Location.model_validate(locations[0])
        except ValidationError as exc:
            raise BusinessError("地点查询没有返回有效的位置数据", 502) from exc
        await self.progress.emit(
            "get_location_id", "获取 LocationId 完成", location.model_dump(), "tool"
        )
        return location

    async def get_forecast(
        self, location: Location, dates: list[date]
    ) -> list[WeatherDay]:
        await self.progress.emit(
            "get_weather_by_location_id",
            "开始查询天气...",
            {"locationId": location.id, "dates": dates},
            "tool",
        )
        if self.settings.QWEATHER_API_VERSION == "v1":
            data = await self.request(
                f"/weather/v1/daily/{location.lat:.2f}/{location.lon:.2f}",
                {"days": "10", "localTime": "true", "lang": "zh"},
            )
            rows = data.get("days")
        else:
            data = await self.request(
                f"/v7/weather/{self.settings.QWEATHER_FORECAST_DAYS}",
                {"location": location.id, "lang": "zh"},
            )
            rows = data.get("daily")
        if not isinstance(rows, list):
            raise BusinessError("和风天气未返回有效预报，请检查接口版本和权限", 502)

        by_date: dict[str, dict[str, Any]] = {}
        for row in rows:
            if not isinstance(row, dict):
                continue
            day = row.get("fxDate") or str(row.get("forecastStartTime", ""))[:10]
            by_date[day] = row
        result = []
        for day in dates:
            row = by_date.get(day.isoformat())
            if row is None:
                result.extend(
                    unavailable_weather([day], "旅行日期不在接口返回的预报范围内")
                )
                continue
            if self.settings.QWEATHER_API_VERSION == "v1":
                try:
                    text = row.get("daytime", {}).get("condition", {}).get("text")
                    high = row.get("temperatureMax", {}).get("value")
                    low = row.get("temperatureMin", {}).get("value")
                except (AttributeError, TypeError) as exc:
                    raise BusinessError("天气预报字段格式无效", 502) from exc
            else:
                text, high, low = (
                    row.get("textDay"),
                    row.get("tempMax"),
                    row.get("tempMin"),
                )
            if not text or high is None or low is None:
                raise BusinessError("天气预报缺少天气现象或温度字段", 502)
            result.append(
                WeatherDay(
                    date=day,
                    weather=str(text),
                    high=f"{high}°C",
                    low=f"{low}°C",
                    source="qweather",
                )
            )
        await self.progress.emit(
            "get_weather_by_location_id",
            "天气查询完成",
            [item.model_dump(mode="json") for item in result],
            "tool",
        )
        return result
