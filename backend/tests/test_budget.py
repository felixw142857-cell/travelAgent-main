"""预算档位与区间估算的单元测试。"""

from __future__ import annotations

from src.tools.budget import TIERS, estimate, parse_amount, pick_tier


def test_parse_amount_handles_common_forms():
    assert parse_amount("3000") == 3000
    assert parse_amount("约 3000 元") == 3000
    assert parse_amount("3,000") == 3000
    assert parse_amount("1.5万") == 15000
    assert parse_amount("1万") == 10000
    assert parse_amount("未指定") is None
    assert parse_amount("") is None
    assert parse_amount(None) is None


def test_pick_tier_by_per_person_per_day():
    # 3000 元 / 3 天 / 1 人 = 1000 元每人每天 -> 舒适
    assert pick_tier(3000, 3, 1) == "舒适"
    # 900 元 / 3 天 / 1 人 = 300 -> 经济
    assert pick_tier(900, 3, 1) == "经济"
    # 30000 / 3 / 1 = 10000 -> 高端
    assert pick_tier(30000, 3, 1) == "高端"
    # 未知预算默认舒适
    assert pick_tier(None, 3, 1) == "舒适"


def test_estimate_lines_match_tier_table():
    result = estimate("3000", days=3, travelers=1)
    assert result.tier == "舒适"
    assert result.nights == 2
    labels = [line.label for line in result.lines]
    assert labels == ["住宿", "餐饮", "门票", "市内交通"]
    for line in result.lines:
        assert 0 < line.low <= line.high
    assert result.total_low < result.total_high


def test_estimate_scales_with_travelers_and_days():
    # 档位由「人均每日金额」决定，所以要让总额随人数/天数同步放大才能比较
    one = estimate("3000", days=3, travelers=1)  # 1000 元/人/天 -> 舒适
    two = estimate("6000", days=3, travelers=2)  # 同样 1000 元/人/天 -> 舒适
    assert one.tier == two.tier == "舒适"
    assert two.total_high == one.total_high * 2
    assert two.total_low == one.total_low * 2

    longer = estimate("5000", days=5, travelers=1)  # 同样 1000 元/人/天
    assert longer.tier == "舒适"
    assert longer.total_high > one.total_high


def test_tier_drops_when_same_budget_split_between_more_people():
    """同一个总额分给更多人时，人均变少，档位应下调。"""
    solo = estimate("3000", days=3, travelers=1)
    pair = estimate("3000", days=3, travelers=2)
    assert solo.tier == "舒适"
    assert pair.tier == "经济"


def test_estimate_verdict_flags_insufficient_budget():
    # 3 天 1 人 500 元，低到连经济档都撑不住
    result = estimate("500", days=3, travelers=1)
    assert result.tier == "经济"
    assert result.total_low == sum(line.low for line in result.lines)
    verdict = result.verdict()
    assert "低于该档位下限" in verdict or "落在该档位区间内" in verdict


def test_estimate_verdict_flags_generous_budget():
    result = estimate("100000", days=3, travelers=1)
    assert result.tier == "高端"
    assert "高于该档位上限" in result.verdict()


def test_render_contains_disclaimer():
    text = estimate("3000", days=3, travelers=2).render()
    assert "预算估算" in text
    assert "不是实时报价" in text
    assert "合计" in text


def test_tier_table_is_sane():
    for tier, table in TIERS.items():
        assert set(table) == {"住宿", "餐饮", "门票", "市内交通"}, tier
        for key, (low, high) in table.items():
            assert 0 < low < high, f"{tier}.{key}"
