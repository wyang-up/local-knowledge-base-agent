# 桌面端系统设置页重设计方案（B端蓝色简约风）

日期：2026-04-01  
状态：已完成设计评审（待用户最终审阅）

## 1. 背景与目标

当前设置页仅覆盖基础只读配置，无法满足以下核心诉求：

- 三大模块卡片化分层与高完成度 B 端视觉
- 模块级独立保存 + 页面级全量保存
- 多服务商配置、按服务商密钥管理、实时校验、二次确认与错误可解释
- 路径管理、磁盘空间反馈、导入导出与重置能力

本次设计目标：在不更换技术栈（React + Express）的前提下，完成可落地、可维护、可扩展的设置中心重构。

## 2. 设计范围

### 2.1 包含范围

- 桌面端设置页（全屏适配）视觉与交互重构
- 三大独立卡片模块：界面设计、模型配置、本地存储路径
- 配置存储模型重构（前后端）
- 导入/导出/重置、二次确认、脏状态管理、离页拦截

### 2.2 不包含范围

- 移动端适配（仅保证桌面端）
- 桌面壳（Electron/Tauri）
- 千问/DeepSeek 独立服务商接入（首版按模型名处理）

补充说明：

- “打开文件夹”能力通过本地后端桥接实现（由后端调用系统命令打开目录），不依赖桌面壳。

## 3. 约束与已确认决策

1. 实现方式：方案 A（Web 全栈增强版）
2. 服务商：`siliconflow`、`openai`、`gemini`、`custom_compatible`
3. 千问/DeepSeek：作为模型名，不作为独立 provider
4. API Key：按服务商分别保存
5. Key 校验：按服务商规则
   - SiliconFlow/OpenAI：`sk-` 前缀
   - Gemini：按 Gemini 规则（不强制 `sk-`）
   - Custom：非空 + 最小长度校验
6. 导出 JSON：不导出明文 Key，仅导出 `hasKey`
7. 目录选择：Chromium（Chrome/Edge）可用；非支持浏览器降级提示
8. 语言/主题：实时预览 + 立即持久化（不进入未保存态）
9. 首版架构：`single-user local mode + local-bridge`

## 4. 信息架构与页面骨架

## 4.1 页面结构

- 顶部：页面标题 + 全局工具区（导入、导出、重置）
- 中部：三张独立卡片按纵向排列
- 底部：全局“保存所有修改”固定操作栏

## 4.2 布局规格

- 容器：桌面端全屏宽度自适应（100%），左右安全边距 32px；当分辨率 >= 1920 时允许内容区上限 1680px 以控制可读性
- 卡片间距：24px
- 卡片样式：16px 圆角 + 浅阴影 + 1px 边框
- 颜色基调：蓝色主色（主按钮高亮），灰色次要按钮

## 4.3 文字层级

- 页面标题：24px/700
- 模块标题：20px/700
- 字段标签：14px/500
- 说明文字：12-13px/400（浅灰）

## 5. 模块设计

## 5.1 模块一：界面设计

字段：

1. `language`（默认：简体中文）
2. `theme`（浅色/深色/跟随系统）

交互：

- 切换立即生效，无需手动保存
- 实时写入后端 `ui_preferences`
- 保存失败自动回滚上一个可用状态并展示错误
- 深色模式由 CSS 变量统一驱动，确保全局一致

状态策略：

- 本模块默认不展示“未保存”红星（避免与“无需保存”冲突）

## 5.2 模块二：模型配置

字段与布局：

- Provider 快速切换：`硅基流动 / OpenAI / Gemini / 自定义兼容`
- BASE URL 行：输入框 + 测试连接 + 保存
- 双列模型区：
  - 左：大语言模型（LLM）
  - 右：嵌入模型（Embedding）
- API Key 行：脱敏展示、显隐切换、复制、修改、保存

关键交互：

- 模型列表按 provider 动态加载
- 模型 hover 显示简介 tooltip
- 模型项显示在线/离线状态点
- 切换 provider 时若存在未保存变更，弹出“保存后切换 / 放弃变更 / 取消”三选弹窗
- 点击“修改密钥”后清空输入并自动聚焦
- 保存成功后恢复脱敏态
- BASE URL / API Key 保存前必须二次确认

备注文案（固定展示于 API Key 行下方）：

- “密钥仅加密存储在后端，不会在前端明文持久化。请勿在公共环境暴露屏幕内容。”

测试连接规则：

- 同时校验 URL、Key、LLM、Embedding
- 按钮 loading，成功绿字，失败红字+原因
- 默认超时 10 秒，失败后 500ms 回退重试 1 次

## 5.3 模块三：本地存储路径

字段与布局：

- 路径行：文件夹图标 + 路径展示 + 选择路径 + 保存
- 工具行：打开文件夹、清理缓存、后端管理
- 信息行：磁盘占用与剩余空间

关键交互：

- Chromium 下可用 `showDirectoryPicker`
- 非 Chromium 显示降级提示，并启用“只读路径展示 + 后端管理入口”；禁用“选择路径”按钮，“打开文件夹”在存在有效已保存路径时可用
- 后端管理入口调用：`POST /api/storage/open`（打开目录）、`POST /api/storage/cache/clear`（清理缓存）
- 存储路径保存前二次确认
- 所有按钮提供 loading + 成败反馈

平台适配：

- Windows/Mac/Linux 初始化默认路径自动适配

备注文案（固定展示于模块底部）：

- “存储路径包含向量数据库、缓存和日志。变更路径后建议重新校验文档可用性。”

## 6. 全局交互规则

## 6.1 未保存状态管理

- 除语言/主题外，字段变更即标记脏状态
- 模块标题显示红色 `*`
- 变更字段右上角显示红点
- 底部“保存所有修改”按钮高亮

## 6.2 离页拦截

- 存在未保存变更时触发确认弹窗：
  - 继续离开
  - 返回编辑
  - 保存后离开

## 6.3 二次确认

- BASE URL、API Key、存储路径写入前均需确认
- 弹窗展示变更摘要（旧值摘要 -> 新值摘要）

## 6.4 按钮反馈与错误可解释

- 测试/保存/修改操作均有 loading
- 成功：绿色文案
- 失败：红色文案 + 明确原因（HTTP 状态/模型不存在/超时等）

## 6.5 全局校验

- BASE URL：
  - `siliconflow/openai/gemini` 必须 `https://`
  - `custom_compatible` 默认 `https://`，允许 `http://localhost` 或内网 HTTP（需显式风险提示 + 二次确认）
  - 内网判定：`127.0.0.0/8`、`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、`localhost`；域名场景先解析再判定
- API Key：按 provider 规则
- 测试连接：URL + Key + 模型三者同时通过

## 6.6 配置导入导出与重置

- 导出 JSON：不含明文 key
- 导出结构：`schemaVersion`、`exportedAt`、`uiPreferences`、`providers[]`、`storagePreferences`
- 导入：先校验，再展示覆盖摘要，确认后落库
- 导入规则：未知字段忽略并告警；任一关键字段校验失败则整包拒绝
- 重置默认：支持模块级与全局级

## 6.7 全局保存编排

- 点击“保存所有修改”后，仅提交当前脏模块（模块一通常无脏状态）
- 执行顺序：模型配置 -> 存储路径（按风险优先顺序）
- 任一模块失败时：
  - 已成功模块保持成功，不自动回滚
  - 失败模块保留编辑态与错误详情
  - 顶部显示“部分保存成功”汇总提示
- 若脏字段包含 BASE URL/API Key/存储路径，仍逐字段触发二次确认

保存优先级与去重规则：

- 行内保存：立即持久化并清除对应字段脏状态
- 模块保存：仅提交该模块剩余脏字段
- 全局保存：仅提交全局剩余脏字段
- 同一字段在同一次用户动作链路中最多提交一次（去重）

## 6.8 弹窗编排优先级

- 阻塞弹窗优先级：离页拦截 > 二次确认 > 普通提示
- 任一时刻只允许一个阻塞弹窗，后续弹窗进入队列
- `save-all` 场景下，敏感字段二次确认按模块串行触发且同字段仅确认一次
- provider 切换触发“保存后切换”时，若涉及敏感字段，先走二次确认再执行切换

## 7. 数据模型与接口

## 7.1 数据结构

- `ui_preferences`
  - `language`
  - `theme`
- `provider_configs`
  - `providerId`
  - `version`（用于乐观锁）
  - `baseUrl`
  - `apiKey`（密文存储）
  - `llmModel`
  - `embeddingModel`
  - `hasKey`
  - `lastModelSyncAt`
  - `updatedAt`
- `provider_model_catalog`
  - `providerId`
  - `modelId`
  - `modelType`（`llm` | `embedding`）
  - `displayName`
  - `description`
  - `isOnline`
  - `lastCheckedAt`
- `storage_preferences`
  - `version`（用于乐观锁）
  - `storagePath`
  - `platform`
  - `cacheSizeBytes`
  - `freeSpaceBytes`
  - `updatedAt`

## 7.2 接口规划

- `GET /api/config/all`
- `PATCH /api/config/ui`
- `PATCH /api/config/provider/:providerId`
- `POST /api/config/provider/:providerId/test`
- `GET /api/config/provider/:providerId/models`
- `POST /api/config/provider/:providerId/key-token`
- `POST /api/config/provider/:providerId/key-reveal`
- `PATCH /api/config/storage`
- `POST /api/config/save-all`
- `POST /api/storage/open`
- `POST /api/storage/cache/clear`
- `GET /api/config/export`
- `POST /api/config/import`
- `POST /api/config/reset-default?scope=module|all&target=ui|provider|storage`

## 7.3 兼容迁移

- 启动时将旧 `model_config` 迁移到新结构
- 保留旧读取兼容一版，逐步淘汰

## 7.4 模型目录接口契约

- 请求：`GET /api/config/provider/:providerId/models`
- 响应字段：
  - `models[]`
    - `modelId`
    - `displayName`
    - `modelType`（`llm`/`embedding`）
    - `description`（用于 hover 简介）
    - `isOnline`（用于状态图标）
    - `lastCheckedAt`
  - `source`（`remote` | `cache`）
  - `isStale`（缓存是否过期）

## 7.5 敏感字段读写契约（API Key）

- 默认读取接口（`/api/config/all`）仅返回：
  - `hasKey`（布尔）
  - `maskedKey`（provider 无关规则：前 3 位 + 固定掩码 + 后 2 位）
- 不通过常规配置接口返回明文 Key
- 显隐与复制流程：
  - 前端调用一次性接口获取短时明文 token
  - token 有效期 60 秒，过期需重新申请
  - 明文仅用于当前会话内展示/复制，不写入 localStorage
- 所有明文读取与复制动作写审计日志（providerId、时间、操作者来源、结果）

安全控制：

- reveal/copy 接口必须校验登录态与 CSRF token
- 限流：每 provider 每分钟最多 5 次 reveal/copy
- token 必须一次性使用且 60 秒过期
- 审计日志保留至少 180 天

token 失效条件与错误码：

- 使用后立即失效：`KEY_TOKEN_USED`
- 超时失效：`KEY_TOKEN_EXPIRED`
- provider 不匹配：`KEY_TOKEN_PROVIDER_MISMATCH`

## 7.6 重置与导入返回结构

- 返回字段统一：
  - `successItems[]`
  - `failedItems[]`
  - `warnings[]`
  - `requestId`
- 重置模块级仅影响目标模块；全局重置返回逐模块结果
- 导入失败不落库；导入成功按模块返回变更摘要

## 7.7 版本兼容与并发冲突策略

- 导入支持 `schemaVersion`：`1.x`
- 高于支持范围的版本：拒绝导入并提示升级客户端
- 低版本：按迁移规则升级后再校验
- 并发冲突：保存时校验 `version/etag`，冲突返回 `409 CONFIG_CONFLICT`

## 7.8 关键接口最小契约

- `POST /api/config/provider/:providerId/key-token`
  - 请求：`{ providerId }`
  - 响应：`{ token, expiresInSeconds, requestId }`
- `POST /api/config/provider/:providerId/key-reveal`
  - 请求：`{ providerId, token }`
  - 响应：`{ plainKey, requestId }`
- `POST /api/config/save-all`
  - 请求：`{ providerPatches: [{ providerId, fields }], storagePatch, expectedVersions }`
  - 响应：`{ successItems, failedItems: [{ module, providerId, field, code, requestId }], requestId }`
- `POST /api/config/import`
  - 请求：`{ schemaVersion, payload, dryRun }`
  - 响应：`{ valid, changesPreview, errors, requestId }`

## 7.9 鉴权与授权矩阵

- `PATCH /api/config/provider/:providerId`：需登录 + CSRF + 审计
- `POST /api/config/provider/:providerId/key-token`：需登录 + CSRF + 限流 + 审计
- `POST /api/config/provider/:providerId/key-reveal`：需登录 + CSRF + 限流 + 审计
- `PATCH /api/config/storage`：需登录 + CSRF + 审计
- `POST /api/config/save-all`：需登录 + CSRF + 审计
- `POST /api/config/import`：需登录 + CSRF + 审计
- `POST /api/config/reset-default`：需登录 + CSRF + 审计
- `POST /api/storage/open`：需登录 + CSRF + 审计
- `POST /api/storage/cache/clear`：需登录 + CSRF + 审计

## 7.11 身份模型（首版定版）

- 模式：`single-user local mode`
- 身份来源：本机单用户会话（本地会话 token）
- 授权模型：不区分角色，但所有敏感接口必须校验会话与 CSRF
- 审计主体：固定本地操作者标识 + requestId
- local-bridge：由后端负责目录相关系统调用（打开目录、清理缓存、路径落库）

## 7.10 域名解析安全策略

- 仅当 `custom_compatible` 且输入为域名时触发解析判定
- DNS 解析超时：2 秒；最多 2 次尝试
- 解析结果缓存 TTL：60 秒
- 若解析失败或结果不稳定，默认拒绝并返回 `CONFIG_URL_INVALID`
- 禁止通过 CNAME/重绑定绕过内网判定

## 8. 视觉与主题规范

- 使用 CSS 变量统一主题（浅色/深色）
- 禁止局部硬编码导致深色错乱
- 输入、按钮、tooltip、弹窗、状态条均需定义 hover/focus/active
- 编辑态：边框高亮蓝色 + 右上红点
- 成功态：组件下方绿色文本 + 成功图标
- 失败态：组件下方红色文本 + 错误详情文本
- 图标按钮（眼睛、复制）必须具备 aria-label 与键盘可达

## 8.1 校验规则细化（前后端共用）

- BASE URL：必须可被统一 URL 解析器解析，且 host 合法
  - `siliconflow/openai/gemini`：协议强制 `https`
  - `custom_compatible`：默认 `https`；可放行 `http://localhost` 与内网 HTTP（需显示风险提示并二次确认）
  - 内网判定：`127.0.0.0/8`、`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、`localhost`；域名先解析再判定
- API Key：
  - `siliconflow/openai`：`^sk-[A-Za-z0-9-_]{16,}$`
  - `gemini`：`^AIza[0-9A-Za-z-_]{20,}$`
  - `custom_compatible`：`^.{12,}$`
- 测试连接必须同时满足：URL 合法 + Key 合法 + LLM/Embedding 均已选中

## 8.2 错误码与文案映射

- 标准错误码：
  - `CONFIG_URL_INVALID`
  - `API_KEY_INVALID_FORMAT`
  - `MODEL_NOT_FOUND`
  - `PROVIDER_TIMEOUT`
  - `DISK_PATH_UNAVAILABLE`
  - `CONFIG_CONFLICT`
- HTTP 映射：
  - `400` -> `CONFIG_URL_INVALID` / `API_KEY_INVALID_FORMAT`
  - `404` -> `MODEL_NOT_FOUND` / `DISK_PATH_UNAVAILABLE`
  - `408` -> `PROVIDER_TIMEOUT`
  - `409` -> `CONFIG_CONFLICT`
  - `500` -> `INTERNAL_ERROR`
- 前端文案模板：
  - 主文案：`操作失败：{codeFriendlyText}`
  - 详情文案：`requestId={requestId}，可用于排查`
  - 可重试动作：`重试` / `查看详情`

## 9. 风险与降级

1. 浏览器能力差异（目录选择）
   - 降级提示 + 禁用按钮
2. 第三方模型列表接口不稳定
   - 缓存最近一次成功列表 + 标注“可能过期”
3. 导入覆盖误操作
   - 覆盖摘要 + 二次确认

## 10. 验收标准

1. 三模块卡片视觉与层次符合设计规范
2. 语言/主题切换实时生效并持久化
3. 其余配置具备脏状态标识与离页拦截
4. 三模块可独立保存，底部支持全局保存
5. BASE URL/API Key/路径均有二次确认
6. 测试连接具备全链路校验与可解释错误
7. 导入/导出/重置可用且不泄露明文密钥
8. 深色模式无样式错乱
9. 审计日志覆盖 reveal/copy/save/import/reset 且可按 `requestId` 检索
10. reveal/copy 限流生效并返回明确错误码
11. 并发冲突可复现并稳定返回 `409 CONFIG_CONFLICT`

## 11. 实施顺序建议

1. 后端：数据结构 + 接口扩展 + 迁移
2. 前端：状态模型与校验器
3. 前端：三卡片 UI 与交互
4. 联调：测试连接、导入导出、路径管理
5. 回归：深色模式、离页拦截、错误处理
