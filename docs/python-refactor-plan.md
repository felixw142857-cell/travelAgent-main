# Python 重构方案 A：FastAPI 后端 + 保留现有 React UI

> 目标：把"Agent 在浏览器里跑"改成"Agent 在 FastAPI 里跑，界面一行不重画"，用 SSE 把执行日志原样推回现有 UI。
> 预估：**12–14 小时净工作时间**（砍掉智能编排的精简版 7–9 小时）。

---

## 1. 现状（实测，不是估计）

- `src` 下 TS/TSX/CSS 共 **3,715 行**（不含 node_modules），**没有任何后端代码**。
- 两条活链路 + 一块死代码：

| 链路 | 入口 | 组成 |
|---|---|---|
| 简单模式（默认） | [App.tsx:34](../src/App.tsx#L34) | [coordinator.ts](../src/agents/coordinator.ts) → Analyzer → Weather → Planner 固定串行 |
| 智能编排（右上角 checkbox） | [App.tsx:31](../src/App.tsx#L31) | [SmartSupervisor.ts](../src/agents/dynamic/SmartSupervisor.ts) → [GateKeeper.ts](../src/agents/dynamic/GateKeeper.ts) → 同样 3 个 Agent |
| **死代码** | 无入口 | `AgentAdapters.ts`(329) + `DynamicExecutor.ts`(192)；`dynamic/` 下没有 `index.ts`，README 里所有 `import ... from '@/agents/dynamic'` 都是失效的 |

结论：`dynamic/` 里 **SmartSupervisor + GateKeeper 是活的必须移植**，AgentAdapters + DynamicExecutor 是废的必须删。

### 1.1 四个必须先记住的事实

1. **LLM 调用在前端**：[fetcher.ts](../src/lib/fetcher.ts) 用 `openai` SDK + `dangerouslyAllowBrowser: true`，递归实现单轮多工具调用循环，**没有轮次上限**，参数里带 DeepSeek 专有的 `thinking: { type: 'disabled' }`。
2. **`AgentResults.*.json` 实际是字符串**：[PlanResult.tsx:27-29](../src/components/PlanResult.tsx#L27-L29) 自己再 `JSON.parse` 一次。后端**必须继续返回字符串**，返回对象会让前端崩。
3. **模型输出是裸 JSON**，代码直接 `JSON.parse`，没有 ```json fence 容错——这是当前最主要的失败源。
4. **Key 已经泄露**：`VITE_*` 会被打进 bundle；`/qweatherapi` 只是 Vite dev proxy，生产环境天气功能不可用。也就是说**这份代码目前没有可部署形态**，Python 后端顺手解决。

---

## 2. 目标形态

单进程：dev 时 `uvicorn` 起 API，Vite 代理 `/api`；prod 时 FastAPI 直接托管 `dist/`，一个服务搞定。

```
浏览器 ──/api/plan/stream──> FastAPI ──> Agent 链 ──> DeepSeek
                                 └──httpx──> 和风天气（不再需要 proxy）
```

---

## 3. 文件清单

### 3.1 新增：后端（约 1,400 行代码 + 600 行提示词 + 200 行测试）

| 路径 | 预估行数 | 对应 TS 源 | 要点 |
|---|---|---|---|
| `backend/pyproject.toml` | 25 | — | fastapi / uvicorn / openai / httpx / pydantic-settings |
| `backend/.env.example` | 10 | `.env.example` | `DEEPSEEK_*`、`QWEATHER_*`，无 `VITE_` 前缀 |
| `backend/app/main.py` | 40 | — | 路由挂载、CORS、生产托管 `dist/` |
| `backend/app/config.py` | 30 | — | pydantic-settings 读 `.env` |
| `backend/app/api/plan.py` | 90 | — | `POST /api/plan/stream`，StreamingResponse + 15s 心跳 |
| `backend/app/core/llm.py` | 110 | [fetcher.ts](../src/lib/fetcher.ts) | `AsyncOpenAI`、工具循环、**加最多 8 轮上限**、`thinking` 走 `extra_body` |
| `backend/app/core/jsonx.py` | 60 | 新增 | 剥 fence → 截取首个 `[`/`{` 到末个 `]`/`}` → 失败重试 1 次 |
| `backend/app/core/events.py` | 40 | [model/index.ts](../src/model/index.ts) 的 `addRecord` | `RecordItem` + 同步事件发射器（回调改成 emitter） |
| `backend/app/core/errors.py` | 20 | `ToolExecutionError` | 保留错误穿透语义 |
| `backend/app/models/records.py` | 30 | `RecordItem` | `contentType: "json" \| "text" \| ""` |
| `backend/app/models/results.py` | 40 | [types/index.ts](../src/types/index.ts) | `AgentResults`，`json: str` |
| `backend/app/models/agent.py` | 40 | `Agent` 接口 | `Protocol` + `AgentInput` |
| `backend/app/tools/qweather.py` | 90 | [tools/index.ts](../src/tools/index.ts) L20-76 | httpx.AsyncClient、10s 超时、**10 条错误码中文映射原样保留** |
| `backend/app/tools/date_tool.py` | 20 | `get_current_date` | `datetime.now().strftime('%Y-%m-%d')` |
| `backend/app/tools/location_tool.py` | 30 | `get_location_id` | `/geo/v2/city/lookup` |
| `backend/app/tools/weather_tool.py` | 40 | `get_weather_by_location_id` | `/v7/weather/30d`，按日期对齐，缺失填"无天气信息" |
| `backend/app/agents/base.py` | 70 | `Agent` 实现约定 | `get_json_result` / `make_text_result` + `add_record` |
| `backend/app/agents/analyzer.py` | 90 | [analyzerAgent.ts](../src/agents/analyzerAgent.ts) | 挂 `get_current_date` 工具 |
| `backend/app/agents/weather.py` | 100 | [weatherAgent.ts](../src/agents/weatherAgent.ts) | 挂 2 个天气工具 |
| `backend/app/agents/planner.py` | 110 | [plannerAgent.ts](../src/agents/plannerAgent.ts) | 无工具，纯提示词 + 格式化输出 |
| `backend/app/agents/coordinator.py` | 80 | [coordinator.ts](../src/agents/coordinator.ts) | 三步串行 |
| `backend/app/agents/smart_supervisor.py` | 150 | [SmartSupervisor.ts](../src/agents/dynamic/SmartSupervisor.ts) | Plan-and-Execute，LLM 选 Agent |
| `backend/app/agents/gate_keeper.py` | 110 | [GateKeeper.ts](../src/agents/dynamic/GateKeeper.ts) | LLM 拼参数 |
| `backend/app/prompts/{analyzer,weather,planner}_system.md` | ~600 | 三个 `systemPrompt` | **原文搬运，一个字不改**（含示例里的 emoji 和中文标点） |
| `backend/tests/test_jsonx.py` | 50 | — | fence / 前后缀噪声 / 空串 |
| `backend/tests/test_tools.py` | 50 | — | respx mock 和风，含 401/403/429 分支 |
| `backend/tests/test_coordinator.py` | 60 | — | fake LLM，验证传递的输入串 |
| `backend/tests/test_api.py` | 40 | — | TestClient 收 SSE 事件序列 |

### 3.2 前端：保留 / 修改 / 删除

**完全不动的（约 1,050 行）**：`components/ui/*`（15 个 shadcn 壳子）、[AgentStatus.tsx](../src/components/AgentStatus.tsx)、[PlanResult.tsx](../src/components/PlanResult.tsx)、[PlannerForm.tsx](../src/components/PlannerForm.tsx)、[model/index.ts](../src/model/index.ts)（zustand 保留，只是数据来源换成 SSE）。

**需要改的（4 个文件）**：

| 文件 | 改动 | 量 |
|---|---|---|
| `src/lib/api.ts` | **新增**：`runPlanStream({query, smartMode}, onRecord)`，fetch + ReadableStream 手解 SSE | ~70 行 |
| [App.tsx](../src/App.tsx) | `new AgentCoordinator(...)` / `new SmartSupervisor(...)` 换成 `await runPlanStream(...)`；错误分支保留 | ~20 行改 |
| [vite.config.ts](../vite.config.ts) | 加 `/api` → `http://127.0.0.1:8000`；删 `/qweatherapi`、删 `/baidu`（src 里零引用，已确认） | ~10 行 |
| [types/index.ts](../src/types/index.ts) | 只留 `AgentResults` / `RecordItem`；删 `TravelPlan`、`DayPlan`、`Meal`、`Activity`、`WeatherInfo`、`TransportationInfo`、`Route`、`TravelFormData`（无引用） | 157 → ~30 行 |
| `.env.example` / `.env.local` | 删掉全部 `VITE_DEEPSEEK_*`、`VITE_QWEATHER_*` | — |
| `vite-env.d.ts` | 删 `VITE_*` 声明 | 11 → 3 行 |

> ⚠️ 不能用 `EventSource`：它只支持 GET，而我们需要 POST 传 query。必须 fetch + ReadableStream 手动分帧。

**删除（约 1,700 行）**：

```
src/lib/fetcher.ts              (100)  → 逻辑进 core/llm.py
src/tools/index.ts              (182)  → 进 tools/
src/agents/analyzerAgent.ts     (174)
src/agents/weatherAgent.ts      (260)
src/agents/plannerAgent.ts      (298)
src/agents/coordinator.ts       (148)
src/agents/dynamic/SmartSupervisor.ts (252)
src/agents/dynamic/GateKeeper.ts      (200)
src/agents/dynamic/AgentAdapters.ts   (329)  ← 死代码，不移植
src/agents/dynamic/DynamicExecutor.ts (192)  ← 死代码，不移植
src/agents/dynamic/types.ts     (~95)
src/agents/dynamic/README.md    (266)  ← 描述的是已废弃的 v2 架构
```

---

## 4. 接口契约

### `POST /api/plan/stream`

```json
{ "query": "8月去杭州3天，预算2000", "smartMode": false }
```

响应 `text/event-stream`，三种事件：

```
event: record
data: {"id":"analyzerAgent_1730...","name":"AnalyzerAgent","type":"agent","desc":"开始分析...","content":"...","contentType":"text","createdAt":1730000000}

event: result
data: {"analysis":{"text":"...","json":"{...}"},"weather":{...},"planner":{...}}

event: error
data: {"message":"和风天气查询失败（401）：认证失败，请检查和风天气 API Key","kind":"tool"}
```

`result` 里三个 `json` 字段**必须是字符串**（见 §1.1 第 2 点）。

### `GET /api/health` → `{"status":"ok","model":"deepseek-flash"}`

---

## 5. 阶段与工时

| 阶段 | 内容 | 工时 | 阻塞项 |
|---|---|---|---|
| P0 | 脚手架：目录、pyproject、config、`.env.example` | 0.5h | — |
| P1 | `core/llm.py` + `jsonx.py` + `events.py` | 2.0h | — |
| P2 | 工具层 4 个文件（qweather + 3 tool） | 2.0h | 需要能连通和风（可用 mock 先跑） |
| P3 | Agent 层：base + 3 个 agent + 提示词抽离 | 3.0h | — |
| P4 | 编排层：coordinator + smart_supervisor + gate_keeper | 2.5h | 取决于 §6 决策 1 |
| P5 | API 层：SSE + health + 静态托管 | 1.5h | — |
| P6 | 前端改接：api.ts + App.tsx + vite.config + 删旧文件 | 1.5h | — |
| P7 | 验证收尾：pytest 4 个文件、真机跑 3 次、README | 2.0h | 需要你的 DeepSeek / 和风 Key 可用 |
| **合计** | | **13.0h** | |

**关于初次估算的修正**：上一轮我说 6–10 小时，是按"只有一条固定三步链路"算的。细查后发现智能编排是活的、且要按对等标准移植（+2.5h），因此上修到 12–14 小时。

- 砍掉智能编排（checkbox 直接去掉）的精简 A：**7–9 小时**。
- 保留但重写（用 Python 重做 planner/executor 结构，而非移植）：**15–18 小时**。

---

## 6. 需要你拍板的 4 个点

1. **智能编排怎么办？**
   - (a) 1:1 移植 SmartSupervisor + GateKeeper（+2.5h，把现有的设计问题一起搬过去）
   - (b) **建议：先只移植简单模式，智能编排留着 checkbox 但暂时置灰**，等主链路稳定后单独重做——它现在的实现有两个真 bug：`finalResult.planner.json` 被赋成字符串、`outputPool` 里 `JSON.parse(jsonResult)` 未保护会直接抛。
   - (c) 直接删掉智能编排（省 2.5h，但少一个功能）
2. **要不要加 JSON 容错？** 现在模型一加解释文字就整体崩。建议加 [jsonx.py](../backend/app/core/jsonx.py)（剥 fence + 重试一次），代价是行为与现版不完全一致，但失败率会明显下降。
3. **前端保留还是顺手换掉？** 保留 = 省 1.5 天。换掉（方案 B）是另一件事。
4. **依赖管理**：本机有 Python 3.14.7 + pip，**没有 uv**。用 `requirements.txt`（零安装，最稳）还是先装 uv 换 `pyproject.toml`？

---

## 7. 坑（照抄会踩）

1. **`thinking` 参数**：TS 里是顶层参数，Python SDK 必须走 `extra_body={"thinking": {"type": "disabled"}}`，写错位置会被静默忽略（模型开始输出思维链，JSON 直接不可解析）。
2. **`json` 字段必须是字符串**，理由见 §1.1。
3. **工具循环没有轮次上限**：原实现递归到底，模型抽风就是无限烧 token。移植时加 `max_rounds=8`，超了抛可读错误。
4. **30 天预报的日期对齐**：`dates.map(...)` 只保留用户日期，缺失填"无天气信息"，这条逻辑和 weatherAgent 提示词里的"示例 3"是对应的，删了模型行为会变。
5. **`get_current_date` 原实现依赖系统 locale**：`toLocaleString().split(' ')[0].replace(/\//g,'-')` 在中文 Windows 上是 `2025/7/1` → `2025-7-1`（**月份不补零**）。Python 用 `strftime('%Y-%m-%d')` 会变成 `2025-07-01`，模型看到的输入略有变化。建议改成补零（更正确），但要知道这是行为变更。
6. **SSE 超时**：一次规划 12–25 秒，中间有静默期（比如 GateKeeper 思考）。必须发心跳 comment，否则中间层会断流；uvicorn 也要显式关掉超时。
7. **`AgentStatus` 会 `JSON.parse(content)`**（[AgentStatus.tsx:66](../src/components/AgentStatus.tsx#L66)）：`contentType: "json"` 的记录如果 content 不是合法 JSON，前端会抛。后端发事件前要校验，或把非法内容降级成 `text`。

---

## 8. 验收标准（可执行，不靠感觉）

- [ ] `curl -N -X POST localhost:8000/api/plan/stream -d '{"query":"...","smartMode":false}'` 能看到 `record` → `result` 完整序列
- [ ] 同一输入连跑 3 次，`PlanResult` 弹窗都能正常渲染（行程卡片、天气、分析三段齐全）
- [ ] `grep -r "VITE_DEEPSEEK" dist/` **无结果**
- [ ] `cd backend && python -m pytest` 全绿
- [ ] 拔掉 Key 或断网时，前端显示中文错误提示而不是白屏/卡死
- [ ] 生产模式 `python -m uvicorn app.main:app` 能直接打开页面并跑通全流程（不再需要 Vite dev server）
