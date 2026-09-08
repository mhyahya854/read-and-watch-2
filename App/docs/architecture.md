# Architecture

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

Future Readest and Mermaid integrations remain isolated under `forks/` and are outside Task 1.
