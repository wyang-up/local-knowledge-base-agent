# PDF Original-Page Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 PDF 预览恢复原版页面视觉，同时支持从溯源进入后的自动定位、轻量半透明覆盖高亮和旁侧提示条。

**Architecture:** 保留 `pdfjs-dist` 作为前端渲染引擎，但从当前“抽取页面文本并列表展示”的方案切回“页面画布层 + 文本层 + 高亮覆盖层”的原版页面渲染。定位优先使用结构化页码/引用片段，命中后在页面原位置叠加轻量高亮框和辅助提示条，不再回退为纯文本页替代视图。

**Tech Stack:** TypeScript, React, pdfjs-dist, Vitest, Testing Library

---

## 1. File Structure

### 新增文件

- `frontend/src/pages/app/components/preview/renderers/pdf-page-overlay.tsx`
  - 负责在单页 PDF 画布上叠加高亮覆盖框与旁侧提示条。
- `frontend/src/pages/app/components/preview/renderers/pdf-page-overlay.test.tsx`
  - 覆盖轻量高亮样式、提示条渲染与点击跳详情行为。

### 修改文件

- `frontend/src/pages/app/components/preview/renderers/PdfPreview.tsx`
  - 从纯文本页展示改为原版页面渲染；接入画布层、文本层和覆盖层。
- `frontend/src/pages/app/components/preview/renderers/pdf-highlight-resolver.ts`
  - 扩展为返回页码、文本命中片段和页内近似命中范围，用于覆盖层定位。
- `frontend/src/pages/app/components/preview/renderers/pdf-highlight-resolver.test.ts`
  - 补充“页内找不到精确片段时仍保留目标页视觉”的降级规则。
- `frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`
  - 将 PDF 预期从“文本页容器”更新为“原版页面容器 + 覆盖高亮 + 提示条”。
- `frontend/src/pages/app/components/preview/DocumentPreviewContent.test.tsx`
  - 更新 PDF 透传用例，使其不再断言旧文本页行为。

---

## Task 1: PDF 覆盖层组件

**Files:**
- Create: `frontend/src/pages/app/components/preview/renderers/pdf-page-overlay.tsx`
- Test: `frontend/src/pages/app/components/preview/renderers/pdf-page-overlay.test.tsx`

- [ ] **Step 1: 写失败测试，锁定覆盖层和提示条行为**

```tsx
import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {PdfPageOverlay} from './pdf-page-overlay';

describe('PdfPageOverlay', () => {
  it('renders light highlight box on original page', () => {
    render(
      <PdfPageOverlay
        rect={{top: 40, left: 20, width: 160, height: 48}}
        label="命中溯源块"
      />,
    );

    const overlay = screen.getByTestId('pdf-page-highlight-overlay');
    expect(overlay.className).toContain('bg-[#FFF7CC]/60');
    expect(overlay.className).toContain('border-[#E8C95A]');
  });

  it('supports click-through from highlight overlay', () => {
    const onClick = vi.fn();
    render(
      <PdfPageOverlay
        rect={{top: 40, left: 20, width: 160, height: 48}}
        label="命中溯源块"
        onClick={onClick}
      />,
    );

    fireEvent.click(screen.getByTestId('pdf-page-highlight-overlay'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run --config frontend/config/vitest.config.ts --pool threads --maxWorkers 1 --no-file-parallelism frontend/src/pages/app/components/preview/renderers/pdf-page-overlay.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 写最小实现**

```tsx
type PdfPageOverlayProps = {
  rect: {top: number; left: number; width: number; height: number};
  label: string;
  onClick?: () => void;
};

export function PdfPageOverlay({rect, label, onClick}: PdfPageOverlayProps) {
  return (
    <>
      <button
        type="button"
        data-testid="pdf-page-highlight-overlay"
        onClick={onClick}
        className="absolute rounded-[8px] border border-[#E8C95A] bg-[#FFF7CC]/60 shadow-sm"
        style={rect}
      />
      <div data-testid="pdf-page-highlight-label" className="absolute rounded-[8px] border border-[#E8C95A] bg-white/90 px-2 py-1 text-xs text-gray-800 shadow-sm">
        {label}
      </div>
    </>
  );
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run --config frontend/config/vitest.config.ts --pool threads --maxWorkers 1 --no-file-parallelism frontend/src/pages/app/components/preview/renderers/pdf-page-overlay.test.tsx`

Expected: PASS。

---

## Task 2: 扩展 PDF 高亮解析器

**Files:**
- Modify: `frontend/src/pages/app/components/preview/renderers/pdf-highlight-resolver.ts`
- Modify: `frontend/src/pages/app/components/preview/renderers/pdf-highlight-resolver.test.ts`

- [ ] **Step 1: 写失败测试，要求返回页码和页内匹配文本信息**

```ts
it('returns target page and snippet for overlay rendering', () => {
  const result = resolvePdfHighlightTarget({
    sourceHighlight: {pageStart: 2, textQuote: '目标句子'},
    pageTexts: [{page: 2, text: '这里有目标句子'}],
  });

  expect(result).toEqual(expect.objectContaining({
    page: 2,
    matchText: '目标句子',
    fallback: false,
  }));
});

it('keeps page-level fallback when exact snippet is missing', () => {
  const result = resolvePdfHighlightTarget({
    sourceHighlight: {pageStart: 3, textQuote: '缺失片段'},
    pageTexts: [{page: 3, text: '第三页别的内容'}],
  });

  expect(result).toEqual(expect.objectContaining({page: 3, fallback: true}));
});
```

- [ ] **Step 2: 运行测试，确认失败或覆盖不足**

Run: `npx vitest run --config frontend/config/vitest.config.ts --environment node frontend/src/pages/app/components/preview/renderers/pdf-highlight-resolver.test.ts`

Expected: FAIL 或覆盖不足。

- [ ] **Step 3: 写最小实现**

```ts
export type ResolvedPdfHighlightTarget = {
  page: number;
  matchText: string;
  pageText: string;
  fallback: boolean;
};
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run --config frontend/config/vitest.config.ts --environment node frontend/src/pages/app/components/preview/renderers/pdf-highlight-resolver.test.ts`

Expected: PASS。

---

## Task 3: PDF 预览恢复原版页面视觉

**Files:**
- Modify: `frontend/src/pages/app/components/preview/renderers/PdfPreview.tsx`
- Modify: `frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`
- Modify: `frontend/src/pages/app/components/preview/DocumentPreviewContent.test.tsx`

- [ ] **Step 1: 写失败测试，要求 PDF 渲染原版页面容器，而不是纯文本页列表**

```tsx
it('renders original-style pdf page surface with overlay highlight', async () => {
  render(
    <PdfPreview
      src="/api/documents/doc-1/content"
      sourceHighlight={{pageStart: 2, textQuote: '这里是目标朔源内容片段', content: '这里是目标朔源内容片段'}}
    />,
  );

  expect(await screen.findByTestId('pdf-preview-page-canvas-2')).toBeInTheDocument();
  expect(screen.getByTestId('pdf-page-highlight-overlay')).toBeInTheDocument();
  expect(screen.getByTestId('pdf-page-highlight-label')).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run --config frontend/config/vitest.config.ts --pool threads --maxWorkers 1 --no-file-parallelism frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx -t "pdf preview renderer"`

Expected: FAIL。

- [ ] **Step 3: 写最小实现，把 PdfPreview 改为页面画布 + 覆盖层结构**

```tsx
// 1. 使用 pdfjs 获取 page viewport
// 2. 为每页渲染 canvas 容器，data-testid="pdf-preview-page-canvas-${page}"
// 3. 在目标页叠加 PdfPageOverlay
// 4. 仍保留 loading / error / partial preview 语义
// 5. 自动滚动到目标页覆盖层
```

- [ ] **Step 4: 降级场景保持原版页面视觉**

```tsx
// 即使 fallback=true，也渲染原版页面容器，只额外显示轻量提示条
// 不能退回整页纯文本显示
```

- [ ] **Step 5: 更新 `DocumentPreviewContent.test.tsx` 中 PDF 透传断言**

```tsx
expect(screen.getByTestId('pdf-preview-renderer')).toBeInTheDocument();
expect(screen.getByTestId('pdf-preview-pages')).toBeInTheDocument();
```

- [ ] **Step 6: 运行相关测试，确认通过**

Run: `npx vitest run --config frontend/config/vitest.config.ts --pool threads --maxWorkers 1 --no-file-parallelism frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx frontend/src/pages/app/components/preview/DocumentPreviewContent.test.tsx`

Expected: PASS。

---

## Task 4: 集成验证

**Files:**
- Modify: `frontend/src/pages/app/components/DocumentListPanel.test.tsx`
- Modify: `frontend/src/pages/app/App.test.tsx`

- [ ] **Step 1: 运行 PDF 相关链路测试**

Run: `npx vitest run --config frontend/config/vitest.config.ts --pool forks --maxWorkers 1 --no-file-parallelism frontend/src/pages/app/components/DocumentListPanel.test.tsx frontend/src/pages/app/App.test.tsx -t "opens preview modal from previewRequest prop|opens preview modal from preview button|opens document preview when source item clicked in qa" --reporter verbose`

Expected: PASS。

- [ ] **Step 2: 运行前端类型检查**

Run: `npm run lint:frontend`

Expected: PASS。

- [ ] **Step 3: 手动验证**

Run: `npm run dev`

Expected: 打开 PDF 预览时看到原版页面视觉；命中区域有轻量半透明覆盖高亮和旁侧提示条；从 QA 溯源进入时自动滚到目标区域。

---

## Self-Review

- Spec coverage: 已覆盖“恢复原版页面视觉”“轻量覆盖高亮”“旁侧提示条”“原文阅读感优先”“页级降级仍保留原版页面”。
- Placeholder scan: 所有步骤都包含具体文件路径、测试命令和最小实现方向，无占位词。
- Type consistency: 继续复用现有 `SourceHighlightTarget`，只让 PDF 预览层恢复页面视觉，不改动其它预览类型的统一契约。
