# Phase 17 Ponytail Audit (OCR Foundation)

Date: 2026-09-17
Mode: full (ladder enforced; stdlib and native first; shortest diff).

## 1. Decisions made while building (anti-bloat)

| Decision | Ladder rung | Evidence |
| --- | --- | --- |
| No new npm/Vite/Python dependency added to the Electron tree | 5 (already-installed / none needed) | `package.json` diff is empty; `tests/pdf-source-immutability.test.mjs` still asserts zero OCR packages |
| `node:child_process` + `node:readline` for the runtime boundary instead of an HTTP daemon or IPC framework | 3 (stdlib) | `server/ocr/runtime-bridge.mjs` imports only `node:child_process`, `node:crypto`, `node:readline` |
| One shared `createManagedOcrProvider()` factory instead of two near-identical provider files | 2 (already in this codebase / delete duplication) | `provider-unlimited-ocr.mjs` and `provider-paddleocr.mjs` are metadata bindings of ~10 lines each |
| One shared `handleOcrRequest()` used by both the packaged desktop service and the dev server | 2 | `electron/desktop-service.mjs` and `server/ocr-vite-plugin.mjs` both delegate to `ocr-http.mjs` |
| Activation via an atomic JSON pointer file, not symlinks | 4 (native/portable platform feature) | `engine-store.mjs` `writeActivation`; symlink semantics differ on Windows |
| Overlay positioning in CSS percentages instead of a JS layout pass | 4 | `lib/document/ocr-overlay.ts` |
| Code-point filter instead of a control-character regex | 3 (stdlib) | `stripControlCharacters()` in `text-representations.mjs` |
| No Docker requirement, no queue, no microservice, no "AI orchestration" layer | 1 (YAGNI) | Absent from the tree entirely |

## 2. Findings from the review pass (dead code removed)

The audit found real dead code introduced during the run. All were deleted in
the same run rather than documented for later:

| Removed | Where | Reason |
| --- | --- | --- |
| `readFileBytes()` | `server/ocr/managed-provider.mjs` | Unused export; the runtime bridge transports images by path/base64 |
| `unavailableState()` | `server/ocr/ocr-contract.mjs` | Unused helper; `OcrError` and structured returns cover every call site |
| `validateOcrSettings()` | `lib/settings/schema.ts` | Unused wrapper around `validateAppSettings({ ocr })` |
| `currentRevision()` | `server/ocr/update-manager.mjs` | Unused private helper |
| `failTimes`/`staged` bookkeeping and a `require()` in an ESM test | `tests/ocr-update-manager.test.mjs` | Unused scaffolding and an invalid CJS call in an ESM test file |

Additionally, `OCR_LIFECYCLE` was promoted from a decorative constant to the
single source of the lifecycle strings actually returned by the provider, so
magic strings and the exported enum cannot drift apart.

## 3. Deliberate simplifications with a named ceiling

- **Integrity verification uses hashes recorded at staging time.** This detects
  post-staging corruption but is not independent upstream attestation; upstream
  publishes no release checksums. Ceiling: supply-chain provenance. Upgrade path:
  add upstream release-checksum or signed-tag verification when upstream offers
  it.
- **Reading order is engine detection order.** No re-ordering or column
  reconstruction is attempted. Ceiling: multi-column layout quality. Upgrade
  path: Phase 18 region alignment work.
- **One page per runtime invocation for the shipped driver path.** No warm model
  pool is maintained between calls. Ceiling: repeated-page throughput. Upgrade
  path: a supervised long-lived bridge per installed revision if measured
  latency demands it.

## 4. Not simplified (trust boundaries kept intact)

Path-segment validation, source-hash binding, session-token enforcement on the
runtime boundary, artifact integrity verification, timeouts, cancellation, and
no-orphan teardown were all kept at full strength. Ponytail does not trade away
input validation or data-loss prevention.

## 5. Scope-creep check

Nothing beyond Phase 17's stated architecture was built. No Phase 18
verification, no confidence ensembling, no correction memory, no Phase 19
intelligence features, and no cross-platform certification work was started.
