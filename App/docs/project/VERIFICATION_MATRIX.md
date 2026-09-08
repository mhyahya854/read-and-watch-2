# Verification Matrix

No phase is complete because checkboxes appear checked. Apply the common gate plus every phase-specific gate below.

## Common completion gate for every phase

- Local repository root, branch, HEAD, status, worktrees, stashes, tags, remotes, LFS, submodules, nested Git, and ignored/private boundaries verified
- Canonical GitHub identity, visibility, default branch, remote HEAD, branches, PRs/issues/releases/workflows as relevant, and target tree verified
- Phase implementation and focused tests pass
- Lint, TypeScript, production build, dependency/security audit, and broader regressions run when applicable
- Repository hygiene and `scripts/validate_project_state.py` pass
- Protected data and source immutability pass for affected scopes
- Graphify run and integrity diagnostics recorded
- Ponytail run and findings resolved or explicitly deferred
- Sanitized phase evidence exists; private detail remains external
- Master plan, run state, phase index, project state, decisions, and changelog updated truthfully
- Commit pushed normally and GitHub verified before phase status becomes `COMPLETE`

## Phase-specific matrix

| Phase | Required phase-specific evidence |
| --- | --- |
| PHASE-00 | Historical reports, live backup/library checks, repository migration evidence, local/GitHub reconciliation, legacy fallback provenance |
| PHASE-01 | Domain/schema ADRs, compatibility mapping, migration/recovery design, transaction model, adapter contract, threat model, licensing decision log |
| PHASE-02 | Schema migrations, fixture and real-catalog dry run, row/field/property parity, stable-ID preservation, rollback/restore, duplicate behavior, Watch separation |
| PHASE-03 | Design constitution review, desktop/constrained-width screenshots kept private as needed, keyboard/accessibility, empty/loading/error states, console clean |
| PHASE-04 | Adapter conformance tests, capability matrix, lifecycle/error tests, no scattered format branching audit |
| PHASE-05 | Official upstream pin/license, format fixtures and real books, TOC/search/selection/progress/restore, source hashes, no visible engine chrome |
| PHASE-06 | PDF fixtures and real PDFs, render/text/search/navigation/outline/link/zoom/rotation/high-DPI tests, malformed input, source hashes, OCR absent |
| PHASE-07 | Cross-format toolbar/sidebar/history/bookmark/settings/restore/keyboard/touch/accessibility parity |
| PHASE-08 | Feature-by-feature parity matrix, every relied-on real format/book, fallback rollback plan, provenance retention, removal diff and regressions |
| PHASE-09 | Anchor fixtures, source-hash mismatch, atomic/transaction recovery, conflicts, bounded history, all annotation types, zoom/reflow persistence |
| PHASE-10 | Canvas persistence/recovery/export, multiple canvases, pen/shapes/text/images, bidirectional deep links, side-by-side/full-screen, no cloud dependency |
| PHASE-11 | Book and library search, annotation browser filters, direct jumps, selection actions, Notes/Canvas handoff, no AI requirement |
| PHASE-12 | JSON/Markdown/notes/canvas exports, derivative PDF independent open, source unchanged, metadata backup/restore, reflowable portability decision |
| PHASE-13 | Tool-choice evidence, Excalidraw/React Flow/Mermaid boundaries, semantic graph integrity, deep links, no universal graph abstraction |
| PHASE-14 | Desktop threat model, chooser/bridge containment, file associations, open-with, processes, persistence, packaging, install/update, Windows tests |
| PHASE-15 | Accurate Privacy/Terms architecture mapping, settings, accessibility, keyboard, first-run/add-item, local-data and recovery UX, truthful copy audit |
| PHASE-16 | Large library/book benchmarks, memory/stability, path traversal, malformed files, CSP/dependencies, crash/transaction recovery, fresh clone/install/build |
| PHASE-17 | Usable-text detector, representative language/layout benchmarks, text overlay/regions/order, OCR provenance, source preservation, OCR-only-when-needed |
| PHASE-18 | Independent engine comparisons, Urdu/Nastaliq benchmark set, disagreement/confidence model, review queue, correction memory, transcription-state labels |
| PHASE-19 | Privacy boundary, explicit AI labeling, opt-in/user control, provenance, hallucination/evidence behavior, source immutability, disable/offline behavior |
| PHASE-20 | Full regression, performance, security, fresh clone/install/package, license/provenance, privacy/terms, backup/restore, Graphify, Ponytail, final fingerprint |

## Evidence statuses

Use `PASS`, `FAIL`, `PARTIAL`, `BLOCKED`, `NOT_APPLICABLE`, or `UNKNOWN`. Every non-PASS value requires a concise reason. `NOT_APPLICABLE` is justified, never used to skip a relevant gate.
