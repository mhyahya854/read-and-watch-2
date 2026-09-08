# Blocker Protocol

## Required response

1. Identify the blocker precisely.
2. Gather reproducible evidence.
3. Make one reasonable safe attempt to resolve it.
4. Try one bounded alternative when justified.
5. Do not repeat identical retries.
6. Do not weaken safety, tests, verification, or architecture merely to get green.
7. Do not rewrite architecture around a trivial tooling problem.
8. Stop when further work has poor expected value or needs new authority.

## Record format

```text
Blocker ID: BLK-YYYYMMDD-NNN
Status: ACTIVE | RESOLVED | ACCEPTED_LIMITATION
Affected phase/task:
Evidence:
Attempt 1:
Bounded alternative:
Result:
Exact user action required:
Safe next action:
```

Active blockers appear in `RUN_STATE.json` and `PROJECT_STATE.md`. Detailed logs remain under the external data root; public summaries must be sanitized.

## Rules

- A blocked task remains unchecked.
- A blocker never becomes PASS through wording changes.
- Pre-existing failures are dated and reproduced before attribution.
- Missing credentials, unavailable authenticated sources, legal choices, ambiguous data, and destructive decisions are surfaced rather than guessed.
- If another independent task in the same phase is legally actionable, `RUN_STATE.json` may point to it only when dependencies allow and the blocker record explains the deviation.
- If no safe task remains, set phase status `BLOCKED`, update durable state, commit/push the blocker report when appropriate, verify remote state, and stop.
