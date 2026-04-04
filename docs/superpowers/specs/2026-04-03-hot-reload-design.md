# 前后端热更新设计

## 目标

- 前端开发时支持 Vite HMR，无需整页刷新
- 后端开发时支持源码保存后自动重启
- 本地联调默认使用前端 dev server 代理 `/api/*` 到后端 `http://localhost:8080`

## 当前方案

- 前端继续使用 `vite --host 0.0.0.0 --port 5173`
- 后端开发命令切换为 `tsx watch --clear-screen=false server.ts`
- 根目录 `npm run dev` 继续并行启动前后端，并给日志打上 `frontend` / `backend` 标签
- 前端默认使用相对路径 `/api/*` 请求后端；如设置 `VITE_API_BASE_URL`，则优先使用显式地址

## 取舍

- 这是稳定开发体验方案，不是 Node 模块级真 HMR
- 后端保存后会自动重启进程，而不是在同一进程中替换模块
- 这样能避免当前 `backend/server.ts` 中数据库连接、HTTP 监听、pipeline 状态等副作用在假 HMR 下积累脏状态

## 使用方式

```bash
npm run dev
```

- 前端地址：`http://localhost:5173`
- 后端地址：`http://localhost:8080`

## 可选环境变量

- `VITE_API_BASE_URL`：显式指定前端请求基地址
- `VITE_API_PROXY_TARGET`：覆盖 Vite 开发代理目标地址，默认 `http://localhost:8080`
- `VITE_HMR=false`：关闭前端 HMR（仅调试时使用）
