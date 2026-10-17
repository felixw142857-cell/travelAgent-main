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
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
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
    "重庆": (29.35, 106.35, 29.75, 106.75),  # 主城区，含磁器口、南山
    "苏州": (31.05, 120.45, 31.50, 120.90),  # 含同里、周庄
    "南京": (31.80, 118.60, 32.20, 119.05),  # 含牛首山、钟山、栖霞山
    "武汉": (30.35, 114.10, 30.75, 114.60),  # 主城区与东湖
    "广州": (22.85, 113.15, 23.30, 113.55),  # 含番禺长隆、沙湾
    "厦门": (24.38, 117.98, 24.70, 118.26),  # 含鼓浪屿、集美
}

SLUG = {
    "成都": "chengdu",
    "杭州": "hangzhou",
    "西安": "xian",
    "北京": "beijing",
    "上海": "shanghai",
    "重庆": "chongqing",
    "苏州": "suzhou",
    "南京": "nanjing",
    "武汉": "wuhan",
    "广州": "guangzhou",
    "厦门": "xiamen",
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
    (("amenity", "restaurant"), "food"),
    (("tourism", "hotel"), "hotel"),
    (("tourism", "guest_house"), "hotel"),
    (("tourism", "hostel"), "hotel"),
    (("historic", "*"), "historic"),
]

# 建议停留分钟与最佳时段（程序估计，非官方数据）
# 住宿不是行程时段，停留记为 0，且不会进入候选景点池
DURATION = {
    "sight": (120, "上午"),
    "museum": (120, "下午"),
    "park": (90, "下午"),
    "temple": (60, "上午"),
    "zoo": (180, "上午"),
    "historic": (60, "上午"),
    "food": (60, "中午"),
    "hotel": (0, ""),
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
    "food": 5,
    "historic": 6,
    "hotel": 7,
}

# 分类配额：餐饮在 OSM 里数量极多且质量参差，必须有上限
CATEGORY_CAP = {"food": 12, "hotel": 10}
DEFAULT_CAP = 45


def build_query(bbox: tuple[float, float, float, float]) -> str:
    """只取有维基数据/维基百科条目的要素，作为「有知名度」的代理指标。

    餐厅用 cuisine 标签做质量代理（绝大多数餐厅没有维基条目），
    酒店要求有 wikidata/stars，避免把家庭旅馆全收进来。
    """
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
  nwr["amenity"="restaurant"]["name"]["cuisine"]{box};
  nwr["tourism"~"^(hotel|guest_house|hostel)$"]["name"]["wikidata"]{box};
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


def fetch_city(
    city: str,
    retries: int = 8,
    extras: bool = False,
    landmarks_only: bool = False,
    endpoints: list[str] | None = None,
    metadata: dict[str, str] | None = None,
) -> list[dict]:
    """镜像轮换 + 指数退避。

    默认前 3 次用完整查询；之后退化为只查 tourism 的轻量查询，
    因为大城市的 9 分支联合查询容易把公共实例打到 500/502。

    extras=True 时只抓餐饮与住宿（2 个分支），用于把这两类单独补齐后合并进已有文件。
    landmarks_only=True 时仅查有百科标记的命名要素，在本地按类别筛选，减少服务器负担。
    """
    south, west, north, east = CITIES[city]
    box = f"({south},{west},{north},{east})"
    if landmarks_only:
        heavy = f"""[out:json][timeout:90];
(
  nwr["name"]["wikidata"]{box};
  nwr["name"]["wikipedia"]{box};
);
out center tags;
"""
        light = heavy
    elif extras:
        heavy = f"""[out:json][timeout:120];
(
  nwr["amenity"="restaurant"]["name"]["cuisine"]{box};
  nwr["amenity"="restaurant"]["name"]["wikidata"]{box};
  nwr["tourism"~"^(hotel|guest_house)$"]["name"]{box};
);
out center tags;
"""
        light = f"""[out:json][timeout:120];
(
  nwr["amenity"="restaurant"]["name"]["cuisine"]{box};
);
out center tags;
"""
    else:
        heavy = build_query(CITIES[city])
        light = f"""[out:json][timeout:120];
(
  nwr["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|theme_park)$"]["name"]["wikidata"]{box};
);
out center tags;
"""
    last: Exception | None = None
    for attempt in range(retries):
        query = heavy if attempt < 3 else light
        mirrors = endpoints or OVERPASS_ENDPOINTS
        endpoint = mirrors[attempt % len(mirrors)]
        host = endpoint.split("/")[2]
        try:
            request = urllib.request.Request(
                endpoint,
                data=query.encode("utf-8"),
                headers={"User-Agent": UA, "Accept": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(
                request, timeout=120 if landmarks_only else 240
            ) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if payload.get("remark"):
                raise urllib.error.URLError(payload["remark"])
            if metadata is not None:
                metadata["endpoint"] = endpoint
                metadata["osm_snapshot_at"] = payload.get("osm3s", {}).get(
                    "timestamp_osm_base", ""
                )
                metadata["query_mode"] = (
                    "landmarks"
                    if landmarks_only
                    else "extras"
                    if extras
                    else "full"
                    if attempt < 3
                    else "tourism_fallback"
                )
            return payload.get("elements", [])
        except urllib.error.HTTPError as exc:
            last = exc
            wait = 20 * (attempt + 1)
            if exc.code in {429, 406}:
                wait = max(30, wait)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last = exc
            wait = 15 * (attempt + 1)
        suffix = f"；{wait}s 后重试" if attempt < retries - 1 else "；重试次数已用完"
        print(
            f"  {city} 第 {attempt + 1}/{retries} 次失败（{host}）：{last}{suffix}",
            file=sys.stderr,
        )
        if attempt < retries - 1:
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
    # 分类配额：餐饮/住宿在 OSM 里数量多但质量参差，按配额截断，
    # 避免几十条随机餐厅把景点挤掉
    capped: list[dict] = []
    counts: dict[str, int] = {}
    for item in deduped:
        category = item["category"]
        if counts.get(category, 0) >= CATEGORY_CAP.get(category, DEFAULT_CAP):
            continue
        counts[category] = counts.get(category, 0) + 1
        capped.append(item)
    return capped[:DEFAULT_CAP]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--city", action="append", help="只拉指定城市，可重复")
    parser.add_argument(
        "--endpoint", action="append", help="指定 Overpass 实例，可重复"
    )
    parser.add_argument(
        "--landmarks-only",
        action="store_true",
        help="轻量采集：查有百科标记的要素，在本地筛选景点类别",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=8,
        choices=range(1, 9),
        help="每城最多尝试次数（1–8）",
    )
    parser.add_argument(
        "--extras",
        action="store_true",
        help="只抓餐饮与住宿，合并进已有文件（完整查询被限流时用）",
    )
    args = parser.parse_args()
    if args.extras and args.landmarks_only:
        parser.error("--extras 与 --landmarks-only 不能同时使用")

    targets = args.city or list(CITIES)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for index, city in enumerate(targets):
        if city not in CITIES:
            print(f"未知城市：{city}（可选：{'、'.join(CITIES)}）", file=sys.stderr)
            return 2
        label = "餐饮/住宿" if args.extras else "景点"
        print(f"[{index + 1}/{len(targets)}] {city} 查询中（{label}）…")
        metadata: dict[str, str] = {}
        elements = fetch_city(
            city,
            retries=args.retries,
            extras=args.extras,
            landmarks_only=args.landmarks_only,
            endpoints=args.endpoint,
            metadata=metadata,
        )
        items = to_items(city, SLUG[city], elements)
        if not items:
            raise RuntimeError(f"{city} 未返回可用景点，保留已有文件")
        document = {
            "city": city,
            "city_slug": SLUG[city],
            "version": 1,
            "updated_at": time.strftime("%Y-%m-%d"),
            "source": {
                "provider": "openstreetmap",
                "license": "ODbL-1.0",
                "endpoint": metadata["endpoint"],
                "osm_snapshot_at": metadata["osm_snapshot_at"],
                "query_mode": metadata["query_mode"],
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
                # extras 运行只负责餐饮/住宿，这两类直接以本次结果为准，
                # 否则上一轮的几十条低质量餐厅会一直堆在文件里
                if args.extras and item.get("category") in {"food", "hotel"}:
                    continue
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
