# Historical Architecture

This diagram describes the certified import and browsing foundation. The canonical target architecture is `docs/project/ARCHITECTURE_TARGET.md`.

```text
Original Notion exports (immutable)
        |
        | copy + SHA-256 verification
        v
backup/notion-original-snapshot/ (immutable)
        |
        | read-only import
        v
library/ (normalized personal data)
        |
        | generated catalog boundary
        v
app/ (local React/TypeScript UI)
```

Readest is now a certified legacy fallback. Its unfinished Readest-centric Task 4 is superseded by `docs/project/MASTER_PLAN.md`.
