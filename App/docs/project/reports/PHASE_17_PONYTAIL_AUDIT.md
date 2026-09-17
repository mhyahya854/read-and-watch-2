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

---

# P17-T002 addendum — benchmark foundation review (2026-09-17)

Real review pass over the P17-T002 delta (schema, scoring, run records, private
corpus store, renderer, importer, tests).

## 1. Ladder decisions (what was NOT built)

| Consideration | Decision |
| --- | --- |
| Benchmark database / metadata framework | **Skipped.** Plain JSON manifests plus a filesystem layout. Add a database only if sample volume makes file scans measurably slow. |
| New npm dependency for image rendering or metrics | **Skipped.** Zero new dependencies. CER/WER are a Levenshtein DP in the repo; rendering uses a locally installed Chromium-family browser that the user already has. |
| New image/cropping library | **Skipped.** The importer ingests an already-selected page/region/line image; PDF page rendering stays with the application's existing PDF.js path. |
| HTML/canvas rasteriser built in-repo | **Skipped.** A shaping-capable browser already exists on the host; a hand-rolled Arabic shaper would have been a bug farm. |
| Duplicating Arabic mark handling in the benchmark | **Skipped.** `text-representations.mjs` (`ARABIC_COMBINING_MARKS`, `stripArabicMarks`, `countArabicMarks`) is reused; the benchmark adds only comparison-specific keys. |
| Separate scoring module per language | **Skipped.** One `scoring.mjs` with three clearly separated Arabic families and a per-engine Urdu function. |
| Per-engine result objects with a shared "winner" field | **Skipped — prohibited.** Engine comparison preserves both outputs and never selects one. |

## 2. Dead code found by the review pass and deleted in the same run

| Removed | Where | Reason |
| --- | --- | --- |
| `preservationReport()` | `server/ocr/benchmark/unicode.mjs` | Unused helper whose assertions the tests already make directly |
| `writeManifestFile()` | `server/ocr/benchmark/manifest.mjs` | Duplicate of `corpus-store.writeManifest()`, which is the one actually used |
| `sampleById()` | `server/ocr/benchmark/manifest.mjs` | Unused lookup helper |
| `fontDataUriBase64()`, `fontPathFor()` | `server/ocr/benchmark/render.mjs` | Unused wrappers around two standard-library calls |
| `normalizeLineEndings()` export | `server/ocr/benchmark/unicode.mjs` | Only used internally by `comparisonText()`; no longer part of the public surface |
| `definitionText()`, `syntheticSourceText()`, `syntheticSampleImageRef()` exports | `server/ocr/benchmark/synthetic-corpus.mjs` | Internal details of the builder, not part of the module contract |
| `ZERO_WIDTH_TEST` duplicate regex, barrel re-exports of the above | `unicode.mjs`, `benchmark/index.mjs` | Dead after the cleanup |

Two decorative constants were promoted into live enforcement instead of being
deleted: `expectedScoringModesFor(language)` now drives the `scoringModes` field
of every scored sample, and `FUTURE_VERIFICATION_STATES` now makes it an error
for a benchmark run to claim `CONSENSUS_VERIFIED`, `HUMAN_VERIFIED`, or
`FULLY_PROOFREAD`. `OCR_INTEGRATION_STATUS` became the single source of the
integration-status strings declared in the provider contract, so the enum and
the provider records cannot drift apart.

## 3. Deliberate simplifications with a named ceiling

- **Levenshtein alignment is O(n·m) over code points.** Ceiling: very long lines.
  The comparison is capped at `MAX_COMPARISON_CODE_POINTS = 4000` and throws
  `COMPARISON_TOO_LARGE` rather than hanging. Upgrade path: banded or Myers diff
  if real page-level scoring is ever needed.
- **Disagreement locations are truncated at 200 entries.** Ceiling: forensic
  detail on very long lines. Upgrade path: persist full diffs beside the record
  when a review workflow needs them.
- **Tashkeel metrics compare the ordered mark sequence per cluster, not per
  letter attachment.** Ceiling: a mark moved to a different letter can score as
  correct if the sequence still matches. Attachment mismatches are reported
  separately as evidence. Upgrade path: cluster-keyed alignment in Phase 18.
- **Split/merged line detection is not inferred.** The report carries explicit
  `splitLines`/`mergedLines` slots that a real segmenter comparison fills in;
  guessing them from counts would have produced a confident wrong number.
- **Synthetic rendering is single-threaded, one browser launch per fixture.**
  Ceiling: render time for large corpora (~7 s for 14 samples). Upgrade path:
  reuse one browser session if the corpus grows by orders of magnitude.

## 4. Not simplified (trust boundaries kept intact)

Ground-truth state gating, hash binding of source/rendered/truth, mandatory
provider enforcement, prohibition of engine substitution, font glyph-coverage
verification before rasterising, offline rendering flags, and the
outside-the-repository guard for private data were all kept at full strength.
Ponytail does not trade away validation or data-safety prevention.

## 5. Scope-creep check

No engine acceptance decision, no real-model benchmark, no confidence model, no
correction memory, no alignment algorithm, no Phase 18 work, no cross-platform
certification, and no UI redesign. Phase 17 remains `IN_PROGRESS` with P17-T004
as the next incomplete task.

---

# P17-T005 addendum — runtime-completion review (2026-09-17)

Real review pass over this run's delta: the specialist provider, provisioning
hooks, Urdu orchestration, reading order, line segmentation, derived search,
reader wiring, settings additions, and the seven new test suites.

## 1. Ladder decisions (what was NOT built)

| Consideration | Decision |
| --- | --- |
| A second OCR framework or a generic "AI orchestration" layer | **Skipped — prohibited by scope.** The specialist is a metadata binding plus provisioning hooks on the existing managed-provider factory. |
| A separate detector for line segmentation | **Skipped.** PP-OCRv5's own detection boxes supply line geometry; segmentation only assigns identities and order. |
| A second search index for OCR text | **Skipped.** Derived OCR text is searched from the existing per-provider records with a computed invalidation key; no parallel FTS database was added. |
| A learned layout/reading-order model | **Skipped.** Deterministic geometry plus declared language/region type, with named warnings for ambiguity. |
| Duplicated pairwise-diff code for runtime disagreement | **Skipped after the review found it.** `scoring.mjs` now has one `pairwiseDisagreementEvidence()` used by both benchmark comparison and runtime orchestration. |
| A duplicate artifact-verification hook for the specialist | **Skipped after the review found it.** The specialist hook re-implemented the shared default verification; it was deleted and the hardened default is used instead. |
| Provider-specific Settings screens | **Skipped.** The existing OCR section renders the specialist from the same inventory it already consumed, plus one Urdu status block. |
| Extra npm or Python dependencies in the application tree | **Skipped.** Zero npm changes. Python packages are installed only into the external per-revision runtime. |

## 2. Dead code and duplication found by this review pass and deleted in the same run

| Removed | Where | Replacement |
| --- | --- | --- |
| `emptyEngineRecord()` | `server/ocr/urdu-pipeline.mjs` | Deleted; never called. |
| Custom `verifyArtifacts()` hook | `server/ocr/specialist-provisioning.mjs` | The shared managed-provider verification (hash + size, abort-aware) already covers it; the upstream-hash comparison happens at download time. |
| Unused `language` parameter on `foldWithMap()` | `server/ocr/ocr-search.mjs` | Deleted; the Arabic folding rules are character-level and language-independent. |
| `modelRevisionPinned` result field | `server/ocr/managed-provider.mjs` | Deleted; `modelRevision` plus the activation provenance already carry it. |
| `SEARCH_PROVENANCE` re-export on the OCR service object | `server/ocr/index.mjs` | Deleted; callers import the constant from its module, and nothing consumed the re-export. |
| Duplicated pairwise-disagreement loop | `server/ocr/benchmark/scoring.mjs` | One private `pairwiseDisagreementEvidence()` shared by both comparison functions. |

## 3. Deliberate simplifications with a named ceiling

- **Reading order is rules, not inference.** Heading/caption/footnote handling
  relies on declared `regionType`; a page whose detector emits no region types
  still gets correct column and line ordering but no caption/footnote
  special-casing. Ceiling: semantic layout roles. Upgrade path: region typing in
  Phase 18 alignment work.
- **Search matching folds text character-wise.** This is what lets an
  unvocalised query return the original vocalised snippet. Ceiling: exotic
  compatibility forms and mixed-script ligatures that a fold cannot align.
  Upgrade path: reuse the benchmark's comparison keys if a real mismatch is
  ever measured.
- **Line crops are produced inside the Python driver per request.** No crop
  cache is kept on disk. Ceiling: repeated recognition of the same page.
  Upgrade path: cache line crops under the managed temp root keyed by
  segmentation revision, only if measured latency demands it.
- **The Urdu pipeline runs lines sequentially.** Ceiling: long pages on slow
  hardware. Upgrade path: bounded parallelism per engine, keeping deterministic
  line identity and cancellation semantics.

## 4. Not simplified (trust boundaries kept intact)

Path-segment and containment validation for line crops, source-hash binding,
per-engine persistence, session-token enforcement, staged verification before
activation, the no-fallback rule, partial-vs-complete semantics, cancellation
and no-orphan teardown, and the refusal to select a winner between mandatory
engines all remain at full strength. The Ponytail pass removed convenience code,
not safety code.

## 5. Scope-creep check

No benchmark was run, no accuracy claim was made, no engine was selected, no
Phase 18 reconciliation was implemented, no cross-platform certification was
started, and no unrelated module was refactored. P17-T004 and P17-T007 remain
open and Phase 18 remains `NOT_STARTED`.
