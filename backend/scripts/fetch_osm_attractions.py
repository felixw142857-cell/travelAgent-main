"""从 OpenStreetMap Overpass API 拉取热门城市景点，生成 data/attractions/*.json。

数据来源：OpenStreetMap（ODbL 1.0）。只保留带 wikidata 标签的要素作为
「有一定知名度」的过滤条件，避免把小区里的健身器材也收进来。

用法（在 backend 目录下）：
    .\\.venv\\Scripts\\python.exe scripts\\fetch_osm_attractions.py
    .\\.venv\\Scripts\\python.exe scripts\\fetch_osm_attractions.py --city 成都
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

OVERPASS_ENDPOINTS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]
UA = "travel-agent-attraction-fetch/1.0 (local development)"
OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "attractions"

# 城市 -> (南, 西, 北, 东)
# 注意：必须覆盖该市"游客真会去"的近郊，否则会漏掉都江堰、兵马俑这类必去点
CITIES: dict[str, tuple[float, float, float, float]] = {
    "成都": (30.50, 103.55, 31.15, 104.35),  # 含都江堰、青城山
    "杭州": (30.10, 120.00, 30.45, 120.35),
    "西安": (34.15, 108.80, 34.45, 109.40),  # 含临潼：兵马俑、华清池
    "北京": (39.75, 116.20, 40.05, 116.55),
    "上海": (31.10, 121.30, 31.35, 121.60),
}

SLUG = {
    "成都": "chengdu",
    "杭州": "hangzhou",
    "西安": "xian",
    "北京": "beijing",
    "上海": "shanghai",
}

# OSM 标签 -> 我们的类别
CATEGORY_RULES = [
    (("tourism", "zoo"), "zoo"),
    (("tourism", "theme_park"), "park"),
    (("tourism", "museum"), "museum"),
    (("tourism", "viewpoint"), "sight"),
    (("tourism", "attraction"), "sight"),
    (("leisure", "park"), "park"),
    (("amenity", "place_of_worship"), "temple"),
    (("historic", "*"), "historic"),
]

# 建议停留分钟与最佳时段（程序估计，非官方数据）
DURATION = {
    "sight": (120, "上午"),
    "museum": (120, "下午"),
    "park": (90, "下午"),
    "temple": (60, "上午"),
    "zoo": (180, "上午"),
    "historic": (60, "上午"),
}


# 这类名字进不了旅行行程，直接剔除
JUNK_NAME = re.compile(r"(墓|遗址|遗址群|古墓|坟)")
# 类别优先级：越靠前越像"游客会去的地方"
CATEGORY_ORDER = {
    "zoo": 0,
    "sight": 1,
    "museum": 2,
    "park": 3,
    "temple": 4,
    "historic": 5,
}


def build_query(bbox: tuple[float, float, float, float]) -> str:
    """只取有维基数据/维基百科条目的要素，作为「有知名度」的代理指标。"""
    south, west, north, east = bbox
    box = f"({south},{west},{north},{east})"
    return f"""[out:json][timeout:120];
(
  nwr["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|theme_park)$"]["name"]["wikidata"]{box};
  nwr["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|theme_park)$"]["name"]["wikipedia"]{box};
  nwr["historic"="castle"]["name"]{box};
  nwr["historic"="monument"]["name"]["wikipedia"]{box};
  nwr["historic"="memorial"]["name"]["wikipedia"]{box};
  nwr["leisure"="park"]["name"]["wikipedia"]{box};
  nwr["amenity"="place_of_worship"]["name"]["wikipedia"]{box};
);
out center tags;
"""


def classify(tags: dict[str, str]) -> str | None:
    for (key, value), category in CATEGORY_RULES:
        if tags.get(key) is None:
            continue
        if value == "*" or tags.get(key) == value:
            return category
    return None


def slugify(city_slug: str, name: str, osm_type: str, osm_id: int) -> str:
    # 中文名转 ASCII slug 不可靠，直接用 osm 标识保证唯一稳定
    return f"{city_slug}-{osm_type}{osm_id}"


def fetch_city(city: str, retries: int = 8) -> list[dict]:
    """镜像轮换 + 指数退避。

    前 3 次用完整查询；之后退化为只查 tourism 的轻量查询，
    因为大城市的 7 分支联合查询容易把公共实例打到 500/502。
    """
    heavy = build_query(CITIES[city])
    south, west, north, east = CITIES[city]
    box = f"({south},{west},{north},{east})"
    light = f"""[out:json][timeout:120];
(
  nwr["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|theme_park)$"]["name"]["wikidata"]{box};
);
out center tags;
"""
    last: Exception | None = None
    for attempt in range(retries):
        query = heavy if attempt < 3 else light
        endpoint = OVERPASS_ENDPOINTS[attempt % len(OVERPASS_ENDPOINTS)]
        host = endpoint.split("/")[2]
        try:
            request = urllib.request.Request(
                endpoint,
                data=query.encode("utf-8"),
                headers={"User-Agent": UA, "Accept": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=240) as response:
                payload = json.loads(response.read().decode("utf-8"))
            return payload.get("elements", [])
        except urllib.error.HTTPError as exc:
            last = exc
            wait = 20 * (attempt + 1)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last = exc
            wait = 15 * (attempt + 1)
        print(
            f"  {city} 第 {attempt + 1}/{retries} 次失败（{host}）：{last}；{wait}s 后重试",
            file=sys.stderr,
        )
        time.sleep(wait)
    raise RuntimeError(f"{city} 拉取失败：{last}")


def to_items(city: str, city_slug: str, elements: list[dict]) -> list[dict]:
    seen: set[str] = set()
    items: list[dict] = []
    for element in elements:
        tags = element.get("tags") or {}
        name = (tags.get("name:zh") or tags.get("name") or "").strip()
        if not name or name in seen or JUNK_NAME.search(name):
            continue
        category = classify(tags)
        if category is None:
            continue
        center = element.get("center") or {}
        lat = element.get("lat") or center.get("lat")
        lon = element.get("lon") or center.get("lon")
        if lat is None or lon is None:
            continue
        seen.add(name)
        minutes, best_time = DURATION[category]
        items.append(
            {
                "id": slugify(city_slug, name, element["type"], element["id"]),
                "name": name,
                "aliases": sorted(
                    {
                        tags.get("name:en", "").strip(),
                        tags.get("official_name", "").strip(),
                    }
                    - {""}
                ),
                "category": category,
                "district": tags.get("addr:district") or tags.get("addr:city") or "",
                "lat": round(float(lat), 6),
                "lon": round(float(lon), 6),
                "suggested_minutes": minutes,
                "best_time": best_time,
                "field_confidence": {
                    "name": "osm",
                    "category": "osm",
                    "coord": "osm",
                    "suggested_minutes": "estimate",
                    "best_time": "estimate",
                },
                "highlight": None,
                "booking": None,
                "notability": "wikipedia" if tags.get("wikipedia") else "wikidata",
                "source": {
                    "provider": "openstreetmap",
                    "license": "ODbL-1.0",
                    "osm_type": element["type"],
                    "osm_id": element["id"],
                    "wikidata": tags.get("wikidata"),
                },
            }
        )
    # 包含式去重：杜甫草堂 / 杜甫草堂博物馆 指向同一处，保留短名
    items.sort(key=lambda item: len(item["name"]))
    deduped: list[dict] = []
    for item in items:
        if any(
            item["name"] in kept["name"] or kept["name"] in item["name"]
            for kept in deduped
        ):
            continue
        deduped.append(item)

    deduped.sort(
        key=lambda item: (
            CATEGORY_ORDER.get(item["category"], 9),
            0 if item["notability"] == "wikipedia" else 1,
            item["name"],
        )
    )
    return deduped[:45]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--city", action="append", help="只拉指定城市，可重复")
    args = parser.parse_args()

    targets = args.city or list(CITIES)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for index, city in enumerate(targets):
        if city not in CITIES:
            print(f"未知城市：{city}（可选：{'、'.join(CITIES)}）", file=sys.stderr)
            return 2
        print(f"[{index + 1}/{len(targets)}] {city} 查询中…")
        elements = fetch_city(city)
        items = to_items(city, SLUG[city], elements)
        document = {
            "city": city,
            "city_slug": SLUG[city],
            "version": 1,
            "updated_at": time.strftime("%Y-%m-%d"),
            "source": {
                "provider": "openstreetmap",
                "license": "ODbL-1.0",
                "endpoint": OVERPASS_ENDPOINTS[0],
            },
            "notes": "名称/类别/坐标为 OSM 实测数据；suggested_minutes 与 best_time 为程序估计，非官方信息。",
            "items": items,
        }
        path = OUT_DIR / f"{SLUG[city]}.json"
        # 轻量兜底查询会丢掉 park/temple/historic 分支，因此与已有数据按 id 合并，
        # 避免一次降级抓取把更完整的旧结果覆盖掉。
        merged = {item["id"]: item for item in items}
        if path.exists():
            try:
                previous = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                previous = {}
            for item in previous.get("items") or []:
                merged.setdefault(item["id"], item)
        document["items"] = sorted(
            merged.values(),
            key=lambda item: (
                CATEGORY_ORDER.get(item["category"], 9),
                0 if item.get("notability") == "wikipedia" else 1,
                item["name"],
            ),
        )[:60]
        path.write_text(
            json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        reused = len(document["items"]) - len(items)
        print(
            f"  -> {path.name}：{len(document['items'])} 条"
            f"（本次 {len(items)} + 沿用 {reused}；原始要素 {len(elements)}）"
        )
        if index < len(targets) - 1:
            time.sleep(10)  # 对公共实例友好，避免连续重查询
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
