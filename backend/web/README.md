# 远行 · 智能旅行规划前端

为 `backend` 的 FastAPI 旅行 Agent 写的一个独立前端页面。无构建步骤、无第三方依赖，直接由静态文件和一个本地同源代理组成。

```
web/
├─ index.html    页面结构
├─ styles.css    视觉样式（暖纸张 / 森林绿 / 陶土色，支持夜间模式）
├─ app.js        交互、NDJSON 流解析、报告渲染
├─ serve.py      静态服务器 + /api 同源代理
└─ README.md
```

## 启动

先确认后端已经运行（默认 `127.0.0.1:8001`）：

```powershell
cd C:\download\travelAgent-main\travelAgent-main\backend
.\scripts\dev.ps1
```

再开一个终端启动本页面：

```powershell
cd C:\download\travelAgent-main\travelAgent-main\backend
.\.venv\Scripts\python.exe web\serve.py
```

打开 <http://127.0.0.1:5174/>。

`serve.py` 会同时提供静态文件，并把 `/api`、`/docs`、`/redoc`、`/openapi.json`
反向代理到 FastAPI。浏览器只访问同源地址，因此**不需要修改后端的 `CORS_ORIGINS`**，
流式 NDJSON 也会原样透传。

### 可选参数

```powershell
# 换前端端口
.\.venv\Scripts\python.exe web\serve.py --port 5175

# 后端不在默认地址
.\.venv\Scripts\python.exe web\serve.py --backend http://127.0.0.1:8002

# 启动后自动打开浏览器
.\.venv\Scripts\python.exe web\serve.py --open
```

## 其他打开方式

- **使用任意静态服务器**：页面会先探测同源 `/api/v1/base/health`；探测失败时回退到
  `http://127.0.0.1:8001`。此时需要把页面的来源加入后端 `CORS_ORIGINS`，或使用
  `?api=http://127.0.0.1:8002` 指定后端地址。
- **直接双击 `index.html`**：浏览器以 `file://` 打开，跨域限制通常会拦截 API 请求，
  不建议这样使用。

## 页面能力

- 需求输入：目的地、日期、天数、预算等；信息不全会展示后端返回的追问卡片，补全后继续。
- 双编排模式：标准 / 智能（对应后端 `mode` 参数）。
- 实时执行时间线：逐条展示 supervisor、agent、tool 记录，可展开查看 JSON/文本输出。
- 报告渲染：旅行封面、沿途天气、逐日行程、景点库来源标记、规划师手记。
- 复制行程、导出 JSON、新建旅程、取消进行中的规划。
- 对话历史自动整理为后端 `history`（最多 20 条、总长不超过 20000 字符）。
- 后端连接状态、地址设置、接口文档入口。
- 响应式布局、键盘 `Ctrl/⌘ + Enter` 提交、`prefers-reduced-motion` 适配。
- 夜间模式；可用 `?theme=night` 直接预览。
- 示例行程预览：`?demo=1`，或点击首页的「先看一份示例行程」。

## 接口约定

页面只调用：

- `GET /api/v1/base/health`、`GET /api/v1/base/version`
- `POST /api/v1/travel/plan/stream`（`application/x-ndjson`）

流事件包括 `record`、`heartbeat`、`result`、`clarification`、`error`；
页面会处理中文跨字节分块、CRLF、心跳、提前断流与浏览器取消。
