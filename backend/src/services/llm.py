"""服务端 DeepSeek 客户端：有界工具循环、超时和结构化结果校验。"""

import json
import re
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

import httpx
from pydantic import TypeAdapter, ValidationError

from src.core.exceptions import BusinessError
from src.settings.config import Settings

ToolCallback = Callable[[str, dict[str, Any]], Awaitable[str]]
T = TypeVar("T")


class ModelOutputError(BusinessError):
    """模型返回了无法按约定解释的数据。"""


def parse_json_text(text: str) -> Any:
    content = text.strip()
    fence = re.fullmatch(r"```(?:json)?\s*([\s\S]*?)\s*```", content, re.IGNORECASE)
    return json.loads(fence.group(1) if fence else content)


class LLMClient:
    def __init__(self, client: httpx.AsyncClient, settings: Settings):
        self.client = client
        self.settings = settings

    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        callback: ToolCallback | None = None,
    ) -> str:
        history = [dict(message) for message in messages]
        for _ in range(self.settings.MAX_TOOL_ROUNDS):
            payload: dict[str, Any] = {
                "model": self.settings.DEEPSEEK_MODEL,
                "messages": history,
                "temperature": 0.7,
                "thinking": {"type": "disabled"},
                "stream": False,
            }
            if tools:
                payload.update(tools=tools, tool_choice="auto")
            try:
                response = await self.client.post(
                    f"{str(self.settings.DEEPSEEK_BASE_URL).rstrip('/')}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.settings.DEEPSEEK_API_KEY.get_secret_value()}"
                    },
                    json=payload,
                    timeout=self.settings.LLM_TIMEOUT_SECONDS,
                )
            except httpx.TimeoutException as exc:
                raise BusinessError("DeepSeek 请求超时，请稍后重试", 504) from exc
            except httpx.RequestError as exc:
                raise BusinessError(
                    "无法连接 DeepSeek，请检查后端网络和接口地址", 502
                ) from exc
            if response.status_code >= 400:
                hints = {
                    401: "认证失败，请检查后端 DEEPSEEK_API_KEY",
                    402: "账户余额不足",
                    429: "请求过于频繁，请稍后重试",
                }
                hint = hints.get(
                    response.status_code, "接口调用失败，请检查模型配置或稍后重试"
                )
                raise BusinessError(
                    f"DeepSeek（HTTP {response.status_code}）：{hint}", 502
                )
            try:
                message = response.json()["choices"][0]["message"]
                if not isinstance(message, dict):
                    raise ValueError("invalid message")
            except (ValueError, KeyError, IndexError, TypeError) as exc:
                raise BusinessError("DeepSeek 返回的响应格式不正确", 502) from exc

            calls = message.get("tool_calls")
            if not calls:
                content = message.get("content")
                if not isinstance(content, str) or not content.strip():
                    raise BusinessError("DeepSeek 未返回可用内容，请重试", 502)
                return content
            if callback is None or not tools or not isinstance(calls, list):
                raise BusinessError("模型请求了未配置的工具", 502)
            allowed_names = {tool["function"]["name"] for tool in tools}
            # 保留完整 assistant 消息；一轮多个调用必须各自回传 tool_call_id。
            history.append(message)
            for call in calls:
                try:
                    name = call["function"]["name"]
                    call_id = call["id"]
                    arguments = json.loads(call["function"].get("arguments") or "{}")
                    if (
                        name not in allowed_names
                        or not isinstance(arguments, dict)
                        or not isinstance(call_id, str)
                    ):
                        raise ValueError("invalid tool call")
                except (KeyError, TypeError, ValueError) as exc:
                    raise BusinessError("模型返回的工具调用参数无效", 502) from exc
                result = await callback(name, arguments)
                history.append(
                    {"role": "tool", "tool_call_id": call_id, "content": result}
                )
        raise BusinessError("模型工具调用超过最大轮数，请简化需求后重试", 502)

    async def json_result(
        self,
        system: str,
        user: str,
        adapter: TypeAdapter[T],
        tools: list[dict[str, Any]] | None = None,
        callback: ToolCallback | None = None,
    ) -> T:
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        text = await self.chat(messages, tools, callback)
        for attempt in range(2):
            try:
                return adapter.validate_python(parse_json_text(text))
            except (ValueError, ValidationError):
                if attempt:
                    raise ModelOutputError(
                        "模型结果未通过数据校验，请重新提交需求", 502
                    ) from None
                # 一次修复机会；限制次数以免无限重试和重复收费。
                text = await self.chat(
                    [
                        *messages,
                        {"role": "assistant", "content": text},
                        {
                            "role": "user",
                            "content": "上次结果不符合 JSON 结构，请仅输出合法 JSON，严格匹配以下结构："
                            + json.dumps(adapter.json_schema(), ensure_ascii=False),
                        },
                    ]
                )
        raise AssertionError("unreachable")
