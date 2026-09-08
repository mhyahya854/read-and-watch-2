# Ponytail Bootstrap Audit

Run: 2026-09-08

Result: PASS - read-only audit; no cleanup applied

Scope: whole repository boundaries and authored code/dependencies. The provenance-pinned vendored Readest tree was treated as an immutable third-party unit; upstream churn is outside this governance run.

delete: unused `pdf-lib` production dependency and lockfile subtree. Replacement: nothing until Phase 12 proves derivative PDF export needs it. [app/package.json]

delete: unused `useIsMobile` hook. Replacement: existing responsive CSS breakpoints. [app/hooks/use-mobile.ts]

delete: unused `TableFooter` and `TableCaption` wrapper variants. Replacement: native elements if a real consumer appears. [app/components/ui/table.tsx]

yagni: single-consumer `UserDataService` object namespace. Replacement: two exported load/save functions if touched in an authorized refactor. [app/lib/user-data.ts]

net: -58 lines, -1 deps possible.

These are non-blocking opportunities. Applying them during this governance-only bootstrap would create unrelated product churn, so they remain an evidence-backed future cleanup ledger.
