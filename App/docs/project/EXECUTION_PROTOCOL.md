# Execution Protocol

## Authority

Use the authority hierarchy in `AGENTS.md`. The repository is project memory; chat history is last-resort context.

## One-invocation loop

```text
                    SAME MASTER EXECUTION PROMPT
                               |
                               v
                      READ RUN_STATE
                               |
                               v
                   READ MASTER PLAN
                               |
                               v
                VERIFY LOCAL + GITHUB
                               |
                               v
               VERIFY PRIOR COMPLETION
                               |
                               v
             FIND FIRST ACTIONABLE TASK
                               |
                               v
                           EXECUTE
                               |
                 +-------------+-------------+
                 |                           |
                 v                           v
               PASS                        BLOCKED
                 |                           |
                 v                           v
              TEST                       DOCUMENT
                 |                           |
                 v                           v
             GRAPHIFY                       STOP
                 |
                 v
             PONYTAIL
                 |
                 v
            VERIFY GATES
                 |
                 v
          UPDATE DURABLE STATE
                 |
                 v
            COMMIT + PUSH
                 |
                 v
           VERIFY GITHUB
                 |
                 v
           PHASE COMPLETE?
              /       \
            NO         YES
            |           |
           STOP      MARK COMPLETE
                        |
                        v
                       STOP
```

One invocation works only on the current actionable task or phase. It never starts the next phase after completing the current one. The user starts a fresh chat for the next phase.

## Start-of-run protocol

1. Read the files required by `AGENTS.md`.
2. Parse `RUN_STATE.json` and validate it with `scripts/validate_project_state.py`.
3. Capture local root, branch, HEAD, status, remotes, worktrees, stashes, tags, LFS, submodules, nested Git metadata, and ignored/private boundaries.
4. Fetch the canonical remote without rewriting history. Verify repository identity, visibility, default branch, remote HEAD, branches, PRs, issues, releases, workflows, and tree state as applicable.
5. Compare live state with recorded state. Investigate discrepancies before writes.
6. Re-run the minimum protected-state and prior-phase gates needed to trust the baseline.
7. Select the first actionable incomplete task. If that differs from `RUN_STATE.json`, fix state only after evidence identifies the correct task.

## Execution rules

- Keep scope to the selected task and its normal prerequisites.
- Preserve originals and use copy-on-import or derived-output paths.
- Make operations deterministic, restartable, conflict-refusing, and logged.
- Do not hide unknowns, weaken gates, or invent evidence.
- Use `BLOCKER_PROTOCOL.md` after a bounded safe resolution attempt.
- Keep Graphify output under the external data root and commit only a sanitized summary.
- Run Ponytail as a read-only simplification audit. Apply findings only when they fit phase scope and verification.

## Phase completion protocol

A phase may become `COMPLETE` only when all of these are true:

1. Required implementation exists locally.
2. Required tests actually pass.
3. Required evidence exists.
4. Protected-state and source-immutability checks pass.
5. Graphify ran and its required diagnostics are recorded.
6. Ponytail ran and findings are resolved, deferred with rationale, or recorded.
7. Master-plan tasks and gates are updated truthfully.
8. `PROJECT_STATE.md`, `RUN_STATE.json`, and `PHASE_INDEX.json` are updated.
9. Relevant decisions and changelog entries are updated.
10. Repository hygiene and governance validation pass.
11. Changes are committed and pushed normally.
12. GitHub is verified to contain the completion commit and required files.

After phase completion, stop. A phase cannot be marked complete before verified push.

## Reporting standard

Use compact, evidence-first reports. Include result, scope, exact commands or test names where useful, counts, known limitations, blockers, commit, remote verification, and exact next action. Never include personal titles, private filenames, absolute user paths, private metadata, secrets, recovery contents, or unnecessary hashes in Git-tracked reports.
