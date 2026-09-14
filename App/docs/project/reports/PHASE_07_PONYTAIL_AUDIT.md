# Phase 07 Ponytail Audit

Result: PASS

Scope: Phase 07 Unified Reader Experience, capability-driven UI architecture, shared navigation toolbar, sidebars, settings modal, bounded location history, canonical bookmarks, preferences persistence, and cross-format parity.

## Complexity & Dependency Review

1. **Zero New External Runtime Dependencies**:
   - Installed exactly 0 new runtime dependencies (`package.json` dependencies remain lean and unchanged).
   - Security audit verified: `npm audit --omit=dev` reports **0 vulnerabilities**.
   - Zero complex third-party reader suites, gesture engines, or state machines added.

2. **One Reader Product, Zero Engine Forks**:
   - Replaced fragmented or format-divergent reader experiments with a single unified reader surface (`App/app/app/reader/[id]/page.tsx` and modular components in `App/app/components/reader/`).
   - Both reflowable books (Foliate-JS) and fixed-layout publications (PDF.js) run inside the exact same `ReaderShell` layout.
   - All presentation code queries runtime adapter capabilities (`canZoom`, `fontControls`, `textSearch`, `continuousLayout`) with strictly zero format string branching (`format === 'pdf'`).

3. **Bounded In-Memory Location History**:
   - Implemented `ReaderHistory` with a lightweight, bounded array (capped at 50 entries) with deduplication and forward truncation.
   - Does not hack browser `history.pushState` or leak memory across long reading sessions.
   - Preserves canonical `DocumentLocation` envelopes (`schemaVersion: 1`).

4. **Native Standards over Libraries**:
   - Native HTML5 `<dialog open>` and semantic elements (`<progress>`, `<aside>`, `<nav>`, `<header>`, `<footer>`) used throughout reader UI.
   - Semantic CSS theme tokens (`.theme-warm`, `.theme-dark`) provide instant palette shifts (>9:1 AAA contrast) without runtime CSS-in-JS style injection or layout thrashing.
   - Pure touch swipe thresholds implemented with native DOM pointer events rather than bundling a 40KB gesture library.

5. **Atomic, Isolated Server Persistence**:
   - Reader state (`items/:id/reading-state.json`), bookmarks (`items/:id/bookmarks.json`), and settings (`reader-settings.json`) persist to external user data root using atomic temporary-file-and-rename writes (`writeAtomic`).
   - Zero external locking or database bloat required for reader reading state.
   - Isolated from Phase 09 annotation persistence.

6. **Truthful Degradation & Zero OCR**:
   - Zero OCR dependencies or background worker queues.
   - Scanned and missing-text documents truthfully display the "Image Scan" badge and an honest missing-text notice ("Text search isn't available for this document.") without hallucinated text.

## Findings

- `delete:` Format-conditional branching (`format === 'pdf'`). Replacement: Capability queries (`snapshot.capabilities.has(...)`).
- `delete:` Separate format-specific reader layouts. Replacement: One unified `ReaderShell`.
- `native:` HTML5 `<dialog>` and `<progress>`, CSS custom properties for instant theme switching.
- `stdlib:` `writeAtomic` via standard Node.js `fs.renameSync` for safe, crash-proof state persistence.
- `yagni:` Multi-tenant cloud bookmark sync, complex gesture recognition libraries, or premature annotation markup. Replacement: Simple canonical bookmarks model and native touch swipe handlers.

Lean already. Ship.
