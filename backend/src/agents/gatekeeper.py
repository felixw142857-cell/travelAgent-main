"""将原 GateKeeper 的参数整理逻辑移到服务端，原始数据始终保留。"""

import json
from typing import Any

from pydantic import TypeAdapter

from src.agents.prompts import GATEKEEPER_PROMPT
from src.schemas.travel import PreparedInput
from src.services.llm import LLMClient, ModelOutputError
from src.services.progress import ProgressReporter


async def prepare_input(
    agent_name: str, context: dict[str, Any], llm: LLMClient, progress: ProgressReporter
) -> str:
    await progress.emit("GateKeeper", f"为 {agent_name} 整理输入...")
    data = json.dumps(context, ensure_ascii=False)
    try:
        prepared = await llm.json_result(
            GATEKEEPER_PROMPT,
            f"目标 Agent：{agent_name}\n可用数据：{data}",
            TypeAdapter(PreparedInput),
        )
        await progress.emit(
            "GateKeeper", f"{agent_name} 输入整理完成", prepared.model_dump()
        )
        return prepared.targetAgentInput
    except ModelOutputError:
        await progress.emit(
            "GateKeeper", "整理结果格式异常，使用已校验的原始结构化输入", data
        )
        return data
