# Document Detail + Chunking Optimization Implementation Plan

> Status: Historical implementation plan. The detail page and chunk metadata behavior have continued evolving after this plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver document detail page UI optimization and backend chunking metadata enhancement with tree navigation support, while only adding new logic and keeping existing behavior intact.

**Architecture:** Extend current backend chunking outputs with bilingual structural metadata (`lang/title/hierarchy/level/node_type`) and persist them into local metadata storage, then expose them through existing detail APIs. On frontend, enhance the existing `DocumentDetailPanel` into a strict three-column layout using metadata-first rendering with fallback to current heading extraction logic.

**Tech Stack:** TypeScript, React, Node.js, Fastify, SQLite, Vitest

---

## Scope Constraints (Confirmed)

- Excluded from this plan by request:
  1. Feature flags / kill switches
  2. Dual-track API compatibility (`chunksV2` style parallel payload)
  3. DB migration hardening strategy discussion (idempotent migration planning details)
- Execution rule: only add code; do not delete or rewrite existing chunking/cleaning/quality/vectorization logic.

## Priority Roadmap

- **P0**: Main delivery path (must complete first)
- **P1**: Stability + performance + retrieval usability
- **P2**: Polish + documentation completion

Total estimate: **18-24 hours**

---

## P0 Tasks (Must-Have)

### Task P0-1: Backend bilingual + structure metadata generation

**Priority:** P0  
**Estimate:** 6-8h  
**Risk:** mixed-language misclassification; heading false positives for numeric patterns

**Files:**
- Modify: `backend/pipeline/document-chunker.ts`
- Test: `backend/pipeline/document-chunker.test.ts`

- [ ] Add language detection helper (`zh/en`) based on text signal ratio + heading keyword fallback
- [ ] Expand heading recognition for CN/EN structural nodes:
  - CN: 摘要、前言、引言、目录、附录、参考文献、致谢、第X章/X节/1.1/1.1.1
  - EN: Abstract、Introduction、TOC、Appendix、References、Chapter/Section/1.1/1.1.1
- [ ] Force structural sections (`abstract/preface/intro/toc/appendix/ref/ack`) to render as level-1 tree nodes
- [ ] Add chunk-level metadata fields:
  - `lang`, `title`, `hierarchy`, `level`, `nodeType`
- [ ] Keep sentence-integrity behavior and title-body association intact
- [ ] Keep table rows and JSON structure-safe chunking behavior intact
- [ ] Add tests for bilingual detection + tree metadata completeness

### Task P0-2: Metadata persistence and API delivery

**Priority:** P0  
**Estimate:** 3-4h  
**Risk:** metadata-chunk index drift during storage

**Files:**
- Modify: `backend/pipeline/document-pipeline-helpers.ts`
- Modify: `backend/pipeline/document-pipeline-store.ts`
- Modify: `backend/server.ts`
- Test: `backend/pipeline/document-pipeline-helpers.test.ts`
- Test: `backend/pipeline/document-pipeline-store.test.ts`

- [ ] Extend metadata record builder to include new tree fields
- [ ] Extend chunk metadata store record schema and read/write mapping
- [ ] Extend `/api/documents/:id` payload with fields needed by detail page:
  - chunk tree metadata fields
  - detail-side info (`chunkingStrategy`, `overlapLength`, `embeddingModel`, parse/vector statuses)
- [ ] Add/adjust tests for persisted tree metadata contract

### Task P0-3: Frontend three-column detail page implementation

**Priority:** P0  
**Estimate:** 6-8h  
**Risk:** scroll-link jitter on long documents; dense DOM render cost

**Files:**
- Modify: `frontend/src/shared/types/index.ts`
- Modify: `frontend/src/pages/app/components/DocumentDetailPanel.tsx`
- Modify: `frontend/src/pages/app/App.tsx`
- Test: `frontend/src/pages/app/components/DocumentDetailPanel.test.tsx`

- [ ] Extend `Chunk` type with optional metadata fields (non-breaking)
- [ ] Left column enhancements:
  - metadata-first tree render
  - icon mapping by node type (📌📖📚📎📄)
  - node chunk count display (`[n块]`)
  - active-node highlight with blue strip + light-blue background
  - click-to-scroll and scroll-to-highlight sync
- [ ] Middle column enhancements:
  - card visual style (`#F8F9FA`, 8px radius, light shadow, 12px spacing)
  - top line includes chunk index, hierarchy breadcrumb, token count, page range
  - summary first-line default view; full content expand/collapse with smooth transition
  - fixed top-right copy action with hover emphasis
- [ ] Right column enhancements (sticky):
  - file info + chunk/stats + strategy/overlap/model + parse/vector status
  - quick actions: download, rechunk, export, print
- [ ] Add UI tests for tree navigation, card expand/collapse, and action button availability

### Task P0-4: End-to-end regression and stability check

**Priority:** P0  
**Estimate:** 2-3h  
**Risk:** hidden regressions in legacy detail rendering and metadata null handling

**Files:**
- Test updates across existing test files above

- [ ] Run targeted backend tests
- [ ] Run targeted frontend tests
- [ ] Run lint + full regression checks
- [ ] Record results in a verification note

---

## P1 Tasks (Recommended Right After P0)

### Task P1-1: Sentence-boundary and structure-protection hardening

**Priority:** P1  
**Estimate:** 1.5-2.5h  
**Risk:** over-conservative rules can reduce chunk granularity

**Files:**
- Modify: `backend/pipeline/document-chunker.test.ts`

- [ ] Add stronger edge-case tests for abbreviations/version/numbering mixed in EN docs
- [ ] Add regression checks for CN+EN mixed sections
- [ ] Validate title-body continuity after quality checks

### Task P1-2: Large-document rendering performance optimization

**Priority:** P1  
**Estimate:** 1.5-2.5h  
**Risk:** optimization can break precise jump-to-chunk positioning

**Files:**
- Modify: `frontend/src/pages/app/components/DocumentDetailPanel.tsx`
- Test: `frontend/src/pages/app/components/DocumentDetailPanel.test.tsx`

- [ ] Add lazy render strategy for chunk cards (or segmented mount)
- [ ] Tune scroll sync logic (observer threshold + update debounce)
- [ ] Verify no UX regressions in highlight synchronization

### Task P1-3: Action workflow robustness

**Priority:** P1  
**Estimate:** 1-1.5h  
**Risk:** inconsistent status display when rechunk job is in progress

**Files:**
- Modify: `frontend/src/pages/app/components/DocumentDetailPanel.tsx`
- Modify: `backend/server.ts`

- [ ] Ensure rechunk action has deterministic request/response contract
- [ ] Add user-visible loading/error/success state handling
- [ ] Ensure export action includes metadata-rich format option

---

## P2 Tasks (Polish)

### Task P2-1: UI consistency cleanup

**Priority:** P2  
**Estimate:** 1-1.5h  
**Risk:** accidental visual drift in dark theme

**Files:**
- Modify: `frontend/src/pages/app/components/DocumentDetailPanel.tsx`
- Optional Modify: shared style utilities where applicable

- [ ] Normalize spacing/radius/color constants used in detail page
- [ ] Verify bilingual typography and spacing consistency

### Task P2-2: Documentation updates

**Priority:** P2  
**Estimate:** 0.5-1h  
**Risk:** docs not matching final payload keys

**Files:**
- Modify: `docs/chunking-strategy.md`
- Create: `docs/superpowers/verification/2026-04-05-document-detail-and-chunking-optimization.md`

- [ ] Document new metadata schema and UI mapping
- [ ] Record verification commands and results

---

## Verification Commands (Execution Stage)

- `npx vitest run backend/pipeline/document-chunker.test.ts`
- `npx vitest run backend/pipeline/document-pipeline-helpers.test.ts`
- `npx vitest run backend/pipeline/document-pipeline-store.test.ts`
- `npx vitest run frontend/src/pages/app/components/DocumentDetailPanel.test.tsx --config frontend/config/vitest.config.ts`
- `npm run lint`

## Completion Criteria

- Three-column detail page meets visual and interaction requirements
- Chunk cards display complete tree metadata (`lang/title/hierarchy/level/node_type`)
- Scroll sync and chapter jump work consistently
- Backend metadata is persisted and exposed to frontend
- Existing pipeline behavior remains operational without deleting/replacing old logic
