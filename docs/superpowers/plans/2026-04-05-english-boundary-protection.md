# English Boundary Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent false English sentence boundaries for abbreviations, versions, and numbering patterns while preserving true sentence endings.

**Architecture:** Add a narrow sentence-splitting wrapper in `backend/pipeline/document-chunker.ts`: `protect -> split -> restore`, with deterministic overlap resolution and optional boundary sentinel for multi-dot abbreviation tails. Keep all other chunking logic unchanged. Add explicit rollback via `ENABLE_ENGLISH_BOUNDARY_PROTECTION` and startup observability.

**Tech Stack:** TypeScript, Node.js, Vitest

---

**Execution directory for all commands in this plan:** `local-knowledge-base-agent` repo root.

### Task 1: Add RED Sentence-Boundary Contract Tests

**Files:**
- Modify: `backend/pipeline/document-chunker.test.ts`

- [ ] **Step 1: Add failing contract test for multi-dot abbreviations and title abbreviation**

Add one test that asserts exact sentence array from a test-only splitter hook:

```ts
it('sentence boundary contract: e.g./i.e./U.S./Dr. cases', () => {
  const text = 'We use e.g. transformers and i.e. attention blocks. Dr. Smith arrived. He lived in the U.S. market for years. He moved to the U.S. Another line starts.';
  const actual = splitSentencesForTest(text);

  expect(actual).toEqual([
    'We use e.g. transformers and i.e. attention blocks.',
    'Dr. Smith arrived.',
    'He lived in the U.S. market for years.',
    'He moved to the U.S.',
    'Another line starts.',
  ]);
});
```

- [ ] **Step 2: Run targeted test file and verify RED**

Run: `npx vitest run backend/pipeline/document-chunker.test.ts`

Expected: FAIL because test hook and protection logic do not exist yet.

- [ ] **Step 3: Add failing contract test for versions + numbering + overlap sample**

```ts
it('sentence boundary contract: versions and numbering patterns', () => {
  const text = 'Updated to v1.2.3 and then 2.0.1. See Sec. 3.2.1 in v1.2.3 docs. Refer Eq. (2.1). Check pp. 12-15 now.';
  const actual = splitSentencesForTest(text);

  expect(actual).toEqual([
    'Updated to v1.2.3 and then 2.0.1.',
    'See Sec. 3.2.1 in v1.2.3 docs.',
    'Refer Eq. (2.1).',
    'Check pp. 12-15 now.',
  ]);
});
```

- [ ] **Step 4: Run targeted test file and verify RED**

Run: `npx vitest run backend/pipeline/document-chunker.test.ts`

Expected: FAIL before implementation.

- [ ] **Step 5: Add failing contract test for single-dot context rules (`etc.`, `No.`, `Fig.`)**

```ts
it('sentence boundary contract: etc./No./Fig. context behavior', () => {
  const text = 'This is enough, etc. Another sentence. See No. 12 and Fig. 3 for proof.';
  const actual = splitSentencesForTest(text);

  expect(actual).toEqual([
    'This is enough, etc.',
    'Another sentence.',
    'See No. 12 and Fig. 3 for proof.',
  ]);
});
```

- [ ] **Step 6: Run targeted test file and verify RED**

Run: `npx vitest run backend/pipeline/document-chunker.test.ts`

Expected: FAIL before implementation.

- [ ] **Step 6.1: Add failing spec-mandated strong counterexample (`Dr. Smith arrived. Next topic.`)**

```ts
it('spec strong counterexample: Dr. Smith arrived. Next topic. must be exactly two sentences', () => {
  const text = 'Dr. Smith arrived. Next topic.';
  const actual = splitSentencesForTest(text);

  expect(actual).toEqual([
    'Dr. Smith arrived.',
    'Next topic.',
  ]);
});
```

- [ ] **Step 6.2: Run targeted test file and verify RED**

Run: `npx vitest run backend/pipeline/document-chunker.test.ts`

Expected: FAIL before implementation.

- [ ] **Step 7: Commit RED tests**

```bash
git add backend/pipeline/document-chunker.test.ts
git commit -m "test: add red contract tests for english sentence boundaries"
```

### Task 2: Implement Minimal Splitter Hook + Protection Engine

**Files:**
- Modify: `backend/pipeline/document-chunker.ts`
- Modify: `backend/pipeline/document-chunker.test.ts`

- [ ] **Step 1: Implement test hook with legacy behavior only**

Add `export function splitSentencesForTest(text: string): string[]` that currently calls existing `splitBySentences`.

Acceptance check: tests still RED but now fail on output mismatch (not missing symbol).

- [ ] **Step 2: Run targeted test file and verify RED**

Run: `npx vitest run backend/pipeline/document-chunker.test.ts`

Expected: FAIL with sentence-array diff.

- [ ] **Step 3: Add failing tie-breaker determinism test first (RED)**

Add a dedicated test that uses a fixed overlap input and exact expected sentence output; include repeated execution assertion to guarantee stable selection order.

Must assert:
- priority: `numbering > version > abbr_multi > abbr_single`
- tie-break order: longest -> priority -> left-to-right -> declaration order

- [ ] **Step 4: Run targeted test file and verify RED for tie-breaker case**

Run: `npx vitest run backend/pipeline/document-chunker.test.ts`

Expected: FAIL before tie-breaker implementation.

- [ ] **Step 5: Implement deterministic candidate matching and overlap tie-breaker (GREEN)**

Implement match resolver to satisfy Step 3 test exactly.

- [ ] **Step 6: Implement `protectEnglishBoundaries` and `restoreProtectedTokens`**

Must satisfy:
- protect only target dot positions
- `U.S.`/`Ph.D.`: internal dots protected; tail dot can trigger boundary sentinel only in sentence-end context
- `Dr./Mr./Ms.`: tail dot protected, never sentinel
- if original text already contains placeholder-like tokens (`__DOT_...__`, `__BND_...__`), pre-escape before protection and reverse-escape after restore
- ensure restore removes all placeholders/sentinels

Acceptance check: no remaining placeholder tokens in final sentence array.

- [ ] **Step 7: Integrate feature flag path in splitter**

Behavior:
- `ENABLE_ENGLISH_BOUNDARY_PROTECTION !== 'false'`: protection path
- otherwise legacy split path

Acceptance check: with flag disabled, boundary contract tests intentionally fail against protected expectations (legacy behavior).

- [ ] **Step 8: Run targeted test file and verify GREEN for protected path**

Run: `npx vitest run backend/pipeline/document-chunker.test.ts`

Expected: all new contract tests pass with default flag.

- [ ] **Step 9: Commit implementation**

```bash
git add backend/pipeline/document-chunker.ts backend/pipeline/document-chunker.test.ts
git commit -m "feat: implement english boundary protection in sentence splitter"
```

### Task 3: Add RED/GREEN Tests for Reversibility, Idempotency, and Rollback

**Files:**
- Modify: `backend/pipeline/document-chunker.test.ts`
- Modify: `backend/pipeline/document-chunker.ts`

- [ ] **Step 1: Add failing reversibility test**

Test input includes `e.g.`, `U.S.`, `v1.2.3`, `Sec. 3.2.1`, `Eq. (2.1)`, `pp. 12-15`.

Assertions:
- `protect + restore` equals original text exactly
- restored text contains no sentinel token

- [ ] **Step 1.1: Add failing placeholder-collision reversibility test**

Input must include literal placeholder-looking substrings:
- `raw __DOT_fake__ token and __BND_fake__ marker with U.S. and v1.2.3`

Assertions:
- `restore(protect(text)) === text` (character-level equality)
- output preserves literal `__DOT_fake__` and `__BND_fake__`
- output contains no generated runtime placeholder/sentinel residue

- [ ] **Step 2: Run targeted test file and verify RED**

Run: `npx vitest run backend/pipeline/document-chunker.test.ts`

Expected: FAIL before helper exposure/finalization.

- [ ] **Step 3: Add minimal internal test hook for protect/restore contract**

Expose a narrow test helper object (e.g., `__sentenceBoundaryTestHooks`) for contract-only tests.

- [ ] **Step 4: Add failing idempotency and rollback tests**

Assertions:
- protect/restore run twice yields same output (idempotent)
- with `ENABLE_ENGLISH_BOUNDARY_PROTECTION=false`, output equals explicit legacy fixture exactly

Legacy fixture definition (must create in test file):
- constant name: `LEGACY_SPLIT_FIXTURE_DR_US_VERSION`
- fixture input: `'Dr. Smith arrived. He lived in the U.S. market. Updated to v1.2.3.'`
- fixture expected output must be a literal array constant (`LEGACY_SPLIT_FIXTURE_DR_US_VERSION.expected`) sampled once and then frozen
- rollback assertions must compare against this literal constant only; do not dynamically call legacy splitter in assertion path

- [ ] **Step 5: Run targeted test file and verify RED**

Run: `npx vitest run backend/pipeline/document-chunker.test.ts`

Expected: at least one new test FAILS before final fix.

- [ ] **Step 6: Implement minimal fixes to make tests pass**

No refactor outside sentence-boundary helpers.

- [ ] **Step 7: Run targeted test file and verify GREEN**

Run: `npx vitest run backend/pipeline/document-chunker.test.ts`

Expected: all contract + stability + rollback tests PASS.

- [ ] **Step 8: Commit stability/rollback tests and fixes**

```bash
git add backend/pipeline/document-chunker.ts backend/pipeline/document-chunker.test.ts
git commit -m "test: lock reversibility idempotency and rollback for boundary protection"
```

### Task 4: Add Startup Observability and Verification Artifact

**Files:**
- Modify: `backend/server.ts`
- Create: `docs/superpowers/verification/2026-04-05-english-boundary-protection.md`

- [ ] **Step 1: Add startup log for feature flag state**

At backend startup, print exactly one line:
- `english_boundary_protection=enabled` or
- `english_boundary_protection=disabled`

- [ ] **Step 2: Run lint and focused tests**

Run:
- `npx vitest run backend/pipeline/document-chunker.test.ts`
- `npm run lint:backend`

Expected: PASS.

- [ ] **Step 3: Write verification artifact with auditable evidence**

Create `docs/superpowers/verification/2026-04-05-english-boundary-protection.md` with sections:
- `Commands Executed` (exact command list)
- `Key Output Excerpts` (copy key PASS lines and startup flag log line)
- `Retry/Failure Notes` (if any failures and reruns)
- `Rollback Check` (set flag false, restart, confirm disabled log)
- `Final Conclusion`

- [ ] **Step 4: Commit observability and verification artifact**

```bash
git add backend/server.ts docs/superpowers/verification/2026-04-05-english-boundary-protection.md
git commit -m "chore: add boundary protection startup observability and verification note"
```

### Task 5: Final Regression Gate

**Files:**
- Reference: `backend/pipeline/document-chunker.ts`
- Reference: `backend/pipeline/document-chunker.test.ts`

- [ ] **Step 1: Run required regression suite**

Run:
- `npx vitest run backend/pipeline/document-chunker.test.ts`
- `npx vitest run backend/pipeline/document-cleaner.test.ts`
- `npx vitest run backend/pipeline/document-parser.test.ts`
- `npx vitest run backend/pipeline/document-pipeline-helpers.test.ts`
- `npx vitest run backend/pipeline/document-pipeline-stages.test.ts`
- `npm run lint:backend`

Expected: all PASS.

- [ ] **Step 2: Manual smoke verification**

Run: `npm run dev`

Check:
- upload samples containing `e.g.`, `U.S.`, `v1.2.3`, `Sec. 3.2.1`, `Eq. (2.1)`, `pp. 12-15`
- verify chunk detail text has no placeholder/sentinel residue
- set `ENABLE_ENGLISH_BOUNDARY_PROTECTION=false`, restart backend, verify disabled startup log

- [ ] **Step 3: Final commit for any remaining test-only adjustments**

```bash
git add backend/pipeline/document-chunker.ts backend/pipeline/document-chunker.test.ts backend/server.ts docs/superpowers/verification/2026-04-05-english-boundary-protection.md
git commit -m "test: finalize english boundary protection regression coverage"
```
