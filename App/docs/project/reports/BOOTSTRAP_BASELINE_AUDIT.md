# Bootstrap Baseline Audit

Audit date: 2026-09-08

Result: PASS, pending final governance commit/push closure.

## Scope inspected

- Durable instructions, project state, legacy tasks, decisions, changelog, readme, architecture/data-format docs, import docs/code entry points, fork provenance, package state, ignore rules, and hygiene tooling
- Detailed external evidence for Tasks 1-3, whole-PC/location audit, source/backup/library checks, real-book/Readest verification, repository migration, and prior Graphify state
- Live repository, ignored/private boundaries, external data root, and canonical GitHub repository

## Starting baseline

- Local root and expected application subdirectory: verified
- Branch: `master`
- Local HEAD: `c065f0c81f2e5b8f652371db062c56d9c0000e06`
- Remote HEAD: same
- Worktree divergence: none
- Tracked paths: 9,131
- Submodules, stashes, tags, LFS paths, and unexpected nested repositories: none
- Repository hygiene: PASS

## Protected data

- Original source vs immutable backup: PASS, 8 files and 182,653,590 bytes, exact path/size/SHA-256 match
- Backup read-only files: 8/8
- Current library: PASS, 91 items (20 Read, 71 Watch) and 75 attachments
- Repository separation export evidence: PASS, 800 files and 4,663,682,393 bytes verified before relocation
- No protected/private data was copied into Git during this bootstrap

## Application regression

- Parent Node tests: PASS, 28/28
- Lint: PASS
- TypeScript: PASS
- Production build: PASS
- npm audit: PASS, 0 vulnerabilities
- Hygiene tests: PASS, 2/2 via the test file's intended direct invocation

At audit start, lint and TypeScript commands could not find local binaries because the ignored dependency tree was absent. `npm ci` restored the lockfile-defined local dependencies without changing tracked source; all gates then passed. The production build retains the known non-blocking Vinext route-classification notice.

## Non-blocking observations

- Broad ignored-file enumeration reports stale/broken dependency junctions inside the ignored vendored Readest dependency tree. They are not tracked and were not modified.
- Graphify package and local skill versions differ; the actual graph refresh and health diagnostics passed.
- No project-level license file exists; the license decision is explicitly unresolved.

## Boundary

No new product feature, migration, reader engine, annotation, canvas, graph product feature, desktop shell, OCR, or AI work was started.
