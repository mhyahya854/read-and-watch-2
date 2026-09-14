# Phase 08 Ponytail Audit

Result: PASS

Scope: Phase 08 Legacy Readest Parity and Retirement, elimination of obsolete launcher dependencies, removal of vendored source from HEAD, and radical repository simplification.

## Measured Impact Scoreboard

- **Files Deleted from HEAD**: 9,066 files (~98% of total tracked files eliminated).
- **Tracked Repository Paths**: Reduced from 9,262 paths to 196 clean paths.
- **External Runtime Processes**: Reduced from 1 (`child_process.spawn` desktop launcher) to 0 (100% native in-browser execution).
- **Windows MAX_PATH Blockers**: Permanently eliminated all deep Android/Kotlin test paths that prevented standard Windows checkouts without `core.longpaths`.
- **New Dependencies**: 0 added. Production `package.json` dependencies remain lean and unchanged.
- **Vulnerabilities**: 0 (`npm audit --omit=dev` clean).

## Complexity & Over-Engineering Hunt Findings

1. **`delete:` Obsolete Vendored Upstream Source (`App/forks/readest/`)**:
   - What was cut: 9,066 vendored files (Tauri CLI, Rust crates, Android harnesses, legacy Electron/React code) totaling tens of megabytes.
   - What replaced it: The unified native reader (Phases 05–07: Foliate.js + PDF.js), which delivers 100% verified parity across all 151 real local books.
   - History retention: 100% preserved in Git commit `81a9276c190b4795b7093c55d175d0b73276fde7`; documented in `docs/project/PROVENANCE_READEST.md`.

2. **`delete:` Desktop Process Spawning (`child_process.spawn`)**:
   - What was cut: `spawn()` invocation, child process detachment, stdio piping, and `defaultLaunchReader()` in `reader-store.mjs`.
   - What replaced it: Direct in-app navigation via standard `<Link href="/reader/:id">` in `reader-control.tsx`. Zero OS process latency, zero detached window management.

3. **`delete:` Desktop Executable Path Plumbing (`readerExecutable`)**:
   - What was cut: Resolving `runtime/readest/bin/readest.exe` across `data-paths.mjs`, `vite.config.ts`, `reader-vite-plugin.mjs`, and `reader-store.mjs`.
   - What replaced it: Web-native routes; `readerExecutable` returns `null`, and reader readiness is unconditionally `true`.

4. **`stdlib / native:` Declarative Client Routing**:
   - Used Next.js / Vinext declarative `<Link>` routing and standard URL search parameters (`?candidate=:id`) for multiple-candidate book selection instead of imperative state machine polling (`openingId`, `openInReader`).

5. **`hygiene:` Test Fixture Decoupling**:
   - Cut fragile cross-directory test references pointing into `../forks/readest/...`.
   - Replaced with self-contained test fixtures in `App/app/tests/fixtures/pdf/` resolved via standard `import.meta.url`.

Lean already. Ship.
