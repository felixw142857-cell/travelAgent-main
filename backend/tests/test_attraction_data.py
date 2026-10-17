"""新增城市快照的完整性及真实检索入口验证；不访问网络。"""

import json
from datetime import date

import pytest

from scripts.fetch_osm_attractions import CITIES
from src.tools.attraction import (
    DATA_DIR,
    Attraction,
    available_cities,
    build_candidates,
    load_city,
    search,
)

NEW_CITIES = [
    ("重庆", "chongqing"),
    ("苏州", "suzhou"),
    ("南京", "nanjing"),
    ("武汉", "wuhan"),
    ("广州", "guangzhou"),
    ("厦门", "xiamen"),
]


@pytest.mark.parametrize(("city", "slug"), NEW_CITIES)
def test_new_city_snapshot_and_search(city: str, slug: str):
    document = json.loads((DATA_DIR / f"{slug}.json").read_text(encoding="utf-8"))
    assert document["city"] == city
    assert document["city_slug"] == slug
    assert date.fromisoformat(document["updated_at"])
    assert document["source"]["provider"] == "openstreetmap"
    assert document["source"]["license"] == "ODbL-1.0"

    rows = document["items"]
    south, west, north, east = CITIES[city]
    assert len({item["id"] for item in rows}) == len(rows)
    for row in rows:
        attraction = Attraction.model_validate(row)
        source = attraction.source
        assert source.osm_type in {"node", "way", "relation"}
        assert source.osm_id and source.osm_id > 0
        assert attraction.id == f"{slug}-{source.osm_type}{source.osm_id}"
        assert source.provider == "openstreetmap"
        assert source.license == "ODbL-1.0"
        assert attraction.lat is not None and south <= attraction.lat <= north
        assert attraction.lon is not None and west <= attraction.lon <= east
        assert row["source"].get("osm_category") not in {
            "railway",
            "highway",
            "public_transport",
        }, "不能把同名地铁站、公交站或道路当成景点"

    assert city in available_cities()
    assert load_city(city) == load_city(slug) == load_city(f"{city}市")
    candidates = build_candidates(city, days=3)
    assert len(candidates) >= 12, "三日行程需要足够的候选景点"
    assert all(item.category != "hotel" for item in candidates)
    assert (
        sum(item.category not in {"food", "hotel"} for item in load_city(city).values())
        >= 12
    )
    sample = candidates[0]
    assert sample.id in {item.id for item in search(city, keyword=sample.name)}
