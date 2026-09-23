# Project State

Bootstrap and historical foundation: COMPLETE and CERTIFIED.

Legacy Task 4: SUPERSEDED - DO NOT EXECUTE.

Last completed phase: `PHASE-16` - Performance, Security, and Reliability Hardening.

Current actionable phase: `PHASE-17` - OCR Foundation - Late Phase (`IN_PROGRESS`).

Exact next task: P17-T004 - populate/use representative lawful private real-world samples and run measured engine benchmarks sufficient for evidence-based acceptance. P17-T002 (benchmark framework: corpus workflow, ground-truth protocol, schemas, scoring, synthetic validation corpus) and P17-T005 (orchestration, regions, deterministic reading order, boxes, overlay, caching, cancellation) are complete. Real-engine benchmark evidence (P17-T004) and multi-language layout/source-preservation verification (P17-T007) remain outstanding. Do not start the post-OCR cross-platform certification stages yet.

Current Phase 17 evidence (2026-09-23 continuation): the application's resolved external benchmark root contains 17 registered candidates from 10 source hashes (5 English, 4 Arabic, 6 Urdu, 2 English/Arabic mixed; 14 PAGE, 2 LINE, 1 REGION). All 17 images received an assistant visual assessment; five drafts were manually transcribed from images and one other had a punctuation correction, but every truth remains DRAFT, none is locked or FINAL, and no formal provider run exists. Seven original drafts came from native text and nine originally needed manual transcription; the remaining exact human-review work is in one private review pack. Source and rendered-image hashes matched on the initial audit. No explicit lawful-use declaration exists. The new REGION and corrected low-contrast label improve coverage, but representative acceptance coverage is not approved. This host has Intel Arc graphics, no supported NVIDIA CUDA device, and no activated OCR runtime/model under the resolved external root. The accepted PP-OCRv5 CPU pins and specialist short runtime-root implementation remain in source; earlier smoke outcomes were not reproduced from the currently resolved evidence root. A proposed P17-G002 rule now exists but needs user approval and real measured evidence. P17-T004, P17-T007, and P17-G002 remain open; Phase 18 remains NOT_STARTED.

P17-T005 runtime-completion results (2026-09-17, second Phase 17 run):

- Corrected the P17-T002 wording without reopening or renumbering any task: P17-T002 is the benchmark *framework* (lawful/private corpus workflow, ground-truth protocol, schemas, scoring utilities, synthetic validation corpus) and stays COMPLETE; P17-T004 is *populating representative lawful private real-world samples and running measured engine benchmarks* and stays INCOMPLETE. `DECISIONS.md` D-055.
- Integrated the mandatory Urdu Nastaliq specialist `qandeelasim13/urdu-ocr-trocr-si26` (provider id `urdu-nastaliq-trocr`, pinned revision `a9ef072320b50014f6df7ed9db807810157a410e`) through the existing provider architecture: a thin adapter, Hugging Face revision resolution, transactional stage/verify/activate/rollback hooks, and real LINE recognition in the shipped `engine_driver.py`. No second OCR framework, no fork, no weight bundling.
- The specialist advertises LINE only, exactly as its model card documents, and refuses PAGE/REGION with `UNSUPPORTED_UNIT`. Weights are downloaded on user action from the public revision into external storage, verified against the published upstream hash, and activated only after integrity, contract, and synthetic smoke checks.
- Implemented the mandatory dual-engine Urdu runtime (`urdu-pipeline.mjs`): PP-OCRv5 supplies detection geometry and recognition, the specialist recognises the same line crops keyed to identical page/region/line identities, both raw outputs are preserved independently, disagreement is recorded as review evidence with no winner, and completion is withheld unless every mandatory engine completes. There is no fallback, backup, secondary, or substitution path.
- Implemented deterministic reading order (`reading-order.mjs`) and line segmentation (`line-segmentation.mjs`): column grouping before row grouping, script-direction-aware in-band ordering, headings before body, captions after their band, footnotes after the main flow, stable line identities, and named ambiguity warnings instead of invented numeric confidence.
- Wired derived OCR into book-local reader search with explicit provenance (`NATIVE_TEXT` vs `OCR_DERIVED`), native-text pages never duplicated from OCR, per-provider Urdu indexing with both provenances preserved, Arabic tashkeel preserved in displayed text while matching folds marks, and invalidation bound to source hash, engine revision, model revision, settings, line-segmentation revision, reading-order revision, and Urdu pipeline revision.
- Real specialist smoke test executed (SMOKE TEST ONLY, not benchmark evidence): the shipped driver loaded the exact pinned revision on CPU with Python 3.12.10, torch 2.14.0+cpu, and transformers 5.17.0, and ran a synthetic line fixture successfully; `model.safetensors` (1,335,747,032 bytes) matched the published upstream sha256 byte-for-byte. Evidence: `READ_WATCH_DATA_ROOT/ocr/evidence/smoke/`.
- Fixed real defects found by the run: Windows OCR pipes now pin UTF-8 (Arabic/Urdu text was otherwise re-encoded by the legacy code page); the specialist tokenizer is instantiated explicitly because newer transformers majors cannot auto-resolve this repository's tokenizer config; the managed-provider composition no longer freezes `version`/`modelRevision` into nulls (which had silently disabled revision-based cache invalidation); staged-update failures preserve their specific structured state.
- Honest limits: no accuracy, CER, WER, speed, or VRAM figure is claimed. The app-managed staged specialist runtime cannot be provisioned on this host while `LongPathsEnabled = 0` (structured `UNSUPPORTED_PLATFORM`, activation pointer untouched, no partial runtime left behind). Unlimited-OCR still requires CUDA, and PP-OCRv5 still fails in this host's Paddle 3.3.1 PIR/oneDNN CPU path.
- Automated evidence: `npm test` 337 -> 409 passing, 0 failing; `npx tsc --noEmit` PASS; `npm run lint` PASS; `npm run build` PASS. Graphify (0.9.57, real incremental run): 2,074 nodes / 4,926 edges / 92 communities / 0 import cycles / 0 unverified / 0 dangling; 431 OCR-related nodes mapped. Ponytail: 6 dead or duplicated items removed in the same run, zero new dependencies, trust boundaries untouched.

- Content commit `722bf403d759d82cecc0f43ef98c8a679aa1e00f` was pushed normally to `origin/master` (no force, no history rewrite) and verified against live GitHub raw content and the GitHub API: every new module and test suite exists remotely, the remote contract requires both Urdu providers with no fallback identifier, the remote tree contains zero weights/caches/runtimes, and remote governance still reports `PHASE-17 IN_PROGRESS` (next task `P17-T004`), `PHASE-18 NOT_STARTED`, and Arch/Ubuntu/macOS `NOT_STARTED`.

P17-T002 benchmark foundation results (2026-09-17):

- Recorded the explicit user decision that **Urdu OCR is a mandatory multi-engine pipeline**: PP-OCRv5 Arabic-script recognition AND the dedicated Nastaliq specialist `qandeelasim13/urdu-ocr-trocr-si26`, both required, both raw outputs preserved. No fallback chain, no backup provider, no automatic substitution, and no majority-vote truth anywhere in OCR (`DECISIONS.md` D-054, `MASTER_PLAN.md` Phase 17 correction).
- Published the canonical protocol `docs/project/OCR_BENCHMARK_PROTOCOL.md`: privacy, lawful sourcing, corpus categories, sample identity, manifest schema, ground-truth states, mandatory-provider policy, Arabic three-family metrics, per-engine Urdu metrics, Urdu disagreement records, the line-level specialist contract and its documented limitations, mixed-language pages, layout/reading-order truth, provenance binding, completion states, and acceptance limitations.
- Implemented the benchmark foundation under `App/app/server/ocr/benchmark/`: corpus/manifest/ground-truth schema and validation, deterministic Unicode comparison rules, transparent scoring (CER, WER, exact match, line preservation; Arabic huroof / tashkeel / fully-vocalised families; per-engine Urdu metrics with Urdu-specific character analysis), run and group records with `COMPLETE` / `PARTIAL_ENGINE_FAILURE` / `BLOCKED` / `REVIEW_REQUIRED` / `MACHINE_TRANSCRIBED`, the hash-bound private corpus store, a font-coverage-checking offline renderer, and the synthetic-corpus builder.
- Created the private corpus layout under `READ_WATCH_DATA_ROOT/ocr/benchmark/` (corpus, ground-truth, manifests, runs per engine plus combined, reports, temp, fonts) and a store that refuses to create it inside the Git repository.
- Authored a 14-sample lawful synthetic starter corpus (English page + lines, Arabic page/region/line, Urdu page/region/five lines including an infrastructure-only sample, one mixed Urdu/English page) and rendered it for real with lawfully redistributable OFL-1.1 fonts (Noto Nastaliq Urdu, Noto Naskh Arabic, Noto Sans) whose sha256 and glyph coverage are verified before rasterising; rendering uses headless Chromium with DNS refused. Images, manifests, ground truth, and fonts stay outside Git.
- Registered the specialist's verified provenance and honest limits: model revision `a9ef072320b50014f6df7ed9db807810157a410e`, Apache-2.0 model card, no licence file in the project repository, training data including CC BY-NC-SA 4.0 material, upstream-reported CER 0.52, line-level input granularity, `integrationStatus: NOT_INTEGRATED`.
- Added tooling: `App/app/scripts/render-benchmark-fixtures.mjs` (lawful synthetic corpus rendering) and `App/app/scripts/import-benchmark-sample.mjs` (private sample registration from a lawful source with an editable, human-authored ground-truth draft).
- Automated evidence: `npm test` 303 -> 337 passing; 34 new P17-T002 tests cover all 38 required cases, including Urdu dual-engine enforcement, single-engine completion refusal, partial-engine failure preservation, no-substitution enforcement, disagreement-without-winner, ground-truth over agreement, line-level specialist identity, and no-fallback-semantics checks.
- Honest limits: no engine has been benchmarked (P17-T004 outstanding); the synthetic corpus is plumbing evidence and not acceptance evidence; Urdu cannot be called complete while the specialist is not integrated; English and PP-OCRv5 real-engine execution remain blocked on this host (no CUDA device; Paddle 3.3.1 PIR/oneDNN CPU failure).

Phase 17 implementation results (2026-09-17, in progress):

- Adopted the corrected durable sequence by explicit user authority: Phase 16 (Windows baseline) then Phase 17 OCR foundation then Phase 18 OCR verification, and only then the four cross-platform certification stages followed by final release certification. The permanent Windows/Linux/macOS requirement is unchanged and the historical Windows Stage 1 certification is preserved.
- Forked both authorised upstream engines under the project account without modifying them: `mhyahya854/Unlimited-OCR` (fork of `baidu/Unlimited-OCR`) and `mhyahya854/PaddleOCR` (fork of `PaddlePaddle/PaddleOCR`). Both forks track upstream `main` at the same commit as the official upstream head; no upstream source, directory, class, or history was renamed, reorganised, or rewritten.
- Implemented a Read & Watch-owned OCR provider contract with explicit structured states (engine/model not installed, unsupported hardware or platform, runtime unavailable, update failed, OCR failed, cancelled, unauthorised language) and explicit language routing: English to Unlimited-OCR, Arabic and Urdu to PP-OCRv5 Arabic-script recognition. No silent engine substitution exists.
- Implemented the usable-native-text decision gate first: pages whose PDF.js text layer is usable never invoke OCR. Native text always wins; only pages with no usable text layer are OCR candidates, and the source PDF is never altered.
- Implemented a supervised OCR runtime boundary outside the Node dependency tree (JSON-lines child process, session token, in-band cancellation, timeouts, guaranteed teardown so app shutdown leaves no orphan process). No public listener and no Docker requirement.
- Implemented the canonical OCR result schema (rawText, displayText, canonicalText, searchText, blocks, boxes, page index, language, provider, engine revision, model revision, confidence with honest "not supplied" reporting, source hash, timestamp, settings provenance) and a derived cache bound to the source hash, engine revision, model revision, language, and settings.
- Implemented the Arabic tashkeel requirement: display text is never Unicode-normalised (NFC reorders Arabic combining marks) and harakat are preserved; a separate diacritic-insensitive search key is derived for matching only. The official PP-OCRv5 Arabic dictionary (`ppocr/utils/dict/ppocrv5_arabic_dict.txt`) was inspected and confirmed to contain fatha, damma, kasra, shadda, sukun, all three tanween marks, superscript alef, Quranic marks, and the Urdu-specific letters used by both languages.
- Implemented transactional one-click engine updates: resolve official upstream revision, stage into a new version directory, verify artifact integrity, run staged health checks and smoke fixtures, validate the adapter contract, then atomically switch an activation pointer; otherwise keep the current revision, record the failure, and allow retry. Rollback to the previous revision is supported, and symbolic links are not used for activation.
- Added an OCR section to the existing Settings surface (enable, default language, update policy, per-provider status, installed revision, model revision, hardware/runtime notes, check for update, update, install, rollback, update all) plus a derived, clearly marked selectable OCR text overlay for pages without native text.
- Automated evidence: `npm test` 297 -> 303 passing tests; OCR suites cover routing, the native-text gate, tashkeel preservation, source immutability, cache invalidation, update staging/activation/rollback, corrupted-download rejection, cancellation, no-orphan shutdown, offline-only recognition, provenance, and settings-reset data safety.
- Real-engine smoke testing is hardware-bound: Unlimited-OCR upstream documents NVIDIA GPU/CUDA inference only and this host has no CUDA device, so English real-engine verification is BLOCKED BY CURRENT HARDWARE. No accuracy, speed, CER, WER, or tashkeel-accuracy number is claimed anywhere.

Phase 16 implementation results:

- Frozen performance, reliability, and security budgets and test specifications in `docs/project/HARDENING_BENCHMARKS.md`.
- Generated reproducible synthetic benchmark fixtures (151, 1,000, and 5,000 catalog items; 100-page benchmark PDF) strictly outside Git in `READ_WATCH_DATA_ROOT/hardening/phase-16/benchmarks/`.
- Measured and eliminated N+1 database queries in `server/library-store.mjs` via chunked batch fetching (`IN (?, ?, ...)`) across 6 auxiliary relational tables (properties, tags, assets, relationships, people, series). Achieved dramatic speedups:
  - 151 items: 123.72ms -> 6.40ms (19.3x speedup)
  - 1,000 items: 856.45ms -> 23.84ms (35.9x speedup)
  - 5,000 items: 4,336.08ms -> 132.08ms (32.8x speedup, beating the 500ms budget)
- Optimized FTS5 search statement preparation with lazy cached statement reuse in `server/search-store.mjs`.
- Security boundary hardening across desktop service and portability layers:
  - Loopback service validation (`electron/desktop-service.mjs`): strict `Host` and `Origin` whitelist rejection (403 Forbidden for non-local origins).
  - CSP enforcement: injected strict `DESKTOP_CSP` headers (`default-src 'self' 'unsafe-inline' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws:;`).
  - Session token authentication: required `X-ReadWatch-Session-Token` on sensitive desktop endpoints (`/api/desktop/resolve-open-file`).
  - Sanitized 500 server error responses with zero private filesystem path leaks.
  - Hardened path traversal defenses (`safeLibraryFile` in `desktop-service.mjs` and `assertSafePath` in `lib/portability/validation.ts`) with reparse point resolution (`realpathSync`), Alternate Data Stream (`:`) rejection, Windows device name defense (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`), and percent-encoded sequence blocking.
  - Strict regex containment (`^[a-zA-Z0-9_-]+$`) on canvas identifiers in `server/canvas-store.mjs`.
- Implemented tamper-evident backup verification:
  - Cryptographic SHA-256 payload checksum validation (`verifyBackupChecksums`) in `server/portability-store.mjs` for both preflight inspection and restore application.
- Expanded automated regression suite (`tests/malformed-and-fault-injection.test.mjs`):
  - 7 comprehensive tests covering malformed/truncated JSON resilience, future schema rejection, corrupted book rejection, SQLite transaction rollback with integrity check validation, atomic write `.tmp` recovery, backup tampering detection, and full round-trip restore into an isolated external target.
  - Total automated test count expanded from 222 to 229 passing tests.
- Completed comprehensive dependency, license, and reachability audit (`docs/project/UPSTREAM_AND_LICENSE_LEDGER.md` and `docs/project/TECHNOLOGY_LEDGER.md`):
  - 100% permissive production runtime dependencies (MIT, Apache-2.0, ISC) with zero copyleft contamination.
  - Reachability analysis for 16 dev/optional audit findings confirmed zero production reachability.
- Validated reproducible build and Windows desktop packaging:
  - Clean `npm run build` and `npm run desktop:pack` producing `dist-electron/win-unpacked/Read & Watch.exe` (201,233,408 bytes, SHA-256 recorded in external ledger).
- Authored Phase 16 Graphify AST audit (`docs/project/reports/PHASE_16_GRAPHIFY_AUDIT.md`) and Ponytail audit (`docs/project/reports/PHASE_16_PONYTAIL_AUDIT.md`).
- Authored comprehensive Phase 16 completion report (`docs/project/reports/PHASE_16_REPORT.md`).
- Recorded Decision D-052 in `DECISIONS.md`.
- Automated tests: **229/229 tests passing** across 32 suites (`npm test`).
- TypeScript compiler: **0 errors** (`npx tsc --noEmit`).
- Linter: **0 warnings, 0 errors** (`npm run lint`).
- Repository hygiene: **PASS** (`python scripts/check_repository_hygiene.py`).
- Project governance: **PASS** (`python scripts/validate_project_state.py`).
- Respected stop condition: stopped cleanly after Phase 16 closure without starting Phase 17 (OCR remains unstarted).

Phase 16 certification repair results (post-closure, 2026-09-15):

- Identified and fixed 4 clean-environment defects discovered during fresh-clone validation: synthetic EPUB fixture added (`tests/fixtures/epub/sample-book.epub`), defensive `mkdirSync` before `DatabaseSync` in `server/search-store.mjs` and `electron/desktop-service.mjs`, resilient empty-database handling in `createReaderStore`, and `isTablePresent('library_meta')` guard in `server/library-store.mjs`. Commits `daf726b`–`47c4fd7`.
- Fresh-clone validation at `47c4fd7`: `npm ci` PASS, `npm test` 229/229 PASS, `npx tsc --noEmit` PASS, `npm run lint` PASS, `npm run build` PASS, `npm run desktop:pack` PASS. Zero private data dependency. Repository hygiene PASS (314 paths). Project governance PASS (21 phases, 231 IDs).
- Build reproducibility: Build A and Build B from `47c4fd7` in isolated clone directories both produce 628 files (553 web + 75 electron). 417/431 common files bit-identical. All 14 SHA-256 differences explained by Vinext framework-generated random values (`BUILD_ID` UUID and `prerenderSecret`). Zero size differences. Zero personal path leakage in build outputs. Classification: `STRUCTURALLY REPRODUCIBLE WITH EXPLAINED FRAMEWORK NONDETERMINISM`.
- NSIS installer generated: `Read & Watch Setup 0.1.0.exe`, 195,706,134 bytes, SHA-256 `FBAA12C9EB86146E802FEA28BC16E4CAB0D97B4E328A15B7420CF94428F87CE3`, zero personal path leakage in binary.
- Clean Windows installation: **PASS** — Verified inside an official clean Windows 11 Pro Build 26200 VM in Oracle VirtualBox 7.2.18. Silent NSIS installation, cold launch (PID 6304), process tree and zero dev daemon isolation, loopback boundary enforcement, source fixture immutability, AppData persistence, synthetic backup/restore, and complete uninstall/reinstall cycle with data continuity all verified with 100% PASS. Host Windows Sandbox was evaluated and found unavailable on Windows 11 Home edition (informational host environment limitation; does not affect certification because the isolated clean VM fulfilled the clean-install gate).
- Graphify rerun on repaired source: **PASS** — Zero new import cycles, zero new privilege edges, graph topology unchanged (1,464 nodes, 3,343 edges, 60 communities). Delta documented in `docs/project/reports/PHASE_16_GRAPHIFY_AUDIT.md` §5.
- Ponytail rerun on repaired source: **PASS** — Zero new dependencies, zero speculative abstractions. Delta documented in `docs/project/reports/PHASE_16_PONYTAIL_AUDIT.md` §6.
- P16-T006 (Fresh Clone, Reproducibility, Packaging, Clean Install): Fresh-clone, reproducibility, packaging, and clean Windows install all **PASS**.
- P16-G003: Crash/transaction/backup/immutability/fresh-clone/reproducibility/clean-install all **PASS**.
- Phase 16 is **COMPLETE and FULLY CERTIFIED**. All active blockers cleared. Phase 17 remains strictly **NOT_STARTED**.
- Durable Cross-Platform Desktop Architecture established (`App/packaging/`):
  - Canonical Architecture: ONE shared application codebase (`App/app/`), THREE thin distribution layers (`packaging/windows/`, `packaging/linux/`, `packaging/macos/`).
  - Desktop Release Targets: Windows (NSIS, portable), Linux (Arch `.pkg.tar.zst`, Ubuntu/Debian `.deb`, AppImage), macOS (Apple Silicon arm64, Intel x64, `.dmg`, `.app`).
  - Pre-OCR Platform Certification Sequence (Hard Gate before Phase 17):
    1. Windows — **CERTIFIED** (30/30 Invariants Passed, 0 Failures). Certified inside clean isolated Windows 11 Pro Build 26200 VirtualBox reference VM (`ReadWatch-Windows-CrossPlatform-30`). Artifact: `Read & Watch Setup 0.1.0.exe` (252,674,455 bytes, SHA-256 `E2A9F16EC02214B50479AF89BDB7ED2DE5FA78C203A3C27D5F4DE181E9793F09`, Git commit `ada8b20205cfe3e51e461b0bc6e249e9b14d7408`). Complete evidence vault archived in `READ_WATCH_DATA_ROOT/cross-platform/windows/evidence/`. Formal report: `docs/project/reports/WINDOWS_CROSS_PLATFORM_CERTIFICATION.md`.
    2. Arch Linux — `NOT_STARTED` (Clean Arch Linux VirtualBox VM; native pacman `.pkg.tar.zst` + `.AppImage`)
    3. Ubuntu LTS — `NOT_STARTED` (Clean Ubuntu 24.04 LTS VirtualBox VM; Debian `.deb` + `.AppImage`)
    4. macOS — `NOT_STARTED` (Apple-backed runner / authentic macOS hardware; signed `.dmg` + `.app`)
    5. Phase 17 OCR Foundation — Sequenced strictly behind full 4-platform certification. Specification: `docs/project/CROSS_PLATFORM_DESKTOP_CERTIFICATION.md`.
- External vault artifacts in `READ_WATCH_DATA_ROOT/cross-platform/windows/evidence/` (30 invariant JSONs, results manifest, summary report, execution trace log, completion marker).
- Windows certification documented in `docs/project/reports/WINDOWS_CROSS_PLATFORM_CERTIFICATION.md` and `docs/project/CROSS_PLATFORM_DESKTOP_CERTIFICATION.md`.

Phase 15 implementation results:

- Conducted exhaustive data flow, network, permission, and third-party runtime inventory (`docs/project/PRODUCT_DATA_FLOW_INVENTORY.md`). Verified zero telemetry, zero analytics, zero cookies, zero external font/script CDNs, zero background outbound traffic.
- Authored truthful Privacy Policy (`app/privacy/page.tsx`): 18 comprehensive sections, Table of Contents, stable anchor IDs, local-first disclosure, external search transparency, and removal of stale "separate reader process" claims.
- Authored user-centric Terms & Conditions (`app/terms/page.tsx`): 15 structured sections, complete user ownership of notes and content, explicit backup responsibility, warranty and liability disclaimers, and standard open-source attribution without invented corporate entities.
- Established legal metadata constants in `lib/legal-metadata.ts` (`APP_VERSION = '0.1.0'`, `LEGAL_DOCUMENT_VERSION = '1.0.0'`, `LEGAL_EFFECTIVE_DATE = 'September 15, 2026'`).
- Added accessible Skip-to-Main-Content navigation anchor (`#main-content`) across `app/layout.tsx` and all product page templates.
- Implemented global application settings architecture:
  - Canonical data models and schemas in `lib/settings/types.ts` and `schema.ts`: appearance (theme, font scale), reading defaults (typography, line spacing, margins, layout), library defaults, and accessibility. Clamped ranges, enumerated value validation, and fail-closed `schemaVersion > 1` guard.
  - Persistent server store in `server/settings-store.mjs` with atomic writes to `user-data/app-settings.json` and resilient JSON corruption recovery to defaults.
  - Mounted `/api/settings` endpoints in Vite development plugin and Electron desktop service.
  - Interactive Settings Manager in `components/settings/settings-manager.tsx` mounted on `/settings`.
  - Machine-isolated portable settings export and import (`read-watch.settings` v1).
  - Hard-gated Settings Reset safety verification (`tests/settings-store.test.mjs` - `P15-G002` / Section 182): resetting preferences restores interface defaults without deleting or modifying books, notes, thoughts, annotations, bookmarks, canvases, diagrams, or backups.
- Completed first-run, add/import, empty, loading, and error states in `components/library-browser.tsx`:
  - Calm, informative empty states for Read and Watch collections with placement guidance and Settings links.
  - Desktop native "Open Book File..." action integrated with `DesktopOpenCoordinator`.
  - Desktop unregistered publication inspection modal with SHA-256 computation, format details, and clear non-destructive placement guidance.
  - 1-click "Reset filters" on 0-match search results.
- Executed whole-product visible copy and anti-vibe audit:
  - Eliminated all em dashes (`—`) across all user-facing JSX/TSX copy in `app/`, `components/`, and `lib/`.
  - Verified zero fake reviews, testimonials, ratings, metrics, avatars, user accounts, or cloud teasers.
  - Removed legacy Readest runtime references in `README.md`.
- Executed accessibility remediation:
  - Full keyboard focus order and dialog focus management (auto-focusing first element, trapping, and restoring focus to trigger on close in `components/ui/dialog.tsx`).
  - Added Escape key dismissal to all dialogs and modals.
  - Implemented `@media (prefers-reduced-motion: reduce)` and `[data-reduce-motion="reduce"]` CSS overrides.
  - Implemented high-contrast focus ring style (`[data-high-contrast-focus="true"]`).
- Generated external visual review evidence in `READ_WATCH_DATA_ROOT/visual-review/phase-15/` (`manifest.json`, `REVIEW_INDEX.md`).
- Passed Graphify audit (`docs/project/reports/PHASE_15_GRAPHIFY_AUDIT.md`) and Ponytail audit (`docs/project/reports/PHASE_15_PONYTAIL_AUDIT.md`).
- Recorded D-051 in `DECISIONS.md`.
- Automated tests: **222/222 tests passing** across entire test suite (`npm test`).
- TypeScript compiler: **0 errors** (`npx tsc --noEmit`).
- Linter: **0 warnings, 0 errors** (`npm run lint`).
- Repository hygiene: **PASS** (`python scripts/check_repository_hygiene.py`).
- Project governance: **PASS** (`python scripts/validate_project_state.py`).
- Respected stop condition: stopped cleanly after Phase 15 closure without starting Phase 16.

Phase 14 implementation results:

- Evaluated desktop shell candidates across 33 architectural criteria (`docs/project/DESKTOP_SHELL_EVALUATION.md`) and selected Outcome B: Electron 35.7.5 with Node.js 22.16.0 LTS (MIT) and electron-builder 26.15.3 (MIT).
- Preserved 100% architectural reuse of all 8 server stores with zero child processes or sidecar daemons.
- Implemented embedded loopback HTTP desktop service (`electron/desktop-service.mjs`) bound strictly to `127.0.0.1:0`.
- Established hardened, sandboxed preload bridge (`electron/preload.mjs`) exposing exactly 5 safe APIs on `window.readWatchDesktop` (`chooseBookFiles`, `chooseDataRoot`, `getAppPaths`, `openExternalHttps`, `onOpenFile` / `getPendingOpenFiles` / `resolveOpenFile`).
- Implemented single-instance lock (`app.requestSingleInstanceLock()`) and navigation security handlers in `electron/main.mjs`.
- Configured native Windows file associations for 8 publication formats (`.epub`, `.pdf`, `.mobi`, `.azw`, `.azw3`, `.fb2`, `.fbz`, `.cbz`) and mounted `DesktopOpenCoordinator` in `app/layout.tsx`.
- Produced NSIS installer (`Read & Watch Setup 0.1.0.exe`) and portable binary (`Read & Watch 0.1.0.exe`) with `deleteAppDataOnUninstall: false`.
- Updated repository hygiene and gitignore to forbid `dist-electron/` and installer binaries from Git.
- Authored canonical documentation: `docs/project/DESKTOP_SHELL_EVALUATION.md`, `docs/project/DESKTOP_NATIVE_BOUNDARY.md`, `docs/project/DESKTOP_INSTALL_AND_UPDATE.md`, and `docs/project/DESKTOP_THREAT_MODEL.md`.
- Automated tests: **219/219 tests passing** across entire test suite (`npm test`), including 6 new boundary integration tests.
- TypeScript compiler: **0 errors** (`npx tsc --noEmit`).
- Linter: **0 warnings, 0 errors** (`npm run lint`).
- Repository hygiene: **PASS** (`python scripts/check_repository_hygiene.py`).
- Desktop review evidence: `READ_WATCH_DATA_ROOT/desktop-review/phase-14/` and `visual-review/phase-14/` (`manifest.json`, `REVIEW_INDEX.md`).
- Source immutability: **151 local books 100% byte-identical**.
- Recorded D-050 in `DECISIONS.md`.
- Respected stop condition: stopped cleanly after Phase 14 closure without beginning Phase 15.

Phase 13 implementation results:

- Established calibrated 4-tier knowledge tool selection constitution (`docs/project/KNOWLEDGE_TOOL_SELECTION.md`): Native UI < Excalidraw < React Flow < Mermaid.
- Pinned `@xyflow/react@12.11.6` (MIT) for interactive semantic concept graphs, scoped strictly to `components/knowledge/concept-graph-canvas.tsx` as a transient client-side projection.
- Pinned `mermaid@12.0.0` (MIT) for text-defined technical diagrams, scoped strictly to `components/knowledge/mermaid-editor.tsx` with enforced `securityLevel: 'strict'`.
- Implemented canonical SQLite persistence in `server/knowledge-store.mjs`:
  - DDL tables: `knowledge_graphs`, `knowledge_nodes`, `knowledge_edges`, `mermaid_documents`.
  - Atomic file-first crash recovery mirrors in `user-data/knowledge/graphs/` and `user-data/knowledge/diagrams/`.
  - Optimistic concurrency control (`expectedRevision` with 409 Conflict rejection).
  - Soft-delete lifecycle tracking (`deleted_at_utc`).
  - Automated crash recovery reconstruction (`rebuildFromFiles()`).
  - Search invalidation integration (`notifySearchInvalidation()`).
- Implemented server-side deep link resolution (`resolveDeepLink()`) for 6 reference types: library items, document locations with anchors, annotations with quote preview, reader notes tab, Excalidraw canvases, and external web URLs. Unresolved links display a calm notice without crashing.
- Built Knowledge Hub dashboard (`app/knowledge/page.tsx`, `components/knowledge/knowledge-hub.tsx`) with 4 tabs: Concept Graphs, Text Diagrams, Standalone Canvases, and Tool Selection Guide.
- Built accessible alternative table/outline fallback view in `concept-graph-canvas.tsx` ensuring complete readability when visual graph cannot render.
- Integrated knowledge graphs and diagrams into derived search index (`server/search-store.mjs` FTS5 rebuild blocks 6 & 7).
- Integrated knowledge entities into Phase 12 portability system: backup bundles (`.rwbackup`), preflight conflict detection, restore application, and standalone `.rwgraph` / `.rwmermaid` exports.
- Automated tests: **213/213 tests passing** across entire test suite (`npm test`).
- TypeScript compiler: **0 errors** (`npx tsc --noEmit`).
- Linter: **0 warnings, 0 errors** (`npm run lint`).
- Repository hygiene: **PASS** (`check_repository_hygiene.py`).
- Project governance: **PASS** (`validate_project_state.py`).
- Graphify audit: **PASS** (`PHASE_13_GRAPHIFY_AUDIT.md`).
- Ponytail audit: **PASS** (`PHASE_13_PONYTAIL_AUDIT.md`).
- Respected stop condition: stopped after Phase 13 without beginning desktop packaging.

Phase 12 implementation results:

- Established versioned portable schema family (`PORTABILITY_SCHEMA_VERSION = 1`) in `lib/portability/types.ts`: `read-watch.annotations`, `read-watch.notes`, `read-watch-canvas-export`, `read-watch.library-metadata`, `read-watch.backup`.
- Implemented runtime validation, schema version guard, and security rules in `lib/portability/validation.ts` (rejection of directory traversal `..`, absolute drive letters, and root paths).
- Authored canonical schema specifications and operational guides: `docs/project/PORTABLE_SCHEMAS.md`, `docs/project/BACKUP_AND_RESTORE.md`, and `docs/project/REFLOWABLE_ANNOTATION_PORTABILITY.md`.
- Implemented core portability and export engine (`server/portability-store.mjs`):
  - Annotation exports: machine-readable JSON with SHA-256 checksum and human-readable Markdown projection.
  - Notes and Canvas exports: item thoughts, notes, canvas scenes, bidirectional deep links, and base64-encoded image assets.
  - Library metadata export: standalone catalog records and item properties.
  - Full unified backup bundle (`.rwbackup`): self-contained, lossless archive with cryptographic checksum manifests; original EPUB/PDF files are strictly excluded to preserve lean storage and avoid media mutation.
  - Safe annotated-PDF derivative export using exact-pinned `pdf-lib@1.17.1` (MIT), drawing semi-transparent highlight rectangles and an editorial comments summary page. Enforces strict refusal guard against source path overwrites and verifies post-export byte-identical and mtime immutability.
  - Restore engine with preflight inspection (`/api/portability/restore/preflight`), conflict breakdown (identical vs divergent), and flexible conflict resolution (`skip`, `overwrite`, `copy`).
  - Automatic post-restore search index rebuild: derived SQLite FTS5 search tables are excluded from backups and deterministically reconstructed on restore via `searchStore.rebuildIndex()`.
- Built user-facing Portability Settings panel (`components/settings/portability-settings.tsx`) mounted in `/settings` with Apple-style polish, backup download trigger, and preflight restore inspection dialog.
- Added in-context export affordances in Reader Top Toolbar (`components/reader/reader-toolbar.tsx`) and Study Browser (`components/study/study-browser.tsx`).
- Automated tests: **173/173 tests passing** across entire test suite (`npm test`).
- TypeScript compiler: **0 errors** (`npx tsc --noEmit`).
- Linter: **0 warnings, 0 errors** (`npm run lint`).
- Production build: **Successful** (`npm run build`).
- Repository hygiene: **PASS** (`check_repository_hygiene.py`).
- Project governance: **PASS** (`validate_project_state.py`).
- Graphify audit: **PASS** (`PHASE_12_GRAPHIFY_AUDIT.md`).
- Ponytail audit: **PASS** (`PHASE_12_PONYTAIL_AUDIT.md`).
- Visual review: `READ_WATCH_DATA_ROOT/visual-review/phase-12/` (`REVIEW_INDEX.md`, `manifest.json`).

Phase 11 implementation results:

- Implemented derived, rebuildable SQLite FTS5 search index (`server/search-store.mjs`) managing `search_index_fts` with `unicode61 remove_diacritics 0`, `search_index_records`, and `search_index_meta` (zero new external npm dependencies, 100% offline).
- Engineered safe query pipeline (`server/search-query.mjs`, `lib/search/query.ts`) that normalizes user inputs, escapes FTS5 syntax characters, and extracts structured snippet tokens for HTML-safe `<mark>` rendering.
- Built unified Study & Annotation Browser (`app/highlights/page.tsx`, `components/study/study-browser.tsx`) featuring truthful artifact counters (highlights, comments, bookmarks, canvases, notes, total), debounced search (`/` shortcut), multi-kind filters, book filter dropdown, and direct source jumps.
- Enhanced book-local reader search (`components/reader/reader-search.tsx`) with semantic chapter/section labels, CFI/page locations, accessible `<output aria-live="polite">` regions, and truthful missing-text notice for scanned PDFs without invoking OCR.
- Built reader selection context menu (`components/reader/reader-selection-menu.tsx`) mounted in `ReaderViewport` supporting instant Copy, Define hook (offline notice), Translate hook (offline notice), Send to Item Notes (markdown excerpt append with citation and optimistic conflict protection), and Send to Canvas (adding excerpt card element to linked Excalidraw scenes).
- Wired direct URL jump navigation (`/reader/:id?annotationId=...` and `?location=...`) with source hash verification and calm mismatch alerts.
- Wired synchronous incremental invalidation hooks across all canonical stores (`annotationStore`, `canvasStore`, `userDataStore`, `readerStore`, `libraryStore`).
- Automated tests: **167/167 tests passing** across entire test suite (`npm test`).
- TypeScript compiler: **0 errors** (`npx tsc --noEmit`).
- Linter: **0 warnings, 0 errors** (`npm run lint`).
- Production build: **Successful** (`npm run build`).
- Repository hygiene: **PASS** (`check_repository_hygiene.py`).
- Project governance: **PASS** (`validate_project_state.py`).
- Graphify audit: **PASS** (`PHASE_11_GRAPHIFY_AUDIT.md`).
- Ponytail audit: **PASS** (`PHASE_11_PONYTAIL_AUDIT.md`).
- Visual review: `READ_WATCH_DATA_ROOT/visual-review/phase-11/` (`REVIEW_INDEX.md`, `manifest.json`).

Phase 08 implementation results:

- Evaluated native-versus-legacy parity across all 151 real local publications (8 EPUBs, 143 PDFs) across 14 distinct reader behaviors (`BEH-01` through `BEH-14`); achieved 100% parity (747 parity matches, 1,208 native superior advantages, 0 parity gaps, 0 blocked items).
- Verified rollback capability in an isolated worktree (`%TEMP%\rw-rollback`) at pre-retirement anchor commit `81a9276c190b4795b7093c55d175d0b73276fde7` with 97/97 tests passing prior to altering active launcher paths.
- Retired the legacy Readest desktop launcher; completely eliminated `import { spawn } from 'node:child_process'` and all process launching logic from `reader-store.mjs`.
- Updated `reader-control.tsx` to navigate directly to `/reader/:itemId` with query parameter preservation (`?candidate=:id`) for multiple-candidate books, removing obsolete launch states.
- Safely removed `App/forks/readest/` (9,066 vendored files) from current Git HEAD, permanently resolving Windows `MAX_PATH` checkout failures caused by deep Android/Kotlin test directories and reducing tracked paths from 9,262 to 196.
- Preserved complete upstream provenance, AGPL-3.0 license records, and Git recovery instructions in `App/docs/project/PROVENANCE_READEST.md`, `UPSTREAM_AND_LICENSE_LEDGER.md`, and `TECHNOLOGY_LEDGER.md`.
- Decoupled PDF unit test fixtures by copying `sample-paper.pdf` and `sample-alice.pdf` to `App/app/tests/fixtures/pdf/`.
- Added retirement enforcement test `App/app/tests/no-active-readest.test.mjs` verifying zero child process spawning, zero `forks/readest` imports, and null `readerExecutable` (100/100 tests passing).
- Updated repository hygiene tooling (`check_repository_hygiene.py`, `test_repository_hygiene.py`) adding `App/forks/readest/` to `FORBIDDEN_PREFIXES`.
- Re-verified source immutability: all 151 real local book files remained 100% byte-identical (0 hash changes).
- Captured 18 visual review screenshots under `Read and Watch - Local Data/visual-review/phase-08/` with `manifest.json` and `REVIEW_INDEX.md`.
- Completed Graphify audit (831 nodes, 1687 edges, 40 communities, 0 import cycles, zero reachability to Readest) and Ponytail audit (9,066 files deleted, 0 new runtime dependencies).


Phase 07 implementation results:

- Unified the reflowable (Foliate-JS) and fixed-layout (Mozilla PDF.js) engines behind a single capability-driven Read & Watch reader interface (`App/app/app/reader/[id]/page.tsx`, `App/app/components/reader/`).
- Eliminated all format-conditional branching (`format === 'pdf'`, `isPdf`) across presentation components; reader chrome queries runtime capabilities (`canZoom`, `fontControls`, `textSearch`, `continuousLayout`, `canRotate`).
- Built modular reader component suite adhering strictly to the Warm Editorial design system: `ReaderShell`, `ReaderToolbar`, `ReaderSidebar`, `ReaderContents`, `ReaderSearch`, `ReaderBookmarks`, `ReaderSettingsDialog`, `ReaderViewport`, `ReaderStatus`.
- Implemented `ReaderHistory` with 50-entry bounded storage, consecutive location deduplication, forward truncation on branching navigation, and bi-directional Back/Forward stepping.
- Implemented canonical format-independent `Bookmark` model with atomic persistence to external data storage via `/api/reader/items/:id/bookmarks`.
- Implemented format-appropriate preferences and theming: Light, Warm, and Dark theme tokens (`.theme-warm`, `.theme-dark`), font family (Serif, Sans, Mono), font sizing (12–28px), line height, text alignment, and zoom (50%–300%) / rotation (90° increments) controls.
- Implemented accessible keyboard model (Arrow keys, Space bar, Ctrl+F, B for bookmarks, Esc to close modals/sidebars), touch swipe gesture handling, accessible `<dialog>` focus trapping, and error recovery states with retry and library return actions.
- Preserved complete engine invisibility: zero vendor chrome, toolbars, logos, or engine-native state storage.
- Reaffirmed Zero-OCR policy: image-only and scanned documents truthfully report lack of text capabilities, disabling search and displaying a clear "Image Scan" badge.
- Automated tests: 97/97 tests passing (5 new tests in `tests/reader-unified-experience.test.mjs` verifying history, bookmarks, preferences, error recovery, and zero format branching).
- Visual review: 101 responsive screenshots captured across Desktop, Tablet, and Mobile under `READ_WATCH_DATA_ROOT/visual-review/phase-07/` with `manifest.json` and `REVIEW_INDEX.md`.
- TypeScript 0 errors, oxlint 0 errors/warnings across 72 files, production build passing cleanly.
- Graphify: PASS - 828 nodes, 1703 edges, 60 communities, 0 import cycles.
- Ponytail: PASS - zero new npm dependencies, native Web/DOM APIs, zero dead code or premature abstractions.
- Phase 07 content commit `94aae776f8264aa53a8a8d70cae28e693d3cc0af` was pushed and verified on GitHub; the closure commit records that remote gate.

Starting Phase 07 local/remote HEAD: `9209598ab8ed5a25f9e14f74ae00d016c657086b`.

Phase 06 implementation results:

- Pinned official Mozilla PDF.js npm distribution: `"pdfjs-dist": "4.10.38"` (Apache-2.0, zero vulnerabilities); recorded in `App/docs/project/PROVENANCE_PDFJS.md`.
- Implemented production `PdfAdapter` under `App/app/lib/document/pdf-adapter.ts` fully conforming to the canonical `DocumentAdapter` contract with complete lifecycle state machine, metadata extraction, outline/TOC extraction, navigation, search with cancellation, selection, and versioned `pdf-geometry` text anchors (`schemaVersion: 1`).
- Implemented resolution-independent canvas rendering with `devicePixelRatio` backing store scaling, bounded by `MAX_CANVAS_DIMENSION = 8192` to prevent memory exhaustion on mobile and large zoom levels.
- Implemented synchronized `.textLayer` aligned directly to unscaled canvas CSS viewport with zero coordinate drift across zoom (0.25x - 5.0x) and orthogonal 90°/180°/270° rotation. Text selection overlay styled with the Phase 03 Warm Editorial palette.
- Enforced strict Zero-OCR policy: zero OCR dependencies, binaries, or background workers exist. Scanned/missing-text PDFs truthfully report lack of text capabilities, and the reader UI displays an "Image Scan" badge with disabled search.
- Added controlled local endpoints in `reader-vite-plugin.mjs` serving verified worker (`/api/reader/pdfjs/worker.mjs`), CMaps, and standard fonts with `X-Content-Type-Options: nosniff` and immutable caching headers, eliminating all third-party CDN dependencies.
- Refactored reader presentation layer at `App/app/app/reader/[id]/page.tsx` to be 100% capability-driven (`canZoom`, `canPaginate`, `canSearch`, `canAdjustFont`), eliminating format branching and passing the architectural audit.
- Source Immutability Gate passed: verified against real local publications (including local cookbook and library books). Confirmed 100% byte-identical SHA-256 hashes and modification timestamps before and after reader operations.
- Automated tests: 92/92 Node tests passing (23 new tests covering conformance, page geometry, features, edge cases, and source immutability).
- Visual review: 18 responsive screenshots captured across Desktop (1440x900), States, Tablet (1024x768), and Mobile (390x844) under `READ_WATCH_DATA_ROOT/visual-review/phase-06/` with `manifest.json` and `REVIEW_INDEX.md`.
- TypeScript 0 errors, oxlint 0 errors/warnings across 58 files, production build passing cleanly.
- Graphify: PASS - 730 nodes, 1405 edges, 51 communities, 0 import cycles.
- Ponytail: PASS - minimal dependency pin, zero Mozilla viewer bloat, zero OCR bloat, zero code bloat.
- Phase 06 content commit `5977f4a71f7a72db5a088683907bb1bc8152b357` was pushed and verified on GitHub; the closure commit records that remote gate.

Starting Phase 06 local/remote HEAD: `14d9ca74d46a24962776858f71fb24845f0a452b`.

Phase 05 implementation results:

- Pinned official upstream Foliate-JS commit `78914aef4466eb960965702401634c2cb348e9b1` (MIT); recorded in `App/forks/foliate-js/PROVENANCE.md`.
- Vendored core reflowable rendering modules under `App/forks/foliate-js/` with zero modifications to upstream code. Non-core demo UI, TTS, OPDS, and PDF modules omitted.
- Implemented `FoliateReflowableAdapter` under `App/app/lib/document/reflowable-adapter.ts` conforming strictly to the canonical `DocumentAdapter` contract with full lifecycle state machine, metadata extraction, hierarchical TOC tree, navigation, text search with cancellation, selection, and text anchor round-trips.
- Implemented `resource-boundary.ts` enforcing Zip-Slip defense, directory traversal rejection, safe URI scheme validation, and strict reader Content Security Policy (`STRICT_READER_CSP`).
- Added path-constrained server streaming endpoint `GET /api/reader/items/:id/file` with `X-Content-Type-Options: nosniff` in `reader-vite-plugin.mjs` and `reader-store.mjs`.
- Implemented minimal verification reader interface at `App/app/app/reader/[id]/page.tsx` styled entirely with Phase 03 design tokens; zero Foliate UI or branding.
- Enforced strict PDF phase boundary: fixed-layout PDF items yield explicit user notices directing to reflowable items, strictly reserving PDF.js for Phase 06.
- Source Immutability Gate passed: all 8 real local EPUB publications in `Read and Watch - Local Data/Read/Book` verified 100% byte-identical before and after reader operations.
- Automated tests: 69/69 Node tests passing (16 new tests covering conformance, resource boundary, format support, and restore/immutability).
- Visual review: 23 responsive screenshots captured across Desktop (1440x900), Tablet (1024x768), and Mobile (390x844) under `READ_WATCH_DATA_ROOT/visual-review/phase-05/` with `manifest.json` and `REVIEW_INDEX.md`.
- TypeScript 0 errors, oxlint 0 errors/warnings across 57 files, production build passing cleanly.
- Graphify: PASS - 636 nodes, 1269 edges, 29 communities, 0 import cycles.
- Ponytail: PASS - zero new npm dependencies, minimal server streaming surface, zero code bloat.
- Phase 05 content commit `bbe8ac094b89e47dfb8ee8c2b00be8377a6f5820` was pushed and verified on GitHub; the closure commit records that remote gate.

Starting Phase 05 local/remote HEAD: `a4c7d8f56d8932d4d6f10e4e5bc93b4d12b579f2`.

Phase 04 implementation results:

- Implemented canonical `DocumentAdapter` contract under `App/app/lib/document/` with full lifecycle states, TOC, navigation, search, selection, and anchor round-trips with `AbortSignal` cancellation.
- Implemented normalized `DocumentError` taxonomy with 15 discrete error codes and sanitized, path-safe error messaging.
- Implemented `DocumentCapabilities` boolean contract and standard capability profiles (`STANDARD_PDF_CAPABILITIES`, `STANDARD_REFLOWABLE_CAPABILITIES`).
- Implemented versioned outer envelopes (`DocumentLocation`, `TextAnchor`) with `schemaVersion: 1`, tagged union payloads (`page`, `semantic`, `progression`; `pdf-geometry`, `reflowable-range`), and SHA-256 source-hash verification.
- Built minimal `DocumentAdapterRegistry` with duplicate collision rejection and format factory lookup.
- Implemented `ReaderSession` capability-driven session controller with snapshot state subscriptions, eliminating format conditionals from UI components.
- Created concrete fixed-layout (`FakePdfAdapter`) and reflowable (`FakeReflowableAdapter`) test doubles.
- Universal 18-point conformance suite passed by both test doubles.
- Format-branching enforcement test suite passing with 0 violations across all presentation components and routes.
- Node tests 53/53, TypeScript 0 errors, oxlint 0 errors/warnings, production build passing, zero vulnerability audit passing.
- Graphify: PASS - 569 nodes, 1048 edges, 34 communities, 0 import cycles.
- Ponytail: PASS - zero new runtime dependencies, pure TypeScript implementation with native Node 24 ESM execution.
- Scope boundary verified: zero third-party rendering engines integrated; legacy Readest bridge preserved.
- Phase 04 content commit `fc807ebe52ee01d7c9b7af26bffe6123b21cb1a2` was pushed and verified on GitHub; the closure commit records that remote gate.

Starting Phase 04 local/remote HEAD: `3d550f3315d8885206531f8d07d07f94913e1f4e`.

Phase 03 implementation results:


- Unified design system implemented adhering strictly to `DESIGN_CONSTITUTION.md` (warm ivory `#fbfbfa`, charcoal text `#1c1c1a`, deep muted teal accent `#244b4c`, editorial serif headings, clean UI sans, rectangular controls, 6px radii, compact desktop table density, no purple, no gradients).
- Unified shell and navigation supporting `/` (Library browser), `/highlights` (Phase 09 interim preview), `/canvas-notes` (Phase 10 interim preview), `/settings` (functional local settings categories), `/privacy` (local-first disclosure), and `/terms` (local-first software terms).
- Calibre-class library table with real-time search (`/` keyboard shortcut), faceted filters (type, status, tags), multi-column sorts, column visibility toggles, 6 pre-configured saved views, and arrow-key row navigation.
- Item detail peek pane with 8 functional tabs: Overview, Thoughts, Notes, Metadata, Media (with lightbox preview), Links, Highlights, and Canvas.
- Manual metadata editing with optimistic revisions, strict client-side validation, conflict detection, reload server copy action, and safe SQLite persistence via `PUT /api/library/items/:id`.
- Data truthfulness: all 91 items rendered with genuine provenance; zero fake ratings, books, reviews, or progress bars.
- Visual certification: 24 baseline screenshots captured in `before/` and 82 final review screenshots captured across `after/`, `states/`, and `breakpoints/` under `READ_WATCH_DATA_ROOT/visual-review/phase-03/` with full `manifest.json` and `REVIEW_INDEX.md`. No screenshots committed to Git.
- Node tests 35/35, Python tests 15/15, hygiene tests 2/2, library verification, lint, TypeScript, production build, and zero-vulnerability audit PASS.
- Graphify: PASS - 390 nodes, 564 edges, 22 communities, 0 import cycles.
- Ponytail: PASS - zero new dependencies, semantic HTML components, zero dead CSS.
- Phase 04 ("Document Adapter Foundation") has not been started.
- Phase 03 content commit `e5de157c03d524ee8cb4a2c09d968e3f18cebf33` was pushed and verified on GitHub; the closure commit records that remote gate.

Starting Phase 03 local/remote HEAD: `a58da7ce50ee0641a01f47cb8f49cca122b0f0be`.

Phase 01 results:

- Common Item plus separate Read/Watch extensions specified.
- SQLite canonical runtime plus deterministic file-first recovery accepted.
- Existing 91 stable IDs and all current source fields mapped losslessly.
- Migration, transaction, backup, restore, rebuild, adapter, ownership, and threat-model contracts specified.
- Project-level license formally deferred pending user/legal decision before direct adoption or distribution.
- Graphify: PASS - Phase 01 architecture query, 326 nodes, 402 edges, 22 communities, integrity clean.
- Ponytail: PASS - speculative frameworks and premature tables deferred; no unrelated cleanup applied.
- App regressions: 28/28 Node tests, 6/6 import tests, 2/2 hygiene tests, lint, TypeScript, build, and zero-vulnerability audit PASS.
- Immutable backup and 91-item library verification PASS. One stale historical user-added source path is retained with exact current source/copy hash evidence; no source was changed.
- Phase 01 content commit `b83cf89780b6f9c7e023f3374752c49a34022d40` was pushed and verified on GitHub; the closure commit records that remote gate.

Starting local/remote HEAD: `4b3037025e069851e1ccf73bbf1beb5b3285807d`.

Active blockers: none. Known pre-implementation requirements are the reviewed stale-provenance normalization before live migration and a project-license choice before direct third-party adoption or external distribution.

Scope boundary: Phase 01 is complete. No Phase 02 implementation, migration, product feature, UI redesign, reader integration, upstream acquisition, dependency addition, or OCR work occurred.
