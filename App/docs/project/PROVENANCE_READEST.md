# Readest Provenance, Upstream Ledger & Retirement Record

Canonical since: Phase 08 legacy Readest parity and retirement  
Governance Anchor: Decision D-044, `MASTER_PLAN.md` Phase 08

---

## 1. Upstream Identity

- **Project**: Readest (Reader for Web, Desktop, and Mobile)
- **Official Repository**: `https://github.com/readest/readest`
- **Pinned Commit**: `6df90139dc7b72246572ab33b12d485b281ca6e6`
- **Maintainers / Authors**: Readest Team & Contributors
- **Upstream License**: GNU Affero General Public License v3.0 (`AGPL-3.0`)
- **Historical Checkout Directory**: `App/forks/readest/` (vendored with submodules flattened per Decision D-019)
- **Historical Desktop Binary**: `App/runtime/readest/bin/readest.exe` (portable Windows/Tauri build)

---

## 2. Integration & Architectural Lifecycle

1. **Task 3 Integration (Certification & Fallback)**:
   - In Task 3, Readest was acquired at commit `6df90139dc7b72246572ab33b12d485b281ca6e6` and vendored under `App/forks/readest/` with submodules flattened, accompanied by `UPSTREAM.md`, `OUR_CHANGES.md`, and a SHA-256 hash manifest.
   - Per Decision D-015, Readest was integrated strictly as an external desktop process launched via `child_process.spawn`. The browser passed only item IDs; the server resolved local book paths securely without permitting arbitrary path execution or source modification (`autoImportBooksOnOpen: false`).
   - In Decision D-025, Readest was designated as a **certified legacy fallback and feature/architecture reference**, rather than the target application shell.

2. **Phase 05–07 Native Implementation**:
   - Phase 05 integrated Foliate.js as the native reflowable book engine.
   - Phase 06 integrated PDF.js (via `pdfjs-dist@4.10.38`) as the native high-DPI fixed-layout engine.
   - Phase 07 created the capability-driven unified reader shell, harmonizing navigation, TOC, search, bookmarks, progress, and settings across both document families.

3. **Phase 08 Parity Verification & Safe Retirement (Decision D-044)**:
   - A rigorous 151-book parity matrix evaluated all 8 real EPUBs and 143 real PDFs across 14 distinct reader behaviors (`BEH-01` through `BEH-14`).
   - The evaluation proved **100% parity** (747 full parity matches, 1,208 native superior advantages, 0 parity gaps, 0 blocked items).
   - Rollback capability was designed and physically verified in an isolated worktree (`%TEMP%\rw-rollback`) prior to retirement.
   - The native reader completely eliminates the need for external process execution, removing `child_process.spawn` from the entire application codebase.

---

## 3. Safe Removal Rationale (Option B)

Per Decision D-044, `App/forks/readest/` is safely removed from the current Git HEAD while preserving full Git history:

1. **Elimination of Windows MAX_PATH Checkout Hazards**:
   - `App/forks/readest/` contained 9,066 files (~98% of the repository file count), including deep Android and Kotlin test directories whose paths exceeded Windows' standard 260-character `MAX_PATH` limit.
   - Removing these vendored files allows fresh clones on standard Windows systems without requiring administrative `core.longpaths` configuration.

2. **Zero Active Runtime or Build Dependencies**:
   - The application codebase has zero active imports from `App/forks/readest/`.
   - Test fixtures previously referenced from Readest (`sample-paper.pdf` and `sample-alice.pdf`) have been copied to `App/app/tests/fixtures/pdf/`.
   - Production bundle size and build times are improved.

3. **Copyleft Boundary Clarification**:
   - Readest is licensed under AGPL-3.0. Removing the vendored source from HEAD ensures the active Read & Watch application shell contains only clean, permissive, or in-house code without copyleft contamination.

---

## 4. Historical Recovery Instructions

The complete vendored Readest source tree, license, submodules, and modification history remain fully preserved in the Git history:

- **Pre-Retirement Commit**: `81a9276c190b4795b7093c55d175d0b73276fde7`
- **To inspect historical Readest source**:
  ```bash
  git checkout 81a9276c190b4795b7093c55d175d0b73276fde7 -- App/forks/readest/
  ```
- **To create a disposable rollback worktree**:
  ```bash
  git worktree add -d <temp-path> 81a9276c190b4795b7093c55d175d0b73276fde7
  ```
- **Parity evidence artifacts**:
  - Full inventory: `Read and Watch - Local Data/parity/phase-08/inventory/`
  - Parity matrix: `Read and Watch - Local Data/parity/phase-08/matrix/parity-matrix.json`
  - Source book hash audit: `Read and Watch - Local Data/parity/phase-08/hashes/`
  - Visual review screenshots: `Read and Watch - Local Data/visual-review/phase-08/`
  - Rollback report: `Read and Watch - Local Data/parity/phase-08/rollback/ROLLBACK_VERIFICATION.md`
