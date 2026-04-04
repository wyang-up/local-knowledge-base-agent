# 文档解析任务编排与向量化重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前上传后直接解析的粗糙流程，升级为带状态机、阶段进度、分块元数据、checkpoint、断点恢复、阶段级重试、文档级队列与前端可视化控制的完整文档处理系统。

**Architecture:** 后端拆成“类型与 DTO / SQLite 持久化 / artifact 持久化 / 解析清洗分块服务 / embedding 与入库执行器 / 队列与 runner / HTTP 路由接线”七层，避免继续把编排逻辑塞进 `backend/server.ts`。前端拆成“文档列表容器 / 文档详情容器 / 阶段标签与进度组件 / 任务动作组件”，消费统一 DTO，展示阶段、排队、恢复、失败原因、不可恢复原因与安全停止状态。

**Tech Stack:** React + Vite + TypeScript、Express + SQLite + LanceDB、Vitest、pdf-parse、mammoth、xlsx、Axios。

---

### File Structure Map

**Backend responsibilities**
- Create: `backend/document-pipeline-types.ts` — 统一阶段、状态、DTO、错误码、元数据类型定义
- Create: `backend/document-pipeline-store.ts` — `document_jobs` / `document_job_checkpoints` / `document_chunk_metadata` / 阶段日志持久化
- Create: `backend/document-parser.ts` — 按文件类型解析原始文档
- Create: `backend/document-cleaner.ts` — 前置清洗、结构保留、清洗动作记录
- Create: `backend/token-estimator.ts` — Token 估算工具
- Create: `backend/document-chunker.ts` — 差异化语义分块与质检回收
- Create: `backend/document-artifact-store.ts` — 解析结果、清洗结果、分块结果、向量结果 artifact 引用管理
- Create: `backend/document-embedding.ts` — 批次 embedding、重试与进度统计
- Create: `backend/document-storage-writer.ts` — 单通道写入 LanceDB 与 metadata 回写
- Create: `backend/document-pipeline-queue.ts` — FIFO 队列、优先级、重任务限制、并发控制
- Create: `backend/document-pipeline-runner.ts` — 状态推进、取消、安全停止、恢复、重试 orchestration
- Create: `backend/document-pipeline-routes.ts` — pipeline 相关 HTTP DTO、参数校验与路由注册
- Modify: `backend/server.ts` — 仅保留应用启动、依赖组装与路由挂载

**Frontend responsibilities**
- Modify: `src/App.tsx` — 接入新的 documents/job DTO、按钮动作与详情展示（若过大则拆出子组件）
- Create: `src/components/documents/DocumentListPanel.tsx` — 文档列表容器与文档行布局
- Create: `src/components/documents/DocumentDetailPipelinePanel.tsx` — 文档详情页任务面板
- Create: `src/components/documents/PipelineStatusBadge.tsx` — 阶段/状态标签
- Create: `src/components/documents/PipelineProgressCard.tsx` — 阶段级/总进度/错误/恢复信息展示
- Create: `src/components/documents/DocumentJobActions.tsx` — 取消 / 继续处理 / 重试 / 重新解析按钮区
- Modify: `src/App.test.tsx` — 新 UI 状态与交互覆盖

**Tests**
- Create: `backend/document-pipeline-types.test.ts`
- Create: `backend/document-pipeline-store.test.ts`
- Create: `backend/document-parser.test.ts`
- Create: `backend/document-cleaner.test.ts`
- Create: `backend/document-chunker.test.ts`
- Create: `backend/document-artifact-store.test.ts`
- Create: `backend/document-embedding.test.ts`
- Create: `backend/document-storage-writer.test.ts`
- Create: `backend/document-pipeline-queue.test.ts`
- Create: `backend/document-pipeline-runner.test.ts`
- Modify: `src/App.test.tsx`

---

### Task 1: 固定阶段类型、错误码与前后端 DTO 契约

**Files:**
- Create: `backend/document-pipeline-types.ts`
- Test: `backend/document-pipeline-types.test.ts`

- [ ] **Step 1: 写失败测试，锁定状态、恢复与展示 DTO 字段**

```ts
// backend/document-pipeline-types.test.ts
import { describe, expect, it } from 'vitest';
import {
  getNextStageAfterSuccess,
  isTerminalStage,
  resolveResumeStage,
  toDocumentJobView,
} from './document-pipeline-types.ts';

describe('document-pipeline-types', () => {
  it('maps success stage transitions', () => {
    expect(getNextStageAfterSuccess('uploaded')).toBe('parsing');
    expect(getNextStageAfterSuccess('quality_check')).toBe('embedding');
  });

  it('resolves resume stage from checkpoint', () => {
    expect(resolveResumeStage({ lastSuccessfulStage: 'embedding' })).toBe('storing');
  });

  it('builds document job view with required progress and resume fields', () => {
    const view = toDocumentJobView({
      stage: 'embedding',
      jobStatus: 'running',
      processedUnits: 4,
      totalUnits: 10,
      stageProgress: 40,
      overallProgress: 72,
      resumeEligible: true,
      resumeInvalidReason: null,
      retryCount: 1,
      message: 'embedding now',
      errorCode: null,
      errorMessage: null,
    } as any);
    expect(view).toMatchObject({
      currentStage: 'embedding',
      processedUnits: 4,
      totalUnits: 10,
      stageProgress: 40,
      overallProgress: 72,
      resumeEligible: true,
      retryCount: 1,
      message: 'embedding now',
    });
  });

  it('marks completed failed cancelled as terminal stages', () => {
    expect(isTerminalStage('completed')).toBe(true);
    expect(isTerminalStage('failed')).toBe(true);
    expect(isTerminalStage('cancelled')).toBe(true);
    expect(isTerminalStage('cleaning')).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `npm test -- --pool=threads backend/document-pipeline-types.test.ts`
Expected: FAIL，类型/导出不存在。

- [ ] **Step 3: 实现最小类型与 DTO 转换工具**

```ts
// backend/document-pipeline-types.ts
export type PipelineStage = 'uploaded' | 'parsing' | 'cleaning' | 'chunking' | 'quality_check' | 'embedding' | 'storing' | 'completed' | 'failed' | 'cancelled';
export type JobStatus = 'queued' | 'running' | 'paused' | 'failed' | 'cancelled' | 'completed';
export type PipelineErrorCode = 'INVALID_FILE' | 'PARSING_FAILED' | 'EMBEDDING_TIMEOUT' | 'STORE_LOCKED' | 'CHECKPOINT_INVALID' | 'USER_CANCELLED' | 'CONFIG_REQUIRED';
export function getNextStageAfterSuccess(stage: PipelineStage): PipelineStage { /* ... */ }
export function resolveResumeStage(input: { lastSuccessfulStage: PipelineStage | null }): PipelineStage { /* ... */ }
export function toDocumentJobView(input: DocumentJobRecord): DocumentJobView { /* ... */ }
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- --pool=threads backend/document-pipeline-types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/document-pipeline-types.ts backend/document-pipeline-types.test.ts
git commit -m "feat: define document pipeline dto contracts"
```

### Task 2: 建立 SQLite 持久化层，覆盖任务表、checkpoint、元数据、阶段日志

**Files:**
- Create: `backend/document-pipeline-store.ts`
- Test: `backend/document-pipeline-store.test.ts`
- Modify: `backend/server.ts`

- [ ] **Step 1: 写失败测试，覆盖 Spec 中必需字段落库**

```ts
// backend/document-pipeline-store.test.ts
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { describe, expect, it } from 'vitest';
import { createDocumentPipelineStore } from './document-pipeline-store.ts';

it('persists job progress resume flags retry count and stage logs', async () => {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const store = await createDocumentPipelineStore(db);
  await store.upsertJob({
    jobId: 'job-1',
    documentId: 'doc-1',
    priority: 1,
    queuePosition: 2,
    stage: 'chunking',
    jobStatus: 'running',
    processedUnits: 3,
    totalUnits: 9,
    stageProgress: 33,
    overallProgress: 40,
    retryCount: 1,
    resumeEligible: true,
    resumeInvalidReason: null,
    message: 'chunking now',
    errorCode: null,
    errorMessage: null,
  });
  await store.appendStageLog({ jobId: 'job-1', documentId: 'doc-1', stage: 'chunking', message: 'entered stage', errorCode: null, errorMessage: null });
  expect(await store.getJob('job-1')).toMatchObject({ retryCount: 1, resumeEligible: true, processedUnits: 3, message: 'chunking now' });
  expect(await store.listStageLogs('job-1')).toHaveLength(1);
});

it('persists full chunk metadata contract', async () => {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const store = await createDocumentPipelineStore(db);
  await store.replaceChunkMetadata('doc-1', [{
    chunkId: 'chunk-1',
    documentId: 'doc-1',
    fileName: 'a.pdf',
    fileType: 'pdf',
    sourceUnit: 'heading',
    sourceLabel: '第一章',
    chunkIndex: 0,
    tokenCount: 120,
    charCount: 300,
    overlapTokenCount: 40,
    qualityStatus: 'passed',
    qualityNote: '',
    cleaningApplied: ['remove_header'],
    embeddingModel: 'bge-m3',
    vectorDimension: 1024,
    storageStatus: 'pending',
    originStart: 'p1',
    originEnd: 'p2',
    sourcePath: '/tmp/a.pdf',
    createdAt: '2026-04-03T00:00:00.000Z',
    updatedAt: '2026-04-03T00:00:00.000Z',
  }]);
  expect(await store.listChunkMetadata('doc-1')).toMatchObject([{ sourceLabel: '第一章', storageStatus: 'pending' }]);
});

it('persists checkpoints with resume flags and invalid reasons', async () => {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const store = await createDocumentPipelineStore(db);
  await store.saveCheckpoint({
    jobId: 'job-1',
    documentId: 'doc-1',
    lastSuccessfulStage: 'quality_check',
    processedUnits: 8,
    totalUnits: 10,
    resumeEligible: false,
    resumeInvalidReason: 'source-md5-changed',
  });
  expect(await store.getCheckpointByDocument('doc-1')).toMatchObject({ resumeEligible: false, resumeInvalidReason: 'source-md5-changed' });
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `npm test -- --pool=threads backend/document-pipeline-store.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 store 与建表迁移**

```ts
// backend/document-pipeline-store.ts
// tables:
// document_jobs
// document_job_checkpoints
// document_chunk_metadata
// document_stage_logs
export async function createDocumentPipelineStore(db) { /* ... */ }
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- --pool=threads backend/document-pipeline-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/document-pipeline-store.ts backend/document-pipeline-store.test.ts backend/server.ts
git commit -m "feat: add pipeline sqlite persistence tables"
```

### Task 3: 建立中间产物 artifact 边界，支撑断点恢复

**Files:**
- Create: `backend/document-artifact-store.ts`
- Test: `backend/document-artifact-store.test.ts`

- [ ] **Step 1: 写失败测试，覆盖 parsing / cleaning / chunking / embedding artifact 保存与失效**

```ts
// backend/document-artifact-store.test.ts
import { describe, expect, it } from 'vitest';
import { createDocumentArtifactStore } from './document-artifact-store.ts';

it('stores parsing cleaning chunking and embedding artifacts separately', async () => {
  const store = createDocumentArtifactStore('/tmp/artifacts-test');
  await store.saveArtifact('doc-1', 'parsing', { units: [{ text: 'raw' }] });
  await store.saveArtifact('doc-1', 'cleaning', { text: 'cleaned' });
  await store.saveArtifact('doc-1', 'chunking', { chunks: [{ id: 'c1' }] });
  await store.saveArtifact('doc-1', 'embedding', { vectors: [{ chunkId: 'c1' }] });
  expect(await store.loadArtifact('doc-1', 'cleaning')).toMatchObject({ text: 'cleaned' });
  await store.invalidateFromStage('doc-1', 'cleaning');
  expect(await store.loadArtifact('doc-1', 'cleaning')).toBeNull();
  expect(await store.loadArtifact('doc-1', 'parsing')).toMatchObject({ units: [{ text: 'raw' }] });
});

it('stores artifact fingerprint so resume validity can be checked', async () => {
  const store = createDocumentArtifactStore('/tmp/artifacts-test');
  await store.saveArtifact('doc-2', 'parsing', { units: [] }, { md5: 'abc', fileSize: 10 });
  expect(await store.readArtifactMeta('doc-2', 'parsing')).toMatchObject({ md5: 'abc', fileSize: 10 });
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `npm test -- --pool=threads backend/document-artifact-store.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现最小 artifact store**

```ts
// backend/document-artifact-store.ts
export function createDocumentArtifactStore(baseDir: string) { /* saveArtifact loadArtifact invalidateFromStage */ }
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- --pool=threads backend/document-artifact-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/document-artifact-store.ts backend/document-artifact-store.test.ts
git commit -m "feat: add pipeline artifact persistence"
```

### Task 4: 实现解析层，先锁死多格式与编码兼容

**Files:**
- Create: `backend/document-parser.ts`
- Test: `backend/document-parser.test.ts`
- Modify: `backend/server-utils.ts`

- [ ] **Step 1: 写失败测试，覆盖 TXT 编码兼容、Excel/CSV/JSON/PDF/DOCX 输出形态**

```ts
// backend/document-parser.test.ts
it('parses gb18030 txt without mojibake', async () => { /* expect text includes 你好 */ });
it('keeps short txt raw body for whole-text preservation', async () => { /* expect parsed units remain single body */ });
it('keeps sheet boundaries and header rows for xlsx/csv', async () => { /* expect parsed units contain sheet label and headers */ });
it('keeps top-level nodes for json and preserves structure', async () => { /* expect parsed units contain node paths and valid object payloads */ });
it('extracts ordered text units for pdf/docx', async () => { /* expect parsed heading/body units keep order */ });
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `npm test -- --pool=threads backend/document-parser.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现最小解析服务**

```ts
// backend/document-parser.ts
export async function parseDocument(input): Promise<ParsedDocument> { /* 按 fileType dispatch */ }
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- --pool=threads backend/document-parser.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/document-parser.ts backend/document-parser.test.ts backend/server-utils.ts
git commit -m "feat: add multi-format document parser"
```

### Task 5: 实现清洗层，锁定页眉页脚清理与 cleaningApplied 记录

**Files:**
- Create: `backend/document-cleaner.ts`
- Test: `backend/document-cleaner.test.ts`

- [ ] **Step 1: 写失败测试，覆盖 PDF/DOCX 页眉页脚去重、空行清理、乱码过滤、标题层级保留**

```ts
// backend/document-cleaner.test.ts
it('removes repeated headers and footers while keeping headings', () => {
  const cleaned = cleanDocumentText(parsed);
  expect(cleaned.text).not.toContain('页眉');
  expect(cleaned.cleaningApplied).toContain('remove_repeated_header');
});

it('removes blank lines and mojibake but preserves heading hierarchy metadata', () => {
  const cleaned = cleanDocumentText(parsed);
  expect(cleaned.text).not.toContain('\n\n\n');
  expect(cleaned.structure[0]?.level).toBe(1);
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `npm test -- --pool=threads backend/document-cleaner.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现最小清洗器**

```ts
export function cleanDocumentText(parsed: ParsedDocument): CleanedDocument { /* ... */ }
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- --pool=threads backend/document-cleaner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/document-cleaner.ts backend/document-cleaner.test.ts
git commit -m "feat: add document cleaning rules"
```

### Task 6: 实现差异化 chunking + 质检层，锁定短文本保留、结构化保真与无效块过滤

**Files:**
- Create: `backend/token-estimator.ts`
- Create: `backend/document-chunker.ts`
- Test: `backend/document-chunker.test.ts`

- [ ] **Step 1: 写失败测试，覆盖所有关键策略**

```ts
// backend/document-chunker.test.ts
it('keeps short txt as one chunk when <= 400 tokens', () => { /* ... */ });
it('splits pdf by heading and sentence boundaries', () => { /* ... */ });
it('keeps docx heading with following body instead of isolating title', () => { /* ... */ });
it('keeps excel sheet rows with headers instead of flattening', () => { /* ... */ });
it('keeps csv field structure in chunk content', () => { /* ... */ });
it('keeps small json as single chunk and large json by top-level node', () => { /* ... */ });
it('marks filtered empty chunks with qualityStatus filtered', () => { /* ... */ });
it('merges tiny fragments and filters empty chunks', () => { /* ... */ });
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `npm test -- --pool=threads backend/document-chunker.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现最小差异化分块与质检器**

```ts
// backend/document-chunker.ts
export function chunkDocument(input: CleanedDocument): ChunkDraft[] { /* dispatch per fileType */ }
export function qualityCheckChunks(chunks: ChunkDraft[]): ChunkDraft[] { /* merge/split/filter */ }
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- --pool=threads backend/document-chunker.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/token-estimator.ts backend/document-chunker.ts backend/document-chunker.test.ts
git commit -m "feat: add semantic chunking and quality checks"
```

### Task 7: 实现 embedding 与 storing 执行器，锁定批次重试、进度统计与单通道入库

**Files:**
- Create: `backend/document-embedding.ts`
- Create: `backend/document-storage-writer.ts`
- Test: `backend/document-embedding.test.ts`
- Test: `backend/document-storage-writer.test.ts`

- [ ] **Step 1: 写失败测试，覆盖已完成块数/总块数、失败批重试、单写入通道**

```ts
// backend/document-embedding.test.ts
it('reports processedUnits totalUnits stageProgress and retryCount while retrying failed batches only', async () => { /* ... */ });

// backend/document-storage-writer.test.ts
it('stores metadata and vectors through a single writer channel', async () => { /* ... */ });
it('keeps embedding artifacts reusable when storing fails', async () => { /* ... */ });
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `npm test -- --pool=threads backend/document-embedding.test.ts backend/document-storage-writer.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现最小执行器**

```ts
export async function embedChunksWithRetry(input, deps) { /* batch retry + processedUnits/totalUnits */ }
export async function storeEmbeddedChunks(input, deps) { /* single writer + metadata status updates */ }
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- --pool=threads backend/document-embedding.test.ts backend/document-storage-writer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/document-embedding.ts backend/document-storage-writer.ts backend/document-embedding.test.ts backend/document-storage-writer.test.ts
git commit -m "feat: add embedding batch executor and storage writer"
```

### Task 8: 实现队列与 runner，锁定 FIFO、单文档单活跃任务、取消安全停止、断点恢复与恢复失效判定

**Files:**
- Create: `backend/document-pipeline-queue.ts`
- Create: `backend/document-pipeline-runner.ts`
- Test: `backend/document-pipeline-queue.test.ts`
- Test: `backend/document-pipeline-runner.test.ts`

- [ ] **Step 1: 写失败测试，覆盖核心编排失败路径**

```ts
// backend/document-pipeline-runner.test.ts
it('resumes from next stage after last successful checkpoint', async () => { /* ... */ });
it('marks resume invalid when source md5 changes', async () => { /* ... */ });
it('stops safely and marks job cancelled when user cancels during embedding', async () => { /* ... */ });
it('sets errorCode errorMessage and retryCount when a stage fails', async () => { /* ... */ });
it('does not retry non-retryable parsing failures', async () => { /* ... */ });
it('retries embedding stage with configured backoff and keeps previous stages intact', async () => { /* ... */ });

// backend/document-pipeline-queue.test.ts
it('keeps fifo ordering and only one active job per document', async () => { /* ... */ });
it('delays heavy jobs under resource guard', async () => { /* ... */ });
it('exposes waiting-for-resources message for delayed heavy jobs', async () => { /* ... */ });
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `npm test -- --pool=threads backend/document-pipeline-queue.test.ts backend/document-pipeline-runner.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 queue 与 runner**

```ts
// backend/document-pipeline-queue.ts
export function createDocumentPipelineQueue(deps) { /* enqueue next cancel reprioritize */ }

// backend/document-pipeline-runner.ts
export function createDocumentPipelineRunner(deps) { /* run resume retry cancel */ }
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- --pool=threads backend/document-pipeline-queue.test.ts backend/document-pipeline-runner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/document-pipeline-queue.ts backend/document-pipeline-runner.ts backend/document-pipeline-queue.test.ts backend/document-pipeline-runner.test.ts
git commit -m "feat: add resumable pipeline queue and runner"
```

### Task 9: 接 HTTP API 与上传入口，先固定契约再接前端

**Files:**
- Create: `backend/document-pipeline-routes.ts`
- Modify: `backend/server.ts`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: 写失败测试，固定 API 契约**

```ts
// src/App.test.tsx
it('shows pipeline view fields from documents api', async () => {
  render(<App />);
  expect(await screen.findByText(/等待资源|Waiting for resources/)).toBeInTheDocument();
  expect(screen.getByText(/已生成向量块数|Embedded/)).toBeInTheDocument();
});

it('shows safe stopping and non resumable reason from api contract', async () => {
  render(<App />);
  expect(await screen.findByText(/正在安全停止|Safely stopping/)).toBeInTheDocument();
  expect(screen.getByText(/不可恢复原因|Not resumable reason/)).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `npm test -- --pool=threads src/App.test.tsx -t "shows pipeline view fields from documents api"`
Expected: FAIL

- [ ] **Step 3: 增加后端 API 并只做路由接线**

```ts
POST /api/upload
GET /api/documents
GET /api/documents/:id
POST /api/documents/:id/cancel
POST /api/documents/:id/resume
POST /api/documents/:id/retry
POST /api/documents/:id/reparse
GET /api/document-jobs
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- --pool=threads src/App.test.tsx -t "shows pipeline view fields from documents api"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/server.ts src/App.test.tsx
git commit -m "feat: expose document pipeline http api"
```

### Task 10: 改造前端文档列表，展示排队、阶段、失败、不可恢复原因与控制按钮

**Files:**
- Create: `src/components/documents/DocumentListPanel.tsx`
- Create: `src/components/documents/PipelineStatusBadge.tsx`
- Create: `src/components/documents/PipelineProgressCard.tsx`
- Create: `src/components/documents/DocumentJobActions.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: 写失败测试，锁定文档列表显示与按钮行为**

```ts
it('shows stage progress queue position and resume/retry buttons in docs list', async () => {
  render(<App />);
  expect(await screen.findByText(/排队第 2 位|Queue #2/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /继续处理|Resume/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /重试|Retry/ })).toBeInTheDocument();
});

it('shows non-resumable reason and reparsing button', async () => {
  render(<App />);
  expect(await screen.findByText(/不可恢复|Not resumable/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /重新解析|Reparse/ })).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `npm test -- --pool=threads src/App.test.tsx -t "shows stage progress queue position and resume/retry buttons in docs list"`
Expected: FAIL

- [ ] **Step 3: 实现最小前端列表组件**

```tsx
// src/components/documents/DocumentListPanel.tsx
// src/components/documents/PipelineStatusBadge.tsx
// src/components/documents/PipelineProgressCard.tsx
// src/components/documents/DocumentJobActions.tsx
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- --pool=threads src/App.test.tsx -t "shows stage progress queue position and resume/retry buttons in docs list"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/documents src/App.tsx src/App.test.tsx
git commit -m "feat: show document pipeline controls in list"
```

### Task 11: 改造前端详情页，展示阶段级进度、向量块进度、失败原因与安全停止文案

**Files:**
- Create: `src/components/documents/DocumentDetailPipelinePanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: 写失败测试，锁定详情页任务面板**

```ts
it('shows stage-level progress embedded chunks and safe-stopping message in detail page', async () => {
  render(<App />);
  expect(await screen.findByText(/正在安全停止|Safely stopping/)).toBeInTheDocument();
  expect(screen.getByText(/4 \/ 10/)).toBeInTheDocument();
  expect(screen.getByText(/失败原因|Failure reason/)).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `npm test -- --pool=threads src/App.test.tsx -t "shows stage-level progress embedded chunks and safe-stopping message in detail page"`
Expected: FAIL

- [ ] **Step 3: 最小实现详情页任务面板**

```tsx
// src/components/documents/DocumentDetailPipelinePanel.tsx
// detail view renders PipelineProgressCard with processedUnits/totalUnits/message/errorCode/errorMessage
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- --pool=threads src/App.test.tsx -t "shows stage-level progress embedded chunks and safe-stopping message in detail page"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: show pipeline details in document detail view"
```

### Task 12: 全量验证与手工验收

**Files:**
- Modify (if needed): `backend/*.ts`
- Modify (if needed): `src/*.tsx`
- Modify (if needed): `src/App.test.tsx`

- [ ] **Step 1: 跑全部后端新增测试**

Run: `npm test -- --pool=threads backend/document-pipeline-types.test.ts backend/document-pipeline-store.test.ts backend/document-artifact-store.test.ts backend/document-parser.test.ts backend/document-cleaner.test.ts backend/document-chunker.test.ts backend/document-embedding.test.ts backend/document-storage-writer.test.ts backend/document-pipeline-queue.test.ts backend/document-pipeline-runner.test.ts`
Expected: PASS

- [ ] **Step 2: 跑前端回归测试**

Run: `npm test -- --pool=threads src/App.test.tsx`
Expected: PASS

- [ ] **Step 3: 跑类型检查与构建**

Run: `npm run lint && npm run build`
Expected: PASS

- [ ] **Step 4: 手工验证主路径**

Run: `npm run dev`
Expected:
- 上传文档进入 `uploaded -> parsing -> cleaning -> chunking -> quality_check -> embedding -> storing -> completed`
- 失败时可看到 `errorCode / errorMessage / retryCount`
- 取消时可看到“正在安全停止”并最终进入 `cancelled`
- 可恢复任务显示“继续处理”且从断点恢复
- 不可恢复任务显示原因并允许“重新解析”
- 排队任务显示等待资源或排队顺位

- [ ] **Step 5: Commit**

```bash
git add backend src
git commit -m "feat: add orchestrated document processing pipeline"
```
