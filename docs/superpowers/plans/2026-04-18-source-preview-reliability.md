# Source Preview Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make source preview navigation reliable end-to-end by restoring structured source metadata flow, fixing over-aggressive preview dedupe, making text and JSON previews prefer structured targets, making PDF preview honest about fallback vs exact highlight, and preserving PDF chunking semantics and cleaning quality.

**Architecture:** The work is split into six focused slices: backend metadata propagation, frontend request identity, text renderer targeting, JSON renderer targeting, PDF renderer honesty, and backend PDF cleaning/chunking semantics. Each slice starts with a failing test, implements the smallest code change to satisfy that test, then re-runs targeted verification before moving on.

**Tech Stack:** TypeScript, Vitest, React 19, Express, pdfjs-dist, existing backend pipeline utilities.

---

## File Map

- Modify: `backend/server.ts`
  - Expand `mapSources()` and `enrichRetrievedChunksWithMetadata()` so structured location fields survive from metadata rows to frontend source objects.
- Modify: `backend/server.sources.test.ts`
  - Add regression coverage for all structured fields and chunk-vs-metadata precedence.
- Modify: `frontend/src/pages/app/components/preview/source-highlight-target.ts`
  - Expand preview request key generation to include all location-sensitive fields.
- Modify: `frontend/src/pages/app/components/DocumentListPanel.test.tsx`
  - Add a regression test proving two requests in the same chunk but at different positions re-open preview.
- Modify: `frontend/src/pages/app/components/preview/renderers/TextPreview.tsx`
  - Prefer `textOffsetStart/textOffsetEnd` over fuzzy text search.
- Modify: `frontend/src/pages/app/components/preview/renderers/JsonPreview.tsx`
  - Replace hardcoded `$.profile` behavior with generic `jsonPath` and node-offset-first matching.
- Modify: `frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`
  - Add renderer-level regression tests for text offsets, generic JSON paths, and PDF fallback behavior.
- Modify: `frontend/src/pages/app/components/preview/renderers/pdf-highlight-target.ts`
  - Remove unverified overlay-box based `exact` resolution and only allow exact when the matching strategy remains explicitly trusted.
- Modify: `frontend/src/pages/app/components/preview/renderers/pdf-highlight-target.test.ts`
  - Update tests to match the new honest fallback behavior.
- Modify: `frontend/src/pages/app/components/preview/renderers/PdfPreview.tsx`
  - Stop rendering misleading exact overlay when coordinate reliability is not guaranteed. Keep page jump + fallback notice.
- Modify: `backend/pipeline/document-cleaner.ts`
  - Apply the same cleanup transforms to `units` text that are already applied to `text`.
- Modify: `backend/pipeline/document-chunker.ts`
  - Remove the early page-unit return path that flattens all pages into `body` chunks. Restore TOC/reference/appendix semantics while preserving page metadata.
- Modify: `backend/pipeline/document-chunker.test.ts`
  - Add regressions for footer/reference-tail cleaning and for TOC/reference pages staying out of regular retrieval.

### Task 1: Restore Structured Source Metadata End-to-End

**Files:**
- Modify: `backend/server.ts:315-355`
- Test: `backend/server.sources.test.ts`

- [ ] **Step 1: Write the failing backend metadata tests**

Add these cases to `backend/server.sources.test.ts`:

```ts
it('maps all structured source fields needed by preview navigation', () => {
  const sources = mapSources([
    {
      id: 'chunk-1',
      docId: 'doc-1',
      chunkIndex: 2,
      fileName: 'sample.json',
      content: '命中内容全文',
      pageStart: 3,
      pageEnd: 4,
      originStart: 'p3:start',
      originEnd: 'p4:end',
      textQuote: '命中内容',
      textOffsetStart: 12,
      textOffsetEnd: 20,
      sheetId: 'sheet-1',
      sheetName: 'Sheet 1',
      rowStart: 8,
      rowEnd: 11,
      columnStart: 2,
      columnEnd: 4,
      jsonPath: '$.users[1].profile',
      nodeStartOffset: 41,
      nodeEndOffset: 98,
    },
  ]);

  expect(sources[0]).toMatchObject({
    docId: 'doc-1',
    chunkId: 'chunk-1',
    chunkIndex: 2,
    pageStart: 3,
    pageEnd: 4,
    originStart: 'p3:start',
    originEnd: 'p4:end',
    textQuote: '命中内容',
    textOffsetStart: 12,
    textOffsetEnd: 20,
    sheetId: 'sheet-1',
    sheetName: 'Sheet 1',
    rowStart: 8,
    rowEnd: 11,
    columnStart: 2,
    columnEnd: 4,
    jsonPath: '$.users[1].profile',
    nodeStartOffset: 41,
    nodeEndOffset: 98,
  });
});

it('prefers chunk fields and backfills missing structured fields from metadata', () => {
  const merged = enrichRetrievedChunksWithMetadata(
    [{
      id: 'chunk-1',
      textOffsetStart: 9,
      pageStart: 2,
      title: 'Chunk Title',
    }],
    [{
      chunkId: 'chunk-1',
      textOffsetStart: 12,
      textOffsetEnd: 18,
      pageStart: 5,
      pageEnd: 6,
      originStart: 'meta:start',
      originEnd: 'meta:end',
      sheetId: 'sheet-1',
      sheetName: 'Sheet 1',
      rowStart: 7,
      rowEnd: 8,
      columnStart: 1,
      columnEnd: 2,
      jsonPath: '$.users[0]',
      nodeStartOffset: 30,
      nodeEndOffset: 60,
      title: 'Meta Title',
    }],
  );

  expect(merged[0]).toMatchObject({
    textOffsetStart: 9,
    textOffsetEnd: 18,
    pageStart: 2,
    pageEnd: 6,
    originStart: 'meta:start',
    originEnd: 'meta:end',
    sheetId: 'sheet-1',
    sheetName: 'Sheet 1',
    rowStart: 7,
    rowEnd: 8,
    columnStart: 1,
    columnEnd: 2,
    jsonPath: '$.users[0]',
    nodeStartOffset: 30,
    nodeEndOffset: 60,
    title: 'Chunk Title',
  });
});
```

- [ ] **Step 2: Run the backend source test file and verify it fails**

Run: `npx vitest run backend/server.sources.test.ts`

Expected: FAIL because the new structured fields are missing from `mapSources()` and `enrichRetrievedChunksWithMetadata()`.

- [ ] **Step 3: Implement minimal backend metadata propagation**

Update `backend/server.ts` so both functions preserve the complete structured field set:

```ts
const structuredFields = {
  originStart: chunk?.originStart ?? metadata?.originStart ?? undefined,
  originEnd: chunk?.originEnd ?? metadata?.originEnd ?? undefined,
  pageStart: chunk?.pageStart ?? metadata?.pageStart ?? undefined,
  pageEnd: chunk?.pageEnd ?? metadata?.pageEnd ?? undefined,
  textOffsetStart: chunk?.textOffsetStart ?? metadata?.textOffsetStart ?? undefined,
  textOffsetEnd: chunk?.textOffsetEnd ?? metadata?.textOffsetEnd ?? undefined,
  sheetId: chunk?.sheetId ?? metadata?.sheetId ?? undefined,
  sheetName: chunk?.sheetName ?? metadata?.sheetName ?? undefined,
  rowStart: chunk?.rowStart ?? metadata?.rowStart ?? undefined,
  rowEnd: chunk?.rowEnd ?? metadata?.rowEnd ?? undefined,
  columnStart: chunk?.columnStart ?? metadata?.columnStart ?? undefined,
  columnEnd: chunk?.columnEnd ?? metadata?.columnEnd ?? undefined,
  jsonPath: chunk?.jsonPath ?? metadata?.jsonPath ?? undefined,
  nodeStartOffset: chunk?.nodeStartOffset ?? metadata?.nodeStartOffset ?? undefined,
  nodeEndOffset: chunk?.nodeEndOffset ?? metadata?.nodeEndOffset ?? undefined,
};
```

Use that same field set in `mapSources()`.

- [ ] **Step 4: Re-run the backend source test file**

Run: `npx vitest run backend/server.sources.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the backend metadata slice**

```bash
git add backend/server.ts backend/server.sources.test.ts
git commit -m "fix: preserve structured source metadata for preview navigation"
```

### Task 2: Fix Preview Request Identity So Distinct Locations Re-Open

**Files:**
- Modify: `frontend/src/pages/app/components/preview/source-highlight-target.ts`
- Test: `frontend/src/pages/app/components/DocumentListPanel.test.tsx`

- [ ] **Step 1: Add a regression test for same-chunk different-target reopen**

Add a test like this to `DocumentListPanel.test.tsx`:

```tsx
it('reopens preview when the same chunk is targeted with different origin or column fields', async () => {
  const firstRequest = {
    docId: 'doc-1',
    chunkId: 'chunk-1',
    chunkIndex: 0,
    originStart: 'a',
    originEnd: 'b',
    columnStart: 1,
    columnEnd: 2,
    content: '第一处命中',
  };
  const secondRequest = {
    ...firstRequest,
    originStart: 'c',
    originEnd: 'd',
    columnStart: 3,
    columnEnd: 5,
    content: '第二处命中',
  };

  const {rerender} = render(<DocumentListPanel previewRequest={firstRequest} {...baseProps} />);
  await screen.findByRole('dialog');

  rerender(<DocumentListPanel previewRequest={secondRequest} {...baseProps} />);

  await waitFor(() => {
    expect(mockHandlePreview).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the focused panel test and verify it fails**

Run: `npm run test:frontend:stable -- frontend/src/pages/app/components/DocumentListPanel.test.tsx`

Expected: FAIL because the request key still treats both requests as identical.

- [ ] **Step 3: Expand the request key to include all location-sensitive fields**

Update `buildSourceHighlightRequestKey()` in `source-highlight-target.ts`:

```ts
return JSON.stringify({
  docId: target.docId,
  chunkId: target.chunkId ?? '',
  chunkIndex: typeof target.chunkIndex === 'number' ? target.chunkIndex : '',
  pageStart: target.pageStart ?? '',
  pageEnd: target.pageEnd ?? '',
  originStart: target.originStart ?? '',
  originEnd: target.originEnd ?? '',
  textQuote: target.textQuote ?? '',
  textOffsetStart: target.textOffsetStart ?? '',
  textOffsetEnd: target.textOffsetEnd ?? '',
  sheetId: target.sheetId ?? '',
  sheetName: target.sheetName ?? '',
  rowStart: target.rowStart ?? '',
  rowEnd: target.rowEnd ?? '',
  columnStart: target.columnStart ?? '',
  columnEnd: target.columnEnd ?? '',
  jsonPath: target.jsonPath ?? '',
  nodeStartOffset: target.nodeStartOffset ?? '',
  nodeEndOffset: target.nodeEndOffset ?? '',
  content: target.content ?? '',
});
```

- [ ] **Step 4: Re-run the focused panel test**

Run: `npm run test:frontend:stable -- frontend/src/pages/app/components/DocumentListPanel.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the request identity slice**

```bash
git add frontend/src/pages/app/components/preview/source-highlight-target.ts frontend/src/pages/app/components/DocumentListPanel.test.tsx
git commit -m "fix: distinguish preview requests by structured target fields"
```

### Task 3: Make Text Preview Prefer Offsets Over Fuzzy Matching

**Files:**
- Modify: `frontend/src/pages/app/components/preview/renderers/TextPreview.tsx`
- Test: `frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`

- [ ] **Step 1: Add a failing text-offset regression test**

Add this case to `preview-renderers.test.tsx`:

```tsx
it('highlights the offset-selected occurrence in text preview', () => {
  render(
    <TextPreview
      text="第一处命中。第二处命中。第三处命中。"
      sourceHighlight={{
        textQuote: '命中',
        textOffsetStart: 7,
        textOffsetEnd: 11,
      }}
    />,
  );

  expect(screen.getByTestId('text-preview-source-highlight')).toHaveTextContent('第二处命中');
});
```

- [ ] **Step 2: Run the renderer tests and verify the new case fails**

Run: `npm run test:frontend:stable -- frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`

Expected: FAIL because the current implementation always highlights the first matching snippet.

- [ ] **Step 3: Implement offset-first highlighting in `TextPreview.tsx`**

Replace the source-target branch with logic shaped like this:

```ts
const sourceRange = useMemo(() => {
  if (
    typeof sourceHighlight?.textOffsetStart === 'number' &&
    typeof sourceHighlight?.textOffsetEnd === 'number' &&
    sourceHighlight.textOffsetStart >= 0 &&
    sourceHighlight.textOffsetEnd > sourceHighlight.textOffsetStart &&
    sourceHighlight.textOffsetEnd <= text.length
  ) {
    return {
      start: sourceHighlight.textOffsetStart,
      end: sourceHighlight.textOffsetEnd,
    };
  }

  const keyword = sourceHighlight?.textQuote?.trim() || sourceHighlight?.content?.trim() || '';
  if (!keyword || !text.includes(keyword)) {
    return null;
  }

  const index = text.indexOf(keyword);
  return {start: index, end: index + keyword.length};
}, [text, sourceHighlight]);
```

Render `sourceRange` instead of `sourceKeyword` directly.

- [ ] **Step 4: Re-run the renderer tests**

Run: `npm run test:frontend:stable -- frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`

Expected: PASS for the new text-offset case and no regressions in existing text cases.

- [ ] **Step 5: Commit the text preview slice**

```bash
git add frontend/src/pages/app/components/preview/renderers/TextPreview.tsx frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx
git commit -m "fix: prefer text offsets for source preview highlights"
```

### Task 4: Replace Hardcoded JSON Path Handling With Generic Structured Targeting

**Files:**
- Modify: `frontend/src/pages/app/components/preview/renderers/JsonPreview.tsx`
- Test: `frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`

- [ ] **Step 1: Add failing JSON path and node-offset tests**

Append tests like these:

```tsx
it('highlights the node selected by node offsets in json preview', () => {
  const value = JSON.stringify({profile: {name: 'Ada'}, team: {lead: 'Grace'}}, null, 2);

  render(
    <JsonPreview
      value={value}
      sourceHighlight={{
        nodeStartOffset: value.indexOf('"team"'),
        nodeEndOffset: value.indexOf('Grace') + 'Grace'.length + 1,
      }}
    />,
  );

  expect(screen.getByTestId('json-preview-source-highlight')).toHaveTextContent('"team"');
});

it('highlights a generic jsonPath target instead of only $.profile', () => {
  render(
    <JsonPreview
      value={{profile: {name: 'Ada'}, team: {lead: 'Grace'}}}
      sourceHighlight={{jsonPath: '$.team'}}
    />,
  );

  expect(screen.getByTestId('json-preview-source-highlight')).toHaveTextContent('"team"');
});
```

- [ ] **Step 2: Run the renderer tests and verify the JSON cases fail**

Run: `npm run test:frontend:stable -- frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`

Expected: FAIL because only `$.profile` is recognized and node offsets are ignored.

- [ ] **Step 3: Implement generic JSON target resolution**

In `JsonPreview.tsx`, add helpers like these:

```ts
function tryReadJsonPathRange(text: string, jsonPath?: string): TextRange | null {
  if (!jsonPath?.startsWith('$.')) {
    return null;
  }

  const segments = jsonPath
    .slice(2)
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);

  const last = segments.at(-1);
  if (!last) {
    return null;
  }

  return findWhitespaceInsensitiveRange(text, `"${last}"`);
}
```

And resolve range in this order:

```ts
if (typeof sourceHighlight?.nodeStartOffset === 'number' && typeof sourceHighlight?.nodeEndOffset === 'number') {
  return {start: sourceHighlight.nodeStartOffset, end: sourceHighlight.nodeEndOffset};
}

const pathRange = tryReadJsonPathRange(text, sourceHighlight?.jsonPath);
if (pathRange) {
  return pathRange;
}
```

Then fall back to `textQuote/content`.

- [ ] **Step 4: Re-run the renderer tests**

Run: `npm run test:frontend:stable -- frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`

Expected: PASS for the new JSON cases.

- [ ] **Step 5: Commit the JSON preview slice**

```bash
git add frontend/src/pages/app/components/preview/renderers/JsonPreview.tsx frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx
git commit -m "fix: use generic structured targets in json preview"
```

### Task 5: Make PDF Preview Honest About Exact vs Fallback

**Files:**
- Modify: `frontend/src/pages/app/components/preview/renderers/pdf-highlight-target.ts`
- Modify: `frontend/src/pages/app/components/preview/renderers/PdfPreview.tsx`
- Test: `frontend/src/pages/app/components/preview/renderers/pdf-highlight-target.test.ts`
- Test: `frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`

- [ ] **Step 1: Rewrite the PDF tests to assert honest fallback behavior**

Change `pdf-highlight-target.test.ts` to these expectations:

```ts
it('returns page fallback when the quote is found but no trusted in-view highlight mapping exists', () => {
  const result = resolvePdfHighlightTarget({
    pageTexts: [{pageNumber: 2, text: '这里是目标朔源内容片段'}],
    sourceHighlight: {
      pageStart: 2,
      textQuote: '目标朔源内容',
      content: '目标朔源内容',
    },
  });

  expect(result).toEqual({
    mode: 'page-fallback',
    pageNumber: 2,
    matchedText: '目标朔源内容',
  });
});
```

In `preview-renderers.test.tsx`, replace the overlay assertion with:

```tsx
it('does not render a misleading exact overlay when only page-level targeting is trusted', async () => {
  render(
    <PdfPreview
      src="/api/documents/doc-1/content"
      sourceHighlight={{
        pageStart: 2,
        textQuote: '这里是目标朔源内容片段',
        content: '这里是目标朔源内容片段',
      }}
    />,
  );

  await waitFor(() => {
    expect(screen.getByTestId('pdf-preview-page-fallback-notice')).toBeInTheDocument();
  });
  expect(screen.queryByTestId('pdf-preview-overlay-highlight')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused PDF tests and verify they fail**

Run: `npx vitest run frontend/src/pages/app/components/preview/renderers/pdf-highlight-target.test.ts frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`

Expected: FAIL because exact mode and overlay are still being produced.

- [ ] **Step 3: Remove misleading exact overlay logic**

Make `resolvePdfHighlightTarget()` return `page-fallback` whenever only page-level trust exists:

```ts
if (preferredPageText?.text.includes(matchedText)) {
  return {
    mode: 'page-fallback',
    pageNumber: preferredPage,
    matchedText,
  };
}
```

Then simplify `PdfPreview.tsx` so it stops rendering `pdf-preview-overlay-highlight` unless a future trusted `exact` path is added back intentionally.

- [ ] **Step 4: Re-run the focused PDF tests**

Run: `npx vitest run frontend/src/pages/app/components/preview/renderers/pdf-highlight-target.test.ts frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the PDF honesty slice**

```bash
git add frontend/src/pages/app/components/preview/renderers/pdf-highlight-target.ts frontend/src/pages/app/components/preview/renderers/PdfPreview.tsx frontend/src/pages/app/components/preview/renderers/pdf-highlight-target.test.ts frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx
git commit -m "fix: fallback honestly when pdf exact highlight is untrusted"
```

### Task 6: Apply Cleaning to PDF Units and Restore PDF Structure Semantics

**Files:**
- Modify: `backend/pipeline/document-cleaner.ts`
- Modify: `backend/pipeline/document-chunker.ts`
- Test: `backend/pipeline/document-chunker.test.ts`

- [ ] **Step 1: Add failing chunker regressions for page-unit cleaning and structure preservation**

Add tests like these to `document-chunker.test.ts`:

```ts
it('does not keep pagination footer noise when chunking from pdf page units', () => {
  const cleaned = baseCleaned({
    fileType: 'pdf',
    text: '正文\n页码 12',
    units: [
      {sourceUnit: 'body', sourceLabel: '第1页', text: '正文\n页码 12', pageStart: 1, pageEnd: 1},
    ] as any,
  });

  const chunks = chunkDocument(cleaned);
  expect(chunks[0]?.content).not.toContain('页码 12');
});

it('keeps toc pages out of regular retrieval when page units are available', () => {
  const chunks = chunkDocument(baseCleaned({
    fileType: 'pdf',
    fileName: 'toc.pdf',
    text: '目录\n第一章 ...... 1\n第二章 ...... 5\n正文开始',
    units: [
      {sourceUnit: 'body', sourceLabel: '第1页', text: '目录\n第一章 ...... 1\n第二章 ...... 5', pageStart: 1, pageEnd: 1},
      {sourceUnit: 'body', sourceLabel: '第2页', text: '第一章\n正文开始', pageStart: 2, pageEnd: 2},
    ] as any,
  }));

  const tocChunk = chunks.find((chunk) => chunk.pageStart === 1);
  expect(tocChunk?.sectionType).toBe('toc');
  expect(tocChunk?.retrievalEligible).toBe(false);
});

it('keeps reference pages out of body retrieval when page units are available', () => {
  const chunks = chunkDocument(baseCleaned({
    fileType: 'pdf',
    fileName: 'refs.pdf',
    text: '正文\nReferences\n[1] Alpha',
    units: [
      {sourceUnit: 'body', sourceLabel: '第1页', text: '第一章\n正文', pageStart: 1, pageEnd: 1},
      {sourceUnit: 'body', sourceLabel: '第2页', text: 'References\n[1] Alpha', pageStart: 2, pageEnd: 2},
    ] as any,
  }));

  const referenceChunk = chunks.find((chunk) => chunk.pageStart === 2);
  expect(referenceChunk?.sectionType).toBe('references');
  expect(referenceChunk?.nodeType).toBe('references');
});
```

- [ ] **Step 2: Run the backend chunker tests and verify they fail**

Run: `npx vitest run backend/pipeline/document-chunker.test.ts`

Expected: FAIL because page-unit chunks still keep noise and flatten everything to `body`.

- [ ] **Step 3: Apply the same cleaner transforms to unit text**

In `document-cleaner.ts`, introduce a helper used by both `parsed.text` and each `parsed.units[i].text`:

```ts
function cleanTextValue(input: string) {
  let text = input;
  text = removePaginationFooters(text);
  text = removeMojibake(text);
  text = collapseBlankLines(text);
  text = removeInvalidSymbols(text);
  text = removeReferenceTail(text);
  return normalizeBodyText(text);
}
```

Then map units with cleaned `text` values before returning `CleanedDocument`.

- [ ] **Step 4: Replace the early page-unit return with structure-aware chunking**

Update `document-chunker.ts` so page-unit chunks classify each page instead of forcing `body`:

```ts
function classifyPageUnit(text: string): 'toc' | 'references' | 'appendix' | 'body' {
  const normalized = text.trim();
  if (/^(目录|contents)\b/im.test(normalized)) return 'toc';
  if (/^(参考文献|references)\b/im.test(normalized)) return 'references';
  if (/^(附录|appendix)\b/im.test(normalized)) return 'appendix';
  return 'body';
}
```

Build page chunks with per-type metadata:

```ts
const sectionType = classifyPageUnit(content);
const retrievalEligible = sectionType !== 'toc' && sectionType !== 'references';
const nodeType = sectionType === 'appendix' ? 'appendix' : sectionType === 'toc' ? 'toc' : sectionType === 'references' ? 'references' : 'body';
```

Do not `return pageChunks` before the rest of the PDF logic has a chance to preserve semantics. If page chunks are used directly, they must already carry the right `sectionType`, `nodeType`, and `retrievalEligible` values.

- [ ] **Step 5: Re-run the backend chunker tests**

Run: `npx vitest run backend/pipeline/document-chunker.test.ts`

Expected: PASS for the new PDF regressions and no regression in existing chunk tests.

- [ ] **Step 6: Commit the PDF backend semantics slice**

```bash
git add backend/pipeline/document-cleaner.ts backend/pipeline/document-chunker.ts backend/pipeline/document-chunker.test.ts
git commit -m "fix: preserve pdf chunk semantics and cleaning quality"
```

### Task 7: Run Cross-Cut Verification

**Files:**
- Verify only

- [ ] **Step 1: Run the targeted backend and frontend regressions**

Run:

```bash
npx vitest run backend/server.sources.test.ts backend/pipeline/document-chunker.test.ts frontend/src/pages/app/components/preview/renderers/pdf-highlight-target.test.ts frontend/src/pages/app/components/preview/renderers/preview-renderers.test.tsx frontend/src/pages/app/components/DocumentListPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run the existing regression bundle**

Run:

```bash
npm run test:regression
```

Expected: PASS.

- [ ] **Step 3: Run type checks**

Run:

```bash
npm run lint:frontend && npm run lint:backend
```

Expected: PASS.

- [ ] **Step 4: Commit the verification checkpoint if needed**

```bash
git status
```

Expected: clean working tree. If there are leftover test-only or formatting changes, commit them with a focused message before handoff.

## Self-Review

- Spec coverage check:
  - Backend field propagation is covered by Task 1.
  - Request key expansion is covered by Task 2.
  - Text and JSON structured targeting are covered by Tasks 3 and 4.
  - Honest PDF fallback is covered by Task 5.
  - PDF cleaning and chunk semantics are covered by Task 6.
  - Verification and regression coverage are covered by Task 7.
- Placeholder scan: no `TODO`, `TBD`, or vague “handle appropriately” steps remain.
- Type consistency check: all field names match the current `SourceHighlightTarget` model and backend metadata names used in the approved spec.
