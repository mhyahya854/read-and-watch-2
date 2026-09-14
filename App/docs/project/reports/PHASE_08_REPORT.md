# Phase 08 Report: Legacy Readest Parity and Retirement

**Phase ID**: `PHASE-08`  
**Title**: Legacy Readest Parity and Retirement  
**Canonical Completion Date**: 2026-09-14  
**Status**: `COMPLETE`  
**Governance Anchor**: Decision D-044, `docs/project/MASTER_PLAN.md`  

---

## Executive Summary

Phase 08 successfully achieved the safe retirement of the legacy Readest desktop engine and launcher bridge. Prior to retiring active fallback paths, rigorous empirical verification proved 100% parity across every relied-upon format (EPUB and PDF), every real local book (151 total: 8 EPUBs and 143 PDFs), and every user-facing reader behavior (`BEH-01` through `BEH-14`).

Zero parity gaps were identified. In 1,208 of 2,114 matrix evaluations, the unified native reader demonstrated clear superiority over the legacy engine (instant in-app loading, zero Electron/Tauri window launch lag, high-DPI scaling, seamless deep linking, and responsive reading progress). Rollback capability was designed and physically verified in an isolated worktree prior to removing active launcher code.

Per Decision D-044, `App/forks/readest/` was safely removed from current Git HEAD, permanently eliminating 9,066 vendored files that caused Windows MAX_PATH checkout failures while preserving complete historical provenance in `docs/project/PROVENANCE_READEST.md` and Git commit `81a9276c190b4795b7093c55d175d0b73276fde7`. All 151 real source books remain 100% byte-identical and unmodified.

---

## 1. Task Execution & Inventory (`P08-T001` - `P08-T003`)

### 1.1 Format & Real-Book Inventory
- **Relied-Upon Formats**:
  - `EPUB`: 8 real local publications under `Read/` (100% supported by native Foliate engine).
  - `PDF`: 143 real local publications under `Read/` (100% supported by native PDF.js engine).
- **Historical Declared Formats**:
  - MOBI, AZW, AZW3, FB2, FBZ, CBZ, TXT, MD (all mapped to native reflowable architecture).
- **Input Integrity Pre-Test Audit**:
  - Full SHA-256 baseline computed across all 151 real books and stored in `Read and Watch - Local Data/parity/phase-08/hashes/pre-test-hashes.json`.

### 1.2 Parity Matrix Results
A total of 2,114 evaluations across 151 books and 14 core behaviors:
- `PASS_NATIVE_PARITY`: 747 evaluations
- `NATIVE_BETTER`: 1,208 evaluations
- `NOT_APPLICABLE`: 159 evaluations (format-constrained zoom/rotation vs reflowable typography)
- `PARITY_GAP`: **0**
- `UNVERIFIED`: **0**
- `BLOCKED`: **0**
Full matrix stored in `Read and Watch - Local Data/parity/phase-08/matrix/parity-matrix.json`.

---

## 2. Rollback Verification (`P08-T004`)

Before altering active launcher or server code, the rollback mechanism was verified in an isolated disposable worktree:
- **Worktree Location**: `%TEMP%\rw-rollback`
- **Target Baseline**: `81a9276c190b4795b7093c55d175d0b73276fde7`
- **Verification Performed**:
  - Checked out 9,262 files with full legacy Readest source and licenses intact.
  - Executed full test suite (`npm test`) inside rollback environment: 97/97 tests passed cleanly.
  - Full report recorded in `Read and Watch - Local Data/parity/phase-08/rollback/ROLLBACK_VERIFICATION.md`.

---

## 3. Active Launcher & Runtime Retirement (`P08-T005`)

1. **`components/reader-control.tsx`**:
   - Replaced external desktop launcher button with direct declarative `<Link>` routing to `/reader/:itemId`.
   - Updated status message to `"Opens in the unified reader."`.
   - Removed obsolete launcher states (`openingId`, `openInReader`).
   - Multiple-candidate books route with deterministic `?candidate=:id` query parameter preservation.
2. **`server/reader-store.mjs`**:
   - Completely removed `import { spawn } from 'node:child_process'`.
   - Removed `defaultLaunchReader()`.
   - Set `readerReady: true` unconditionally.
   - Updated `open()` to return `{ ok: true, name, format, url }` without spawning any external OS process.
3. **`server/data-paths.mjs` & `data-paths.d.mts`**:
   - Retired `readerExecutable` to `null`.
4. **`server/reader-vite-plugin.mjs`**:
   - Renamed plugin to `'local-unified-reader'`.
   - Removed `readerExecutable` dependency.
5. **`app/settings/page.tsx`**:
   - Updated Reading section description to `"Unified native reader for verified local EPUB and PDF publications"`.

---

## 4. Safe Removal of Vendored Source (`P08-T006`)

1. **Vendored Source Removal**:
   - Removed `App/forks/readest/` from Git HEAD via `git rm -r App/forks/readest` (9,066 files deleted from HEAD).
   - Removed residual physical directory; working tree reduced to 196 tracked paths.
   - Permanently resolved Windows `MAX_PATH` checkout failures caused by deep Android test directories.
2. **Tracked Provenance & History Preservation**:
   - Created `docs/project/PROVENANCE_READEST.md` recording upstream repo, pinned commit `6df90139dc7b72246572ab33b12d485b281ca6e6`, AGPL-3.0 license, and retirement rationale.
   - Updated `docs/project/UPSTREAM_AND_LICENSE_LEDGER.md` and `docs/project/TECHNOLOGY_LEDGER.md` (marked Readest as `RETIRED LEGACY FALLBACK`).
   - Copied unit test PDF fixtures to `App/app/tests/fixtures/pdf/` (`sample-paper.pdf` and `sample-alice.pdf`).
3. **Automated Enforcement**:
   - Added `App/app/tests/no-active-readest.test.mjs` asserting 0 child process spawning, 0 forks/readest imports, and null `readerExecutable`.
   - Updated `App/scripts/check_repository_hygiene.py` and `App/scripts/test_repository_hygiene.py` adding `App/forks/readest/` to `FORBIDDEN_PREFIXES`.

---

## 5. Verification Gates Summary (`P08-T007`)

| Gate ID | Description | Result | Evidence |
|---|---|---|---|
| **`P08-G001`** | Native-vs-legacy parity matrix | **PASS** | 2,114 cells evaluated; 0 gaps, 0 blocked; 18 visual review screenshots in `Read and Watch - Local Data/visual-review/phase-08/` |
| **`P08-G002`** | Rollback & provenance verified | **PASS** | Rollback verified in `%TEMP%\rw-rollback`; `docs/project/PROVENANCE_READEST.md` created |
| **`P08-G003`** | Active retirement & source immutability | **PASS** | `child_process` eliminated; 151 book source hashes 100% byte-identical |
| **`P08-G004`** | Common closure, audits, and regressions | **PASS** | 100/100 tests pass, `npm run build` succeeds, Graphify & Ponytail audits pass, hygiene clean (196 paths) |

---

## 6. Stop Condition

Phase 08 is fully complete. In accordance with governing rules, **Phase 09 (Unified Annotation Foundation) is NOT started**.
