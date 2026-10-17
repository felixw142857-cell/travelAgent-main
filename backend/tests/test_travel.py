"""通过真实 API/Service/Agent 流程测试迁移，只有外部 HTTP 服务被替换。"""

import asyncio
import json
from datetime import date

import httpx
import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from pydantic import SecretStr, TypeAdapter

from src import create_app
from src.api.v1.travel.travel import get_travel_service, stream_plan
from src.core.exceptions import BusinessError
from src.schemas.travel import AnalysisResult, PlanRequest, ProgressRecord
from src.services.llm import LLMClient
from src.services.progress import ProgressReporter
from src.services.travel_service import TravelService
from src.tools.weather import Location, WeatherTools


def analysis_data():
    return {
        "destination": "成都",
        "duration": 2,
        "startDate": "2026-10-18",
        "budget": 3000,
        "preferences": "美食、观光",
        "extraRequirements": "去宽窄巷子",
    }


def plan_data():
    return [
        {
            "date": day,
            "plan": [
                {
                    "time": time,
                    "activity": "在成都游览并体验当地美食",
                    "notes": "注意交通与开放时间",
                }
                for time in ("上午", "中午", "下午")
            ],
            "generalTips": "预留休息时间",
        }
        for day in ("2026-10-18", "2026-10-19")
    ]


def completion(content):
    return httpx.Response(
        200,
        json={
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": json.dumps(content, ensure_ascii=False),
                    }
                }
            ]
        },
    )


class ExternalAPIs:
    def __init__(self):
        self.requests = []
        self.skip_weather = False
        self.weather_failure = False
        self.model_failure = False

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.url.path.endswith("/chat/completions"):
            assert request.headers["Authorization"] == "Bearer backend-test-key"
            payload = json.loads(request.content)
            assert payload["thinking"] == {"type": "disabled"}
            if self.model_failure:
                return httpx.Response(401, json={"error": "authentication failed"})
            system = payload["messages"][0]["content"]
            if "你是旅行需求分析专家" in system:
                return completion(analysis_data())
            if "你是资深旅行规划师" in system:
                return completion(plan_data())
            if "你是天气与出行建议专家" in system:
                return completion(
                    [
                        {"date": day, "recommendations": "携带雨具，预留室内活动"}
                        for day in ("2026-10-18", "2026-10-19")
                    ]
                )
            if "你是旅行 Agent 主管" in system:
                names = (
                    ["PlannerAgent"]
                    if self.skip_weather
                    else ["PlannerAgent", "WeatherAgent", "AnalyzerAgent"]
                )
                return completion(
                    [{"agentName": name, "reason": "按需求执行"} for name in names]
                )
            if "你是 GateKeeper 参数整理器" in system:
                return completion(
                    {
                        "targetAgentInput": "根据已有结构化数据规划成都旅行",
                        "reasoning": "保留原始需求",
                        "usedSources": ["originalQuery"],
                    }
                )
            raise AssertionError("Unexpected model task")
        assert request.headers["X-QW-Api-Key"] == "weather-test-key"
        assert "key=" not in str(request.url)
        if self.weather_failure:
            return httpx.Response(403, json={"code": "403"})
        if request.url.path == "/geo/v2/city/lookup":
            assert request.url.params["location"] == "成都"
            return httpx.Response(
                200,
                json={
                    "code": "200",
                    "location": [{"id": "101270101", "lat": "30.67", "lon": "104.06"}],
                },
            )
        if request.url.path.startswith("/weather/v1/daily/"):
            return httpx.Response(
                200,
                json={
                    "days": [
                        {
                            "forecastStartTime": day + "T00:00+08:00",
                            "daytime": {"condition": {"text": "小雨"}},
                            "temperatureMax": {"value": 21},
                            "temperatureMin": {"value": 15},
                        }
                        for day in ("2026-10-18", "2026-10-19")
                    ]
                },
            )
        if request.url.path == "/v7/weather/30d":
            return httpx.Response(
                200,
                json={
                    "code": "200",
                    "daily": [
                        {
                            "fxDate": "2026-10-18",
                            "textDay": "晴",
                            "tempMax": "22",
                            "tempMin": "14",
                        }
                    ],
                },
            )
        raise AssertionError("Unexpected API path: " + request.url.path)


@pytest.fixture
def travel_setup(settings):
    configured = settings.model_copy(
        update={
            "DEEPSEEK_API_KEY": SecretStr("backend-test-key"),
            "QWEATHER_API_KEY": SecretStr("weather-test-key"),
            "QWEATHER_API_HOST": "test.qweatherapi.com",
        }
    )
    external = ExternalAPIs()
    network = httpx.AsyncClient(transport=httpx.MockTransport(external.handle))
    service = TravelService(configured, network)
    app = create_app(settings)
    app.dependency_overrides[get_travel_service] = lambda: service
    with TestClient(app) as client:
        yield client, service, external
    asyncio.run(network.aclose())


def test_standard_mode_returns_validated_objects_and_records(travel_setup):
    client, _, external = travel_setup
    response = client.post(
        "/api/v1/travel/plan", json={"query": "明天去成都两天，预算3000元"}
    )
    assert response.status_code == 200, response.text
    outcome = response.json()["data"]
    result = outcome["result"]
    assert result["analysis"]["json"]["preferences"] == ["美食", "观光"]
    assert result["analysis"]["json"]["allDates"] == ["2026-10-18", "2026-10-19"]
    assert result["weather"]["json"][0]["high"] == "21°C"
    assert result["weather"]["json"][0]["source"] == "qweather"
    assert len(result["planner"]["json"]) == 2
    assert any(record["name"] == "get_location_id" for record in outcome["records"])
    ids = [record["id"] for record in outcome["records"]]
    assert len(ids) == len(set(ids))
    assert len(external.requests) == 5


def test_stream_preserves_progress_and_final_result(travel_setup):
    client, _, _ = travel_setup
    response = client.post("/api/v1/travel/plan/stream", json={"query": "成都两日游"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    events = [json.loads(line) for line in response.text.splitlines()]
    assert events[0]["event"] == "record"
    assert events[-1]["event"] == "result"
    assert events[-1]["data"]["analysis"]["json"]["destination"] == "成都"
    assert sum(event["event"] == "result" for event in events) == 1


def test_smart_mode_normalizes_dependencies_and_calls_gatekeeper(travel_setup):
    client, _, _ = travel_setup
    response = client.post(
        "/api/v1/travel/plan", json={"query": "成都两日游", "mode": "smart"}
    )
    assert response.status_code == 200, response.text
    records = response.json()["data"]["records"]
    executed = [
        record["desc"] for record in records if record["desc"].startswith("执行 ")
    ]
    assert executed == ["执行 AnalyzerAgent", "执行 WeatherAgent", "执行 PlannerAgent"]
    assert sum(record["name"] == "GateKeeper" for record in records) == 6


def test_skipped_weather_still_returns_complete_report(travel_setup):
    client, _, external = travel_setup
    external.skip_weather = True
    response = client.post(
        "/api/v1/travel/plan", json={"query": "成都两日游，不查天气", "mode": "smart"}
    )
    assert response.status_code == 200, response.text
    result = response.json()["data"]["result"]
    assert result["analysis"]["json"]["destination"] == "成都"
    assert all(day["source"] == "unavailable" for day in result["weather"]["json"])
    assert not any(
        "qweatherapi.com" in str(request.url) for request in external.requests
    )


def test_weather_failure_continues_with_explicit_missing_data(travel_setup):
    client, _, external = travel_setup
    external.weather_failure = True
    response = client.post("/api/v1/travel/plan", json={"query": "成都两日游"})
    assert response.status_code == 200, response.text
    result = response.json()["data"]["result"]
    assert all(
        day["weather"] == "无天气信息" and day["high"] == "无天气信息"
        for day in result["weather"]["json"]
    )
    assert "403" in result["weather"]["json"][0]["recommendations"]


def test_weather_failure_can_be_strict(travel_setup):
    client, service, external = travel_setup
    service.settings = service.settings.model_copy(
        update={"WEATHER_FAILURE_MODE": "error"}
    )
    external.weather_failure = True
    response = client.post("/api/v1/travel/plan", json={"query": "成都两日游"})
    assert response.status_code == 502
    assert "403" in response.json()["msg"]


def test_stream_failure_is_a_terminal_event(travel_setup):
    client, _, external = travel_setup
    external.model_failure = True
    response = client.post("/api/v1/travel/plan/stream", json={"query": "成都两日游"})
    events = [json.loads(line) for line in response.text.splitlines()]
    assert events[-1]["event"] == "error"
    assert "认证失败" in events[-1]["data"]["message"]
    assert events[-1]["data"]["request_id"] == response.headers["X-Request-ID"]
    assert not any(event["event"] == "result" for event in events)


def test_missing_key_fails_before_stream_starts(client):
    for path in ("/api/v1/travel/plan", "/api/v1/travel/plan/stream"):
        response = client.post(path, json={"query": "成都游"})
        assert response.status_code == 503
        assert "backend/.env" in response.json()["msg"]


@pytest.mark.parametrize(
    "payload",
    [
        {"query": "  "},
        {"query": "成都", "mode": "invalid"},
        {"query": "成都", "apiKey": "browser-key"},
    ],
)
def test_request_validation_rejects_invalid_or_browser_credentials(client, payload):
    assert client.post("/api/v1/travel/plan", json=payload).status_code == 422


def test_analysis_normalizes_old_types_and_recalculates_dates():
    result = AnalysisResult.model_validate(
        {**analysis_data(), "allDates": "错误的日期"}
    )
    assert result.budget == "3000"
    assert result.allDates == [date(2026, 10, 18), date(2026, 10, 19)]


def test_v7_adapter_and_out_of_range_dates(travel_setup):
    _, service, external = travel_setup
    service.settings = service.settings.model_copy(
        update={"QWEATHER_API_VERSION": "v7"}
    )

    async def run():
        tools = WeatherTools(service.client, service.settings, ProgressReporter())
        result = await tools.get_forecast(
            Location(id="101270101", lat=30.67, lon=104.06),
            [date(2026, 10, 18), date(2026, 12, 1)],
        )
        assert result[0].weather == "晴"
        assert result[1].source == "unavailable"

    asyncio.run(run())
    assert len(external.requests) == 1


def test_model_tool_calls_roundtrip_all_ids(settings):
    configured = settings.model_copy(
        update={"DEEPSEEK_API_KEY": SecretStr("backend-test-key")}
    )
    sent = []

    def handle(request):
        payload = json.loads(request.content)
        sent.append(payload)
        if len(sent) == 1:
            calls = [
                {
                    "id": identifier,
                    "type": "function",
                    "function": {"name": "get_current_date", "arguments": "{}"},
                }
                for identifier in ("one", "two")
            ]
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "message": {
                                "role": "assistant",
                                "content": None,
                                "tool_calls": calls,
                            }
                        }
                    ]
                },
            )
        assert [message["tool_call_id"] for message in payload["messages"][-2:]] == [
            "one",
            "two",
        ]
        return completion(analysis_data())

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as network:
            llm = LLMClient(network, configured)

            async def execute(name, arguments):
                assert name == "get_current_date" and arguments == {}
                return "当前日期是 2026-10-17"

            from src.tools.date import DATE_TOOL_SCHEMA

            result = await llm.json_result(
                "提取旅行需求",
                "成都游",
                TypeAdapter(AnalysisResult),
                [DATE_TOOL_SCHEMA],
                execute,
            )
            assert result.destination == "成都"

    asyncio.run(run())
    assert len(sent) == 2


def test_model_json_has_one_repair_attempt(settings):
    sent = []

    def handle(request):
        sent.append(request)
        if len(sent) == 1:
            return httpx.Response(
                200, json={"choices": [{"message": {"content": "invalid JSON"}}]}
            )
        return completion(analysis_data())

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as network:
            result = await LLMClient(network, settings).json_result(
                "分析需求", "成都游", TypeAdapter(AnalysisResult)
            )
            assert result.duration == 2

    asyncio.run(run())
    assert len(sent) == 2


def test_total_timeout_cancels_work(settings):
    configured = settings.model_copy(
        update={
            "DEEPSEEK_API_KEY": SecretStr("backend-test-key"),
            "PLAN_TIMEOUT_SECONDS": 0.01,
        }
    )
    cancelled = []

    async def handle(request):
        try:
            await asyncio.sleep(10)
        finally:
            cancelled.append(True)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as network:
            with pytest.raises(BusinessError, match="总时间限制"):
                await TravelService(configured, network).execute(
                    PlanRequest(query="成都游")
                )

    asyncio.run(run())
    assert cancelled == [True]


def test_closing_stream_cancels_running_model_work():
    async def run():
        cancelled = asyncio.Event()

        class WaitingService:
            def validate_configuration(self):
                pass

            async def execute(self, payload, callback):
                try:
                    await callback(
                        ProgressRecord(
                            id="first",
                            name="AnalyzerAgent",
                            type="agent",
                            desc="开始分析",
                            content=payload.query,
                            contentType="text",
                            createdAt=1,
                        )
                    )
                    await asyncio.Event().wait()
                finally:
                    cancelled.set()

        request = Request({"type": "http", "state": {"request_id": "cancel-test"}})
        response = await stream_plan(
            PlanRequest(query="成都游"), request, WaitingService()
        )
        iterator = response.body_iterator
        assert json.loads(await anext(iterator))["event"] == "record"
        await iterator.aclose()
        assert cancelled.is_set()

    asyncio.run(run())


def test_concurrent_plans_keep_their_own_progress(settings):
    configured = settings.model_copy(
        update={
            "DEEPSEEK_API_KEY": SecretStr("backend-test-key"),
            "QWEATHER_API_KEY": SecretStr("weather-test-key"),
            "QWEATHER_API_HOST": "test.qweatherapi.com",
        }
    )

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(ExternalAPIs().handle)
        ) as network:
            service = TravelService(configured, network)
            first, second = await asyncio.gather(
                service.execute(PlanRequest(query="成都游，喜欢美食")),
                service.execute(PlanRequest(query="成都游，喜欢博物馆")),
            )
            assert first.result is not second.result
            assert {item.id for item in first.records}.isdisjoint(
                item.id for item in second.records
            )
            assert any(item.content == "成都游，喜欢美食" for item in first.records)
            assert not any(
                item.content == "成都游，喜欢博物馆" for item in first.records
            )
            assert any(item.content == "成都游，喜欢博物馆" for item in second.records)

    asyncio.run(run())


def test_malformed_weather_fields_return_business_error(settings):
    configured = settings.model_copy(
        update={
            "QWEATHER_API_KEY": SecretStr("weather-test-key"),
            "QWEATHER_API_HOST": "test.qweatherapi.com",
        }
    )

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    200,
                    json={
                        "days": [
                            {
                                "forecastStartTime": "2026-10-18T00:00+08:00",
                                "daytime": None,
                            }
                        ]
                    },
                )
            )
        ) as network:
            tools = WeatherTools(network, configured, ProgressReporter())
            with pytest.raises(BusinessError, match="字段格式无效"):
                await tools.get_forecast(
                    Location(id="101270101", lat=30.67, lon=104.06),
                    [date(2026, 10, 18)],
                )

    asyncio.run(run())
