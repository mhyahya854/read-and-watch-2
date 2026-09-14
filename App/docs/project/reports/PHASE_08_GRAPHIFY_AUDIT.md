# Phase 08 Graphify Audit

Result: PASS

The codebase dependency graph was extracted and clustered using Graphify (`python -m graphify extract App/app --code-only` and `python -m graphify cluster-only`) following the completion of Phase 08 legacy Readest parity verification and retirement.

## Graph Summary

- Nodes: 831 (adjusted from 828 in Phase 07 with the addition of retirement enforcement test `no-active-readest.test.mjs`)
- Edges: 1687
- Communities: 40
- Extraction Fidelity: 98% EXTRACTED, 2% INFERRED, 0% AMBIGUOUS (inferred confidence: 0.85)
- Import cycles: 0
- Missing endpoints: 0
- Dangling endpoints: 0
- Exact duplicate edges: 0
- Self-loops: 0
- Unverified nodes: 0

## Architectural Verification of Readest Retirement

The updated dependency graph proves the complete architectural detachment and safe retirement of legacy Readest:

1. **Zero Active Reachability to Readest**:
   - `App/forks/readest/` has been safely removed from Git HEAD; 0 active imports or module dependencies target the vendored tree.
   - `child_process.spawn` has been completely eliminated from `server/reader-store.mjs` and all other production application modules.
   - `readerExecutable` in `data-paths.mjs` resolves to `null`, completely decoupling the runtime path from external Tauri/desktop binaries.
2. **Unified Reader Navigation Path**:
   - `reader-control.tsx` links directly to `/reader/:itemId` using declarative client routing (`<Link>`), retiring all background spawn processes and opening state machines.
   - Multiple book candidates route deterministically with `?candidate=:id` query parameter preservation.
3. **Core Architectural Hubs & Dominant Abstractions**:
   - `ReaderSession` (72 edges): Universal document coordinator driving capabilities across both adapter families.
   - `DocumentLocation` (41 edges): Canonical location envelope for CFI, page number, and percentage progression.
   - `DocumentError` (34 edges): Structured domain error boundary preventing unhandled crashes or path leakage.
   - `reader-context.tsx`: React Context bridge coordinating UI components, capability queries, and REST persistence.
   - `FoliateReflowableAdapter` & `PdfAdapter`: Production document adapters providing 100% native reader coverage for all relied-upon formats.
4. **Preserved Historical Provenance**:
   - Upstream AGPL-3.0 provenance and historical commit records remain reachable and documented in `docs/project/PROVENANCE_READEST.md`, `docs/project/UPSTREAM_AND_LICENSE_LEDGER.md`, and `docs/project/TECHNOLOGY_LEDGER.md`.
5. **Storage & Data Boundary**:
   - All Graphify outputs reside strictly in `READ_WATCH_DATA_ROOT/App/graphify-out` outside Git.
