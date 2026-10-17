# 旅行规划助手 · Travel Agent

输入一句话，三个 Agent 依次协作——**需求澄清 → 天气查询 → 行程生成**——实时展示每一步执行过程，最终输出一份可以照着走的行程手册，并标注每条安排的资料来源。

React 前端 + Python FastAPI 服务端。模型调用、工具调用、Agent 编排全部在服务端完成，浏览器只负责提交需求、展示执行记录和报告。

## 特性

- **先澄清再规划**：目的地、出发日期、天数、预算任一缺失时先追问，不空跑模型。预算可以回答「不限」「暂未确定」或让助手推荐。
- **两种编排模式**：标准流程（固定三步）与智能编排（主管 Agent 选步骤，GateKeeper 为后续 Agent 整理输入）。
- **实时执行时间线**：`NDJSON` 流逐条推送 supervisor / agent / tool 记录，可中断、可重试。
- **内置景点库**：11 个城市、387 条真实景点（含餐厅与住宿），来源 OpenStreetMap，可追溯到 OSM ID。
- **程序校验行程**：校验景点 id 是否在库内、整份行程是否重复安排、日期是否与旅行日期一致、单日停留是否超限。
- **资料来源标记**：每条安排标注「景点库已校验」或「待核实」，不把猜测说成事实。
- **预算有依据**：按消费档位（经济 / 舒适 / 高端）给出住宿、餐饮、门票、市内交通的**区间估算**与计算口径，不编造单点价格。
- **前端体验**：日夜主题、示例预览、复制行程、导出 JSON、响应式布局。

## 架构

```text
React (frontend/)
   │  POST /api/v1/travel/plan/stream
   ▼
FastAPI (backend/)
   ├── TravelService          请求级编排，不保存全局状态
   ├── AnalyzerAgent          提取需求；信息缺失则返回追问
   ├── SmartSupervisor        （智能模式）决定执行步骤
   ├── GateKeeper             （智能模式）为后续 Agent 整理输入
   ├── WeatherAgent           和风天气 + 出行建议
   ├── PlannerAgent           候选景点 + 天气 → 每日行程
   ├── tools/attraction.py    本地景点库检索
   ├── tools/budget.py        消费档位与区间估算
   └── tools/weather.py       和风天气 v1 / v7
   │
   ├──▶ DeepSeek Chat Completions
   └──▶ 和风天气 API
   ▼  NDJSON：record / heartbeat / clarification / result / error
React 时间线与报告
```

关键设计：**天气与景点是外部事实，模型只负责组织与建议**。日期由程序按「出发日 + 天数」推导，不采信模型；票价、房价、营业时间一律标为待核实。

## 目录结构

```text
travelAgent-main/
├── frontend/                 # React + TypeScript + Vite，独立工程
│   ├── src/
│   │   ├── App.tsx           # 页面组合、主题
│   │   ├── components/       # JourneyComposer / JourneyProgress / JourneyReport …
│   │   ├── hooks/            # 规划请求、对话上下文、连接状态
│   │   ├── lib/              # API 流解析、日期与导出工具
│   │   └── types/            # 与后端响应对应的类型
│   └── tests/                # 流解析、上下文限制、导出测试
├── backend/                  # FastAPI + Pydantic + httpx，独立工程
│   ├── src/
│   │   ├── api/v1/           # 版本化路由
│   │   ├── services/         # 旅行流程、LLM 客户端、进度收集
│   │   ├── agents/           # analyzer / weather / planner / supervisor / gatekeeper
│   │   ├── tools/            # attraction / budget / weather / date
│   │   ├── schemas/          # 数据契约与校验
│   │   ├── settings/         # 配置
│   │   └── core/             # 应用工厂、CORS、异常、中间件
│   ├── data/attractions/     # 景点库（11 城 387 条）+ 数据说明
│   ├── scripts/              # setup / dev / check / 抓数据 / 真机试跑
│   └── tests/                # 端到端与单元测试（全部 mock 外部 HTTP）
├── README.md
└── LICENSE
```

## 快速开始

需要 **Node.js 18+**、**Python 3.11+**。`setup.ps1` 会使用已安装的 UV，或在 `backend/.tools/` 自动下载。

```powershell
# 终端一：后端，默认 http://127.0.0.1:8001
cd backend
.\scripts\setup.ps1
# 首次运行后，在 backend/.env 填写 DEEPSEEK_API_KEY
.\scripts\dev.ps1
```

```powershell
# 终端二：前端，默认 http://localhost:5173
cd frontend
npm install
npm run dev
```

打开终端显示的页面地址。接口文档：<http://127.0.0.1:8001/docs>。

端口被占用时：

```powershell
cd backend;  .\scripts\dev.ps1 -Port 8002      # 同时把 frontend/.env.local 的 BACKEND_URL 改成 8002
cd frontend; npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

## 配置

### 后端 `backend/.env`

按后端目录读取，系统环境变量优先；修改后重启后端。

| 变量 | 默认值 / 用途 |
|---|---|
| `DEEPSEEK_API_KEY` | **规划必填**；空值返回 503，健康检查仍可用 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | `deepseek-flash`，以账号可用模型为准 |
| `APP_TIMEZONE` | `Asia/Shanghai` |
| `LLM_TIMEOUT_SECONDS` | `60`，单次模型请求超时 |
| `PLAN_TIMEOUT_SECONDS` | `240`，完整规划总超时 |
| `MAX_TOOL_ROUNDS` | `6`，工具调用最大轮数 |
| `QWEATHER_API_KEY` | 独立的和风天气凭据 |
| `QWEATHER_API_HOST` | 控制台 `*.qweatherapi.com` 域名，不带路径 |
| `QWEATHER_API_VERSION` | `v1`（经纬度）或 `v7`（LocationId） |
| `QWEATHER_FORECAST_DAYS` | `30d`，仅 v7 使用 |
| `WEATHER_TIMEOUT_SECONDS` | `10` |
| `WEATHER_FAILURE_MODE` | `continue`（标记缺失后继续）或 `error`（停止） |
| `CORS_ORIGINS` | 默认 localhost / 127.0.0.1 的 5173 |
| `DOCS_ENABLED` | `true` |
| `LOG_LEVEL` | `INFO` |

天气未配置或查询失败时，默认继续生成行程并在报告中标记天气不可用。

### 前端 `frontend/.env.local`

```dotenv
BACKEND_URL=http://127.0.0.1:8001   # 开发代理目标
VITE_API_BASE_URL=                  # 构建时的浏览器 API 地址，本地代理模式留空
```

开发时浏览器请求 `/api`，由 Vite 转发给 Python（`/docs`、`/openapi.json` 同样转发）。**模型与天气密钥只放 `backend/.env`，不要写进 `VITE_*` 变量**——那会被打包进浏览器产物。

## 景点库与预算

### 景点库

11 个城市共 387 条，全部来自 **OpenStreetMap**（ODbL 1.0），带真实坐标与 OSM ID：

| 城市 | 条数 | 城市 | 条数 | 城市 | 条数 |
|---|---|---|---|---|---|
| 成都 | 49 | 北京 | 45 | 上海 | 45 |
| 杭州 | 45 | 南京 | 45 | 苏州 | 45 |
| 西安 | 30 | 重庆 | 25 | 武汉 | 24 |
| 广州 | 19 | 厦门 | 15 | | |

数据口径、字段可信度、分类配额与许可要求见 [`backend/data/attractions/README.md`](backend/data/attractions/README.md)。

重新生成或补抓（餐饮/住宿单独抓取，避免大查询被公共实例限流）：

```powershell
cd backend
.\.venv\Scripts\python.exe scripts\fetch_osm_attractions.py --city 成都
.\.venv\Scripts\python.exe scripts\fetch_osm_attractions.py --city 成都 --extras
```

城市不在库内时自动降级为模型自由生成，不阻断流程，但报告中会标为「待核实」。

### 预算

`tools/budget.py` 把用户给的总额换算成消费档位（经济 / 舒适 / 高端），再按住宿、餐饮、门票、市内交通四类给出区间，并和你给的金额对比。**这是带口径的估算，不是实时报价**；报告会写明「房价、门票、营业时间以官方渠道为准」。

## 接口

| 方法和路径 | 用途 |
|---|---|
| `GET /api/v1/base/health` | 应用就绪（不验证外部账号） |
| `GET /api/v1/base/version` | 版本信息 |
| `GET /docs`、`/redoc`、`/openapi.json` | 接口文档 |
| `POST /api/v1/travel/plan` | 完整结果 + 执行记录 |
| `POST /api/v1/travel/plan/stream` | 实时执行记录 + 最终结果 |

请求体（两个规划接口共用）：

```json
{"query": "11月1日去成都玩三天，预算3000，喜欢美食", "mode": "standard"}
```

`query` 1–5000 字符；`mode` 为 `standard` 或 `smart`；可选 `history` 传入之前对话（每项 `role`/`content`，最多 20 条、总计 20000 字符），本轮输入只放 `query`。

普通响应为 `code/msg/data/request_id`，`data` 中 `result` 与 `clarification` 恰好一个非空。流式响应为 `application/x-ndjson`，每行一个对象：

| event | 说明 |
|---|---|
| `record` | 一条执行记录，直接进入页面时间线 |
| `heartbeat` | 静默期心跳，约 10 秒一次 |
| `clarification` | 信息不全时的追问，等待用户补充 |
| `result` | 完整 `analysis` / `weather` / `planner`，随后结束 |
| `error` | 错误信息与 `request_id`，随后结束 |

浏览器断开或取消会终止对应任务与外部调用，不会在后台继续执行。`X-Request-ID` 对应后端日志。

## 测试

```powershell
# 后端：Ruff 检查 + 格式 + pytest
cd backend
.\scripts\check.ps1
```

```powershell
# 前端
cd frontend
npm test        # 流解析、上下文限制、导出
npm run lint
npm run build
```

后端测试用 `httpx.MockTransport` 替换模型与天气 HTTP 响应，**不产生真实 API 费用**；覆盖路由、生命周期、CORS、请求 ID、错误处理、普通/智能流程、追问的四个必需字段、天气 v1/v7 与降级、多工具调用、JSON 修复、超时、断开取消、并发隔离，以及景点候选与行程校验。

想直接看一次真实输出（会消耗一次模型调用）：

```powershell
cd backend
.\.venv\Scripts\python.exe scripts\try_plan.py "11月1日去成都玩三天，预算3000，喜欢美食"
```

## 常见问题

| 现象 | 处理 |
|---|---|
| 无法连接 Python 后端 | 启动后端；检查端口与 `frontend/.env.local` 的 `BACKEND_URL`，改完重启 Vite |
| 提示填写 DeepSeek Key | 编辑 `backend/.env` 后重启后端 |
| DeepSeek 认证失败 / 无权限 | 检查 Key、`DEEPSEEK_BASE_URL` 与模型名 |
| 天气超时或无权限 | 检查天气 Key、API Host 与订阅；默认标记原因并继续生成行程 |
| 智能编排明显更慢 | 多轮模型调用所致，可改用标准模式 |
| 依赖安装异常 | 重跑 `backend/scripts/setup.ps1`（会适配 Windows 的 UV 缓存权限） |
| 行程里景点标为「待核实」 | 该城市暂无景点库数据，或该时段不是景点（用餐、交通、返程） |

## 已知限制

- 没有登录、数据库历史与后台任务队列；对话只保存在当前页面内存，刷新即清空。
- 景点库覆盖 11 个城市，其余城市由模型自由生成并标为「待核实」。
- 不含门票、房价、营业时间等实时报价；预算按档位给区间估算。
- 天气来自和风天气，接口权限与预报范围以实际订阅为准。

## 数据来源与许可

- 起因项目：[《前端视角下认识 AI Agent》配套演示](https://juejin.cn/post/7522476555774066703)（MIT License，见 [LICENSE](LICENSE)）。本项目在其基础上把浏览器端逻辑迁到 Python 服务端，并重写了提示词、景点库、校验与界面。
- Python 框架参考 [FastAPI-Template](https://github.com/JiayuXu0/FastAPI-Template)（MIT License，见 [backend/LICENSE.template](backend/LICENSE.template)）。
- 景点与住宿餐饮数据来自 [OpenStreetMap](https://www.openstreetmap.org)，许可 **ODbL 1.0**：使用需署名 `© OpenStreetMap contributors`；对外提供衍生数据库需同样以 ODbL 开放。
