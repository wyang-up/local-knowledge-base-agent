# Unified Preview Source Highlighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 PDF、TXT/DOCX、JSON、Excel/CSV 预览都能在从问答溯源进入时自动定位到目标块，并用统一的块级高亮样式显示，支持点击高亮块跳转详情。

**Architecture:** 在前端新增统一的预览定位目标模型与解析工具层，把“来源信息 -> 渲染器可消费的定位数据”标准化。PDF 从 iframe 方案升级为 `pdfjs-dist` 自渲染文本层；文本、JSON、表格分别实现块级高亮渲染，但共享统一的高亮视觉样式与点击跳详情契约。

**Tech Stack:** TypeScript, React, pdfjs-dist, Vitest, Testing Library

---

## 0. 关联文档

- 设计文档：`docs/superpowers/specs/2026-04-08-unified-preview-source-highlighting-design.md`
- 现有预览总入口：`frontend/src/pages/app/components/preview/DocumentPreviewContent.tsx`
- 当前预览壳层：`frontend/src/pages/app/components/preview/PreviewModal.tsx`
- 当前问答到预览链路：`frontend/src/pages/app/App.tsx`、`frontend/src/pages/app/components/DocumentListPanel.tsx`

## 1. File Structure（先锁定边界）

### 新增文件

- `frontend/src/pages/app/components/preview/source-highlight-target.ts`
  - 定义统一预览定位目标类型、类型守卫、标准化函数。
- `frontend/src/pages/app/components/preview/source-highlight-target.test.ts`
  - 覆盖通用字段、PDF/表格/JSON 扩展字段与回退规则。

- `frontend/src/pages/app/components/preview/renderers/highlight-block.tsx`
  - 提供统一块级高亮壳组件，封装统一样式与点击行为。
- `frontend/src/pages/app/components/preview/renderers/highlight-block.test.tsx`
  - 覆盖样式类名、点击回调、无交互态。

- `frontend/src/pages/app/components/preview/renderers/pdf-highlight-resolver.ts`
  - 负责把 `page/textQuote/offset/chunk content` 解析成 PDF 文本层高亮范围。
- `frontend/src/pages/app/components/preview/renderers/pdf-highlight-resolver.test.ts`
  - 覆盖页级命中、quote 回退、失败降级。

### 修改文件

- `frontend/src/pages/app/components/preview/preview-types.ts`
  - 扩展统一预览定位目标类型，替代当前弱类型 `PreviewOpenOptions`。
- `frontend/src/shared/types/index.ts`
  - 扩展 `MessageSource`，补充结构化定位字段。

- `frontend/src/pages/app/components/preview/DocumentPreviewContent.tsx`
  - 接入统一定位目标类型，并将其传递到各渲染器。
- `frontend/src/pages/app/components/preview/DocumentPreviewContent.test.tsx`
  - 覆盖定位目标透传、点击高亮块触发详情。

- `frontend/src/pages/app/components/preview/renderers/PdfPreview.tsx`
  - 从 iframe 方案升级为 pdfjs 渲染 + 文本层高亮。
- `frontend/src/pages/app/components/preview/renderers/TextPreview.tsx`
  - 从词级 `<mark>` 升级为块级高亮容器。
- `frontend/src/pages/app/components/preview/renderers/JsonPreview.tsx`
  - 保持原文文本视图，支持节点级块高亮。
- `frontend/src/pages/app/components/preview/renderers/TablePreview.tsx`
  - 从单行黄底升级为行区间块高亮。
- `frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`
  - 补齐 PDF/Text/JSON/Table 真高亮测试。

- `frontend/src/pages/app/components/DocumentListPanel.tsx`
  - 统一向预览页传入完整定位目标。
- `frontend/src/pages/app/components/DocumentListPanel.test.tsx`
  - 覆盖从 previewRequest 打开预览后确实带入定位目标。

- `frontend/src/pages/app/App.tsx`
  - 在 QA -> 预览的链路里构建完整定位目标。
- `frontend/src/pages/app/App.test.tsx`
  - 覆盖问答点击溯源后的预览定位行为。

---

## Task 1: 统一预览定位目标模型

**Files:**
- Create: `frontend/src/pages/app/components/preview/source-highlight-target.ts`
- Test: `frontend/src/pages/app/components/preview/source-highlight-target.test.ts`
- Modify: `frontend/src/pages/app/components/preview/preview-types.ts`
- Modify: `frontend/src/shared/types/index.ts`

- [ ] **Step 1: 写失败测试，定义统一目标模型的标准化行为**

```ts
import {describe, expect, it} from 'vitest';
import {normalizeSourceHighlightTarget} from './source-highlight-target';

describe('normalizeSourceHighlightTarget', () => {
  it('keeps common chunk fields and structured location fields', () => {
    expect(normalizeSourceHighlightTarget({
      docId: 'doc-1',
      chunkId: 'chunk-2',
      chunkIndex: 1,
      content: '目标片段',
      pageStart: 3,
      pageEnd: 4,
      textOffsetStart: 120,
      textOffsetEnd: 240,
    })).toEqual(expect.objectContaining({
      docId: 'doc-1',
      chunkId: 'chunk-2',
      chunkIndex: 1,
      pageStart: 3,
      pageEnd: 4,
      textOffsetStart: 120,
      textOffsetEnd: 240,
    }));
  });

  it('drops invalid numeric fields but preserves text fallback content', () => {
    expect(normalizeSourceHighlightTarget({
      content: '回退片段',
      pageStart: -1,
      rowStart: Number.NaN,
    })).toEqual(expect.objectContaining({
      content: '回退片段',
      pageStart: undefined,
      rowStart: undefined,
    }));
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- frontend/src/pages/app/components/preview/source-highlight-target.test.ts`

Expected: FAIL（提示模块或导出不存在）。

- [ ] **Step 3: 写最小实现，补齐统一目标类型与标准化函数**

```ts
export type SourceHighlightTarget = {
  docId?: string;
  chunkId?: string;
  chunkIndex?: number;
  content?: string;
  originStart?: string;
  originEnd?: string;
  pageStart?: number;
  pageEnd?: number;
  textQuote?: string;
  textOffsetStart?: number;
  textOffsetEnd?: number;
  sheetId?: string;
  sheetName?: string;
  rowStart?: number;
  rowEnd?: number;
  columnStart?: number;
  columnEnd?: number;
  jsonPath?: string;
  nodeStartOffset?: number;
  nodeEndOffset?: number;
};

export function normalizeSourceHighlightTarget(input: unknown): SourceHighlightTarget | null {
  // 只保留合法字段；如果 content/chunkId/chunkIndex/docId 全空则返回 null
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- frontend/src/pages/app/components/preview/source-highlight-target.test.ts`

Expected: PASS。

- [ ] **Step 5: 同步扩展共享类型**

```ts
export interface MessageSource {
  docId?: string;
  chunkId?: string;
  chunkIndex?: number;
  docName: string;
  content: string;
  originStart?: string;
  originEnd?: string;
  pageStart?: number;
  pageEnd?: number;
  textQuote?: string;
  textOffsetStart?: number;
  textOffsetEnd?: number;
  sheetId?: string;
  sheetName?: string;
  rowStart?: number;
  rowEnd?: number;
  columnStart?: number;
  columnEnd?: number;
  jsonPath?: string;
  nodeStartOffset?: number;
  nodeEndOffset?: number;
}
```

- [ ] **Step 6: 运行类型检查**

Run: `npm run lint:frontend`

Expected: PASS。

---

## Task 2: 统一高亮块壳组件

**Files:**
- Create: `frontend/src/pages/app/components/preview/renderers/highlight-block.tsx`
- Test: `frontend/src/pages/app/components/preview/renderers/highlight-block.test.tsx`

- [ ] **Step 1: 写失败测试，锁定统一样式与点击行为**

```tsx
import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {HighlightBlock} from './highlight-block';

describe('HighlightBlock', () => {
  it('renders unified block highlight style', () => {
    render(<HighlightBlock>命中块</HighlightBlock>);
    const block = screen.getByTestId('preview-highlight-block');
    expect(block.className).toContain('bg-[#FFF7CC]');
    expect(block.className).toContain('border-[#E8C95A]');
    expect(block.className).toContain('rounded-[8px]');
  });

  it('invokes click handler when block is interactive', () => {
    const onClick = vi.fn();
    render(<HighlightBlock onClick={onClick}>命中块</HighlightBlock>);
    fireEvent.click(screen.getByTestId('preview-highlight-block'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- frontend/src/pages/app/components/preview/renderers/highlight-block.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 写最小实现**

```tsx
type HighlightBlockProps = {
  children: React.ReactNode;
  onClick?: () => void;
};

export function HighlightBlock({children, onClick}: HighlightBlockProps) {
  const interactive = typeof onClick === 'function';
  return (
    <div
      data-testid="preview-highlight-block"
      onClick={onClick}
      className={interactive
        ? 'cursor-pointer rounded-[8px] border border-[#E8C95A] bg-[#FFF7CC] shadow-sm transition-colors hover:border-[#D4B240]'
        : 'rounded-[8px] border border-[#E8C95A] bg-[#FFF7CC] shadow-sm'}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- frontend/src/pages/app/components/preview/renderers/highlight-block.test.tsx`

Expected: PASS。

---

## Task 3: 文本 / JSON 渲染器升级为块级高亮

**Files:**
- Modify: `frontend/src/pages/app/components/preview/renderers/TextPreview.tsx`
- Modify: `frontend/src/pages/app/components/preview/renderers/JsonPreview.tsx`
- Modify: `frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`
- Modify: `frontend/src/pages/app/components/preview/DocumentPreviewContent.tsx`
- Modify: `frontend/src/pages/app/components/preview/DocumentPreviewContent.test.tsx`

- [ ] **Step 1: 先给 TextPreview 写失败测试，要求块级高亮而不是词级 mark**

```tsx
it('renders text source as block highlight and supports click-through', () => {
  const onOpenDetail = vi.fn();
  render(
    <TextPreview
      text="第一段\n目标分块正文\n第三段"
      sourceHighlight={{content: '目标分块正文'}}
      onSourceBlockClick={onOpenDetail}
    />,
  );

  expect(screen.getByTestId('preview-highlight-block')).toHaveTextContent('目标分块正文');
  fireEvent.click(screen.getByTestId('preview-highlight-block'));
  expect(onOpenDetail).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: 再给 JsonPreview 写失败测试，要求原文节点块高亮**

```tsx
it('renders json source as original-text block highlight', () => {
  render(
    <JsonPreview
      value={'{"profile":{"name":"Alice"},"tags":["admin"]}'}
      sourceHighlight={{content: '"profile": {\n    "name": "Alice"\n  }'}}
    />,
  );

  expect(screen.getByTestId('preview-highlight-block')).toBeInTheDocument();
  expect(screen.getByTestId('json-preview-content')).toHaveTextContent('"profile"');
});
```

- [ ] **Step 3: 运行渲染器测试，确认失败**

Run: `npm test -- frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`

Expected: FAIL（现有实现仍是 `mark` 或滚动比率定位）。

- [ ] **Step 4: 最小实现 TextPreview 块级切片渲染**

```tsx
// 1) 接收统一 target 或 target.content
// 2) 找到 before / match / after
// 3) 用 HighlightBlock 包裹 match
// 4) useEffect 中滚动 highlightRef.scrollIntoView({ block: 'center' })
```

- [ ] **Step 5: 最小实现 JsonPreview 节点块高亮**

```tsx
// 保持 pre 原文视图
// 命中节点后，用 HighlightBlock 包裹整段节点文本
// 若只能模糊命中，仍至少高亮最接近的连续片段
```

- [ ] **Step 6: 修改 `DocumentPreviewContent`，向文本/JSON 渲染器透传统一 target 与点击回调**

```tsx
<JsonPreview value={resource?.content} sourceHighlight={sourceHighlight} onSourceBlockClick={onLocateChunk} />
<TextPreview text={toText(resource?.content)} sourceHighlight={sourceHighlight} onSourceBlockClick={onLocateChunk} />
```

- [ ] **Step 7: 运行文本/JSON 相关测试，确认通过**

Run: `npm test -- frontend/src/pages/app/components/preview/DocumentPreviewContent.test.tsx frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`

Expected: PASS。

---

## Task 4: 表格渲染器升级为行区间块高亮

**Files:**
- Modify: `frontend/src/pages/app/components/preview/renderers/TablePreview.tsx`
- Modify: `frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`

- [ ] **Step 1: 写失败测试，要求高亮整段行区间而不是单行命中**

```tsx
it('highlights matched row range block inside selected sheet', () => {
  render(
    <TablePreview
      sheets={[{id: 'sheet-1', name: 'Sheet 1', columns: ['姓名'], rows: [['张三'], ['李四'], ['王五']]}]}
      sourceHighlight={{sheetId: 'sheet-1', rowStart: 1, rowEnd: 2, content: '李四 王五'}}
    />,
  );

  expect(screen.getAllByTestId('table-preview-source-highlight-row')).toHaveLength(2);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`

Expected: FAIL（当前实现只支持一行）。

- [ ] **Step 3: 写最小实现，支持 Sheet + 行区间命中**

```tsx
// 优先按 target.sheetId / sheetName 切 sheet
// 计算 highlightedRowStart / highlightedRowEnd
// 命中区间内的 tr 统一加高亮样式和 data-testid
// 首行高亮区滚动到视口中部
```

- [ ] **Step 4: 让高亮区支持点击跳详情**

```tsx
// 区间内每行可点击，统一触发 onSourceBlockClick
```

- [ ] **Step 5: 运行表格测试，确认通过**

Run: `npm test -- frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`

Expected: PASS。

---

## Task 5: PDF 真高亮（pdfjs 自渲染）

**Files:**
- Create: `frontend/src/pages/app/components/preview/renderers/pdf-highlight-resolver.ts`
- Test: `frontend/src/pages/app/components/preview/renderers/pdf-highlight-resolver.test.ts`
- Modify: `frontend/src/pages/app/components/preview/renderers/PdfPreview.tsx`
- Modify: `frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`

- [ ] **Step 1: 先写解析器失败测试，定义页级命中与 quote 回退规则**

```ts
import {describe, expect, it} from 'vitest';
import {resolvePdfHighlightTarget} from './pdf-highlight-resolver';

describe('resolvePdfHighlightTarget', () => {
  it('prefers explicit page range and text quote', () => {
    const result = resolvePdfHighlightTarget({
      sourceHighlight: {pageStart: 2, pageEnd: 2, textQuote: '目标句子'},
      pageTexts: [
        {page: 1, text: '第一页'},
        {page: 2, text: '这里有目标句子'},
      ],
    });

    expect(result).toEqual(expect.objectContaining({page: 2, matchText: '目标句子'}));
  });

  it('falls back to content snippet when quote is absent', () => {
    const result = resolvePdfHighlightTarget({
      sourceHighlight: {content: '目标段落'},
      pageTexts: [{page: 3, text: '第三页目标段落正文'}],
    });

    expect(result?.page).toBe(3);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- frontend/src/pages/app/components/preview/renderers/pdf-highlight-resolver.test.ts`

Expected: FAIL。

- [ ] **Step 3: 写最小解析器实现**

```ts
export function resolvePdfHighlightTarget({ sourceHighlight, pageTexts }) {
  // 优先 pageStart/pageEnd + textQuote
  // 再用 content 模糊匹配
  // 返回 { page, matchText, fallback: boolean }
}
```

- [ ] **Step 4: 给 PdfPreview 写失败测试，要求不再使用 iframe，且渲染可见高亮块**

```tsx
it('renders pdf pages with visible highlight block instead of iframe-only viewer', async () => {
  render(
    <PdfPreview
      src="/api/documents/doc-1/content"
      sourceHighlight={{pageStart: 2, textQuote: '目标片段', content: '目标片段'}}
      onSourceBlockClick={vi.fn()}
    />,
  );

  expect(screen.queryByTitle('PDF 预览内容')).not.toBeInTheDocument();
  expect(await screen.findByTestId('preview-highlight-block')).toBeInTheDocument();
});
```

- [ ] **Step 5: 运行渲染器测试，确认失败**

Run: `npm test -- frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`

Expected: FAIL。

- [ ] **Step 6: 在 `PdfPreview.tsx` 写最小可用 pdfjs 自渲染实现**

```tsx
// 1) import pdfjs-dist，加载 document
// 2) 渲染目标页和相邻页文本内容
// 3) 把命中块用 HighlightBlock 包裹或覆盖在页文本层上
// 4) 滚动目标块到中部
// 5) 点击高亮块触发 onSourceBlockClick
```

- [ ] **Step 7: 若无法精确文本层命中，至少渲染页内降级高亮块**

```tsx
// 在 page 容器内插入“已定位到目标页，正文块匹配已降级”的 HighlightBlock
```

- [ ] **Step 8: 运行 PDF 相关测试，确认通过**

Run: `npm test -- frontend/src/pages/app/components/preview/renderers/pdf-highlight-resolver.test.ts frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`

Expected: PASS。

---

## Task 6: 预览总入口与问答链路接入统一定位目标

**Files:**
- Modify: `frontend/src/pages/app/components/preview/DocumentPreviewContent.tsx`
- Modify: `frontend/src/pages/app/components/DocumentListPanel.tsx`
- Modify: `frontend/src/pages/app/App.tsx`
- Modify: `frontend/src/pages/app/components/DocumentListPanel.test.tsx`
- Modify: `frontend/src/pages/app/App.test.tsx`

- [ ] **Step 1: 写失败测试，要求 previewRequest 能透传结构化定位字段**

```tsx
it('opens preview from source request with structured highlight target', async () => {
  render(
    <DocumentListPanel
      ...props
      previewRequest={{
        docId: 'doc-1',
        docName: '示例.pdf',
        chunkId: 'chunk-1',
        chunkIndex: 0,
        content: '目标片段',
        pageStart: 2,
        textQuote: '目标片段',
      }}
    />,
  );

  expect(await screen.findByTestId('pdf-preview-renderer')).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试，确认失败或缺少结构字段断言**

Run: `npm test -- frontend/src/pages/app/components/DocumentListPanel.test.tsx frontend/src/pages/app/App.test.tsx`

Expected: FAIL 或缺少结构字段透传覆盖。

- [ ] **Step 3: 在 `App.tsx` 构造统一定位目标**

```ts
setPreviewSource({
  ...source,
  pageStart: source.pageStart,
  textQuote: source.textQuote ?? source.content,
  sheetId: source.sheetId,
  rowStart: source.rowStart,
  jsonPath: source.jsonPath,
});
```

- [ ] **Step 4: 在 `DocumentListPanel.tsx` 透传完整定位目标到预览内容层**

```tsx
<DocumentPreviewContent
  ...
  sourceHighlight={normalizeSourceHighlightTarget(activePreviewSource)}
  onLocateChunk={...}
/>
```

- [ ] **Step 5: 运行链路测试，确认通过**

Run: `npm test -- frontend/src/pages/app/components/DocumentListPanel.test.tsx frontend/src/pages/app/App.test.tsx`

Expected: PASS。

---

## Task 7: 全量回归验证

**Files:**
- Modify: `frontend/src/pages/app/components/preview/DocumentPreviewContent.test.tsx`
- Modify: `frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`
- Modify: `frontend/src/pages/app/components/DocumentListPanel.test.tsx`
- Modify: `frontend/src/pages/app/App.test.tsx`

- [ ] **Step 1: 增补验收测试清单**

```ts
// 1. PDF / TXT / JSON / 表格都渲染 preview-highlight-block 或等价块级高亮
// 2. 高亮块点击触发 onLocateChunk
// 3. 顶部定位条与正文高亮同时存在
// 4. 结构化定位缺失时仍能退化到可见高亮
```

- [ ] **Step 2: 运行前端预览相关测试**

Run: `npm test -- frontend/src/pages/app/components/preview/DocumentPreviewContent.test.tsx frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx frontend/src/pages/app/components/DocumentListPanel.test.tsx frontend/src/pages/app/App.test.tsx`

Expected: PASS。

- [ ] **Step 3: 运行前端类型检查**

Run: `npm run lint:frontend`

Expected: PASS。

- [ ] **Step 4: 手动验证关键路径**

Run: `npm run dev`

Expected: 本地打开应用后，问答点击溯源进入预览，PDF / TXT / JSON / 表格均能自动滚到目标块并显示统一高亮。

---

## Self-Review

- Spec coverage: 已覆盖统一定位模型、PDF 自渲染真高亮、文本/JSON 块级高亮、表格行区间高亮、QA -> 预览链路透传、统一视觉样式与降级策略。
- Placeholder scan: 所有任务已给出具体文件路径、测试入口、最小实现方向与验证命令；无 `TODO/TBD` 占位词。
- Type consistency: 统一使用 `SourceHighlightTarget` 作为预览目标类型，避免 `string | null` 与对象混用导致后续渲染器接口继续分裂。
