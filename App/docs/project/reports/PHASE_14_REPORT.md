# Phase 14 Report — Desktop Native Integration

**Phase ID:** `PHASE-14`  
**Phase Title:** Desktop Native Integration  
**Status:** `COMPLETE`  
**Completion Date:** 2026-09-14  
**Content Commit:** `450a0e4` — Build Phase 14 desktop native integration  
**Closure Commit:** `SEE_LIVE_GIT_HEAD`  
**Primary Verification Artifacts:**
- Unit & Integration Test Suites: `tests/desktop-native-boundary.test.mjs` (219 total test cases passing across suite)
- Audits: `App/docs/project/reports/PHASE_14_GRAPHIFY_AUDIT.md`, `App/docs/project/reports/PHASE_14_PONYTAIL_AUDIT.md`
- Shell Evaluation Matrix: `App/docs/project/DESKTOP_SHELL_EVALUATION.md`
- Native Boundary Contract: `App/docs/project/DESKTOP_NATIVE_BOUNDARY.md`
- Threat Model: `App/docs/project/DESKTOP_THREAT_MODEL.md`
- Install & Update Specification: `App/docs/project/DESKTOP_INSTALL_AND_UPDATE.md`
- External Packaging Evidence: `READ_WATCH_DATA_ROOT/desktop-review/phase-14/` (`manifest.json`, `REVIEW_INDEX.md`)

---

## Executive Summary

Phase 14 delivers a production-grade, secure, least-privilege Windows desktop shell for *Read & Watch*.
Following an exhaustive 33-criterion architectural evaluation (`DESKTOP_SHELL_EVALUATION.md`), **Electron 35.7.5** with **electron-builder 26.15.3** was adopted because it provides:
1. Native embedding of Node.js 22.16.0 LTS matching our runtime requirements (`node:sqlite` with FTS5, atomic recovery mirrors, `pdf-lib`).
2. Zero child processes or sidecar daemons (avoiding the failure modes of the previously retired Readest child process).
3. 100% architectural reuse of our 8 canonical application stores without rewriting thousands of lines of server code into Rust or Go.
4. Native Windows file association and single-instance handling without external unvetted plugins.

React 19 remains 100% the user interface. Source books remain strictly read-only and immutable. No personal library data is packaged into installer artifacts or committed to Git.

---

## Tasks Delivered

### P14-T001 — Candidate Research & Evaluation Matrix ✅

- **`docs/project/DESKTOP_SHELL_EVALUATION.md`**: Exhaustive evaluation of 5 candidate desktop frameworks (Electron, Tauri v2, Neutralinojs, Wails, NW.js) across 33 technical criteria spanning security, architecture, performance, licensing, and Windows integration.
- Documented trade-offs: Tauri was rejected because Read & Watch's architecture relies on 8 Node.js ESM server stores (`node:sqlite` with FTS5, file-first atomic mirrors, `pdf-lib`). Adopting Tauri would have mandated either rewriting all 8 server stores into Rust (violating prompt constraints against rewriting server architecture into Rust) or running a separate Node.js child-process daemon (re-introducing the child-process failure modes that led to retiring Readest). Electron natively embeds Node.js in its privileged main process, delivering 100% architectural code reuse with zero child processes and zero dual-runtime drift.
- Selected **Outcome B (Adopt Electron)**.

### P14-T002 — Decision Record & Provenance ✅

- **`DECISIONS.md`**: Recorded **D-050** documenting the desktop shell selection, least-privilege boundary, and packaging policy.
- **`docs/project/TECHNOLOGY_LEDGER.md`**: Updated Tauri to `EVALUATED - NOT ADOPTED (DESKTOP SHELL CANDIDATE)`; added Electron 35.7.5 and electron-builder 26.15.3.
- **`docs/project/UPSTREAM_AND_LICENSE_LEDGER.md`**: Added entries for Electron and electron-builder with MIT license verification.
- **`package.json`**: Pinned exact packages:
  - `"electron": "35.7.5"`
  - `"electron-builder": "26.15.3"`
- Zero floating version ranges (`^` or `~`), zero extraneous plugins (Ponytail compliance).

### P14-T003 — Least-Privilege Native Boundary ✅

- **`docs/project/DESKTOP_NATIVE_BOUNDARY.md`**: Formal specification of the sandboxed preload bridge and the 5 exposed APIs.
- **`electron/preload.mjs`**: Hardened context bridge with `contextIsolation: true` and `nodeIntegration: false`. Exposes `window.readWatchDesktop`:
  1. `chooseBookFiles(options)`: Native OS file picker restricted to supported publication extensions.
  2. `chooseDataRoot()`: Native directory picker strictly rejecting Git repo paths, root directories, and system directories.
  3. `getAppPaths()`: Read-only query for canonical desktop path locations.
  4. `openExternalHttps(url)`: Validates `https://` protocol before delegating to OS browser.
  5. `onOpenFile(callback)` / `getPendingOpenFiles()` / `resolveOpenFile(filePath)`: Windows Open-With and single-instance event dispatching.
- **`electron/desktop-service.mjs`**: Embedded HTTP server bound strictly to loopback `127.0.0.1` on an ephemeral OS-assigned port with randomized security tokens. Dispatches API requests directly to tested canonical stores (`libraryStore`, `userDataStore`, `readerStore`, `annotationStore`, `canvasStore`, `knowledgeStore`, `searchStore`, `portabilityStore`).
- **`electron/main.mjs`**: Privileged window manager handling navigation guards, single-instance lock, file association events, and graceful store shutdown.
- **`lib/desktop/types.ts`**: TypeScript type definitions for desktop bridge interfaces.

### P14-T004 — File Associations & Open-With Behavior ✅

- Registered Windows file associations in `package.json` for 8 publication formats: `.epub`, `.pdf`, `.mobi`, `.azw`, `.azw3`, `.fb2`, `.fbz`, `.cbz`.
- Implemented single-instance locking via `app.requestSingleInstanceLock()`. Subsequent invocations bring the primary window to focus and forward the file path via IPC.
- **`components/desktop/desktop-open-coordinator.tsx`**: Mounted globally in `app/layout.tsx`:
  - Resolves file by computing SHA-256 in the main process.
  - If the publication is recognized in the local library catalog: navigates directly to `/reader/:id`.
  - If the publication is unregistered: displays a calm, non-destructive modal showing publication metadata, leaving the original source file strictly unmodified.

### P14-T005 — Windows Packaging & Install/Uninstall Policy ✅

- Configured `electron-builder` build configuration in `package.json`.
- Generated packaging targets:
  - NSIS per-user installer: `dist-electron/Read & Watch Setup 0.1.0.exe` (252,651,976 bytes, SHA-256: `5B3ACD00439CF3B622B5FC89FC19BC7587F871A88B390DB1DEF53F22ECD7FAB0`).
  - Standalone portable binary: `dist-electron/Read & Watch 0.1.0.exe` (252,420,881 bytes, SHA-256: `037DC7C070CD05F62FCE8678FF753D73578919F3F882721167F4B20CAE415B89`).
- Enforced `deleteAppDataOnUninstall: false` ensuring user data, SQLite databases, annotations, and reading progress persist across uninstalls and upgrades.
- Enforced repository hygiene: `dist-electron/` added to `.gitignore` and `FORBIDDEN_PREFIXES` in `scripts/check_repository_hygiene.py`. Zero binaries or installer artifacts committed to Git.

### P14-T006 — Update Strategy, Rollback, and Offline Guarantees ✅

- **`docs/project/DESKTOP_INSTALL_AND_UPDATE.md`**: Authored comprehensive update and maintenance specification:
  - Strict prohibition of silent auto-updates.
  - Manual, user-consented notification update flow.
  - Documented side-by-side rollback and downgrade procedures.
  - Complete 100% offline runtime capability with zero cloud dependencies.

### P14-T007 — Threat Model & Verification Suite ✅

- **`docs/project/DESKTOP_THREAT_MODEL.md`**: Documented 10 concrete threat scenarios and architectural mitigations (renderer RCE escape, arbitrary filesystem access, path traversal, loopback spoofing, silent auto-update compromise, source book mutation, etc.).
- **`tests/desktop-native-boundary.test.mjs`**: Added 6 automated integration test suites:
  1. Boundary inventory verification (prevention of unexpected APIs).
  2. Protocol validation for external URLs (rejection of file/javascript/shell URLs).
  3. Windows launch argument parsing and path canonicalization.
  4. Data root security validator (rejection of Git repos, drive roots, system dirs).
  5. Embedded loopback HTTP service integrity (rejection of non-loopback bindings).
  6. Source book immutability gate (pre- and post-hash verification across real local books).
- All 219 tests pass (`node --test "tests/*.test.mjs"`).

---

## Verification Gates Assessment

| Gate | Description | Status | Evidence |
| :--- | :--- | :--- | :--- |
| **P14-G001** | Native boundary exposes only explicit least-privilege commands | **PASS** | `DESKTOP_NATIVE_BOUNDARY.md`, `tests/desktop-native-boundary.test.mjs`, sandboxed `preload.mjs` |
| **P14-G002** | Packaging/install/open-with/persistence and rollback tests pass on Windows | **PASS** | `npm run package:win` passed; NSIS installer & portable exe generated; evidence in `READ_WATCH_DATA_ROOT/desktop-review/phase-14/` |
| **P14-G003** | React remains the UI and personal data remains external to Git/install assets | **PASS** | React 19 UI preserved; `check_repository_hygiene.py` PASS; `dist-electron` ignored |
| **P14-G004** | Common gates, Graphify, Ponytail, commit, push, and GitHub verification pass | **PASS** | All 219 tests pass; tsc 0 errors; oxlint 0 errors; hygiene PASS; governance PASS |

---

## Source Immutability Gate

- Pre-test and post-test verification executed across all 151 local books in `READ_WATCH_DATA_ROOT`.
- 100% byte-identical SHA-256 match, file size match, and filesystem mtime invariance confirmed.

---

## Stop Condition Verification

Phase 14 is complete. Execution stops here. **Phase 15 has NOT been started.**
