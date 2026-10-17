# 景点库数据说明

## 来源与许可

所有数据来自 **OpenStreetMap**（[openstreetmap.org](https://www.openstreetmap.org)），
通过 Overpass API 拉取，许可为 **ODbL 1.0**。

> 使用时必须保留署名：`© OpenStreetMap contributors`。
> 如果把本目录数据整合进对外提供的数据库，需同样以 ODbL 开放。

生成脚本：[`backend/scripts/fetch_osm_attractions.py`](../../scripts/fetch_osm_attractions.py)

## 字段可信度

| 字段 | 来源 | 可信度 |
|---|---|---|
| `name` / `aliases` | OSM 标签 | 高 |
| `category` | OSM 标签映射（见脚本 `CATEGORY_RULES`） | 高 |
| `lat` / `lon` | OSM 坐标 | 高 |
| `district` | OSM `addr:*`，多数缺失 | 中 |
| `suggested_minutes` / `best_time` | **程序按类别估计** | 低，仅供排程参考 |
| `highlight` / `booking` | 未采集，恒为 `null` | 无 |

**门票价格、开放时间、预约要求都不在本库内**，提示词要求模型把它们标为「待核实」。

## 筛选口径

为了不把小区健身器材也收进来，做了四道过滤：

1. 必须有 `wikidata` 或 `wikipedia` 标签（有百科条目 = 有一定知名度）
2. 名称含「墓 / 遗址 / 古墓 / 坟」的剔除（进不了旅行行程）
3. 同名去重，以及包含式去重（`杜甫草堂` 与 `杜甫草堂博物馆` 只留一个）
4. 按类别优先级 + 有无维基条目排序，每城最多 45 条

## 城市覆盖

| 城市 | 文件 | 状态 |
|---|---|---|
| 成都 | `chengdu.json` | ✅ |
| 杭州 | `hangzhou.json` | ✅ |
| 西安 | `xian.json` | ⏳ 公共实例限流，待补 |
| 北京 | `beijing.json` | ⏳ 待补 |
| 上海 | `shanghai.json` | ⏳ 待补 |

## 重新生成

```powershell
cd backend
# 全部城市（公共实例会 429/504，脚本带镜像轮换与指数退避，可能较慢）
.\.venv\Scripts\python.exe scripts\fetch_osm_attractions.py

# 单个城市
.\.venv\Scripts\python.exe scripts\fetch_osm_attractions.py --city 成都
```

城市名称与检索范围（bbox）定义在脚本的 `CITIES` 字典里，可自行增补。

## 已知局限

- OSM 在中国大陆的覆盖不均衡，热门城市的景点较全，中小城市稀疏
- 只有"有维基条目"的要素才会被收进来，所以**不会包含新开的网红店**
- 缺少营业时间、门票、预约规则——这些要么接高德 POI，要么靠 RAG 补
- 数据有快照日期（`updated_at`），会随时间过期
