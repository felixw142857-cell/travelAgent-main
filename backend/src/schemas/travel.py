"""旅行接口契约；字段与 React 报告和时间线一一对应。"""

import re
from datetime import date, timedelta
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class PlanRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    query: str = Field(min_length=1, max_length=5000)
    mode: Literal["standard", "smart"] = "standard"


class AnalysisResult(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    destination: str = Field(min_length=1)
    duration: int = Field(ge=1, le=30)
    startDate: date
    allDates: list[date] = Field(default_factory=list)
    budget: str = "未指定"
    preferences: list[str] = Field(default_factory=list)
    extraRequirements: str = ""
    travelers: int = Field(default=1, ge=1, le=100)

    @field_validator("preferences", mode="before")
    @classmethod
    def normalize_preferences(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [
                item.strip() for item in re.split(r"[,，、;；]", value) if item.strip()
            ]
        return value

    @field_validator("budget", mode="before")
    @classmethod
    def normalize_budget(cls, value: Any) -> str:
        return str(value) if value is not None else "未指定"

    @model_validator(mode="before")
    @classmethod
    def ignore_model_dates(cls, value: Any) -> Any:
        # 日期由程序按出发日和天数推导，避免模型漏天或输出旧版逗号字符串。
        if isinstance(value, dict):
            value = {**value, "allDates": []}
        return value

    @model_validator(mode="after")
    def calculate_dates(self):
        self.allDates = [
            self.startDate + timedelta(days=day) for day in range(self.duration)
        ]
        return self


class WeatherDay(BaseModel):
    date: date
    weather: str = "无天气信息"
    high: str = "无天气信息"
    low: str = "无天气信息"
    recommendations: str = "暂无天气预报，请在出发前查询实际天气。"
    source: Literal["qweather", "unavailable"] = "unavailable"


class WeatherAdvice(BaseModel):
    date: date
    recommendations: str = Field(min_length=1)


class Activity(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    time: str = Field(min_length=1)
    activity: str = Field(min_length=1)
    notes: str = ""


class DayPlan(BaseModel):
    date: date
    plan: list[Activity] = Field(min_length=3, max_length=20)
    generalTips: str = ""


T = TypeVar("T")


class AgentResult(BaseModel, Generic[T]):
    model_config = ConfigDict(populate_by_name=True)
    text: str
    json_data: T = Field(alias="json")


class AgentResults(BaseModel):
    analysis: AgentResult[AnalysisResult]
    weather: AgentResult[list[WeatherDay]]
    planner: AgentResult[list[DayPlan]]


class ProgressRecord(BaseModel):
    id: str
    name: str
    type: Literal["supervisor", "agent", "tool"]
    desc: str
    content: str
    contentType: Literal["json", "text", ""]
    createdAt: int


class PlanOutcome(BaseModel):
    result: AgentResults
    records: list[ProgressRecord]


class PlanStep(BaseModel):
    agentName: Literal["AnalyzerAgent", "WeatherAgent", "PlannerAgent"]
    reason: str = "执行旅行规划步骤"


class PreparedInput(BaseModel):
    targetAgentInput: str = Field(min_length=1)
    reasoning: str = ""
    usedSources: list[str] = Field(default_factory=list)
