# English Boundary Protection Verification (2026-04-05)

> Status: Historical verification snapshot. Keep as prior evidence for chunking hardening, not as the latest regression baseline.

## Verification Metadata

- Execution environment:
  - `node`: `v25.8.1`
  - `npm`: `11.12.1`
- Verification document baseline commit: `7df00b5990a933560ab9e9e431cb156ad3359b9d`
- Feature baseline parent commit: `18288a58b65a4a75dcd33741560cbb25a2e61857`

## Verification Runs

### Run A (failed gate)

- Timestamp: `2026-04-05T10:02:40+08:00`
- Execution directory: `/mnt/e/opencode/project/local-knowledge-base-agent/.worktrees/english-boundary-protection`
- Commands and exit codes:
  - `npx vitest run backend/pipeline/document-chunker.test.ts` -> exit `0`
  - `npm run lint:backend` -> exit `2`
- Key output summary:
  - Chunker tests passed: `Test Files  1 passed (1)`, `Tests  34 passed (34)`.
  - Lint failed with: `server.ts(12,18): error TS2307: Cannot find module 'cors' or its corresponding type declarations.`

### Run B (fixed gate)

- Timestamp: `2026-04-05T10:25:34+08:00`
- Execution directory: `/mnt/e/opencode/project/local-knowledge-base-agent/.worktrees/english-boundary-protection`
- Pre-action before rerun:
  - Installed backend dependencies (`npm install --prefix backend`).
  - Scope note: environment repair only, no application code change.
- Commands and exit codes:
  - `npx vitest run backend/pipeline/document-chunker.test.ts` -> exit `0`
  - `npm run lint:backend` -> exit `0`
  - `PORT=18081 npm run start --prefix backend` -> process started successfully (manually terminated after startup log capture)
- Key output summary:
  - Chunker tests passed: `Test Files  1 passed (1)`, `Tests  34 passed (34)`.
  - Backend lint passed (`tsc --noEmit` completed without errors).
  - Startup log excerpt:
    - `Backend running at http://localhost:18081`
    - `english_boundary_protection=enabled`

## Retry/Failure Notes

- Run A lint failure is attributable to missing backend dependency resolution in the environment.
- Run B confirms the issue was environmental: after dependency installation, the same lint command passed with no code changes.

## Rollback Check

- Boundary protection rollback behavior remains controlled by `ENABLE_ENGLISH_BOUNDARY_PROTECTION`.
- When disabled (`false` / `off` / `0`), splitter falls back to legacy segmentation path (covered by boundary tests).

## Final Conclusion

- Regression gate is closed based on **Run B**: required tests pass, backend lint passes, and startup observability is confirmed with `english_boundary_protection=enabled` in startup logs.
