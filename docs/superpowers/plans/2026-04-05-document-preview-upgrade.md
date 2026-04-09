# Document Preview Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将文档列表页的轻量 chunk 预览升级为原文件级本地预览器（PDF/表格/JSON/文本），并补齐后端内容读取契约与前端统一预览架构。

**Architecture:** 后端新增标准化文档内容读取接口（含 Range、错误 JSON 契约、统一错误码映射）与预览开关读取接口；前端新增 `PreviewModal + DocumentPreviewContent + useDocumentPreviewResource` 分层架构，将类型渲染器解耦为独立组件并按需加载。首阶段只实现“快速打开、稳定预览、统一降级、详情跳转”，不实现预览内 chunk 高亮联动。

**Tech Stack:** TypeScript, React, Express, Node.js fs stream, Vitest, Testing Library

---

## 0. 关联文档

- 设计文档：`docs/superpowers/specs/2026-04-05-document-preview-upgrade-design.md`
- 现有实现入口：`frontend/src/pages/app/components/DocumentListPanel.tsx`
- 后端服务入口：`backend/server.ts`

## 1. File Structure（先锁定边界）

### 新增文件

- `backend/utils/document-preview-content.ts`
  - 解析单段 Range、构建 200/206/416 响应元信息、统一错误码映射。
- `backend/utils/document-preview-content.test.ts`
  - 覆盖 Range 契约、错误响应体契约、`X-Preview-Partial` 语义。
- `backend/server.preview-content.test.ts`
  - 接口级契约测试（`200/206/416`、`Content-Range`、错误 JSON、`X-Preview-Partial`）。

- `frontend/src/pages/app/components/preview/preview-types.ts`
  - 统一前端预览上下文、错误码、渲染输入类型。
- `frontend/src/pages/app/components/preview/phase1-preview-options.ts`
  - Phase1 边界约束：忽略定位类 options，防止误入 Phase2 行为。
- `frontend/src/pages/app/components/preview/phase1-preview-options.test.ts`
  - 负向测试：`chunkId/page/keyword/sheetName/jsonPath` 不触发预览内定位。
- `frontend/src/pages/app/components/preview/useDocumentPreviewResource.ts`
  - 本地读取、请求取消、LRU(3) 缓存、错误标准化。
- `frontend/src/pages/app/components/preview/useDocumentPreviewResource.test.tsx`
  - 覆盖请求、Abort、缓存、错误映射。

- `frontend/src/pages/app/components/preview/PreviewModal.tsx`
  - 统一壳层（遮罩、头尾栏、按钮、Esc、尺寸）。
- `frontend/src/pages/app/components/preview/PreviewModal.test.tsx`
  - 覆盖开关交互、遮罩关闭、按钮回调、元信息栏渲染。
- `frontend/src/pages/app/components/preview/LegacyChunkPreviewModal.tsx`
  - 旧预览实现迁移文件，仅用于开关回退路径。

- `frontend/src/pages/app/components/preview/DocumentPreviewContent.tsx`
  - MIME/扩展名判定与渲染器路由。
- `frontend/src/pages/app/components/preview/DocumentPreviewContent.test.tsx`
  - 覆盖类型判定优先级（MIME > ext > fallback）。

- `frontend/src/pages/app/components/preview/renderers/PdfPreview.tsx`
- `frontend/src/pages/app/components/preview/renderers/TablePreview.tsx`
- `frontend/src/pages/app/components/preview/renderers/JsonPreview.tsx`
- `frontend/src/pages/app/components/preview/renderers/TextPreview.tsx`
- `frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`
  - 覆盖各类型首屏渲染、异常退化、部分预览提示。

### 修改文件

- `backend/server.ts`
  - 新增 `GET /api/documents/:id/content` 与 `GET /api/settings/preview-flags`。
- `frontend/src/pages/app/components/DocumentListPanel.tsx`
  - 接入新预览架构，同时保留旧预览回退分支。
- `frontend/src/pages/app/components/DocumentListPanel.test.tsx`
  - 更新预览交互断言，新增“关闭后列表状态不变”。
- `frontend/src/pages/app/App.tsx`
  - 扩展 locale 文案与 `DocumentListPanel` 传参。
- `frontend/src/pages/app/App.test.tsx`
  - 更新预览路径用例（标题栏按钮、主题/语言回归）。
- `frontend/src/shared/types/index.ts`
  - 扩展 `Document` 的可选预览字段（不破坏既有类型）。
- `README.md`
  - 补充预览 API、能力边界与使用说明。

---

## Task 1: 后端预览契约工具（Range + 错误模型）

**Files:**
- Create: `backend/utils/document-preview-content.ts`
- Test: `backend/utils/document-preview-content.test.ts`

- [ ] **Step 1: 写失败测试（Range 与错误 JSON 契约）**

```ts
import { describe, expect, it } from 'vitest';
import {
  parseSingleRange,
  buildRangeResponsePlan,
  buildPreviewError,
} from './document-preview-content.ts';

describe('document-preview-content', () => {
  it('parses bytes range correctly', () => {
    expect(parseSingleRange('bytes=0-1023', 5000)).toEqual({ start: 0, end: 1023 });
  });

  it('returns invalid for out-of-bounds range', () => {
    expect(parseSingleRange('bytes=9999-10000', 5000)).toBe('invalid');
  });

  it('builds 416 contract with content-range', () => {
    expect(buildRangeResponsePlan('bytes=9999-10000', 5000)).toEqual({
      status: 416,
      headers: { 'Content-Range': 'bytes */5000' },
    });
  });

  it('builds machine-readable error payload', () => {
    expect(buildPreviewError('READ_FAILED', '读取失败', true, { reason: 'FILE_LOCKED' })).toEqual({
      code: 'READ_FAILED',
      message: '读取失败',
      retriable: true,
      details: { reason: 'FILE_LOCKED' },
    });
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run backend/utils/document-preview-content.test.ts`

Expected: FAIL（提示导出函数不存在或返回不匹配）。

- [ ] **Step 3: 实现最小可用工具函数**

```ts
export type PreviewErrorCode =
  | 'NOT_FOUND'
  | 'UNSUPPORTED_TYPE'
  | 'PARSE_FAILED'
  | 'READ_FAILED'
  | 'LOAD_TIMEOUT'
  | 'TOO_LARGE_PARTIAL'
  | 'ABORTED';

export function parseSingleRange(header: string | undefined, size: number) {
  // 返回 { start, end } | null | 'invalid'
}

export function buildRangeResponsePlan(header: string | undefined, size: number) {
  // 200 全量、206 分段、416 越界
}

export function buildPreviewError(
  code: PreviewErrorCode,
  message: string,
  retriable: boolean,
  details?: Record<string, unknown>,
) {
  return { code, message, retriable, details };
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run backend/utils/document-preview-content.test.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/utils/document-preview-content.ts backend/utils/document-preview-content.test.ts
git commit -m "test: cover preview content range and error contract"
```

---

## Task 2: 接入后端接口（内容读取 + 预览开关）

**Files:**
- Modify: `backend/server.ts`
- Create: `backend/server.preview-content.test.ts`
- Modify: `backend/utils/document-preview-content.test.ts`

- [ ] **Step 1: 补失败测试（状态码映射与 partial 标记）**

```ts
it('marks partial preview by header contract', () => {
  const plan = buildRangeResponsePlan('bytes=0-1023', 1000000);
  expect(plan.status).toBe(206);
  expect(plan.headers['Accept-Ranges']).toBe('bytes');
});
```

- [ ] **Step 2: 运行测试，确认新增断言先失败**

Run: `npx vitest run backend/utils/document-preview-content.test.ts`

Expected: FAIL。

- [ ] **Step 3: 在 `server.ts` 增加预览接口并复用工具**

```ts
app.get('/api/documents/:id/content', async (req, res) => {
  // 1) 校验 document 与 filePath
  // 2) 读取 fs.stat 取 size
  // 3) 通过 buildRangeResponsePlan 处理 Range
  // 4) 200: 全量流；206: 分段流；416: 返回 Content-Range
  // 5) 非 2xx 返回 buildPreviewError(...) JSON
});

app.get('/api/settings/preview-flags', async (_req, res) => {
  // ENABLE_NEW_PREVIEW_MODAL=true/false
  // ENABLE_NEW_PREVIEW_BY_TYPE=pdf:true,table:true,json:false,text:true
  // 解析后返回运行时开关，供前端灰度与回退
  res.json({
    enableNewPreviewModal: true,
    enableNewPreviewByType: { pdf: true, table: true, json: true, text: true },
  });
});
```

- [ ] **Step 4: 写接口级失败测试（200/206/416/错误映射）**

```ts
import { describe, expect, it } from 'vitest';

describe('GET /api/documents/:id/content', () => {
  it('returns 206 with Content-Range when request has bytes range', async () => {
    // inject 或最小 HTTP 集成调用
  });

  it('returns X-Preview-Partial=true when partial strategy is applied', async () => {
    // 断言响应头 X-Preview-Partial: true
  });

  it('returns 416 with bytes */total for invalid range', async () => {
    // 断言 Content-Range: bytes */<size>
  });

  it('maps 404/415/500 to machine-readable errors', async () => {
    // 至少断言: code/message/retriable
    // 404 -> NOT_FOUND, 415 -> UNSUPPORTED_TYPE, 500 -> READ_FAILED
  });
});
```

- [ ] **Step 5: 运行接口级测试，确认失败**

Run: `npx vitest run backend/server.preview-content.test.ts`

Expected: FAIL。

- [ ] **Step 6: 实现通过后重新运行后端契约测试 + lint**

Run: `npx vitest run backend/utils/document-preview-content.test.ts && npm run lint --prefix backend`

Expected: PASS。

- [ ] **Step 7: 运行接口级测试，确认通过**

Run: `npx vitest run backend/server.preview-content.test.ts`

Expected: PASS。

- [ ] **Step 8: 本地接口烟测（非测试替代）**

前置：

```bash
npm run dev --prefix backend
curl -s http://localhost:8080/api/documents | jq '.[0].id'
```

Run: `curl -I http://localhost:8080/api/documents/<docId>/content`

Expected: `200`（或带 Range 时 `206`），响应头含 `Accept-Ranges`。

- [ ] **Step 9: Commit**

```bash
git add backend/server.ts backend/utils/document-preview-content.test.ts backend/server.preview-content.test.ts
git commit -m "feat: add document preview content endpoint with range contract"
```

---

## Task 3: 开关链路与旧预览回退路径

**Files:**
- Modify: `frontend/src/pages/app/components/DocumentListPanel.tsx`
- Create: `frontend/src/pages/app/components/preview/LegacyChunkPreviewModal.tsx`
- Modify: `frontend/src/pages/app/components/DocumentListPanel.test.tsx`

- [ ] **Step 1: 写失败测试（开关关闭时走旧预览）**

```tsx
it('falls back to legacy preview when new preview flag is disabled', async () => {
  // mock /api/settings/preview-flags => { enableNewPreviewModal: false }
  // 点击预览后仍显示旧 chunk 预览内容
});

it('falls back to legacy preview for a disabled file type', async () => {
  // mock /api/settings/preview-flags => { enableNewPreviewModal: true, enableNewPreviewByType: { pdf:false, table:true, json:true, text:true } }
  // 打开 pdf 文档时走旧预览，打开 csv 时走新预览
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run frontend/src/pages/app/components/DocumentListPanel.test.tsx --config frontend/config/vitest.config.ts`

Expected: FAIL。

- [ ] **Step 3: 抽离旧预览组件并接入开关分支**

```tsx
// DocumentListPanel:
// if (!flags.enableNewPreviewModal) {
//   return <LegacyChunkPreviewModal ... />
// }
// if (!flags.enableNewPreviewByType[resolvedType]) {
//   return <LegacyChunkPreviewModal ... />
// }
// return <PreviewModal ... />
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run frontend/src/pages/app/components/DocumentListPanel.test.tsx --config frontend/config/vitest.config.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/app/components/DocumentListPanel.tsx frontend/src/pages/app/components/preview/LegacyChunkPreviewModal.tsx frontend/src/pages/app/components/DocumentListPanel.test.tsx
git commit -m "feat: keep legacy preview fallback behind runtime flag"
```

---

## Task 4: 前端资源层与 Phase1 边界约束

**Files:**
- Create: `frontend/src/pages/app/components/preview/preview-types.ts`
- Create: `frontend/src/pages/app/components/preview/phase1-preview-options.ts`
- Create: `frontend/src/pages/app/components/preview/phase1-preview-options.test.ts`
- Create: `frontend/src/pages/app/components/preview/useDocumentPreviewResource.ts`
- Test: `frontend/src/pages/app/components/preview/useDocumentPreviewResource.test.tsx`

- [ ] **Step 1: 写失败测试（加载/Abort/LRU + Phase1 负向边界）**

```ts
it('strips locate options in phase1', () => {
  expect(resolvePhase1PreviewOptions({ chunkId: 'c1', page: 2 })).toEqual({});
});
```

```tsx
it('aborts previous request when switching document quickly', async () => {
  // doc-1 -> doc-2 快速切换，断言 doc-1 请求 abort
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run frontend/src/pages/app/components/preview/phase1-preview-options.test.ts frontend/src/pages/app/components/preview/useDocumentPreviewResource.test.tsx --config frontend/config/vitest.config.ts`

Expected: FAIL。

- [ ] **Step 3: 实现 options 约束与资源 hook**

```ts
export function resolvePhase1PreviewOptions(_options?: PreviewOpenOptions) {
  return {};
}

export function useDocumentPreviewResource(...) {
  // fetch /api/documents/:id/content
  // AbortController + LRU(3)
  // 错误码标准化
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run frontend/src/pages/app/components/preview/phase1-preview-options.test.ts frontend/src/pages/app/components/preview/useDocumentPreviewResource.test.tsx --config frontend/config/vitest.config.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/app/components/preview/preview-types.ts frontend/src/pages/app/components/preview/phase1-preview-options.ts frontend/src/pages/app/components/preview/phase1-preview-options.test.ts frontend/src/pages/app/components/preview/useDocumentPreviewResource.ts frontend/src/pages/app/components/preview/useDocumentPreviewResource.test.tsx
git commit -m "feat: add phase1 preview option guard and resource hook"
```

---

## Task 5: 预览壳层与类型分发（不含渲染细节）

**Files:**
- Create: `frontend/src/pages/app/components/preview/PreviewModal.tsx`
- Create: `frontend/src/pages/app/components/preview/DocumentPreviewContent.tsx`
- Test: `frontend/src/pages/app/components/preview/PreviewModal.test.tsx`
- Test: `frontend/src/pages/app/components/preview/DocumentPreviewContent.test.tsx`

- [ ] **Step 1: 写失败测试（遮罩/Esc/头尾栏/类型判定）**

```tsx
it('closes modal by mask click and Esc', async () => {
  // onClose 两条路径
});

it('routes by mime first then extension fallback', () => {
  // MIME > ext > fallback
});

it('returns disabled-state fallback when current type flag is false', () => {
  // enableNewPreviewByType.json=false 时，json 文档不进入 JsonPreview
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run frontend/src/pages/app/components/preview/PreviewModal.test.tsx frontend/src/pages/app/components/preview/DocumentPreviewContent.test.tsx --config frontend/config/vitest.config.ts`

Expected: FAIL。

- [ ] **Step 3: 实现壳层与分发**

```tsx
export function PreviewModal(...) {
  // 90vw/90vh, radius 8px
  // actions: 查看详情/下载/关闭
}

export function DocumentPreviewContent(...) {
  // MIME > ext > text fallback
  // if type flag disabled -> 返回 disabled fallback（交由上层走 legacy）
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run frontend/src/pages/app/components/preview/PreviewModal.test.tsx frontend/src/pages/app/components/preview/DocumentPreviewContent.test.tsx --config frontend/config/vitest.config.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/app/components/preview/PreviewModal.tsx frontend/src/pages/app/components/preview/PreviewModal.test.tsx frontend/src/pages/app/components/preview/DocumentPreviewContent.tsx frontend/src/pages/app/components/preview/DocumentPreviewContent.test.tsx
git commit -m "feat: add preview shell and document type adapter"
```

---

## Task 6: PDF 渲染器（单独交付）

**Files:**
- Create: `frontend/src/pages/app/components/preview/renderers/PdfPreview.tsx`
- Modify: `frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`

- [ ] **Step 1: 写失败测试（PDF 首屏与基本控件）**

```tsx
it('renders pdf first screen with basic controls', () => {
  // 翻页、缩放、页码输入可见
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx --config frontend/config/vitest.config.ts -t "pdf"`

Expected: FAIL。

- [ ] **Step 3: 实现 `PdfPreview` 最小能力**

```tsx
// 首版保证：可读 + 基本翻页/缩放
// 暂不实现批注与缩略图
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx --config frontend/config/vitest.config.ts -t "pdf"`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/app/components/preview/renderers/PdfPreview.tsx frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx
git commit -m "feat: add phase1 pdf preview renderer"
```

---

## Task 7: 表格渲染器（Excel/CSV，单独交付）

**Files:**
- Create: `frontend/src/pages/app/components/preview/renderers/TablePreview.tsx`
- Modify: `frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`

- [ ] **Step 1: 写失败测试（表头固定/滚动/sheet 切换）**

```tsx
it('renders table preview with sticky header and sheet switch', () => {
  // xlsx sheet 切换 + csv 单表
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx --config frontend/config/vitest.config.ts -t "table"`

Expected: FAIL。

- [ ] **Step 3: 实现 `TablePreview` 最小能力**

```tsx
// 固定表头 + 横纵滚动 + 首批行挂载
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx --config frontend/config/vitest.config.ts -t "table"`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/app/components/preview/renderers/TablePreview.tsx frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx
git commit -m "feat: add phase1 table preview renderer"
```

---

## Task 8: JSON 渲染器（单独交付）

**Files:**
- Create: `frontend/src/pages/app/components/preview/renderers/JsonPreview.tsx`
- Modify: `frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`

- [ ] **Step 1: 写失败测试（折叠/展开/复制/部分预览提示）**

```tsx
it('renders json tree with collapse and copy actions', () => {
  // 根节点展示 + 节点折叠
});

it('shows partial hint when X-Preview-Partial is true', () => {
  // 文案提示
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx --config frontend/config/vitest.config.ts -t "json"`

Expected: FAIL。

- [ ] **Step 3: 实现 `JsonPreview` 最小能力**

```tsx
// 树形折叠 + 复制 + 错误降级
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx --config frontend/config/vitest.config.ts -t "json"`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/app/components/preview/renderers/JsonPreview.tsx frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx
git commit -m "feat: add phase1 json preview renderer"
```

---

## Task 9: 文本渲染器（DOCX/TXT，单独交付）

**Files:**
- Create: `frontend/src/pages/app/components/preview/renderers/TextPreview.tsx`
- Modify: `frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`

- [ ] **Step 1: 写失败测试（滚动/搜索/复制）**

```tsx
it('renders text preview with search and copy', () => {
  // 文本展示 + 搜索输入 + 复制按钮
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx --config frontend/config/vitest.config.ts -t "text"`

Expected: FAIL。

- [ ] **Step 3: 实现 `TextPreview` 最小能力**

```tsx
// 纯文本滚动 + 基础搜索 + 复制
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx --config frontend/config/vitest.config.ts -t "text"`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/app/components/preview/renderers/TextPreview.tsx frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx
git commit -m "feat: add phase1 text preview renderer"
```

---

## Task 10: 列表页接入（新旧双路径 + 应用层文案）

**Files:**
- Modify: `frontend/src/pages/app/components/DocumentListPanel.tsx`
- Modify: `frontend/src/pages/app/components/DocumentListPanel.test.tsx`
- Modify: `frontend/src/pages/app/App.tsx`
- Modify: `frontend/src/pages/app/App.test.tsx`
- Modify: `frontend/src/shared/types/index.ts`

- [ ] **Step 1: 写失败测试（新预览行为 + 列表状态保持）**

```tsx
it('opens unified modal and keeps list unchanged after close', async () => {
  // 打开 -> 关闭 -> 原列表状态不变
});

it('locate action navigates to detail in phase1', async () => {
  // 定位分块只触发详情跳转
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run frontend/src/pages/app/components/DocumentListPanel.test.tsx frontend/src/pages/app/App.test.tsx --config frontend/config/vitest.config.ts`

Expected: FAIL。

- [ ] **Step 3: 接入新预览并保留旧路径开关**

```tsx
// DocumentListPanel:
// 1) 拉取 /api/settings/preview-flags
// 2) enableNewPreviewModal=true => 新架构
// 3) enableNewPreviewByType[docType]=false => LegacyChunkPreviewModal
// 4) enableNewPreviewModal=false => 全局 LegacyChunkPreviewModal
```

- [ ] **Step 4: 扩展 locale/类型字段（不破坏现有接口）**

```ts
type DocumentListLocale = {
  previewDownload: string;
  previewLocateChunk: string;
  previewOpenFailed: string;
  previewPartialHint: string;
}
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `npx vitest run frontend/src/pages/app/components/DocumentListPanel.test.tsx frontend/src/pages/app/App.test.tsx --config frontend/config/vitest.config.ts`

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/app/components/DocumentListPanel.tsx frontend/src/pages/app/components/DocumentListPanel.test.tsx frontend/src/pages/app/App.tsx frontend/src/pages/app/App.test.tsx frontend/src/shared/types/index.ts
git commit -m "feat: wire new preview flow with runtime fallback"
```

---

## Task 11: 回归矩阵验证与文档收尾

**Files:**
- Modify: `README.md`
- Create: `docs/superpowers/verification/2026-04-05-document-preview-upgrade.md`

- [ ] **Step 1: 更新 README（API + 边界 + 回退）**

```md
## Preview API
- GET /api/documents/:id/content (200/206/416)
- Error JSON: code/message/retriable/details
- Runtime flags: /api/settings/preview-flags
```

- [ ] **Step 2: 执行自动化回归命令**

Run:

```bash
npx vitest run backend/utils/document-preview-content.test.ts backend/server.preview-content.test.ts
npx vitest run frontend/src/pages/app/components/preview/phase1-preview-options.test.ts frontend/src/pages/app/components/preview/useDocumentPreviewResource.test.tsx --config frontend/config/vitest.config.ts
npx vitest run frontend/src/pages/app/components/preview/PreviewModal.test.tsx frontend/src/pages/app/components/preview/DocumentPreviewContent.test.tsx --config frontend/config/vitest.config.ts
npx vitest run frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx --config frontend/config/vitest.config.ts
npx vitest run frontend/src/pages/app/components/DocumentListPanel.test.tsx frontend/src/pages/app/App.test.tsx --config frontend/config/vitest.config.ts
npm run lint
```

Expected: 全部 PASS。

- [ ] **Step 3: 执行关键回归矩阵（手工 + 开关演练）并记录**

```md
- 预览中删除文档 -> 错误态 + 可下载/详情
- 轮询刷新中预览不断开
- 主题/语言切换不打断预览
- 连续 20 次切换文档无串内容
- 关闭后 3 秒内资源释放
```

开关演练命令（可操作）：

```bash
# 全局回退演练
ENABLE_NEW_PREVIEW_MODAL=false npm run dev --prefix backend

# 类型级回退演练（示例：仅关闭 json 新预览）
ENABLE_NEW_PREVIEW_MODAL=true ENABLE_NEW_PREVIEW_BY_TYPE="pdf:true,table:true,json:false,text:true" npm run dev --prefix backend

# 验证接口返回
curl -s http://localhost:8080/api/settings/preview-flags | jq
```

预期：

- 全局回退时：所有类型文档都走 `LegacyChunkPreviewModal`。
- 类型回退时：仅目标类型走旧预览，其他类型保持新预览。

- [ ] **Step 4: 写入验证报告并提交**

```bash
git add README.md docs/superpowers/verification/2026-04-05-document-preview-upgrade.md
git commit -m "docs: add preview verification matrix and api contract"
```

---

## 完成标准（DoD）

- 文档列表页预览从 chunk 摘要升级为原文件级预览，且支持全局与按类型（pdf/table/json/text）运行时回退到旧预览路径。
- 后端内容接口满足 `200/206/416` + `Content-Range` + 统一错误 JSON 契约。
- 前端具备请求取消、LRU 缓存、错误降级、部分预览提示。
- 渲染器按 `pdf -> table -> json -> text` 逐步交付并各自有测试与提交。
- Phase1 范围得到负向测试保证：`openPreview` 定位类 options 不触发预览内高亮/定位。
- 上传、删除、重试、详情、主题与语言切换流程无回归。
