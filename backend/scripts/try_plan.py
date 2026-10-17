"""真机跑一次完整规划，检查候选景点注入与程序校验是否生效。

用法（在 backend 目录下）：
    .\\.venv\\Scripts\\python.exe scripts\\try_plan.py "下个月去成都玩三天，预算3000，喜欢历史和美食"
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# 允许直接 `python scripts/try_plan.py` 运行，而不用 -m
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.schemas.travel import PlanRequest  # noqa: E402
from src.services.travel_service import TravelService  # noqa: E402
from src.settings.config import Settings  # noqa: E402


async def main(query: str) -> int:
    service = TravelService(Settings())
    records: list[str] = []

    async def on_record(record) -> None:
        records.append(f"[{record.type}] {record.name} · {record.desc}")

    outcome = await service.execute(PlanRequest(query=query), on_record)

    if outcome.clarification is not None:
        print("== 需要补充信息 ==")
        print(outcome.clarification.message)
        print("缺失字段：", ", ".join(outcome.clarification.missingFields))
        return 0

    assert outcome.result is not None
    plan = outcome.result.planner.json_data
    library_records = [line for line in records if "search_attractions" in line]
    print("== 执行记录 ==")
    for line in records:
        print(" ", line)
    print()
    print("== 景点库命中 ==")
    for line in library_records:
        print(" ", line)
    print()

    total = 0
    from_library = 0
    for day in plan:
        print(f"--- {day.date} ---")
        for activity in day.plan:
            total += 1
            mark = "库" if activity.attractionId else "－"
            if activity.attractionId:
                from_library += 1
            print(
                f"  [{mark}] {activity.time}  {activity.activity[:36]}"
                f"\n         id={activity.attractionId or '(无)'}  source={activity.source}"
            )
    print()
    print(f"时段总数 {total}，其中引用景点库 {from_library}")
    print("资料来源脚注：", "资料来源" in outcome.result.planner.text)
    print("预算估算段：", "预算估算" in outcome.result.planner.text)
    print()
    print("== planner.text 的预算段 ==")
    text = outcome.result.planner.text
    marker = text.find("【预算估算】")
    print(text[marker:] if marker != -1 else "(没有预算段)")
    return 0


if __name__ == "__main__":
    text = (
        sys.argv[1]
        if len(sys.argv) > 1
        else "下个月去成都玩三天，预算3000，喜欢历史和美食"
    )
    raise SystemExit(asyncio.run(main(text)))
