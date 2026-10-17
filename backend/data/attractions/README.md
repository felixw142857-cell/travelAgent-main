# 景点库数据说明

## 来源与许可

所有数据来自 **OpenStreetMap**（[openstreetmap.org](https://www.openstreetmap.org)），
主要通过 Overpass API 拉取，许可为 **ODbL 1.0**。广州、厦门这次因 Overpass 服务不可用，采用指定景点名称逐项查询 OSM Nominatim 的方式核对标识、名称与坐标。

> 使用时必须保留署名：`© OpenStreetMap contributors`。
> 如果把本目录数据整合进对外提供的数据库，需同样以 ODbL 开放。

生成脚本：[`backend/scripts/fetch_osm_attractions.py`](../../scripts/fetch_osm_attractions.py)

## 字段可信度

| 字段 | 来源 | 可信度 |
|---|---|---|
| `name` / `aliases` | OSM 标签 | 高 |
| `category` | OSM 标签映射；部分指定景点为人工分类 | 见 `field_confidence.category`：`osm` / `curated` |
| `lat` / `lon` | OSM 坐标 | 高 |
| `district` | OSM `addr:*` 或地址区划，缺失时留空 | 中 |
| `suggested_minutes` / `best_time` | **程序按类别估计** | 低，仅供排程参考 |
| `highlight` / `booking` | 未采集，恒为 `null` | 无 |

**门票价格、房价、开放时间、预约要求都不在本库内**，提示词要求模型把它们标为「待核实」。
预算由 [`tools/budget.py`](../../src/tools/budget.py) 按消费档位给区间估算，不是报价。

## 类别与配额

| 类别 | 含义 | 是否进入行程候选 | 单城上限 |
|---|---|---|---|
| `sight` / `museum` / `park` / `temple` / `zoo` / `historic` | 景点 | ✅ | 45 |
| `food` | 餐厅（午餐/晚餐时段） | ✅ | **12** |
| `hotel` | 住宿（不进时段，报告末尾单独列出） | ❌ | **10** |

餐饮在 OSM 里数量极多且质量参差（很多是地铁站边的连锁店），所以设了硬上限，
避免几十条随机餐厅把真正的景点挤出候选池。住宿没有可靠房价，只给名称与区域。

单独补餐饮/住宿（完整查询被限流时用）：

```powershell
.\.venv\Scripts\python.exe scripts\fetch_osm_attractions.py --city 成都 --extras
```

## 筛选口径

为了不把小区健身器材也收进来，做了四道过滤：

1. 自动采集优先选择有 `wikidata` 或 `wikipedia` 标签的景点；餐饮与住宿按脚本各自的标签条件筛选
2. 自动采集沿用 `JUNK_NAME` 名称过滤规则
3. 同名去重，以及包含式去重（`杜甫草堂` 与 `杜甫草堂博物馆` 只留一个）
4. 按类别优先级 + 有无维基条目排序，再按上表的分类配额截断

广州、厦门为指定景点快照：核对 OSM 名称与原始对象 ID，过滤同名地铁站、公交站、道路以及名称不匹配的结果。分类优先采用 OSM 标签映射，无法直接映射时标记为 `curated`，不会把人工分类伪装成原始标签。每条记录保留 `source.lookup_query` 便于追溯。

## 城市覆盖

当前覆盖 **11 城、387 条记录**。条数包括景点及部分餐饮、住宿，不代表该城市的完整 POI 总量。

| 城市 | 文件 | 记录数 | 检索范围要点 |
|---|---|---|---|
| 成都 | `chengdu.json` | 49 | 含都江堰、青城山（bbox 放宽到 31.15N / 103.55E） |
| 杭州 | `hangzhou.json` | 45 | 主城区 |
| 西安 | `xian.json` | 30 | 含临潼：兵马俑、华清池（bbox 放宽到 109.40E） |
| 上海 | `shanghai.json` | 45 | 主城区 |
| 北京 | `beijing.json` | 45 | 主城区（走轻量查询兜底拉到） |
| 重庆 | `chongqing.json` | 25 | 主城区：洪崖洞、动物园、博物馆等 |
| 苏州 | `suzhou.json` | 45 | 园林、古迹及近郊检索范围 |
| 南京 | `nanjing.json` | 45 | 主城区及近郊：夫子庙、红山森林动物园等 |
| 武汉 | `wuhan.json` | 24 | 轻量 tourism 快照：黄鹤楼、博物馆等 |
| 广州 | `guangzhou.json` | 19 | 主城区、番禺的指定景点，逐项核对 OSM |
| 厦门 | `xiamen.json` | 15 | 鼓浪屿、主城区、集美的指定景点，逐项核对 OSM |

本次新增六城合计 **173 条记录**，快照日期为 **2026-10-17**。新增 JSON 会由 `available_cities()` / `load_city()` 自动发现；无需修改前端或提示词。

> **bbox 必须覆盖近郊**，否则会漏掉都江堰、青城山、兵马俑这类"必去但不在市中心"的点。
> 各市范围定义在脚本 `CITIES` 字典里。

完整联合查询可能遇到公共实例的 429、500、502 或超时。脚本有镜像轮换和退避，三次失败后使用 tourism 查询；也可直接选择 `--landmarks-only`，仅查询有百科标记的命名要素，再在本地筛选类别。下载为空或接口报告不完整结果时，不覆盖已有数据。

## 重新生成

```powershell
cd backend
# 全部城市（公共实例会 429/504，脚本带镜像轮换与指数退避，可能较慢）
.\.venv\Scripts\python.exe scripts\fetch_osm_attractions.py

# 单个城市
.\.venv\Scripts\python.exe scripts\fetch_osm_attractions.py --city 成都

# 轻量查询；可重复 --city，只更新指定城市
.\.venv\Scripts\python.exe scripts\fetch_osm_attractions.py --city 广州 --city 厦门 --landmarks-only --retries 3
```

城市名称与检索范围（bbox）定义在脚本的 `CITIES` 字典里，可自行增补。`--endpoint` 可指定可用 Overpass 实例；新导入的元信息记录实际成功实例及数据时间（接口提供时）。

本次 Nominatim 核对是小规模、一次性导入，按[官方使用规则](https://operations.osmfoundation.org/policies/nominatim/)单线程、低于每秒一次并缓存响应；运行聊天服务时只读取本地 JSON。不可将这一做法改成公共实例的全量 POI 抓取或自动补全服务。

## 已知局限

- OSM 在中国大陆的覆盖不均衡，热门城市的景点较全，中小城市稀疏
- 自动景点采集以百科标记为主，指定快照也只是有限选点，不能保证收录新店或所有热门景点
- 缺少营业时间、门票、预约规则——这些要么接高德 POI，要么靠 RAG 补
- 数据有快照日期（`updated_at`），会随时间过期
