# One-time repository separation and GitHub sanitization

- [x] Inventory local repository, nested repositories, LFS, and public GitHub metadata
- [x] Create and verify pre-cleanup Git bundles
- [x] Classify and copy protected data to the external local-data root
- [x] Verify export by count, bytes, paths, sizes, and SHA-256
- [x] Relocate protected sources recoverably
- [x] Vendor and verify the pinned Readest source without nested Git metadata
- [x] Add the single external-data-root configuration boundary
- [x] Add repository hygiene enforcement and regression tests
- [x] Pass parent app and external data regression checks
- [x] Pass final Readest build/test verification
- [x] Create and scan the one-commit clean repository
- [x] Create and verify the new public GitHub repository `read-and-watch-2`
- [x] Pass fresh-clone install, build, test, and history checks
- [x] Write the final migration report and stop

# Task 1 Checklist

## Phase 0 - Persistent foundation

- [x] Initialize project structure
- [x] Create persistent state/resume system
- [x] Verify required Step 0 files and folders

## Phase 1 - Source discovery and backup

- [x] Locate Read/Watch source exports within the allowed search scope
- [x] Record source paths in `config/source-paths.json`
- [x] Create source manifest
- [x] Copy Read backup
- [x] Copy Watch backup
- [x] Generate backup manifest
- [x] Verify backup file counts, bytes, paths, sizes, and SHA-256 checksums
- [x] Mark verified backup immutable/read-only where practical

## Phase 2 - Export audit and importer

- [x] Audit Notion export structure
- [x] Count Read and Watch records conservatively
- [x] Document formats, properties, attachments, unknowns, and parsing concerns
- [x] Design the initial library schema and deterministic naming strategy
- [x] Implement an idempotent, restartable importer with checkpoints and logs
- [x] Import Read from the verified backup
- [x] Verify Read import
- [x] Import Watch from the verified backup
- [x] Verify Watch import
- [x] Generate `library/READ.md`
- [x] Generate `library/WATCH.md`
- [x] Verify library structure, IDs, provenance, links, attachments, and UTF-8 Markdown

## Phase 3 - Local UI blueprint

- [x] Build the React/TypeScript Notion-inspired UI shell
- [x] Connect the UI to the real imported catalog
- [x] Verify Read view
- [x] Verify Watch view
- [x] Verify item detail selection and future-integration placeholders
- [x] Verify missing artwork, long names, and empty fields
- [x] Verify production build and local run

## Phase 4 - Closure

- [x] Generate all required reports
- [x] Run the complete source-to-backup-to-library audit
- [x] Confirm original source exports remain unchanged
- [x] Finalize `PROJECT_STATE.md`, `TASKS.md`, `DECISIONS.md`, and `CHANGELOG.md`
- [x] Task 1 complete

# Task 2 Checklist - Local persistent user data (My Thoughts and Notes)

## Phase 0 - Whole-PC location audit and gate

- [x] Whole-PC location audit completed safely (read-only)
- [x] No files deleted, moved, renamed, overwritten, merged, or repaired during the audit
- [x] Canonical project location confirmed with high confidence
- [x] No unresolved divergent project copy exists
- [x] Original Notion exports verified unchanged
- [x] Verified immutable backup verified unchanged
- [x] Task 1 re-certification passes
- [x] Audit reports written: `WHOLE_PC_LOCATION_AUDIT.md`, `PROJECT_COPY_COMPARISON.md`, `PROJECT_LOCATIONS.json`

## Phase 1 - Persistence layer

- [x] Separate writable `user-data/` area outside imported evidence
- [x] Stable item IDs from the Task 1 catalog are the only accepted identifiers
- [x] Lazy creation: no file until the first real save
- [x] My Thoughts and Notes stored as independent UTF-8 Markdown files
- [x] Atomic save (temp file + verified replace), never against imported evidence
- [x] Path traversal and invalid item IDs rejected (server-side validation)
- [x] Conflict detection on save (409 when the on-disk note changed since load)
- [x] Bounded recoverable history for user-data (`user-data/.history/`)
- [x] Compact `user-data/index.json` updated on save (no note bodies inside)
- [x] `user-data/README.md` documenting layout and retention

## Phase 2 - UI

- [x] My Thoughts writable/persistent in item detail
- [x] Notes writable/persistent in item detail
- [x] Save control and visible save state (saved / saving / unsaved / error)
- [x] Ctrl+S keyboard shortcut
- [x] Safe switching between items (warn before discarding unsaved edits)
- [x] Missing note files cause no errors
- [x] Raw Markdown preserved; no lossy transformation on save
- [x] Edit/Preview toggle if straightforward and safe
- [x] No redesign of the rest of the Task 1 UI

## Phase 3 - Tests

- [x] Load thoughts when none exists
- [x] Save new thoughts
- [x] Reload saved thoughts
- [x] Edit existing thoughts
- [x] Save notes independently of thoughts
- [x] Switching items preserves correct association
- [x] Item IDs cannot escape user-data path
- [x] Invalid item IDs rejected
- [x] Atomic persistence behavior where testable
- [x] Conflict detection
- [x] User-data index updates
- [x] Markdown Unicode text
- [x] Empty note handling
- [x] Long note handling

## Phase 4 - Verification and closure

- [x] Manual UI verification (Read item, Watch item, save/reload, switching, mobile, console)
- [x] Protected Task 1 evidence re-hashed and unchanged after Task 2
- [x] `reports/TASK_2_PERSISTENCE_VERIFICATION.md` written
- [x] `reports/TASK_2_FINAL_REPORT.md` written
- [x] `PROJECT_STATE.md`, `TASKS.md`, `DECISIONS.md`, `CHANGELOG.md` updated
- [x] Task 2 complete - do not start Task 3 without explicit authorization

# Task 3 Checklist - Readest fork and initial reader integration

## Phase 0 - Baseline gate

- [x] Re-certify Task 1/2 baseline
- [x] Capture pre-Task-3 protected-state hashes

## Phase 1 - Read collection audit

- [x] Audit all 19 Read items and exact local file paths
- [x] Classify readable, unsupported, ambiguous, and missing book files
- [x] Write `reports/TASK_3_READ_FORMAT_AUDIT.md`

## Phase 2 - Readest upstream and architecture

- [x] Inspect the existing `forks/readest/` placeholder safely
- [x] Acquire official Readest source under `forks/readest/`
- [x] Record upstream commit, branch/tag, retrieval date, and license
- [x] Establish a clean local integration branch and `OUR_CHANGES.md`
- [x] Inspect Readest targets, build, routing, file-opening, formats, and runtime state
- [x] Compare realistic integration options
- [x] Document the decision in `reports/TASK_3_READEST_ARCHITECTURE.md`
- [x] Record the accepted architecture in `DECISIONS.md`

## Phase 3 - Minimal integration

- [x] Implement a safe stable-ID-to-book resolver
- [x] Reject Watch, malformed, unknown, traversal, absolute, missing, and unsupported targets
- [x] Handle multiple readable candidates without guessing
- [x] Activate `Open in Reader` for Read items only
- [x] Integrate the existing Readest UI
- [x] Add a clear Back to Library path
- [x] Keep reader runtime state in a documented application-owned location

## Phase 4 - Verification and closure

- [x] Add and pass focused security and resolver tests
- [x] Open a genuine user-supplied supported PDF through the parent UI and Readest; verify real content, navigation, reopening, return, and before/after hashes
- [x] Test each supported local format available where feasible
- [x] Run Task 2 regression tests and app build checks
- [x] Verify source books and protected evidence unchanged
- [x] Write `reports/TASK_3_READEST_DIFF.md`
- [x] Write `reports/TASK_3_READER_VERIFICATION.md`
- [x] Write `reports/TASK_3_FINAL_REPORT.md`
- [x] Update durable project state and changelog
- [x] Task 3 complete and certified - stop before Task 4, Mermaid, AI, or reader redesign

# Task 4 Checklist - Reader annotations, drawing, and export foundation

> **SUPERSEDED - DO NOT EXECUTE**
>
> The user replaced this unfinished Readest-centric architecture with the unified native Read & Watch roadmap in `docs/project/MASTER_PLAN.md`. The unchecked items below remain unchanged as historical evidence and are not complete.

## Phase 0 - Baseline gate

- [x] Re-certify Task 3
- [x] Capture pre-Task-4 protected-state hashes
- [x] Verify the genuine source and library PDF copies are unchanged

## Phase 1 - Readest capability audit and architecture

- [ ] Audit existing Readest annotation support
- [ ] Design and document the versioned annotation schema
- [ ] Design the PDF normalized-coordinate anchor model
- [ ] Design the EPUB stable-locator model from actual Readest/foliate-js behavior
- [ ] Document the minimal integration and export architecture

## Phase 2 - Storage and reader integration

- [ ] Implement annotation storage and per-book index
- [ ] Implement atomic saves, bounded history, conflict detection, and recovery
- [ ] Implement comments
- [ ] Integrate highlights into the same annotation universe
- [ ] Implement freehand drawing and individual-object erasing
- [ ] Implement line, arrow, rectangle, and ellipse shapes
- [ ] Implement page-positioned text boxes
- [ ] Implement session undo/redo
- [ ] Implement the minimal annotation toolbar/sidebar
- [ ] Implement current-page/all filtering and show/hide
- [ ] Implement close/reopen persistence and book-hash mismatch detection

## Phase 3 - Export

- [ ] Implement annotation-only Markdown and JSON export
- [ ] Implement or safely prototype annotated-PDF export to a new file
- [ ] Document the safe portable EPUB/reflowable export strategy

## Phase 4 - Tests and verification

- [ ] Add and pass focused annotation/storage/export tests
- [ ] Verify genuine PDF comments, freehand, shapes, and text boxes on pages 10/19/33
- [ ] Verify zoom/resize alignment and close/reopen persistence
- [ ] Verify annotation show/hide, selection, edit, delete, and recovery
- [ ] Verify annotation-only export contents
- [ ] Open and verify the annotated PDF independently if implemented
- [ ] Verify the original source and library PDF hashes are unchanged
- [ ] Run Task 1/2 regression checks
- [ ] Run Task 3 reader regression checks
- [ ] Verify desktop thoroughly and mobile for catastrophic regressions
- [ ] Document every Readest fork change
- [ ] Re-run the protected-state comparison

## Phase 5 - Closure

- [ ] Complete all required Task 4 reports
- [ ] Update durable state, decisions, changelog, and fork ledger
- [ ] Task 4 complete - stop before Task 5, Mermaid, relationship graphs, or AI
