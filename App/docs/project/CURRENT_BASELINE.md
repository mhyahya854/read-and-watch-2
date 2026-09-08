# Current Baseline

Certified: 2026-09-08 bootstrap

## Repository

- Canonical remote: `mhyahya854/read-and-watch-2`
- Visibility: public
- Default branch and remote HEAD: `master`
- Starting local and remote commit: `c065f0c81f2e5b8f652371db062c56d9c0000e06`
- Starting divergence: none
- Starting tracked paths: 9,131
- Local branches: `master` only; no submodules, stashes, tags, or LFS paths
- Nested Git metadata: none below the repository root
- GitHub: one branch, no PRs, issues, releases, or active root workflows at inspection time
- GitHub recursive tree: 11,082 entries, untruncated; no forbidden tracked path identified

## External data boundary

The external data root exists as the repository sibling configured by `READ_WATCH_DATA_ROOT`. It contains immutable source exports and backup data, normalized library data, user data, runtime state, detailed reports, migration recovery material, and Graphify output. None of these private areas is canonical Git content.

Current live checks:

- Source-to-backup: 8 files and 182,653,590 bytes, exact path/size/SHA-256 match, zero drift
- Backup read-only state: 8 of 8 files
- Library: 91 items (20 Read, 71 Watch), 75 attachments, verification PASS
- Repository separation export: 800 files and 4,663,682,393 bytes verified before relocation
- Recovery bundles remain external and verified according to the migration report

## Certified product foundation

- Task 1: 19 original Read records, 71 Watch records, 90 Notion-derived records, 74 Notion attachments, deterministic importer, generated catalog, and initial React/TypeScript browsing UI
- Task 2: local persistent My Thoughts and Notes with stable IDs, path validation, atomic writes, bounded history, conflict detection, index, UI, and regression tests
- Task 3: Read audit, pinned Readest provenance, secure stable-ID resolution, safe launching, one user-added real PDF record, real-book verification, and source immutability
- Current catalog after Task 3: 91 items and 75 media references
- Readest classification: `CERTIFIED LEGACY FALLBACK + FEATURE/ARCHITECTURE REFERENCE`

## Live bootstrap verification

- App tests: PASS, 28/28
- Lint: PASS
- TypeScript: PASS
- Production build: PASS with the known non-blocking Vinext route-classification notice
- npm audit: PASS, 0 vulnerabilities
- Repository hygiene: PASS
- Hygiene tests: PASS, 2/2 when invoked directly
- Backup and library verification: PASS
- Graphify: PASS, 326 nodes, 402 edges, 22 communities, clean integrity diagnostics
- Ponytail: PASS, four non-blocking simplification opportunities, no cleanup applied

## Known limitations

- Dependency install state was absent at bootstrap start; `npm ci` restored the ignored local dependency tree before lint, TypeScript, and build verification.
- Ignored vendored Readest dependency junctions produce stale-path warnings during broad ignored-file enumeration. They are not tracked and were not altered.
- The installed Graphify package reports version 0.9.53 while the local Codex skill package reports 0.9.17. The refresh and diagnostics passed; upgrade is a future tooling-maintenance decision.
- No project-level license file exists. This is an unresolved distribution/legal decision, not a guessed license.
- No new product feature was started in this bootstrap.
