# AI 旅行规划助手

React 页面 + Python FastAPI 服务端。需求分析、DeepSeek 调用、天气查询、多 Agent 编排和行程生成已迁入 Python；浏览器负责提交需求、展示执行记录和旅行报告。

前后端按独立工程组织：

```text
travelAgent-main/
├── frontend/       # React 源码、前端测试、配置、依赖与构建产物
├── backend/        # FastAPI 服务、Agent、工具、配置与 Python 测试
├── docs/           # 共享设计资料和历史方案
├── README.md
└── 启动说明.md
```

## 启动

需要 Node.js 18+、Python 3.11+ 和 UV。在两个 PowerShell 终端分别执行：

```powershell
# 终端一：Python 后端，默认 8001
cd C:\download\travelAgent-main\travelAgent-main\backend
.\scripts\setup.ps1
# 首次运行后，在 backend/.env 填写 DEEPSEEK_API_KEY
.\scripts\dev.ps1
```

```powershell
# 终端二：React 前端
cd C:\download\travelAgent-main\travelAgent-main\frontend
npm install
npm run dev
```

页面：[http://localhost:5173](http://localhost:5173)；接口文档：[http://127.0.0.1:8001/docs](http://127.0.0.1:8001/docs)。前端也可以使用 pnpm 安装和启动。

## Key 填在哪里

只在 `backend/.env` 配置：

```dotenv
DEEPSEEK_API_KEY=你的DeepSeek密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash

# 需要真实天气时填写独立的天气 Key 和控制台 API Host
QWEATHER_API_KEY=
QWEATHER_API_HOST=
QWEATHER_API_VERSION=v1
```

DeepSeek Key 用于生成内容，和风天气 Key 用于查询真实天气。天气未配置、请求失败或日期超出预报范围时，默认继续生成行程，报告明确标记天气不可用。可设置 `WEATHER_FAILURE_MODE=error`，要求天气失败时停止规划。

前端的 `frontend/.env.local` 只保存地址，不再使用 `VITE_DEEPSEEK_API_KEY` 等前端密钥变量：

```dotenv
BACKEND_URL=http://127.0.0.1:8001
VITE_API_BASE_URL=
```

开发时 Vite 将 `/api` 转发到 `BACKEND_URL`。修改后端 `.env` 后重启 Python；修改前端地址后重启 Vite。生产环境需配置 `/api` 反向代理，或者构建前设置 `VITE_API_BASE_URL` 并配置后端 `CORS_ORIGINS`。

## 功能与数据流

桌面端左侧是 320–360 像素的聊天栏，右侧展示执行进度和报告入口，窄屏自动上下排列。可在同一对话中逐步补充或修改需求，也可以开始新对话。

需求分析先确认目的地、出发日期、旅行天数和总预算；缺失时助手会回复追问，暂不查询天气或生成行程。预算可以明确说明“不限”“暂未确定”或“请推荐”。补充信息时会带上之前的对话，已提供的内容无需重复。

信息完整后，普通模式执行天气查询 → 行程生成；智能编排增加 SmartSupervisor 选择步骤，并由 GateKeeper 为后续 Agent 整理输入。页面可实时查看进度，也可以取消请求。对话保留在当前页面内存中，刷新后清空。

```text
React 表单 → POST /api/v1/travel/plan/stream
  → FastAPI → TravelService → Python Agents → DeepSeek / 和风天气
  ← NDJSON 执行记录和最终结构化结果 → React 时间线和报告
```

接口返回经过 Pydantic 校验的对象，前端不再解析模型 JSON 字符串。天气和温度来自天气接口，模型只生成建议。当前日期由 Python 按 `Asia/Shanghai` 提供。

## 目录职责

| 路径 | 作用 |
|---|---|
| `frontend/src/App.tsx` | 左右布局、对话上下文、提交、取消和报告状态 |
| `frontend/src/components/ChatPanel.tsx` | 聊天记录、追问及待补充字段 |
| `frontend/src/lib/api.ts` | 调用 Python，增量解析进度流 |
| `frontend/src/components/` | 表单、执行时间线和报告 |
| `frontend/src/model/` | 当前页面执行记录状态 |
| `frontend/src/types/` | 与 Python 响应对应的类型 |
| `backend/src/api/v1/` | 接口和响应传输 |
| `backend/src/services/` | 旅行流程、模型客户端和进度收集 |
| `backend/src/agents/` | 需求分析、天气建议、行程规划、主管、参数整理 |
| `backend/src/tools/` | 日期和天气 API 工具 |
| `backend/src/schemas/` | 旅行数据和统一响应结构 |
| `backend/src/core/` | CORS、请求 ID、异常和依赖注入 |
| `backend/src/settings/` | 后端配置 |
| `backend/src/models/`、`repositories/` | 预留持久化分层，目前没有数据库业务 |
| `backend/tests/`、`frontend/tests/` | 后端流程及前端流解析测试 |

原浏览器端的 Agent、天气工具和 `fetcher.ts` 已删除，浏览器不再直接调用供应商。目前没有登录、数据库历史和后台任务队列；取消或关闭页面会终止该页面的规划请求。

## 检查

```powershell
# frontend 目录
cd C:\download\travelAgent-main\travelAgent-main\frontend
npm test
npm run lint
npm run build

# backend 目录
cd C:\download\travelAgent-main\travelAgent-main\backend
.\scripts\check.ps1
```

测试替换外部模型和天气 HTTP 响应，不产生真实 API 费用。前端目录及部署见 [frontend/README.md](frontend/README.md)；详细后端架构、配置、接口事件和迁移对照见 [backend/README.md](backend/README.md)；日常使用见 [启动说明.md](启动说明.md)。

项目源自 [《前端视角下认识 AI Agent》配套演示](https://juejin.cn/post/7522476555774066703)。Python 框架参考 FastAPI-Template，保留模板许可证见 [backend/LICENSE.template](backend/LICENSE.template)。
