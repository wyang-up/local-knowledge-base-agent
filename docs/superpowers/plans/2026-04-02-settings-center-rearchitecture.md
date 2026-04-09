# Settings Center Rebuild Implementation Plan

> Status: Historical implementation plan. Major parts have landed, but the current settings behavior has evolved beyond this plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a desktop-grade 3-card settings center with provider-specific config, secure key reveal flow, storage local-bridge actions, module-level saves, and global save-all.

**Architecture:** Keep React + Express, but move settings into focused modules. Backend provides a `single-user local mode + local-bridge` contract (session + CSRF + audit + version conflict handling). Frontend uses centralized settings state with field-level dirty tracking and strict save orchestration (line-save -> module-save -> save-all dedupe).

**Tech Stack:** React 19, TypeScript, Tailwind, Express, sqlite, Vitest, Testing Library.

---

## Prerequisites

- **Working directory:** `/mnt/e/opencode/project`
- **Source-of-truth spec:** `docs/superpowers/specs/2026-04-01-settings-page-redesign-design.md`
- **Governance note:** `Product-Spec.md` and `Product-Spec-CHANGELOG.md` are release-facing mirrors; detailed implementation source remains the spec file above.
- **Before tasks:** `npm --prefix local-knowledge-base-agent install && npm --prefix local-knowledge-base-agent/backend install`
- **Test assumption:** All commands below run from project root with `--prefix local-knowledge-base-agent`.

---

## File Structure

- Modify: `Product-Spec.md`
- Modify: `Product-Spec-CHANGELOG.md`
- Modify: `local-knowledge-base-agent/backend/tsconfig.json`
- Create/Delete: `local-knowledge-base-agent/backend/__typecheck_probe__.ts`
- Create: `local-knowledge-base-agent/backend/settings-types.ts`
- Create: `local-knowledge-base-agent/backend/settings-validators.ts`
- Create: `local-knowledge-base-agent/backend/settings-validators.test.ts`
- Create: `local-knowledge-base-agent/backend/domain-guard.ts`
- Create: `local-knowledge-base-agent/backend/domain-guard.test.ts`
- Create: `local-knowledge-base-agent/backend/settings-store.ts`
- Create: `local-knowledge-base-agent/backend/settings-store.test.ts`
- Create: `local-knowledge-base-agent/backend/config-import-export-reset-saveall.test.ts`
- Create: `local-knowledge-base-agent/backend/settings-auth.ts`
- Create: `local-knowledge-base-agent/backend/settings-auth.test.ts`
- Create: `local-knowledge-base-agent/backend/key-security.ts`
- Create: `local-knowledge-base-agent/backend/key-security.test.ts`
- Create: `local-knowledge-base-agent/backend/storage-bridge.ts`
- Create: `local-knowledge-base-agent/backend/storage-bridge.test.ts`
- Modify: `local-knowledge-base-agent/backend/server.ts`
- Create: `local-knowledge-base-agent/src/settings/types.ts`
- Create: `local-knowledge-base-agent/src/settings/validators.ts`
- Create: `local-knowledge-base-agent/src/settings/validators.test.ts`
- Create: `local-knowledge-base-agent/src/settings/useSettingsState.ts`
- Create: `local-knowledge-base-agent/src/settings/useSettingsState.test.tsx`
- Create: `local-knowledge-base-agent/src/components/settings/SettingsLayout.tsx`
- Create: `local-knowledge-base-agent/src/components/settings/UIPreferencesCard.tsx`
- Create: `local-knowledge-base-agent/src/components/settings/ModelConfigCard.tsx`
- Create: `local-knowledge-base-agent/src/components/settings/StorageCard.tsx`
- Create: `local-knowledge-base-agent/src/components/settings/ConfirmDialog.tsx`
- Create: `local-knowledge-base-agent/src/components/settings/InlineStatus.tsx`
- Modify: `local-knowledge-base-agent/src/App.tsx`
- Modify: `local-knowledge-base-agent/src/App.test.tsx`

---

### Task 1: Finalize Product Spec/Changelog Baseline

**Files:**
- Modify: `Product-Spec.md`
- Modify: `Product-Spec-CHANGELOG.md`

- [ ] **Step 1: Update Product Spec with finalized architecture wording**
- [ ] **Step 2: Add changelog entry for settings-center iteration**
- [ ] **Step 3: Verify file content manually references `single-user local mode + local-bridge`**
- [ ] **Step 4: Commit**

```bash
git add Product-Spec.md Product-Spec-CHANGELOG.md
git commit -m "docs: lock settings architecture baseline"
```

### Task 2: Make Backend Typecheck Cover New Modules (TDD precondition)

**Files:**
- Modify: `local-knowledge-base-agent/backend/tsconfig.json`
- Create/Delete: `local-knowledge-base-agent/backend/__typecheck_probe__.ts`

- [ ] **Step 1: Create `backend/__typecheck_probe__.ts` with intentional type error**
- [ ] **Step 2: Run backend lint to confirm new file is NOT checked yet**

Run: `npm --prefix local-knowledge-base-agent run lint:backend`  
Expected: PASS even when new backend file has type issue (proves bad include scope).

- [ ] **Step 3: Expand backend tsconfig include to `*.ts` modules under backend root**
- [ ] **Step 4: Re-run backend lint and verify probe is now typechecked (must fail)**

Run: `npm --prefix local-knowledge-base-agent run lint:backend`  
Expected: FAIL before fixing temp issue, PASS after fix.

- [ ] **Step 5: Remove `backend/__typecheck_probe__.ts` and rerun lint (must pass)**

Run: `npm --prefix local-knowledge-base-agent run lint:backend`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add local-knowledge-base-agent/backend/tsconfig.json
git commit -m "chore: expand backend tsconfig include for settings modules"
```

### Task 3: Backend Provider Validation Contracts (TDD)

**Files:**
- Create: `local-knowledge-base-agent/backend/settings-types.ts`
- Create: `local-knowledge-base-agent/backend/settings-validators.ts`
- Create: `local-knowledge-base-agent/backend/settings-validators.test.ts`
- Create: `local-knowledge-base-agent/backend/domain-guard.ts`
- Create: `local-knowledge-base-agent/backend/domain-guard.test.ts`

- [ ] **Step 1: Write failing tests for URL/key/provider validation matrix**

```ts
it('rejects non-https for openai/siliconflow/gemini')
it('allows custom http localhost/private network with risk flag')
it('returns provider-specific key format errors')
it('applies DNS timeout=2s and maxRetries=2 for custom domain checks')
it('uses 60s DNS cache TTL and rejects unstable rebinding results')
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm --prefix local-knowledge-base-agent test -- backend/settings-validators.test.ts backend/domain-guard.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement minimal validator logic and typed error codes**
- [ ] **Step 4: Re-run test to verify GREEN**

Run: `npm --prefix local-knowledge-base-agent test -- backend/settings-validators.test.ts backend/domain-guard.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add local-knowledge-base-agent/backend/settings-types.ts local-knowledge-base-agent/backend/settings-validators.ts local-knowledge-base-agent/backend/settings-validators.test.ts local-knowledge-base-agent/backend/domain-guard.ts local-knowledge-base-agent/backend/domain-guard.test.ts
git commit -m "test+feat: add provider-aware settings validators"
```

### Task 4: Backend Store + Migration + Versioning (TDD)

**Files:**
- Create: `local-knowledge-base-agent/backend/settings-store.ts`
- Create: `local-knowledge-base-agent/backend/settings-store.test.ts`
- Modify: `local-knowledge-base-agent/backend/server.ts`

- [ ] **Step 1: Write failing migration/store tests**

```ts
it('migrates model_config to provider_configs and preferences tables')
it('returns /api/config/all with maskedKey only')
it('returns maskedKey in format: first3 + fixed-mask + last2')
it('enforces version bump and 409 conflict on stale version')
it('patches /api/config/ui and persists language/theme immediately')
it('patches /api/config/provider/:providerId with version checks')
it('patches /api/config/storage with version checks')
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm --prefix local-knowledge-base-agent test -- backend/settings-store.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement store tables, migration, version conflict checks, and PATCH endpoint handlers (`ui/provider/storage`)**
- [ ] **Step 4: Re-run tests and backend lint**

Run: `npm --prefix local-knowledge-base-agent test -- backend/settings-store.test.ts && npm --prefix local-knowledge-base-agent run lint:backend`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add local-knowledge-base-agent/backend/settings-store.ts local-knowledge-base-agent/backend/settings-store.test.ts local-knowledge-base-agent/backend/server.ts
git commit -m "feat: add settings store migration and optimistic versioning"
```

### Task 5: Single-User Auth + CSRF + Audit Guards (TDD)

**Files:**
- Create: `local-knowledge-base-agent/backend/settings-auth.ts`
- Create: `local-knowledge-base-agent/backend/settings-auth.test.ts`
- Modify: `local-knowledge-base-agent/backend/server.ts`

- [ ] **Step 1: Write failing tests for protected route matrix**

```ts
it('blocks protected settings route without session token')
it('blocks protected settings route without csrf token')
it('attaches requestId and actor info to audit context')
it('enforces auth+csrf on all protected routes from spec matrix')
```

- [ ] **Step 1.1: Route matrix to assert explicitly**

`PATCH /api/config/provider/:providerId`, `POST /api/config/provider/:providerId/key-token`, `POST /api/config/provider/:providerId/key-reveal`, `PATCH /api/config/storage`, `POST /api/config/save-all`, `POST /api/config/import`, `POST /api/config/reset-default`, `POST /api/storage/open`, `POST /api/storage/cache/clear`

- [ ] **Step 2: Run tests to verify fail**

Run: `npm --prefix local-knowledge-base-agent test -- backend/settings-auth.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement minimal middleware and audit context helper**
- [ ] **Step 4: Re-run tests to pass**

Run: `npm --prefix local-knowledge-base-agent test -- backend/settings-auth.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add local-knowledge-base-agent/backend/settings-auth.ts local-knowledge-base-agent/backend/settings-auth.test.ts local-knowledge-base-agent/backend/server.ts
git commit -m "feat: enforce single-user session and csrf guards for settings"
```

### Task 6: Key Token/Reveal Flow + Error Matrix (TDD)

**Files:**
- Create: `local-knowledge-base-agent/backend/key-security.ts`
- Create: `local-knowledge-base-agent/backend/key-security.test.ts`
- Modify: `local-knowledge-base-agent/backend/server.ts`

- [ ] **Step 1: Write failing tests for `key-token` and `key-reveal` endpoints**

```ts
it('issues one-time token with 60s ttl')
it('returns KEY_TOKEN_USED after single use')
it('returns KEY_TOKEN_EXPIRED after ttl')
it('returns KEY_TOKEN_PROVIDER_MISMATCH on wrong provider')
it('limits reveal/copy to 5 requests per provider per minute')
it('writes audit entry for reveal and copy actions with requestId/provider/actor/result')
it('purges audit events older than 180 days and keeps newer events')
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm --prefix local-knowledge-base-agent test -- backend/key-security.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement token store + explicit 5/min/provider limiter + audited copy contract (`copy` uses reveal payload then logs copy action) + 180-day retention purge**
- [ ] **Step 4: Re-run tests to pass**

Run: `npm --prefix local-knowledge-base-agent test -- backend/key-security.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add local-knowledge-base-agent/backend/key-security.ts local-knowledge-base-agent/backend/key-security.test.ts local-knowledge-base-agent/backend/server.ts
git commit -m "feat: add secure one-time key reveal endpoints"
```

### Task 7: Provider Test-Connection Endpoint (TDD)

**Files:**
- Modify: `local-knowledge-base-agent/backend/server.ts`
- Modify: `local-knowledge-base-agent/backend/settings-store.test.ts`

- [ ] **Step 1: Write failing tests for `/api/config/provider/:providerId/test` (URL+Key+model all required)**
- [ ] **Step 1.1: Add failing tests for test-connection timeout=10s and retry-once with 500ms backoff**
- [ ] **Step 1.2: Add failing tests for retry exhaustion error mapping**
- [ ] **Step 2: Run tests to verify fail**

Run: `npm --prefix local-knowledge-base-agent test -- backend/settings-store.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement minimal endpoint behavior and error code mapping**
- [ ] **Step 4: Re-run tests to pass**

Run: `npm --prefix local-knowledge-base-agent test -- backend/settings-store.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add local-knowledge-base-agent/backend/server.ts local-knowledge-base-agent/backend/settings-store.test.ts
git commit -m "feat: add provider test-connection endpoint contract"
```

### Task 8: Provider Models Endpoint (TDD)

**Files:**
- Modify: `local-knowledge-base-agent/backend/server.ts`
- Modify: `local-knowledge-base-agent/backend/settings-store.test.ts`

- [ ] **Step 1: Write failing tests for `/api/config/provider/:providerId/models` (`remote/cache/isStale`)**
- [ ] **Step 2: Run tests to verify fail**

Run: `npm --prefix local-knowledge-base-agent test -- backend/settings-store.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement minimal models endpoint with stale metadata**
- [ ] **Step 4: Re-run tests to pass**

Run: `npm --prefix local-knowledge-base-agent test -- backend/settings-store.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add local-knowledge-base-agent/backend/server.ts local-knowledge-base-agent/backend/settings-store.test.ts
git commit -m "feat: add provider models endpoint with cache metadata"
```

### Task 9: Storage Bridge Endpoints (TDD)

**Files:**
- Create: `local-knowledge-base-agent/backend/storage-bridge.ts`
- Create: `local-knowledge-base-agent/backend/storage-bridge.test.ts`
- Modify: `local-knowledge-base-agent/backend/server.ts`

- [ ] **Step 1: Write failing tests for `/api/storage/open` and `/api/storage/cache/clear`**
- [ ] **Step 2: Run tests to verify fail**

Run: `npm --prefix local-knowledge-base-agent test -- backend/storage-bridge.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement minimal bridge helpers and endpoint wiring**
- [ ] **Step 4: Re-run tests + backend lint**

Run: `npm --prefix local-knowledge-base-agent test -- backend/storage-bridge.test.ts && npm --prefix local-knowledge-base-agent run lint:backend`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add local-knowledge-base-agent/backend/storage-bridge.ts local-knowledge-base-agent/backend/storage-bridge.test.ts local-knowledge-base-agent/backend/server.ts
git commit -m "feat: add storage local-bridge open and cache clear endpoints"
```

### Task 10: Import/Export/Reset/Save-All Contracts (TDD)

**Files:**
- Modify: `local-knowledge-base-agent/backend/server.ts`
- Modify: `local-knowledge-base-agent/backend/settings-store.ts`
- Create: `local-knowledge-base-agent/backend/config-import-export-reset-saveall.test.ts`

- [ ] **Step 1: Add failing tests for export without plaintext keys**
- [ ] **Step 2: Add failing tests for import schemaVersion handling (accept 1.x, reject higher)**
- [ ] **Step 3: Add failing tests for reset scope/target behavior**
- [ ] **Step 4: Add failing tests for save-all field-level failedItems payload**
- [ ] **Step 5: Run tests to verify fail**

Run: `npm --prefix local-knowledge-base-agent test -- backend/config-import-export-reset-saveall.test.ts`  
Expected: FAIL.

- [ ] **Step 6: Implement export endpoint only (no plaintext key) and rerun RED/GREEN for export tests**
- [ ] **Step 6.1: Run `npm --prefix local-knowledge-base-agent test -- backend/config-import-export-reset-saveall.test.ts` (export assertions GREEN)**
- [ ] **Step 7: Implement import endpoint only (`schemaVersion` + `dryRun`) and rerun RED/GREEN for import tests**
- [ ] **Step 7.1: Run `npm --prefix local-knowledge-base-agent test -- backend/config-import-export-reset-saveall.test.ts` (import assertions GREEN)**
- [ ] **Step 8: Implement reset endpoint only (`scope/target`) and rerun RED/GREEN for reset tests**
- [ ] **Step 8.1: Run `npm --prefix local-knowledge-base-agent test -- backend/config-import-export-reset-saveall.test.ts` (reset assertions GREEN)**
- [ ] **Step 9: Implement save-all endpoint only (field-level `failedItems`) and rerun RED/GREEN for save-all tests**
- [ ] **Step 9.1: Run `npm --prefix local-knowledge-base-agent test -- backend/config-import-export-reset-saveall.test.ts` (save-all assertions GREEN)**

Run: `npm --prefix local-knowledge-base-agent test -- backend/config-import-export-reset-saveall.test.ts`  
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add local-knowledge-base-agent/backend/server.ts local-knowledge-base-agent/backend/settings-store.ts local-knowledge-base-agent/backend/config-import-export-reset-saveall.test.ts
git commit -m "feat: implement settings import export reset and save-all contracts"
```

### Task 11: Frontend Settings State + Validation Engine (TDD)

**Files:**
- Create: `local-knowledge-base-agent/src/settings/types.ts`
- Create: `local-knowledge-base-agent/src/settings/validators.ts`
- Create: `local-knowledge-base-agent/src/settings/validators.test.ts`
- Create: `local-knowledge-base-agent/src/settings/useSettingsState.ts`
- Create: `local-knowledge-base-agent/src/settings/useSettingsState.test.tsx`

- [ ] **Step 1: Write failing FE validator tests mirroring backend rules**
- [ ] **Step 2: Run validator tests (RED)**

Run: `npm --prefix local-knowledge-base-agent test -- src/settings/validators.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement minimal FE validators + warning flags**
- [ ] **Step 4: Write failing state-hook tests for dirty tracking and save dedupe**
- [ ] **Step 5: Run hook tests (RED)**

Run: `npm --prefix local-knowledge-base-agent test -- src/settings/useSettingsState.test.tsx`  
Expected: FAIL.

- [ ] **Step 6: Implement minimal hook logic to satisfy current failing assertions**
- [ ] **Step 7: Re-run hook tests (GREEN)**

Run: `npm --prefix local-knowledge-base-agent test -- src/settings/useSettingsState.test.tsx`  
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add local-knowledge-base-agent/src/settings/types.ts local-knowledge-base-agent/src/settings/validators.ts local-knowledge-base-agent/src/settings/validators.test.ts local-knowledge-base-agent/src/settings/useSettingsState.ts local-knowledge-base-agent/src/settings/useSettingsState.test.tsx
git commit -m "test+feat: add frontend settings state and validation engine"
```

### Task 12: Build 3-Card Settings UI + Critical Interactions (TDD)

**Files:**
- Create: `local-knowledge-base-agent/src/components/settings/SettingsLayout.tsx`
- Create: `local-knowledge-base-agent/src/components/settings/UIPreferencesCard.tsx`
- Create: `local-knowledge-base-agent/src/components/settings/ModelConfigCard.tsx`
- Create: `local-knowledge-base-agent/src/components/settings/StorageCard.tsx`
- Create: `local-knowledge-base-agent/src/components/settings/ConfirmDialog.tsx`
- Create: `local-knowledge-base-agent/src/components/settings/InlineStatus.tsx`
- Modify: `local-knowledge-base-agent/src/App.tsx`
- Modify: `local-knowledge-base-agent/src/App.test.tsx`

- [ ] **Step 1: Add failing UI tests for 3 independent cards and visual markers**
- [ ] **Step 2: Add failing tests for language/theme instant apply**
- [ ] **Step 3: Add failing tests for provider switch unsaved prompt flow**
- [ ] **Step 4: Add failing tests for top toolbar import/export/reset buttons**
- [ ] **Step 5: Add failing tests for bottom fixed save-all bar and partial-success banner**
- [ ] **Step 6: Add failing tests for strict dialog order (`离页拦截 > 二次确认 > 普通提示`) and single-blocking-dialog queue behavior**
- [ ] **Step 6.1: Add failing tests for model hover tooltip (`description`) and online/offline status dot (`isOnline`)**
- [ ] **Step 7: Run App tests (RED)**

Run: `npm --prefix local-knowledge-base-agent test -- src/App.test.tsx`  
Expected: FAIL.

- [ ] **Step 8: Implement layout and cards minimally to pass first assertions**
- [ ] **Step 9: Implement confirm dialogs + loading/success/error states**
- [ ] **Step 10: Implement non-Chromium fallback behavior in Storage card**
- [ ] **Step 11: Re-run App tests (GREEN)**

Run: `npm --prefix local-knowledge-base-agent test -- src/App.test.tsx`  
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add local-knowledge-base-agent/src/components/settings/SettingsLayout.tsx local-knowledge-base-agent/src/components/settings/UIPreferencesCard.tsx local-knowledge-base-agent/src/components/settings/ModelConfigCard.tsx local-knowledge-base-agent/src/components/settings/StorageCard.tsx local-knowledge-base-agent/src/components/settings/ConfirmDialog.tsx local-knowledge-base-agent/src/components/settings/InlineStatus.tsx local-knowledge-base-agent/src/App.tsx local-knowledge-base-agent/src/App.test.tsx
git commit -m "feat: deliver three-card settings UI and interaction states"
```

### Task 13: Final Verification + Release Notes

**Files:**
- Modify: `Product-Spec-CHANGELOG.md` (only if implementation deviates)

- [ ] **Step 1: Run full tests**

Run: `npm --prefix local-knowledge-base-agent test`  
Expected: PASS all suites.

- [ ] **Step 2: Run lint + build**

Run: `npm --prefix local-knowledge-base-agent run lint && npm --prefix local-knowledge-base-agent run build`  
Expected: PASS.

- [ ] **Step 3: Manual QA checklist**

- 3 card visual hierarchy, hover/edit/success/failure states
- language/theme real-time apply
- per-provider key mask/reveal/copy flow
- provider test/models/cache/stale behavior
- storage open/clear/stats behavior
- import/export/reset/save-all and 409 conflict behavior
- unsaved leave-page intercept

- [ ] **Step 4: Commit final wrap**

```bash
git add local-knowledge-base-agent/backend/server.ts local-knowledge-base-agent/src/App.tsx local-knowledge-base-agent/src/App.test.tsx Product-Spec-CHANGELOG.md
git commit -m "chore: finalize settings center verification and release notes"
```

---

## Verification Command Set

- `npm --prefix local-knowledge-base-agent test -- backend/settings-validators.test.ts`
- `npm --prefix local-knowledge-base-agent test -- backend/domain-guard.test.ts`
- `npm --prefix local-knowledge-base-agent test -- backend/settings-store.test.ts`
- `npm --prefix local-knowledge-base-agent test -- backend/config-import-export-reset-saveall.test.ts`
- `npm --prefix local-knowledge-base-agent test -- backend/settings-auth.test.ts`
- `npm --prefix local-knowledge-base-agent test -- backend/key-security.test.ts`
- `npm --prefix local-knowledge-base-agent test -- backend/storage-bridge.test.ts`
- `npm --prefix local-knowledge-base-agent test -- src/settings/validators.test.ts`
- `npm --prefix local-knowledge-base-agent test -- src/settings/useSettingsState.test.tsx`
- `npm --prefix local-knowledge-base-agent test -- src/App.test.tsx`
- `npm --prefix local-knowledge-base-agent test`
- `npm --prefix local-knowledge-base-agent run lint`
- `npm --prefix local-knowledge-base-agent run build`
