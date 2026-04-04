# 本地知识库 Agent（前后端分离版）

## 架构说明

- 前端：React + Vite（默认 `http://localhost:5173`）
- 后端：Express API（默认 `http://localhost:8080`）
- AI 服务：SiliconFlow（OpenAI 兼容接口，默认 `https://api.siliconflow.cn/v1`）

## 目录结构

- `frontend/src/`：前端页面与交互
- `frontend/config/`：前端开发与测试配置（Vite、Vitest、前端环境变量示例）
- `backend/`：后端 API、文档解析、向量化、问答
- `backend/config/`：后端环境变量示例与后端配置文件
- `data/`：本地数据库与上传文件

前端当前按职责继续拆分为：

- `frontend/src/pages/`：页面与应用入口
- `frontend/src/features/`：功能模块（当前主要是 settings）
- `frontend/src/shared/`：通用工具与共享类型
- `frontend/src/test/`：前端测试初始化与共享测试支持

## 本地启动

1. 安装前端依赖

```bash
npm install
```

2. 安装后端依赖

```bash
npm install --prefix backend
```

3. 一键启动前后端

```bash
npm run dev
```

启动后访问：

- 前端：`http://localhost:5173`
- 后端健康检查：`http://localhost:8080/api/health`

## 开发热更新与 API 代理

默认开发方式：

```bash
npm run dev
```

这个命令会同时启动前后端，并启用两套开发期更新机制：

- 前端：Vite HMR，修改 `frontend/src/` 下文件后，浏览器会尽量无刷新更新
- 前端代码目录：`frontend/src/`
- 后端：`tsx watch`，修改 `backend/` 下文件后，API 进程会自动重启

### 默认代理行为

前端开发环境默认直接请求相对路径 `/api/*`，例如：

- `/api/documents`
- `/api/upload`
- `/api/health`

这些请求会由 Vite dev server 自动代理到：

- `http://localhost:8080`

这意味着开发时通常不需要手动写死后端地址，也能避免额外的跨域调试噪音。

### 什么时候用 `VITE_API_BASE_URL`

如果你希望前端直接请求某个明确后端地址，而不是走 Vite 代理，可以设置：

```bash
VITE_API_BASE_URL=http://127.0.0.1:8080
```

设置后，前端会直接请求这个地址，优先级高于默认 `/api` 相对路径策略。

适合这些场景：

- 你要把前端 dev server 连到另一台机器上的后端
- 你临时需要绕过 Vite 代理排查请求问题
- 你希望在浏览器网络面板里直接看到真实后端地址

### 什么时候用 `VITE_API_PROXY_TARGET`

如果你仍然想保留前端相对路径 `/api/*` 的写法，但希望代理转发到别的后端地址，可以设置：

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:8081
```

这会修改 Vite 开发代理的目标地址，但前端代码里依然保持 `/api/*` 不变。

简单区分：

- `VITE_API_BASE_URL`：改“前端实际请求地址”
- `VITE_API_PROXY_TARGET`：改“Vite 代理转发目标”

### 可选开发环境变量示例

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:8080
VITE_HMR=false
```

- `VITE_API_PROXY_TARGET`：覆盖默认代理目标
- `VITE_HMR=false`：临时关闭前端 HMR，仅用于排查开发期异常

## 单独启动

```bash
npm run dev:frontend
npm run dev:backend
```

- `npm run dev:frontend`：只启动 Vite 前端开发服务器
- `npm run dev:backend`：只启动后端 watch 模式，保存后自动重启

## 端口占用排查

如果 `npm run dev` 启动失败，最常见原因是 `5173` 或 `8080` 已经被旧进程占用。

常见表现：

- 前端报错 `Port 5173 is already in use`
- 新开的并行开发进程刚起来就退出
- 浏览器打开的是旧页面或旧后端响应

建议处理方式：

1. 先关闭已经运行的旧前端/后端开发进程
2. 再重新执行 `npm run dev`
3. 重新打开 `http://localhost:5173`

如果你是在多终端反复启动开发服务，先清掉旧进程再重启，能少掉很多假问题。

## 环境变量

- 前端：可在项目根 `.env` 中配置 `VITE_API_BASE_URL`、`VITE_API_PROXY_TARGET`、`VITE_HMR`；示例文件位于 `frontend/config/.env.example`
- 后端：运行时可使用 `backend/.env`；示例文件位于 `backend/config/.env.example`，支持 `PORT`、`DATA_DIR`、`LANCE_PATH`、`CORS_ORIGIN`、`BASE_URL`、`EMBEDDING_MODEL`、`LLM_MODEL`
- API Key：在前端「设置」页通过「保存密钥」写入后端配置中心（`/api/config/apikey`）

## 目录与文件说明（用途 / 作用 / 实现部分）

以下说明聚焦项目源码与配置，不包含 `node_modules/` 等第三方依赖目录。

### 根目录

- `package.json`：前端工程主脚本入口，负责并行启动前后端、前端构建、测试、类型检查。
- `tsconfig.json`：前端 TypeScript 编译检查配置，覆盖 `frontend/src` 与 `frontend/config`。
- `README.md`：项目总说明（当前文档）。
- `metadata.json`：项目元数据（由工程流程使用）。
- `data/`：本地运行数据目录（上传文档、索引与运行产物）。

### 前端目录 `frontend/`

- `frontend/index.html`：Vite 页面入口模板，挂载 React 根节点。
- `frontend/config/vite.config.ts`：前端开发与构建配置（HMR、`/api` 代理、别名等）。
- `frontend/config/vitest.config.ts`：前端测试运行配置（jsdom、setup 文件、测试入口）。
- `frontend/config/.env.example`：前端环境变量示例。
- `frontend/src/index.css`：全局样式入口。
- `frontend/src/vite-env.d.ts`：Vite 类型声明。

#### 前端页面编排层 `frontend/src/pages/app/`

- `main.tsx`：React 应用启动入口。
- `App.tsx`：页面编排容器（状态管理、请求编排、页面切换）；已将大块视图拆分到 `components/`。
- `App.test.tsx`：应用主流程回归测试（文档列表、设置交互、API 调用行为等）。

#### 前端页面组件层 `frontend/src/pages/app/components/`

- `AppShell.tsx`：顶栏 + 底部 Tab 框架层。
- `DocumentListPanel.tsx`：文档列表页视图层（上传、预览、删除、重试、跳转详情）。
- `DocumentDetailPanel.tsx`：文档详情页视图层（元信息、目录、分块展示）。
- `QAPagePanel.tsx`：问答页视图层（会话列表、消息区、输入区、状态栏）。
- `SettingsPagePanel.tsx`：设置页视图层（UI、模型、存储卡片与确认弹窗）。
- 对应 `*.test.tsx`：各面板组件回归测试。

#### 前端页面纯逻辑 `frontend/src/pages/app/lib/`

- `conversation.ts`：会话标题、时间格式化等纯函数。
- `conversation.test.ts`：纯函数回归测试。

#### 前端功能模块层 `frontend/src/features/settings/`

- `useSettingsPageController.ts`：设置页核心交互控制器（保存、导入导出、切换 provider、安全头等）。
- `useSettingsState.ts`：设置草稿状态管理。
- `validators.ts`：设置校验规则。
- `types.ts`：设置模块类型定义。
- `components/*.tsx`：设置模块内卡片与弹窗组件。
- `*.test.ts` / `*.test.tsx`：设置模块测试。

#### 前端共享层 `frontend/src/shared/`

- `shared/lib/utils.ts`：通用工具函数（样式组合等）。
- `shared/lib/mcp-stream.ts`：MCP 流解析工具。
- `shared/types/index.ts`：前端共享类型（`Document`、`Chunk`、`Conversation` 等）。

#### 前端测试基础设施 `frontend/src/test/`

- `setup.ts`：Vitest 全局测试初始化。

### 后端目录 `backend/`

- `backend/package.json`：后端依赖与脚本（`tsx watch` 开发热更新）。
- `backend/server.ts`：后端 API 入口（Express 路由注册、流水线编排入口）。
- `backend/tsconfig.json`：后端 TypeScript 检查配置。
- `backend/config/.env.example`：后端环境变量示例。

#### 后端流水线层 `backend/pipeline/`

- `document-parser.ts`：文档解析。
- `document-cleaner.ts`：清洗文本。
- `document-chunker.ts`：分块策略（中英混排、超大块拆分等）。
- `document-embedding.ts`：向量化调用与批处理控制。
- `document-storage-writer.ts`：向量与元数据写入。
- `document-pipeline-runner.ts`：阶段执行与恢复控制。
- `document-pipeline-stages.ts` / `document-pipeline-helpers.ts`：阶段执行器与辅助构造。
- `document-pipeline-store.ts` / `document-artifact-store.ts`：流水线状态与产物存储。
- `document-pipeline-queue.ts`：后台队列调度。
- `document-pipeline-types.ts`：流水线类型定义。
- 对应 `*.test.ts`：流水线各阶段与边界测试。

#### 后端设置层 `backend/settings/`

- `settings-routes.ts`：设置相关 API 路由。
- `settings-store.ts`：设置持久化读写。
- `settings-auth.ts`：设置接口认证/会话安全。
- `settings-validators.ts`：设置项校验。
- `key-security.ts` / `domain-guard.ts`：密钥与域名安全保护。
- `settings-types.ts`：设置领域类型。
- 对应 `*.test.ts`：设置模块测试。

#### 后端存储层 `backend/storage/`

- `storage-bridge.ts`：存储目录桥接能力（打开目录、清理缓存等）。
- `lance-path.ts`：LanceDB 路径与目录策略。
- 对应 `*.test.ts`：存储模块测试。

#### 后端通用工具层 `backend/utils/`

- `server-utils.ts`：服务端通用辅助函数。
- `stream-utils.ts`：流处理工具。
- `mcp-utils.ts`：MCP 相关工具。
- 对应 `*.test.ts`：工具层测试。

### 构建产物目录（运行生成）

- `dist/`、`frontend/dist/`：前端构建产物（可删除并通过 `npm run build` 重新生成）。
- `data/uploads/`：运行期上传文件缓存（业务数据，不建议随意删除）。

## 按开发流程看代码

下面不是按目录看，而是按你平时改需求的顺序看。

### 1) 先跑起来（本地开发）

- 启动脚本：`package.json`（根）
- 前端开发配置：`frontend/config/vite.config.ts`
- 后端开发配置：`backend/package.json`（`tsx watch`）
- 你通常先改这里来解决启动、代理、热更新问题。

### 2) 改页面结构和交互（前端）

- 应用编排入口：`frontend/src/pages/app/App.tsx`
- 页面壳层：`frontend/src/pages/app/components/AppShell.tsx`
- 业务页面面板：
  - 文档列表：`frontend/src/pages/app/components/DocumentListPanel.tsx`
  - 文档详情：`frontend/src/pages/app/components/DocumentDetailPanel.tsx`
  - 问答页：`frontend/src/pages/app/components/QAPagePanel.tsx`
  - 设置页：`frontend/src/pages/app/components/SettingsPagePanel.tsx`

建议：新增页面逻辑先放面板组件，`App.tsx` 只保留编排与切换。

### 3) 改设置能力（模型、密钥、存储路径）

- 前端设置状态与控制器：
  - `frontend/src/features/settings/useSettingsState.ts`
  - `frontend/src/features/settings/useSettingsPageController.ts`
  - `frontend/src/features/settings/validators.ts`
- 后端设置 API 与存储：
  - `backend/settings/settings-routes.ts`
  - `backend/settings/settings-store.ts`
  - `backend/settings/settings-auth.ts`
  - `backend/settings/key-security.ts`

建议：设置需求通常前后端都要改，先看 `useSettingsPageController.ts` 对应调用了哪些后端路由。

### 4) 改上传、解析、分块、向量化链路

- 上传入口与编排：`backend/server.ts`
- 流水线核心：`backend/pipeline/`
  - 解析：`document-parser.ts`
  - 清洗：`document-cleaner.ts`
  - 分块：`document-chunker.ts`
  - 向量化：`document-embedding.ts`
  - 存储：`document-storage-writer.ts`
  - 阶段调度：`document-pipeline-runner.ts` / `document-pipeline-stages.ts`

建议：涉及文档处理问题时，优先按 pipeline 阶段定位，不要直接在 `server.ts` 里硬改。

### 5) 改问答流式输出（MCP/流处理）

- 前端流解析：`frontend/src/shared/lib/mcp-stream.ts`
- 后端流工具：`backend/utils/stream-utils.ts`、`backend/utils/mcp-utils.ts`
- 问答页 UI：`frontend/src/pages/app/components/QAPagePanel.tsx`

建议：先确认流格式，再改 UI；流格式错了，前端改再多都只是掩盖问题。

### 6) 改本地存储/目录能力

- 后端存储桥接：`backend/storage/storage-bridge.ts`
- 向量目录策略：`backend/storage/lance-path.ts`
- 前端设置存储入口：`frontend/src/features/settings/components/StorageCard.tsx`

### 7) 写/改测试（回归优先）

- 前端页面回归：`frontend/src/pages/app/**/*.test.tsx`
- 前端功能模块测试：`frontend/src/features/settings/*.test.ts*`
- 后端模块测试：`backend/**/**/*.test.ts`

建议：先补最小回归测试再改实现，尤其是页面拆分和 pipeline 改造。

### 8) 最后做验证

- 类型检查：`npm run lint`
- 测试：`npm run test`
- 构建：`npm run build`

如果是只改前端结构，至少跑：`npm run lint:frontend` + 相关 `vitest` 文件。

## 按常见问题排查

下面按“现象 -> 先看哪里 -> 怎么验证”给你一套最快路径。

### 1) 前端能开，但接口全报错 / 404

- 先看：`frontend/config/vite.config.ts`（`/api` 代理）、`.env`（`VITE_API_BASE_URL`）
- 再看：`backend/server.ts` 是否正常启动
- 验证：
  - 打开 `http://localhost:8080/api/health`
  - 打开 `http://localhost:5173/api/health`（走前端代理）

### 2) 上传文档后一直失败 / 卡在处理中

- 先看：`backend/pipeline/document-parser.ts`、`backend/pipeline/document-cleaner.ts`、`backend/pipeline/document-chunker.ts`、`backend/pipeline/document-embedding.ts`
- 再看：`backend/pipeline/document-pipeline-runner.ts`、`backend/pipeline/document-pipeline-stages.ts`
- 验证：先跑对应 `backend/pipeline/*.test.ts`，再上传一个最小样本（小 txt/pdf）做真链路验证

### 3) 英文 PDF / 混排文档向量化失败

- 先看：`backend/pipeline/document-chunker.ts`（句边界、超大块拆分）、`backend/pipeline/document-embedding.ts`（batch/retry）
- 再看：`backend/pipeline/document-storage-writer.ts`
- 验证：检查文档最终 `chunkCount` 是否正常，不要出现“单一超大块”

### 4) 问答页面无流式输出 / 一直转圈

- 先看：`frontend/src/pages/app/components/QAPagePanel.tsx`、`frontend/src/shared/lib/mcp-stream.ts`
- 再看：`backend/utils/stream-utils.ts`、`backend/utils/mcp-utils.ts`
- 验证：跑 `mcp-stream` 相关测试，观察问答请求是否持续收到 `chat.delta`

### 5) 设置页保存失败 / 导入导出异常

- 先看：`frontend/src/features/settings/useSettingsPageController.ts`
- 再看：`backend/settings/settings-routes.ts`、`backend/settings/settings-store.ts`、`backend/settings/settings-auth.ts`
- 验证：跑 settings 模块测试；前端手动操作一遍“改值 -> 保存 -> 刷新后仍存在”

### 6) API Key 相关功能异常（显示/复制/测试连接）

- 先看：`backend/settings/key-security.ts`、`backend/settings/settings-auth.ts`
- 再看：`frontend/src/features/settings/components/ModelConfigCard.tsx`
- 验证：确认请求头里带了 settings session/csrf；跑 `key-security.test.ts`

### 7) 存储目录打不开 / 清理缓存失败

- 先看：`backend/storage/storage-bridge.ts`、`backend/storage/lance-path.ts`
- 再看：`frontend/src/features/settings/components/StorageCard.tsx`
- 验证：手动触发“打开目录/清理缓存”并观察后端日志返回信息

### 8) 目录重构后项目突然起不来

- 先看：`frontend/config/vite.config.ts`、`frontend/config/vitest.config.ts`、`tsconfig.json`
- 再看：`frontend/index.html` 入口路径、`frontend/src/pages/app/main.tsx`
- 验证：按顺序跑 `npm run lint` -> `npm run test` -> `npm run build`

### 9) 不确定该从哪一层开始改

- UI/交互问题：先从 `frontend/src/pages/app/components/*.tsx` 入手
- 业务状态问题：先看 `frontend/src/features/settings/*` 或 `App.tsx` 编排逻辑
- 文档处理问题：先看 `backend/pipeline/*`
- 安全/配置问题：先看 `backend/settings/*`

## 排查命令速查表

以下命令默认在项目根目录 `local-knowledge-base-agent/` 执行。

### A. 启动与健康检查

```bash
# 一键启动前后端
npm run dev

# 只启前端
npm run dev:frontend

# 只启后端
npm run dev:backend

# 后端健康检查（直连）
curl http://127.0.0.1:8080/api/health

# 通过前端代理检查后端
curl http://127.0.0.1:5173/api/health
```

### B. 基础验证（三件套）

```bash
# 类型检查（前后端）
npm run lint

# 全量测试
npm run test

# 前端构建
npm run build
```

### C. 前端结构重构回归（推荐最小集）

```bash
npx vitest run \
  frontend/config/frontend-config-paths.test.ts \
  frontend/config/frontend-entry-paths.test.ts \
  frontend/src/pages/app/components/AppShell.test.tsx \
  frontend/src/pages/app/components/DocumentListPanel.test.tsx \
  frontend/src/pages/app/components/DocumentDetailPanel.test.tsx \
  frontend/src/pages/app/components/QAPagePanel.test.tsx \
  frontend/src/pages/app/components/SettingsPagePanel.test.tsx \
  frontend/src/pages/app/lib/conversation.test.ts \
  frontend/src/pages/app/App.test.tsx \
  --pool vmThreads --config frontend/config/vitest.config.ts
```

### D. 后端流水线问题最小定位

```bash
npx vitest run \
  backend/pipeline/document-parser.test.ts \
  backend/pipeline/document-cleaner.test.ts \
  backend/pipeline/document-chunker.test.ts \
  backend/pipeline/document-embedding.test.ts \
  backend/pipeline/document-pipeline-runner.test.ts \
  backend/pipeline/document-pipeline-stages.test.ts \
  --pool vmThreads --config frontend/config/vitest.config.ts
```

### E. 设置/安全问题最小定位

```bash
npx vitest run \
  backend/settings/settings-auth.test.ts \
  backend/settings/settings-store.test.ts \
  backend/settings/settings-validators.test.ts \
  backend/settings/key-security.test.ts \
  --pool vmThreads --config frontend/config/vitest.config.ts
```

### F. 端口占用快速检测

```bash
# 检查 5173/8080 是否已被占用（0 代表可用）
python3 -c "import socket; s=socket.socket(); print('5173:', s.connect_ex(('127.0.0.1',5173))); s.close()"
python3 -c "import socket; s=socket.socket(); print('8080:', s.connect_ex(('127.0.0.1',8080))); s.close()"
```

### G. 常用日志查看（后台运行时）

```bash
# 查看你手动重定向的前端日志
less /tmp/local-kb-frontend.log

# 查看你手动重定向的后端日志
less /tmp/local-kb-backend.log
```

> 说明：日志文件名按你的启动命令而定；如果你改了重定向路径，请用你自己的文件名。

## 验证命令

```bash
npm run lint
npm run test
npm run build
```
