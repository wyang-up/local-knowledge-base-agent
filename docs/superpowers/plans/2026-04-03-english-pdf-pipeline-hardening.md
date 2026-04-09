# English PDF Pipeline Hardening Implementation Plan

> Status: Historical implementation plan. This file documents an earlier hardening phase and is no longer the latest source of truth for preview or pipeline behavior.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix English PDF documents failing after upload by upgrading PDF/DOCX chunking to bilingual-aware boundaries, making short-segment merging conditional, and improving embedding throughput with conservative batch processing.

**Architecture:** Keep the current pipeline shape (`parse -> clean -> chunk -> quality_check -> embedding -> storing`) but harden the `chunking` and `embedding` stages instead of adding more frontend state. The chunker becomes a two-pass system: first create bilingual paragraph/sentence segments, then decide whether to merge or split based on document size and token statistics. The embedding stage keeps low document-level concurrency while switching from one-request-per-chunk to dynamic small batches so English PDFs no longer fail because of oversized or excessively slow requests.

**Tech Stack:** Node.js, TypeScript, Express, Axios, Vitest, existing pipeline modules under `backend/`

---

### Task 1: Confirm Current Spec Coverage Before Code

**Files:**
- Reference: `/mnt/e/opencode/project/Product-Spec.md`
- Reference: `/mnt/e/opencode/project/Product-Spec-CHANGELOG.md`

- [ ] **Step 1: Re-read the current spec requirements**

Confirm that the current spec already covers these rules introduced in `v1.19`:

```md
- PDF / DOCX must support Chinese, English, and mixed-language boundary detection.
- Sentence splitting must recognize `。！？；.!?;`, paragraph breaks, and common English headings.
- Short-segment merging is conditional, not always-on.
- Oversized chunks must be split before embedding.
- Embedding must use conservative small-batch requests, not fixed single-chunk requests.
```

- [ ] **Step 2: Record the exact spec sections implementation must satisfy**

Use the spec as the source of truth and list the sections that later verification must check:
- PDF/DOCX bilingual boundary detection
- conditional merging and oversized split rules
- embedding batching and failed-batch observability
- metadata persistence for merged/split chunks

Must-reference spec sections for implementation and verification:
- `Product-Spec.md` §4「智能清洗、差异化语义分块与向量化」
- `Product-Spec.md` §5「分块元数据表结构」
- `Product-Spec.md` §6「实时进度状态机」
- `Product-Spec.md` §7「取消后恢复策略」
- `Product-Spec.md` §8「重试策略」
- `Product-Spec.md` §9「队列与并发策略」
- `Product-Spec-CHANGELOG.md` `v1.19` / `v1.16` / `v1.15`

- [ ] **Step 3: Keep product direction unchanged during implementation**

Check that the spec still matches the current product direction:
- frontend remains simple (`解析中 / 已完成 / 失败`)
- retry remains the main user-facing control
- backend gets the smarter pipeline behavior

### Task 2: Lock the Regression With Chunker Tests First

**Files:**
- Modify: `/mnt/e/opencode/project/local-knowledge-base-agent/backend/document-chunker.test.ts`
- Modify: `/mnt/e/opencode/project/local-knowledge-base-agent/backend/document-chunker.ts`

- [ ] **Step 1: Write a failing test for English PDF segmentation**

Add a test showing an English PDF is split into multiple meaningful chunks rather than a single giant block.

```ts
it('splits english pdf content by english sentence and paragraph boundaries', () => {
  const cleaned: CleanedDocument = {
    fileType: 'pdf',
    fileName: 'english.pdf',
    text: 'Chapter 1\n\nThis is the first sentence. This is the second sentence.\n\nChapter 2\n\nAnother paragraph starts here. It continues.',
    cleaningApplied: [],
    structure: [],
  };

  const chunks = chunkDocument(cleaned);

  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.some((chunk) => chunk.content.includes('Another paragraph'))).toBe(true);
});
```

- [ ] **Step 2: Run the chunker test file and verify RED**

Run: `npm test -- backend/document-chunker.test.ts`

Expected: the new English PDF test fails because current code only splits on `。`.

- [ ] **Step 3: Write a failing test for mixed-language PDF segmentation**

Add a test showing a Chinese-English mixed PDF respects both punctuation systems and paragraph boundaries.

```ts
it('splits mixed-language pdf content without collapsing english and chinese sections into one block', () => {
  // assert chunks > 1 and both language sections remain traceable
});
```

- [ ] **Step 4: Write a failing test for DOCX bilingual segmentation**

Add a DOCX-focused test proving the same segmentation helpers apply to `docx`, not only `pdf`.

```ts
it('splits bilingual docx content by bilingual sentence boundaries', () => {
  // assert multiple chunks and stable source labels
});
```

- [ ] **Step 5: Add a failing test for conditional short-segment merging**

Add one test that proves normal documents are not merged aggressively, and another that proves over-fragmented documents do trigger merging.

```ts
it('does not merge short segments when document does not hit merge thresholds', () => {
  // expect several small chunks to remain separate
});

it('merges adjacent short segments when chunk explosion threshold is reached', () => {
  // expect many tiny segments to collapse under a cap
});
```

- [ ] **Step 6: Run the chunker test file again and verify RED**

Run: `npm test -- backend/document-chunker.test.ts`

Expected: the English PDF, mixed-language PDF, DOCX, and threshold tests all fail before implementation.

- [ ] **Step 7: Add failing metadata contract tests for merged and split chunks before implementation**

Build a metadata contract matrix for merged and split chunks before touching `document-chunker.ts`. Assert these exact fields are present and correct in chunk outputs or persisted records wherever the spec marks them as required; do not treat missing fields as acceptable merely because they are derivable upstream:
- `chunkId`
- `documentId`
- `fileName`
- `fileType`
- `sourceUnit`
- `chunkIndex`
- `tokenCount`
- `charCount`
- `overlapTokenCount`
- `qualityStatus`
- `qualityNote`
- `cleaningApplied`
- `embeddingModel`
- `vectorDimension`
- `storageStatus`
- `createdAt`
- `updatedAt`

For every final persisted stored chunk, assert all spec-required fields unconditionally:
`chunkId`, `documentId`, `fileName`, `fileType`, `sourceUnit`, `chunkIndex`,
`tokenCount`, `charCount`, `overlapTokenCount`, `qualityStatus`, `cleaningApplied`,
`embeddingModel`, `vectorDimension`, `storageStatus`, `createdAt`, `updatedAt`.

Assert spec-optional fields conditionally:
- `sourcePath` when a real source path exists
- `sourceLabel` when the chunk has a structural label; for PDF / DOCX heading-based chunks in these tests, require it
- `originStart` / `originEnd` when the pipeline has origin location data; for merged or split PDF / DOCX test fixtures in these tests, require non-empty values

Add assertions proving merged or oversized-split chunks carry the expected metadata contract and remain usable by downstream persistence.

```ts
expect(chunks.some((chunk) => chunk.qualityStatus === 'merged')).toBe(true);
expect(chunks.some((chunk) => chunk.qualityStatus === 'split')).toBe(true);
```

- [ ] **Step 8: Run the chunker test file again and verify RED for metadata contract**

Run: `npm test -- backend/document-chunker.test.ts`

Expected: the metadata contract tests fail before implementation.

- [ ] **Step 9: Implement the minimal chunker changes**

Refactor `document-chunker.ts` into small helpers instead of one inline loop. Keep the file focused, but if it grows too large, split helpers into a sibling utility module.

Implementation requirements:

```ts
function splitPdfDocxIntoSegments(text: string): string[]
function detectHeadingLabel(segment: string): string | null
function shouldMergeShortSegments(stats: ChunkStats): boolean
function mergeAdjacentShortSegments(segments: string[], options: MergeOptions): string[]
function splitOversizedSegment(segment: string, maxTokens: number): string[]
```

Rules to implement:
- split on blank lines first
- split on both Chinese and English sentence punctuation
- treat obvious English headings as heading candidates
- only merge when thresholds are hit
- always split oversized segments before returning chunks
- preserve enough metadata to distinguish normal, merged, and split chunks (`qualityStatus`, `qualityNote`, `sourceLabel`, `tokenCount`)

- [ ] **Step 10: Run the chunker test file and verify GREEN**

Run: `npm test -- backend/document-chunker.test.ts`

Expected: all chunker tests, including metadata contract tests, pass.

### Task 3: Add Embedding Batch Regression Tests Before Changing Runtime Behavior

**Files:**
- Modify: `/mnt/e/opencode/project/local-knowledge-base-agent/backend/document-embedding.test.ts`
- Modify: `/mnt/e/opencode/project/local-knowledge-base-agent/backend/document-embedding.ts`

- [ ] **Step 1: Write a failing test for batch grouping**

Add a test showing multiple chunks are sent in grouped batches instead of one request each.

```ts
it('embeds chunks in grouped batches', async () => {
  const batchSizes: number[] = [];

  await embedChunksWithRetry({
    chunks: Array.from({ length: 10 }, (_, index) => ({ chunkId: `c${index}`, content: `chunk ${index}` })),
    batchSize: 4,
    maxRetries: 0,
    embedBatch: async (batch) => {
      batchSizes.push(batch.length);
      return batch.map(() => [1, 2, 3]);
    },
  });

  expect(batchSizes).toEqual([4, 4, 2]);
});
```

- [ ] **Step 2: Write a failing test for dynamic batch sizing helper**

Add a focused unit test for a new helper such as `resolveEmbeddingBatchSize(chunks)`.

```ts
expect(resolveEmbeddingBatchSize([{ content: 'short text' }])).toBe(8);
expect(resolveEmbeddingBatchSize([{ content: 'x'.repeat(4000) }])).toBe(1);
```

- [ ] **Step 3: Write a failing test proving only failed batches are retried**

Extend the embedding tests so a middle batch fails once, then succeeds, while completed batches are not repeated.

```ts
expect(embedder.mock.calls.map(([batch]) => batch.map((item) => item.chunkId))).toEqual([
  ['c1', 'c2'],
  ['c3', 'c4'],
  ['c3', 'c4'],
]);
```

- [ ] **Step 4: Write a failing test for batch observability data**

Add a helper or return-shape test verifying batch size and failed-batch count are exposed for diagnostics.

- [ ] **Step 5: Write a failing test for failed-batch threshold behavior**

Add a RED test proving the embedding stage fails the document when failed batches exceed the configured threshold instead of retrying forever.

```ts
it('fails when failed batch ratio exceeds threshold', async () => {
  // expect overall embedding failure once failed-batch ratio is too high
});
```

- [ ] **Step 6: Write a failing test for retry bookkeeping**

Add a RED test proving retry metadata includes at least `retryCount`, failure reason, and retry trigger timestamp.

- [ ] **Step 7: Write a failing test for per-batch status tracking**

Add a RED test proving every batch has a traceable record with at least:
- batch index or batch identifier
- chunk IDs in that batch
- success or failure status
- failure reason when failed
- retry count for that batch
- retry trigger timestamp
- failed batch count and failed-batch ratio basis

- [ ] **Step 8: Run the embedding test file and verify RED**

Run: `npm test -- backend/document-embedding.test.ts`

Expected: the batching helper, failed-batch retry, threshold, and bookkeeping tests fail before implementation.

- [ ] **Step 9: Write a failing test for embedding retry backoff and retryability rules**

Add a RED test proving all of the following:
- `embedding` automatically retries at most 3 times
- backoff sequence is `2s / 5s / 10s`
- clearly non-retryable errors stop retries immediately
- automatic retries only apply to the current failed batch and do not rerun already successful batches

- [ ] **Step 10: Implement retry-policy compliance in `document-embedding.ts`**

Implement and expose:
- maximum retry count
- backoff intervals
- non-retryable error short-circuit
- failed-batch-only retry behavior

- [ ] **Step 11: Implement the remaining minimal embedding changes**

In `document-embedding.ts`:
- keep `embedChunksWithRetry` reusable
- export a small helper to decide batch size from chunk token/char estimates
- expose enough result/progress data to know batch size and failed-batch count
- keep retries scoped to the failed batch only
- capture retry bookkeeping (`retryCount`, failure reason, retry timestamp)
- support a failed-batch ratio threshold that aborts the document when exceeded
- track per-batch identity and success/failure state so failed batches remain auditable
- do not add unnecessary generic configuration layers

Suggested helper shape:

```ts
export function resolveEmbeddingBatchSize(chunks: Array<{ content: string; tokenCount?: number }>): number {
  // 8 for small chunks, 4 for medium chunks, 1 for very large chunks
}
```

- [ ] **Step 12: Run the embedding test file and verify GREEN**

Run: `npm test -- backend/document-embedding.test.ts`

Expected: all embedding tests pass.

### Task 4: Wire Dynamic Batching and Accurate Error Codes Into the Pipeline

**Files:**
- Modify: `/mnt/e/opencode/project/local-knowledge-base-agent/backend/server.ts`
- Modify: `/mnt/e/opencode/project/local-knowledge-base-agent/backend/document-storage-writer.test.ts`
- Modify: `/mnt/e/opencode/project/local-knowledge-base-agent/backend/document-pipeline-runner.test.ts`
- Reference: `/mnt/e/opencode/project/local-knowledge-base-agent/backend/document-chunker.ts`
- Reference: `/mnt/e/opencode/project/local-knowledge-base-agent/backend/document-embedding.ts`

- [ ] **Step 1: Write a failing pipeline-facing test for stage-specific failures**

Add or extend a targeted backend test so runtime wiring is covered before editing `server.ts`. At minimum, prove that a failure in embedding is surfaced as `EMBEDDING_FAILED` rather than `PARSING_FAILED`.

- [ ] **Step 2: Write a failing test for metadata persistence after merged or split chunking**

Use `document-storage-writer.test.ts` or another narrow test to prove merged or split chunks still persist the metadata contract required by the spec.

The test must explicitly assert persisted metadata contains all spec-required fields, and conditionally assert optional fields per spec. For the merged or split PDF / DOCX fixtures used here, require non-empty `sourceLabel`, `originStart`, and `originEnd`.

- [ ] **Step 3: Write a failing test for embedding runtime bookkeeping propagation**

Add a RED test proving runtime progress/persistence carries forward at least:
- batch size used
- failed batch count
- failed batch identifiers or indexes
- per-batch success/failure status
- retry count
- retry trigger timestamp
- latest failure reason
- failed-batch ratio numerator
- failed-batch ratio denominator
- failed-batch ratio result
- `resumeEligible`
- `resumeInvalidReason`
- `lastCheckpointAt`
- `processedUnits`
- `totalUnits`

Batch bookkeeping must propagate into a durable runtime-visible record used by the pipeline status or persistence layer, not only the in-memory return value of `embedChunksWithRetry`. Tests must assert the pipeline runner persists or surfaces this record after the embedding stage completes or fails.

- [ ] **Step 4: Write a failing pipeline retry or resume test for embedding-stage failure**

Add a RED test in `backend/document-pipeline-runner.test.ts` proving that when `embedding` fails:
- document status becomes `failed`
- failure code is `EMBEDDING_FAILED`
- `lastSuccessfulStage` or resume checkpoint remains at the stage immediately before embedding
- `resumeEligible`, `resumeInvalidReason`, `lastCheckpointAt`, `processedUnits`, and `totalUnits` are persisted correctly
- manual retry resumes from `embedding`, not from `parsing`, `cleaning`, `chunking`, or `quality_check`
- manual retry resumes from `embedding` only when `resumeEligible = true`
- previously successful intermediate artifacts are reused rather than recomputed
- resume metadata remains durable after process restart or task reload

Run:
- `npm test -- backend/document-pipeline-runner.test.ts`

Expected: the new retry or resume test fails before wiring changes.

- [ ] **Step 5: Run the exact new runtime tests and verify RED**

Run:
- `npm test -- backend/document-pipeline-runner.test.ts`
- `npm test -- backend/document-storage-writer.test.ts`

Expected: the newly added stage-specific failure and metadata/runtime bookkeeping tests fail before wiring changes.

- [ ] **Step 6: Write a failing queue and concurrency regression test for embedding stage limits**

Add a RED test proving that after dynamic batching is introduced:
- document-level `embedding` concurrency remains `1`
- a single document still uses conservative small-batch submission instead of high-concurrency full fan-out
- any existing limiter or pacing hook for the `embedding` stage is not bypassed

- [ ] **Step 7: Update `runEmbeddingStage` to use dynamic batch sizing**

Replace the hard-coded `batchSize: 1` with the helper from `document-embedding.ts`.

Implementation outline:

```ts
const embeddingInputs = chunkDrafts.map((chunk, index) => ({
  chunkId: `${doc.id}-${index}`,
  content: chunk.content,
  tokenCount: chunk.tokenCount,
}));

const batchSize = resolveEmbeddingBatchSize(embeddingInputs);
```

- [ ] **Step 8: Persist batch observability, stage checkpoints, and correct stage-specific failure codes**

Instead of always writing `PARSING_FAILED`, track the current stage and map it to an error code:

```ts
const errorCodeByStage = {
  parsing: 'PARSING_FAILED',
  cleaning: 'CLEANING_FAILED',
  chunking: 'CHUNKING_FAILED',
  quality_check: 'QUALITY_CHECK_FAILED',
  embedding: 'EMBEDDING_FAILED',
  storing: 'STORING_FAILED',
};
```

Also persist or surface enough embedding diagnostics to know which batch size was used and how many batch failures were retried.

Batch bookkeeping must propagate into a durable runtime-visible record used by the pipeline status or persistence layer, not only the in-memory return value of `embedChunksWithRetry`. The GREEN tests from Step 3 and Step 4 must prove this record still exists after the embedding stage completes or fails.

Persist enough stage checkpoint data so a failed embedding task can resume from `embedding` on manual retry, reusing successful upstream artifacts.

Persist and verify at least these recovery fields:
- `resumeEligible`
- `resumeInvalidReason`
- `lastCheckpointAt`
- `processedUnits`
- `totalUnits`

- [ ] **Step 9: Run the exact same runtime tests and verify GREEN**

Run:
- `npm test -- backend/document-pipeline-runner.test.ts`
- `npm test -- backend/document-storage-writer.test.ts`

Expected: the same runtime tests that failed in Step 4 now pass.

- [ ] **Step 10: Run the queue and concurrency regression test and verify GREEN**

Run:
- `npm test -- backend/document-pipeline-runner.test.ts`

Expected: the embedding-stage concurrency guard test passes after wiring changes.

- [ ] **Step 11: Run targeted backend tests and verify GREEN**

Run: `npm test -- backend/document-chunker.test.ts backend/document-embedding.test.ts backend/document-storage-writer.test.ts backend/document-pipeline-runner.test.ts`

Expected: all targeted tests pass.

### Task 5: Run Final Verification and Record Evidence

**Files:**
- Create: `/mnt/e/opencode/project/local-knowledge-base-agent/docs/superpowers/verification/2026-04-03-english-pdf-pipeline-hardening.md`
- No code changes required unless verification finds problems

- [ ] **Step 0: Create a durable verification evidence file**

Create `/mnt/e/opencode/project/local-knowledge-base-agent/docs/superpowers/verification/2026-04-03-english-pdf-pipeline-hardening.md` and append all final verification evidence there as the release-gating artifact.

- [ ] **Step 1: Run the targeted backend verification command**

Run: `npm test -- backend/document-chunker.test.ts backend/document-embedding.test.ts backend/document-storage-writer.test.ts backend/document-pipeline-runner.test.ts`

Expected: PASS with zero failures.

- [ ] **Step 2: Run the backend lint command**

Run: `npm run lint`

Expected: exit code 0.

- [ ] **Step 3: Run one mandatory real English PDF upload smoke test**

Use a known English PDF through the app and confirm all of the following:
- upload succeeds
- document reaches `completed` instead of `failed`
- the file is a multi-section English PDF and chunk count is greater than 1
- no single giant chunk is sent directly to embedding
- retry remains available only for actual failures
- any failure now reports the real stage-specific error code

- [ ] **Step 4: Preserve verification evidence for release gating**

Record at least:
- actual English PDF file name used for smoke test
- example chapter or paragraph boundary hits proving english sentence/title splitting actually happened
- resulting chunk count
- maximum chunk token count
- chosen embedding batch size
- actual batch grouping sequence
- failed-batch retry result, if any occurred
- evidence of embedding retry backoff sequence and stop-on-nonretryable behavior
- persisted per-batch identifiers or indexes
- persisted per-batch success or failure status
- persisted per-batch retry count
- persisted latest failure reason and retry trigger timestamp
- total batch count plus failed-batch ratio calculation inputs and result
- recorded `lastSuccessfulStage`
- recorded resume target stage after embedding failure
- evidence that manual retry resumes from `embedding` without rerunning upstream stages
- evidence that only one document entered embedding stage at a time during verification
- final stage log and error code evidence

All listed evidence must be written into the verification file created in Step 0, including the exact test and lint command outputs plus the smoke-test observations.

- [ ] **Step 5: Run two mandatory real bilingual smoke tests: one mixed-language PDF and one bilingual DOCX**

Use one mixed-language PDF and one bilingual DOCX through the full pipeline and record for each file:
- input file name
- final document status is `completed`
- resulting chunk count
- resulting chunk count is greater than 1
- evidence that bilingual boundaries were recognized
- no single giant chunk was sent to embedding
- chosen embedding batch size
- actual batch grouping sequence
- persisted per-batch identifiers or indexes
- persisted per-batch success or failure status
- persisted per-batch retry count
- persisted latest failure reason and retry trigger timestamp
- final document status
- any stage-specific failure code if it fails
- final stage log and stage-specific error code evidence if any failure occurs

All listed evidence must be written into the verification file created in Step 0, including the exact test and lint command outputs plus the smoke-test observations.

- [ ] **Step 6: Update the final work log for the next agent or human**

Record:
- what changed in the spec
- what tests were added
- actual verification commands and outputs
- whether the real English PDF smoke test, mixed-language PDF smoke test, and bilingual DOCX smoke test all passed or still need follow-up
