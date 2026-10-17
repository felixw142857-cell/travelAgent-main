"""预算估算：把用户给的总额换算成可执行的消费档位与区间。

设计原则
--------
* **不编单点价格**。这里给的是"档位假设区间"，不是报价，也不是从任何接口取来的实时数据。
* 所有假设集中在本文件的 TIERS 表里，改一处即可调整全部口径。
* 输出必须带免责说明，报告里明确"以官方渠道为准"，避免被当成承诺。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# 档位 -> 每类花费的单价区间（人民币）
# 住宿/餐饮/交通：元 / 人 / 天；门票：元 / 人 / 天（按行程天数的均值摊分）
TIERS: dict[str, dict[str, tuple[int, int]]] = {
    "经济": {
        "住宿": (150, 300),
        "餐饮": (60, 120),
        "门票": (40, 100),
        "市内交通": (20, 50),
    },
    "舒适": {
        "住宿": (400, 800),
        "餐饮": (120, 250),
        "门票": (80, 200),
        "市内交通": (50, 100),
    },
    "高端": {
        "住宿": (1000, 2500),
        "餐饮": (300, 800),
        "门票": (150, 400),
        "市内交通": (150, 400),
    },
}

# 每人每天总额落在哪个区间就归哪个档位
TIER_THRESHOLDS = ((600, "经济"), (1400, "舒适"))


@dataclass
class BudgetLine:
    label: str
    low: int
    high: int
    note: str


@dataclass
class BudgetEstimate:
    tier: str
    travelers: int
    days: int
    nights: int
    stated_total: int | None
    lines: list[BudgetLine] = field(default_factory=list)

    @property
    def total_low(self) -> int:
        return sum(line.low for line in self.lines)

    @property
    def total_high(self) -> int:
        return sum(line.high for line in self.lines)

    def verdict(self) -> str:
        if self.stated_total is None:
            return ""
        if self.stated_total < self.total_low:
            return (
                f"你给的 {self.stated_total} 元低于该档位下限 {self.total_low} 元，"
                "建议提高预算或压缩天数"
            )
        if self.stated_total > self.total_high:
            return (
                f"你给的 {self.stated_total} 元高于该档位上限 {self.total_high} 元，"
                "可以提升住宿或餐饮档位"
            )
        return f"你给的 {self.stated_total} 元落在该档位区间内"

    def render(self) -> str:
        lines = [
            f"【预算估算】{self.travelers} 人 · {self.days} 天 {self.nights} 晚 · "
            f"档位：{self.tier}"
        ]
        for line in self.lines:
            lines.append(f"- {line.label}：{line.low}–{line.high} 元（{line.note}）")
        lines.append(f"- 合计：{self.total_low}–{self.total_high} 元")
        verdict = self.verdict()
        if verdict:
            lines.append(f"- 判断：{verdict}")
        lines.append(
            "- 说明：以上为按档位推算的估算区间，不是实时报价；"
            "房价、门票与营业时间以官方渠道为准，下单前请再次确认。"
        )
        return "\n".join(lines)


def parse_amount(budget: str | None) -> int | None:
    """从「3000」「约 3000 元」「1.5万」这类文本里取出金额。"""
    if not budget:
        return None
    text = str(budget).replace(",", "").replace("，", "")
    match = re.search(r"(\d+(?:\.\d+)?)\s*(万)?", text)
    if not match:
        return None
    value = float(match.group(1))
    if match.group(2):
        value *= 10000
    amount = int(round(value))
    return amount if amount > 0 else None


def pick_tier(stated_total: int | None, days: int, travelers: int) -> str:
    if stated_total is None or days <= 0 or travelers <= 0:
        return "舒适"
    per_person_day = stated_total / (days * travelers)
    for threshold, tier in TIER_THRESHOLDS:
        if per_person_day < threshold:
            return tier
    return "高端"


def estimate(budget: str | None, days: int, travelers: int = 1) -> BudgetEstimate:
    days = max(1, days)
    travelers = max(1, travelers)
    nights = max(1, days - 1)
    stated_total = parse_amount(budget)
    tier = pick_tier(stated_total, days, travelers)
    table = TIERS[tier]

    lines = [
        BudgetLine(
            label="住宿",
            low=table["住宿"][0] * nights * travelers,
            high=table["住宿"][1] * nights * travelers,
            note=f"{table['住宿'][0]}–{table['住宿'][1]} 元/间/晚 × {nights} 晚 × {travelers} 人",
        ),
        BudgetLine(
            label="餐饮",
            low=table["餐饮"][0] * days * travelers,
            high=table["餐饮"][1] * days * travelers,
            note=f"{table['餐饮'][0]}–{table['餐饮'][1]} 元/人/天 × {days} 天 × {travelers} 人",
        ),
        BudgetLine(
            label="门票",
            low=table["门票"][0] * days * travelers,
            high=table["门票"][1] * days * travelers,
            note=f"{table['门票'][0]}–{table['门票'][1]} 元/人/天 × {days} 天 × {travelers} 人",
        ),
        BudgetLine(
            label="市内交通",
            low=table["市内交通"][0] * days * travelers,
            high=table["市内交通"][1] * days * travelers,
            note=f"{table['市内交通'][0]}–{table['市内交通'][1]} 元/人/天 × {days} 天 × {travelers} 人",
        ),
    ]
    return BudgetEstimate(
        tier=tier,
        travelers=travelers,
        days=days,
        nights=nights,
        stated_total=stated_total,
        lines=lines,
    )
