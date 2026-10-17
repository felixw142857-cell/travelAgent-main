"""景点库与行程校验的单元测试；不依赖网络。"""

from __future__ import annotations

from datetime import date

import pytest

from src.agents.planner import SOURCE_MODEL, SOURCE_UNVERIFIED, _validate, planner_text
from src.core.exceptions import BusinessError
from src.schemas.travel import Activity, AnalysisResult, DayPlan
from src.tools.attraction import (
    Attraction,
    AttractionDataError,
    AttractionSource,
    accommodation,
    available_cities,
    build_candidates,
    load_city,
    normalize_city,
    score,
    search,
)

DATES = [date(2025, 8, 1), date(2025, 8, 2)]


def make_attraction(
    identifier: str, name: str, category: str = "sight", minutes: int = 120
):
    return Attraction(
        id=identifier,
        name=name,
        category=category,
        suggested_minutes=minutes,
        source=AttractionSource(provider="openstreetmap", license="ODbL-1.0"),
    )


def make_candidates(count: int, minutes: int = 120) -> list[Attraction]:
    return [
        make_attraction(f"cd-{i}", f"景点{i}", minutes=minutes)
        for i in range(1, count + 1)
    ]


def make_plan(id_rows: list[list[str]]) -> list[DayPlan]:
    """按天给出景点 id，每天至少 3 个时段（DayPlan.plan 的硬约束）。"""
    return [
        DayPlan(
            date=DATES[index],
            plan=[
                Activity(
                    time=f"{9 + slot * 3:02d}:00-{11 + slot * 3:02d}:00",
                    activity=f"游览 {identifier}" if identifier else "自由活动",
                    notes="",
                    attractionId=identifier,
                )
                for slot, identifier in enumerate(row)
            ],
            generalTips="",
        )
        for index, row in enumerate(id_rows)
    ]


def make_analysis(days: int = 2) -> AnalysisResult:
    return AnalysisResult(
        destination="成都",
        duration=days,
        startDate=DATES[0],
        preferences=["历史"],
    )


# ---------------- 景点库 ----------------


def test_normalize_city_strips_suffix():
    assert normalize_city("成都市") == "成都"
    assert normalize_city(" 成都 ") == "成都"
    assert normalize_city("杭州") == "杭州"


def test_available_cities_are_readable():
    for city in available_cities():
        assert city.strip()


def test_load_city_returns_full_records():
    cities = available_cities()
    if not cities:
        pytest.skip("景点库为空，先运行 scripts/fetch_osm_attractions.py")
    items = load_city(cities[0])
    assert items
    sample = next(iter(items.values()))
    assert sample.id and sample.name and sample.category
    assert sample.source.license == "ODbL-1.0"


def test_load_unknown_city_reports_available():
    with pytest.raises(AttractionDataError) as excinfo:
        load_city("不存在城市")
    assert "不存在城市" in str(excinfo.value)


def test_build_candidates_covers_minimum_slots():
    """候选数量必须够 days*3 个时段用；偏好命中另由 score 单测覆盖。"""
    cities = available_cities()
    if not cities:
        pytest.skip("景点库为空")
    for city in cities:
        candidates = build_candidates(city, preferences=["公园"], days=3)
        assert len(candidates) >= 12, city


def test_score_prefers_preference_match():
    park = make_attraction("a", "人民公园", "park")
    tower = make_attraction("b", "天府熊猫塔", "sight")
    assert score(park, ["公园"]) > score(tower, ["公园"])
    assert score(park, ["公园"]) > score(park, [])


def test_search_filters_by_category():
    cities = available_cities()
    if not cities:
        pytest.skip("景点库为空")
    results = search(cities[0], category="museum", limit=5)
    assert results
    assert all(item.category == "museum" for item in results)


def test_search_respects_exclude_list():
    cities = available_cities()
    if not cities:
        pytest.skip("景点库为空")
    first = search(cities[0], limit=1)
    if not first:
        pytest.skip("该城市无景点")
    rest = search(cities[0], limit=5, exclude_ids=[first[0].id])
    assert all(item.id != first[0].id for item in rest)


# ---------------- 行程校验 ----------------


def test_validate_accepts_valid_plan_and_fills_source():
    candidates = make_candidates(6)
    plan = make_plan([["cd-1", "cd-2", "cd-3"], ["cd-4", "cd-5", "cd-6"]])
    warnings = _validate(plan, make_analysis(), candidates)
    assert warnings == []
    assert plan[0].plan[0].source == "openstreetmap · ODbL-1.0"
    assert plan[1].plan[2].source == "openstreetmap · ODbL-1.0"


def test_validate_rejects_unknown_attraction():
    candidates = make_candidates(6)
    plan = make_plan([["cd-1", "cd-2", "cd-99"], ["cd-4", "cd-5", "cd-6"]])
    with pytest.raises(BusinessError) as excinfo:
        _validate(plan, make_analysis(), candidates)
    assert "景点库之外" in excinfo.value.message


def test_validate_rejects_duplicate_across_days():
    candidates = make_candidates(6)
    plan = make_plan([["cd-1", "cd-2", "cd-3"], ["cd-1", "cd-5", "cd-6"]])
    with pytest.raises(BusinessError) as excinfo:
        _validate(plan, make_analysis(), candidates)
    assert "重复" in excinfo.value.message


def test_validate_rejects_wrong_dates():
    candidates = make_candidates(6)
    plan = make_plan([["cd-1", "cd-2", "cd-3"], ["cd-4", "cd-5", "cd-6"]])
    plan[1].date = date(2025, 8, 9)
    with pytest.raises(BusinessError) as excinfo:
        _validate(plan, make_analysis(), candidates)
    assert "日期" in excinfo.value.message


def test_validate_marks_missing_id_as_unverified():
    """用餐、交通、休息等时段不对应景点，允许留空 id。"""
    candidates = make_candidates(6)
    plan = make_plan([["cd-1", "cd-2", ""], ["cd-4", "cd-5", ""]])
    warnings = _validate(plan, make_analysis(), candidates)
    assert warnings == []
    assert plan[0].plan[2].attractionId == ""
    assert plan[0].plan[2].source == SOURCE_UNVERIFIED
    assert plan[0].plan[0].source == "openstreetmap · ODbL-1.0"


def test_validate_without_candidates_marks_model_source():
    plan = make_plan([["", "", ""], ["", "", ""]])
    warnings = _validate(plan, make_analysis(), [])
    assert warnings == []
    assert plan[0].plan[0].source == SOURCE_MODEL


def test_validate_warns_on_overlong_day():
    candidates = make_candidates(3, minutes=300)
    plan = make_plan([["cd-1", "cd-2", "cd-3"]])
    warnings = _validate(plan, make_analysis(1), candidates)
    assert warnings and "超过单日上限" in warnings[0]


# ---------------- 文本输出 ----------------


def test_planner_text_lists_sources():
    candidates = make_candidates(3, minutes=60)
    plan = make_plan([["cd-1", "cd-2", "cd-3"]])
    _validate(plan, make_analysis(1), candidates)
    text = planner_text(plan)
    assert "资料来源" in text
    assert "openstreetmap" in text


def test_planner_text_without_source_has_no_footer():
    plan = make_plan([["", "", ""]])
    assert "资料来源" not in planner_text(plan)


# ---------------- 餐饮与住宿 ----------------


def test_build_candidates_excludes_hotels(monkeypatch):
    """住宿不占行程时段，不能出现在候选池里。"""
    hotel = make_attraction("h1", "某酒店", "hotel")
    sight = make_attraction("s1", "某塔", "sight")
    food = make_attraction("f1", "某小吃店", "food")
    monkeypatch.setattr(
        "src.tools.attraction.load_city",
        lambda city: {"h1": hotel, "s1": sight, "f1": food},
    )
    candidates = build_candidates("成都", days=1)
    ids = [item.id for item in candidates]
    assert "h1" not in ids
    assert "f1" in ids and "s1" in ids


def test_accommodation_lists_only_hotels(monkeypatch):
    hotel = make_attraction("h1", "某酒店", "hotel")
    sight = make_attraction("s1", "某塔", "sight")
    monkeypatch.setattr(
        "src.tools.attraction.load_city",
        lambda city: {"h1": hotel, "s1": sight},
    )
    result = accommodation("成都")
    assert [item.id for item in result] == ["h1"]


def test_build_candidates_prefers_food_when_asked(monkeypatch):
    food = make_attraction("f1", "龙抄手", "food")
    sight = make_attraction("s1", "某塔", "sight")
    monkeypatch.setattr(
        "src.tools.attraction.load_city",
        lambda city: {"f1": food, "s1": sight},
    )
    candidates = build_candidates("成都", preferences=["美食"], days=1)
    assert candidates[0].id == "f1"
