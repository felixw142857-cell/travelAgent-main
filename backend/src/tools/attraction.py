"""景点库：本地 JSON 的事实层，供 PlannerAgent 从候选中挑选。

数据来源为 OpenStreetMap（ODbL-1.0），由 scripts/fetch_osm_attractions.py 生成。
名称/类别/坐标为实测数据；suggested_minutes 与 best_time 是程序估计。
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "attractions"

# 用户在偏好里写的词 -> 景点类别
PREFERENCE_CATEGORY = {
    "古镇": "historic",
    "古迹": "historic",
    "历史": "historic",
    "博物馆": "museum",
    "展览": "museum",
    "公园": "park",
    "自然": "park",
    "寺庙": "temple",
    "宗教": "temple",
    "动物园": "zoo",
    "熊猫": "zoo",
    "观景": "sight",
    "地标": "sight",
}

CATEGORY_LABEL = {
    "sight": "地标景点",
    "museum": "博物馆",
    "park": "公园",
    "temple": "寺庙",
    "zoo": "动物园",
    "historic": "古迹",
}

# 类别优先级，用于候选排序
CATEGORY_ORDER = {
    "zoo": 0,
    "sight": 1,
    "museum": 2,
    "park": 3,
    "temple": 4,
    "historic": 5,
}


class AttractionSource(BaseModel):
    model_config = ConfigDict(extra="ignore")
    provider: str = "openstreetmap"
    license: str = "ODbL-1.0"
    osm_type: str = ""
    osm_id: int | None = None
    wikidata: str | None = None


class Attraction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    aliases: list[str] = Field(default_factory=list)
    category: str
    district: str = ""
    lat: float | None = None
    lon: float | None = None
    suggested_minutes: int = 90
    best_time: str = ""
    highlight: str | None = None
    booking: str | None = None
    notability: str = "wikidata"
    source: AttractionSource = Field(default_factory=AttractionSource)

    @property
    def category_label(self) -> str:
        return CATEGORY_LABEL.get(self.category, self.category)

    def brief(self) -> dict[str, Any]:
        """给模型看的精简字段：不含坐标，省 token。"""
        payload: dict[str, Any] = {
            "id": self.id,
            "name": self.name,
            "category": self.category_label,
            "suggested_minutes": self.suggested_minutes,
        }
        if self.district:
            payload["district"] = self.district
        if self.best_time:
            payload["best_time"] = self.best_time
        if self.highlight:
            payload["highlight"] = self.highlight
        return payload

    def attribution(self) -> str:
        return f"{self.name}（{self.source.provider}, {self.source.license}）"


class AttractionDataError(Exception):
    """景点库缺数据或格式错误。"""


def normalize_city(city: str) -> str:
    return re.sub(r"(市|地区|自治州)$", "", city.strip())


@lru_cache(maxsize=32)
def _load_file(path_str: str) -> tuple[str, dict[str, Attraction]]:
    path = Path(path_str)
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AttractionDataError(f"景点库读取失败：{path.name}") from exc
    items: list[dict[str, Any]] = document.get("items") or []
    return document.get("city", ""), {
        item["id"]: Attraction.model_validate(item) for item in items
    }


def available_cities() -> list[str]:
    if not DATA_DIR.exists():
        return []
    cities: list[str] = []
    for path in sorted(DATA_DIR.glob("*.json")):
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if document.get("city"):
            cities.append(document["city"])
    return cities


def load_city(city: str) -> dict[str, Attraction]:
    """按城市名或 slug 载入景点表；找不到时给出可用城市列表。"""
    slug = normalize_city(city)
    if not DATA_DIR.exists():
        raise AttractionDataError(
            "景点库为空：请先在 backend 目录运行 "
            "python scripts/fetch_osm_attractions.py"
        )
    for path in sorted(DATA_DIR.glob("*.json")):
        name, items = _load_file(str(path))
        if name == slug or path.stem == slug.lower():
            return items
    cities = available_cities()
    raise AttractionDataError(
        f"景点库暂无「{city}」的数据；当前支持：{'、'.join(cities) or '（空）'}"
    )


def score(item: Attraction, preferences: list[str]) -> int:
    """偏好命中加分；类别越靠前越优先。"""
    points = 10 - CATEGORY_ORDER.get(item.category, 9)
    if item.notability == "wikipedia":
        points += 3
    for preference in preferences:
        key = preference.strip()
        if not key:
            continue
        if key in item.name or any(key in alias for alias in item.aliases):
            points += 6
        target = PREFERENCE_CATEGORY.get(key)
        if target and target == item.category:
            points += 4
    return points


def build_candidates(
    city: str,
    preferences: list[str] | None = None,
    limit: int = 24,
    days: int = 1,
) -> list[Attraction]:
    """按偏好筛选并排序，保证候选数至少够 days*3 个时段使用。"""
    items = load_city(city)
    ranked = sorted(
        items.values(),
        key=lambda item: (-score(item, preferences or []), item.name),
    )
    minimum = max(days * 3 + 3, 12)
    return ranked[: max(limit, minimum)]


def search(
    city: str,
    category: str | None = None,
    keyword: str | None = None,
    limit: int = 12,
    exclude_ids: list[str] | None = None,
) -> list[Attraction]:
    """工具入口：按类别/关键词过滤。"""
    items = load_city(city)
    excluded = set(exclude_ids or [])
    result: list[Attraction] = []
    for item in items.values():
        if item.id in excluded:
            continue
        if category and item.category != category:
            continue
        if (
            keyword
            and keyword not in item.name
            and not any(keyword in alias for alias in item.aliases)
        ):
            continue
        result.append(item)
    result.sort(key=lambda item: (-score(item, []), len(item.name)))
    return result[:limit]


ATTRACTION_TOOL_SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "search_attractions",
        "description": "按城市和类别查询本地景点库，返回真实存在的景点及其建议停留时长",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "城市名，如“成都”"},
                "category": {
                    "type": "string",
                    "description": "类别：sight/museum/park/temple/zoo/historic，可选",
                },
                "keyword": {"type": "string", "description": "景点名称关键词，可选"},
                "limit": {"type": "integer", "description": "返回条数，默认 12"},
            },
            "required": ["city"],
        },
    },
}
