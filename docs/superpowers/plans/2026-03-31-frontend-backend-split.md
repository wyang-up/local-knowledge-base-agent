# 前后端分离改造 Implementation Plan

> Status: Historical implementation plan. This migration has already landed and is kept as architecture history.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前单进程项目改造成单仓双服务的前后端分离架构，前端与后端可独立启动与部署。

**Architecture:** 前端保留 Vite SPA（5173），后端独立 Express API（8080），通过 `VITE_API_BASE_URL` 通信。后端去除 Vite middleware，统一提供纯 `/api/*` 服务并启用 CORS。

**Tech Stack:** React + Vite + TypeScript、Express + SQLite + LanceDB、Ollama、CORS。

---

### Task 1: 建立后端独立工程

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/server.ts`
- Create: `backend/server-utils.ts`

- [ ] 拷贝并改造现有服务端逻辑到 `backend/server.ts`
- [ ] 移除 Vite middleware 相关代码，固定 API 端口为 8080
- [ ] 增加 CORS 配置允许前端地址访问
- [ ] 后端可通过 `npm run dev --prefix backend` 独立启动

### Task 2: 改造前端 API 调用配置

**Files:**
- Modify: `src/App.tsx`
- Create: `.env.example`

- [ ] 增加 `VITE_API_BASE_URL` 配置读取
- [ ] 将页面中所有 `/api/*` 请求改为基于 `VITE_API_BASE_URL` 拼接
- [ ] 保持现有功能行为不变（上传、列表、问答、模型检测）

### Task 3: 改造仓库启动脚本与文档

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Delete: `server.ts`
- Delete: `server-utils.ts`

- [ ] 根脚本拆分为 `dev:frontend`、`dev:backend`、`dev`
- [ ] 增加并行启动命令，支持一键拉起双服务
- [ ] 更新 README 的启动方式、端口说明、联调说明

### Task 4: 验证改造结果

**Files:**
- Modify (if needed): `src/App.test.tsx`
- Modify (if needed): `backend/server.ts`

- [ ] 执行 `npm run lint`
- [ ] 执行 `npm run test`
- [ ] 执行 `npm run build`
- [ ] 启动前后端并验证 `documents`、`upload`、`chat`、`ollama/models` 接口联通
