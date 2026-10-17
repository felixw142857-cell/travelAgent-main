# 旅行规划助手前端

独立的 React + TypeScript + Vite 工程，负责聊天、补充需求、执行时间线和旅行报告。通过 HTTP / NDJSON 调用同级 `backend/` 的 FastAPI 服务。

## 启动

```powershell
cd C:\download\travelAgent-main\travelAgent-main\frontend
npm install
npm run dev
```

已有 `node_modules/` 时可以直接启动。也可使用 `pnpm install`、`pnpm dev`。本地页面通常为 `http://localhost:5173`，后端另开终端在 `backend/` 运行 `scripts/dev.ps1`，默认端口 8001。

## 配置

配置文件为当前目录的 `.env.local`，缺失时从 `.env.example` 复制：

```dotenv
BACKEND_URL=http://127.0.0.1:8001
VITE_API_BASE_URL=
```

`BACKEND_URL` 是开发代理目标，浏览器请求 `/api`，由 Vite 转给 Python。`VITE_API_BASE_URL` 是构建时的浏览器 API 地址；本地代理模式留空。修改后重启 Vite。DeepSeek 和天气 Key 只放在 `../backend/.env`，不要使用 `VITE_` 密钥变量。

## 文件分工

| 路径 | 用途 |
|---|---|
| `src/App.tsx` | 页面布局、对话上下文和请求状态 |
| `src/components/` | 聊天、输入框、执行记录和报告组件 |
| `src/lib/api.ts` | FastAPI 进度流、追问、错误和取消处理 |
| `src/model/` | 当前页面的执行记录状态 |
| `src/types/` | 后端响应的 TypeScript 类型 |
| `tests/` | 真实流解析代码的 Node 测试 |
| `index.html` | 页面入口 |
| `vite.config.ts` | 前端根目录、路径别名、环境文件和开发代理 |
| `tsconfig*.json` | TypeScript 配置 |
| `tailwind.config.js`、`postcss.config.js` | 样式构建 |
| `components.json` | UI 组件生成器配置 |
| `package.json` 和锁文件 | 独立前端依赖及命令 |
| `dist/` | 构建产物，不提交版本库 |

## 验证和构建

```powershell
npm test
npm run lint
npm run build
npm run preview
```

生产部署发布 `dist/`。Web 服务器将 `/api` 反向代理到独立的 Python 服务；或者构建前设置 `VITE_API_BASE_URL` 指向后端，并在后端设置对应的 `CORS_ORIGINS`。流式接口需关闭代理缓冲并允许足够的读取超时。预览命令只用于本机检查构建结果。

完整启动和后端配置见 [项目 README](../README.md)、[启动说明](../启动说明.md) 和 [后端文档](../backend/README.md)。
