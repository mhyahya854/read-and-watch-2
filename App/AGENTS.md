# Durable Project Instructions

This repository is a long-running local personal media and knowledge application. Treat this file, `PROJECT_STATE.md`, `TASKS.md`, `DECISIONS.md`, and the latest files in `logs/` and `reports/` as the durable source of project context.

## Resume protocol

When the user says `resume`:

1. Read this file completely.
2. Read `PROJECT_STATE.md`, `TASKS.md`, and `DECISIONS.md`.
3. Read the latest relevant files under the configured external data root.
4. Inspect the live repository and external data state and verify previously recorded work.
5. Continue from the first unfinished task in `TASKS.md`.
6. Do not restart completed work or repeat imports unnecessarily.
7. Update `PROJECT_STATE.md` and `TASKS.md` after meaningful progress.

If an operation may have been interrupted, verify its outputs before continuing. Never assume that a partial copy, import, build, or report is complete.

## Non-negotiable data safety

- The source Notion exports are immutable. Read them only.
- The verified backup under the external data root is immutable project data.
- Never delete, edit, reorganize, deduplicate, or automatically clean the backup.
- Never move, rename, delete, overwrite, reorganize in place, or convert the original source exports.
- Imports must use COPY operations and must read from the verified backup, not from the originals.
- All import operations must be deterministic, idempotent, restartable, logged, and provenance-preserving.
- A failed backup verification blocks all transformation and import work.
- Never silently discard unknown files, properties, columns, attachments, or metadata.
- Preserve enough provenance to trace every imported item to its exact source export record or file.
- When uncertain, keep the data and record the uncertainty for review. Do not guess.

## Project boundaries

- Application source belongs in `app/`.
- Future upstream forks belong in `forks/`.
- Personal normalized data, immutable backups, manifests, checkpoints, logs, reports, user data, and runtime state belong only under `READ_WATCH_DATA_ROOT`, outside Git.
- Import code belongs in `import/`; its mutable state belongs under the external data root.
- `forks/readest/` is vendored upstream source pinned and documented by its provenance files. Never add nested Git metadata.
- Do not modify or clone Readest, Mermaid, or Mermaid Live Editor until the user explicitly requests it.
- Do not begin reader, annotation, graph-algorithm, embeddings, recommendation, or local-LLM work during Task 1.

## Verification and documentation

- Every major phase needs evidence-based verification before it is marked complete.
- Use file counts, byte counts, relative-path comparisons, file sizes, and SHA-256 hashes for source-to-backup verification.
- Do not claim PASS without running the corresponding verification.
- Update `PROJECT_STATE.md` before and after each major phase and before ending a session.
- Keep `PROJECT_STATE.md` concise and record the last successful verification, last operation, and exact next action.
- Update `TASKS.md` checkboxes only after the work is genuinely complete.
- Record important architecture and safety decisions in `DECISIONS.md`.
- Record meaningful user-visible changes in `CHANGELOG.md`.
- Store detailed operation logs and verification/audit results under the external data root.

## Repository hygiene

- Do not commit private exports, backups, books, PDFs, EPUBs, screenshots, generated library data, or machine-specific source paths by default.
- Run `python scripts/check_repository_hygiene.py` before every commit and push.
- Never remove a user file merely because Git ignores it.
- Prefer small, auditable operations and verify outputs before proceeding.
