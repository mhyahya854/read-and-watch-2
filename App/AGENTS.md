# Durable Project Instructions

This repository is a long-running local personal media and knowledge application. The repository, not chat history, is project memory.

## Authority hierarchy

Future work must resolve conflicts in this order:

1. Explicit current user instructions
2. `docs/project/MASTER_PLAN.md`
3. `docs/project/RUN_STATE.json`
4. `PROJECT_STATE.md`
5. `DECISIONS.md`
6. Live source code and tests
7. `docs/project/VERIFICATION_MATRIX.md`
8. Sanitized phase reports under `docs/project/reports/`
9. Detailed external reports and evidence under `READ_WATCH_DATA_ROOT`
10. `CHANGELOG.md`
11. Legacy `TASKS.md`
12. Previous chat context

`TASKS.md` is historical and is not the authority for future execution. Its unfinished Readest-centric Task 4 is superseded and must not be executed.

## Resume protocol

When the user says `resume` or supplies the reusable master execution prompt:

1. Read this file completely.
2. Read `docs/project/RUN_STATE.json`.
3. Read `docs/project/MASTER_PLAN.md`.
4. Read `PROJECT_STATE.md` and `DECISIONS.md`.
5. Verify live local Git and GitHub state; do not trust recorded heads without checking.
6. Read `docs/project/VERIFICATION_MATRIX.md`, relevant sanitized reports, and the latest relevant detailed evidence under `READ_WATCH_DATA_ROOT`.
7. Verify prior completion before relying on it.
8. Select the first legally actionable incomplete task identified by the master plan and run state.
9. Work only on the current task or phase. Do not leap into the next phase.
10. Run Graphify and Ponytail as required by the phase and record actual evidence.
11. Update durable state after meaningful progress and before stopping.

If an operation may have been interrupted, verify its outputs before continuing. Never assume a partial copy, migration, build, import, commit, or push is complete.

## Non-negotiable data safety

- Original Notion exports are immutable and read-only.
- The verified backup under the external data root is immutable project data.
- Original source books are immutable unless the user explicitly authorizes a separate derivative operation.
- Never delete, edit, reorganize, deduplicate, rename, overwrite, convert in place, or automatically clean protected sources or backups.
- Imports use COPY operations and read from the verified backup, not originals.
- A failed backup verification blocks transformation and import work.
- Imports and migrations must be deterministic, idempotent, restartable, logged, provenance-preserving, and conflict-refusing.
- Never silently discard unknown files, properties, columns, attachments, metadata, or user data.
- Preserve enough provenance to trace every imported item to its exact source record or file.
- When uncertain, keep the data and record the uncertainty for review. Do not guess.
- Third-party engines provide capabilities; Read & Watch owns the experience and canonical user data.

## Project boundaries

- Application source belongs in `app/`.
- Future pinned upstream source belongs in `forks/` only after its roadmap phase authorizes acquisition.
- Personal data, immutable backups, manifests, checkpoints, operational logs/reports, user data, generated library data, runtime state, books, media, OCR output, and private canvases belong only under `READ_WATCH_DATA_ROOT`, outside Git.
- Import code belongs in `import/`; mutable importer state belongs under the external data root.
- `forks/readest/` is vendored upstream source pinned and documented by provenance files. Never add nested Git metadata.
- Readest is a certified legacy fallback, not the target architecture. Do not remove it before Phase 08 parity gates pass.
- Do not clone deferred upstream projects or start a later phase early.

## Verification and phase completion

- Every phase has stable IDs, explicit gates, evidence requirements, and a stop condition in `docs/project/MASTER_PLAN.md`.
- No phase is complete because checkboxes look complete; implementation and evidence must exist.
- A phase becomes `COMPLETE` only after local implementation, tests, protected-state checks, Graphify, Ponytail, durable-state updates, commit, normal push, and verified GitHub containment all pass.
- Run `python scripts/check_repository_hygiene.py` before every commit and push.
- Run `python scripts/validate_project_state.py` whenever governance state changes.
- Never weaken tests or safety rules merely to get green.
- Record important architecture and safety decisions in `DECISIONS.md` and user-visible changes in `CHANGELOG.md`.
- Store detailed/private evidence under `READ_WATCH_DATA_ROOT`; commit only sanitized reports under `docs/project/reports/`.
- When a phase completes, stop. The next phase requires a fresh user invocation.

## Mandatory Graphify and Ponytail

- Invoke Graphify during every execution run and at every phase gate, using the installed skill exactly as documented. Keep generated/heavy graph output outside Git and commit only a sanitized audit summary.
- Invoke Ponytail during every execution run and at every phase gate. Record over-engineering findings, but do not apply risky cleanup without phase scope and verification.
- Never invent Graphify or Ponytail results. Use `BLOCKER_PROTOCOL.md` when either prerequisite is genuinely unavailable after a bounded repair attempt.

## Repository hygiene

- Never commit private exports, backups, books, PDFs, EPUBs, private media, private notes, canvases, OCR output, screenshots, generated library data, runtime state, recovery bundles, secrets, or machine-specific source paths.
- Never remove a user file merely because Git ignores it.
- Do not rewrite Git history or force-push.
- Prefer small, auditable operations and verify exact outputs before proceeding.
