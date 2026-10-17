# 旅行规划助手 Python 服务端

基于 FastAPI、Pydantic、HTTPX 和 UV。原先在浏览器执行的 TypeScript 业务已迁入 Python，React 只负责输入、执行时间线和报告。

框架参考本机 `C:\download\FastAPI-Template-main\FastAPI-Template-main`，沿用版本化路由、应用工厂、UV 和分层结构。模板原项目为 https://github.com/JiayuXu0/FastAPI-Template ，保留许可证见 [LICENSE.template](LICENSE.template)。

## 启动和检查

```powershell
cd C:\download\travelAgent-main\travelAgent-main\backend
.\scripts\setup.ps1
# 编辑 .env 中的 DEEPSEEK_API_KEY
.\scripts\dev.ps1
```

默认监听 `127.0.0.1:8001`；指定端口使用 `scripts/dev.ps1 -Port 8002`，同步修改 `../frontend/.env.local` 的 `BACKEND_URL`。前端在独立的 `../frontend/` 目录启动。也可使用已创建的环境：

```powershell
.\.venv\Scripts\python.exe -m uvicorn src:app --reload --reload-dir src --host 127.0.0.1 --port 8001
.\scripts\check.ps1
```

`setup.ps1` 使用已安装 UV 或在项目 `.tools/` 下载 UV，创建 `.venv`，安装锁定依赖，不覆盖已有 `.env`。为适配本机 Windows 的缓存权限，使用临时缓存和复制模式，退出后恢复临时目录设置。`check.ps1` 对 `src/tests/scripts` 执行 Ruff 检查、格式检查和 pytest。

## 配置

按后端目录读取 `.env`，系统环境变量优先。修改后重启后端。示例见 [.env.example](.env.example)。

| 变量 | 默认值 / 用途 |
|---|---|
| `DEEPSEEK_API_KEY` | 规划必填；空值返回 503，健康检查仍可用 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com`，追加 `/chat/completions` |
| `DEEPSEEK_MODEL` | `deepseek-flash`，以账号可用模型为准 |
| `APP_TIMEZONE` | `Asia/Shanghai` |
| `LLM_TIMEOUT_SECONDS` | `60`，单次模型 HTTP 请求超时 |
| `PLAN_TIMEOUT_SECONDS` | `240`，完整规划总超时 |
| `MAX_TOOL_ROUNDS` | `6`，单次对话最大请求轮数 |
| `QWEATHER_API_KEY` | 独立的和风天气凭据 |
| `QWEATHER_API_HOST` | 控制台 `*.qweatherapi.com` 域名，不带路径 |
| `QWEATHER_API_VERSION` | `v1`，也可选择 `v7` 适配原接口 |
| `QWEATHER_FORECAST_DAYS` | `30d`，仅 v7 使用；可选 `3d/7d/10d/15d/30d`，需相应权限 |
| `WEATHER_TIMEOUT_SECONDS` | `10`，每次地点/天气 HTTP 请求超时 |
| `WEATHER_FAILURE_MODE` | `continue` 标记缺失后继续；`error` 在天气查询失败时停止 |
| `CORS_ORIGINS` | 默认 localhost 和 127.0.0.1 的 5173 来源，逗号分隔 |
| `DOCS_ENABLED` | `true` |
| `LOG_LEVEL` | `INFO` |

天气 v1 使用 `/geo/v2/city/lookup` 获取经纬度，再请求 `/weather/v1/daily/{lat}/{lon}`，当前请求 10 天；v7 使用 LocationId 请求 `/v7/weather/{配置天数}`。权限和预报以实际返回为准，超出范围的日期标记缺失。参考 [v1 官方文档](https://dev.qweather.com/docs/api/weather/weather-daily-forecast/) 和 [v7 官方文档](https://dev.qweather.com/docs/api/weather/weather-daily-forecast-webapi-v7/)。

前端 `../frontend/.env.local` 中的旧配置可运行以下脚本迁移。已有后端值优先；首次复制模型 Key 时一起复制对应地址及模型名。后端值匹配的旧前端变量会被移除，不一致的项保留并提示变量名，不打印密钥：

```powershell
.\.venv\Scripts\python.exe scripts\migrate_frontend_env.py
```

不要把密钥写入 `VITE_*`。`../frontend/.env.local` 只需 `BACKEND_URL`（开发代理）和可选的 `VITE_API_BASE_URL`（构建 API 地址）。

## 分层与迁移对照

| 原 TypeScript 实现 | Python 实现 | 原因 |
|---|---|---|
| `src/lib/fetcher.ts` | `src/services/llm.py` | 服务端保管凭据，集中处理超时和工具调用 |
| `src/tools/index.ts` | `src/tools/date.py`、`weather.py` | 日期和天气适配独立，地点查询错误可见 |
| `analyzerAgent.ts` | `src/agents/analyzer.py` | 模型提取语义，程序规范偏好、预算和日期 |
| `weatherAgent.ts` | `src/agents/weather.py` | 天气取自接口，模型只给出行建议 |
| `plannerAgent.ts` | `src/agents/planner.py` | 校验每日活动数及日期完整性 |
| `coordinator.ts`、`DynamicExecutor.ts` | `src/services/travel_service.py` | 普通和流式接口共用流程，请求状态隔离 |
| `SmartSupervisor.ts` | `src/agents/supervisor.py` | 保留智能选择，保证分析在前、规划在后 |
| `GateKeeper.ts`、`AgentAdapters.ts` | `src/agents/gatekeeper.py` + 类型化上下文 | 整理输入，同时保留原始结构化事实 |

上述前端业务文件和 JS OpenAI SDK 依赖已移除。React `../frontend/src/lib/api.ts` 只处理 HTTP、中文分块解码、错误和取消。

其他目录：`src/api/v1/` 接口传输；`src/schemas/` 数据契约；`src/settings/` 配置；`src/core/` 初始化、CORS、异常、中间件和依赖；`src/log/` 请求日志；`src/models/`、`repositories/` 预留持久化。路由只调用 Service，Service 协调 Agent 和工具，后续保存历史时使用模板 Repository/Model 分层。

本次同时修正：日期从出发日和天数推导；偏好字符串转数组；模型 JSON 格式错误最多修复一次；工具循环有限轮数；多个工具调用逐个回传 `tool_call_id`；DeepSeek 使用非思考模式。天气缺失时明确标记，不制造实时预报。

## 接口

| 方法和路径 | 用途 |
|---|---|
| `GET /` | 服务入口 |
| `GET /api/v1/base/health` | 应用就绪，不验证外部账号 |
| `GET /api/v1/base/version` | 版本信息 |
| `GET /docs`、`/redoc`、`/openapi.json` | 文档和接口规范 |
| `POST /api/v1/travel/plan` | 完整结果及执行记录 |
| `POST /api/v1/travel/plan/stream` | 实时执行记录和最终结果 |

两个规划接口共用请求：

```json
{"query":"明天去成都玩两天，预算3000元，喜欢美食","mode":"standard"}
```

`query` 去首尾空白后 1–5000 字符；`mode` 为 `standard` 或 `smart`。可选 `history` 传入之前的对话，每项只有 `role`（user/assistant）和 `content`；最多 20 条，每条最多 5000 字符，总计不超过 20000 字符。本轮输入只放在 `query`，不要重复追加到历史中。

需求分析先提取 `AnalysisDraft`：目的地、出发日期、天数、预算任一缺失时返回追问，不进入主管、GateKeeper、天气或行程流程，不再默认明天或三天。预算明确为不限、暂未确定或请推荐均可通过；偏好可选。后续输入与历史合并，用户明确修改时采用最新信息。

普通响应为 `code/msg/data/request_id`；`data` 包含 `result`、`clarification` 和 `records`，其中 `result` 与 `clarification` 恰好一个非空。完整 `result` 中 `analysis/weather/planner` 各有 `text` 及对象形式的 `json`。追问 `clarification` 包含可显示的 `message`、`missingFields` 和已提取的 `draft`，属于正常 HTTP 200 业务结果。

实时响应为 `application/x-ndjson`，每行一个对象：

| event | data |
|---|---|
| `record` | `id/name/type/desc/content/contentType/createdAt`，兼容页面时间线 |
| `heartbeat` | `null`，无记录时约 10 秒发送一次 |
| `result` | 完整的 `analysis/weather/planner` 对象，随后结束 |
| `clarification` | `message/missingFields/draft`，显示追问后结束，等待用户下一轮补充 |
| `error` | `message/code/request_id`，随后结束 |

缺少模型配置或请求校验失败时，在流开始前返回普通 HTTP 错误。流开始后状态已发送，后续错误通过 `error` 事件表达。每次请求有独立有界队列，浏览器取消或断开会取消对应任务及外部调用，不会在后台继续保存结果。

`X-Request-ID` 对应后端日志；`X-Process-Time-Ms` 为响应头发送前耗时，流式完整耗时看执行记录。生产代理需要关闭响应缓冲并设置足够读取超时，Vite 开发代理已配置约 300 秒。

## 验证范围与边界

自动测试使用 HTTPX MockTransport 替换外部响应，不产生真实调用费用。覆盖基础路由、生命周期、CORS、请求 ID、错误、普通/智能规划、步骤依赖、GateKeeper、v1/v7 天气、天气降级、多个工具调用、JSON 修复、超时、断开取消和并发隔离。追问测试覆盖四个必需字段、部分补充、完整补充、预算不限、终结事件、历史长度及角色校验，并确认信息缺失时不执行后续 Agent。

前端 Node 测试直接加载实际流解析代码，验证中文跨字节、跨行分块、心跳、结果、错误 ID、HTTP 错误、代理误配、提前断流及取消。在 `../frontend/` 目录运行 `npm test`、`npm run lint`、`npm run build`。

当前没有登录、数据库历史或后台任务队列。
