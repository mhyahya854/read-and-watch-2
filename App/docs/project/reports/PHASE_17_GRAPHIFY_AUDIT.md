# Phase 17 Graphify Audit (OCR Foundation Delta)

Date: 2026-09-17
Tool: `graphify` 0.9.57 (installed CLI), run against `App/app` in place.
Method: documented incremental (`--update`) flow — `detect_incremental`, structural
AST extraction of code files, merge into the existing graph, then rebuild,
cluster, label, report, and export HTML.

## 1. Result

| Metric | Before (Phase 16 closure) | After Phase 17 OCR foundation |
| --- | --- | --- |
| Nodes | 1,464 | **1,730** |
| Edges | 3,343 | **3,917** |
| Communities | 60 | **87** |
| God nodes | 10 | 10 |
| Import cycles | 0 | **0 (none detected)** |

Delta: **+266 nodes**, **+574 edges**, **+27 communities**, zero new import
cycles.

## 2. Graph health check (read-only diagnostic)

```
nodes: 1730
unverified_code_nodes: 0
raw_edges: 4603
valid_candidate_edges: 4168
missing_endpoint_edges: 0
dangling_endpoint_edges: 435
self_loop_edges: 0
exact_duplicate_edges: 0
post_build_edges: 3917
```

`Graph health: WARNING` — 435 dangling-endpoint edges and 251 collapsed
same-endpoint edges. These are structural-AST artefacts of the extractor (the
same class of diagnostic present in earlier phases), not OCR-specific and not
new import cycles. The diagnostic is read-only and non-aborting. They are
recorded here rather than hidden.

## 3. OCR architecture mapped (the required Phase 17 map)

The graph now contains **250 OCR-related nodes** across ten or more communities.
The required architectural map — native-text gate, OCR router, provider
abstraction, Unlimited-OCR boundary, PaddleOCR boundary, OCR runtime boundary,
source hash/provenance, cache, search overlay/index, update staging, activation,
rollback, and user-data boundaries — is present as first-class connected nodes:

| Community | Representative nodes |
| --- | --- |
| `Mjs Ocr` (contract) | `OCR_PROVIDERS`, `OCR_LANGUAGES`, `OCR_LIFECYCLE`, `OCR_STATE`, `assertProviderContract`, `REQUIRED_PROVIDER_MEMBERS` |
| `Mjs Ocr` (gate + routing) | `evaluateNativeTextGate`, `NATIVE_TEXT_DECISION`, `NATIVE_TEXT_REASON`, `NATIVE_TEXT_THRESHOLDS`, `summariseTextLayer`, `authorisedProviderForLanguage`, `OCR_LANGUAGE_ROUTING`, `providerMetadata` |
| `Mjs Ocr` (engine runtime) | `probePythonRuntime`, `runCommand`, `defaultCollectArtifacts`, `sha256OfFile`, `createUpstreamResolver`, `resolveUpstreamHead` |
| `Mjs Ocr-Store` | `createOcrStore`, `assertSourceHash`, `sourceDir`, `resultKey`, `save`, `load`, `listForSource`, `isStale`, `purgeSource` |
| `Server Ocr` (updater) | `createEngineUpdateManager`, `stageUpdate`, `checkForUpdates`, `activateUpdate`, `rollback`, `readVerification`, `readArtifactManifest` |
| `Server Ocr` (HTTP) | `handleOcrRequest`, `Ocr-Http` route nodes |
| Arabic text | `ARABIC_COMBINING_MARKS`, `buildOcrTextRepresentations`, `countArabicMarks`, `hasArabicMarks`, `stripArabicMarks`, `stripControlCharacters`, `toCanonicalText` |
| Overlay | `mountOcrOverlay`, `createOcrOverlayModel`, `OcrOverlayModel` |
| Settings UI | `OcrSettingsSection`, `fetchOcrInventory`, `checkOcrUpdate`, `installOcrEngine`, `rollbackOcrEngine` |
| Driver | `server_ocr_driver_engine_driver_drivererror` and the Python driver module |

## 4. God nodes and surprising connections (graph output, unedited)

God nodes: `ReaderSession` (77), `createCanvasStore()` (47), `DocumentLocation`
(45), `DocumentError` (44), `react` (42), `PdfAdapter` (39),
`createLibraryStore()` (38), `FoliateReflowableAdapter` (35),
`createKnowledgeStore()` (35), `ReadonlyDocumentSource` (33).

Notable extracted connection: `mountOcrOverlay()` sits in the PDF document
community alongside `PdfAdapter`, `getPdfJs()`, and `PdfJsDocument`, confirming
the overlay is wired into the existing PDF rendering path rather than beside it.

Import cycles: **none detected**.

## 5. Honest limitations of this audit

- Semantic (LLM) extraction was **skipped** for this delta. The changed corpus is
  code-only in substance; non-code changes were configuration and declaration
  files (`.json`, `.d.mts`, `README.md`). The graph update is therefore
  **structural**, and no new INFERRED semantic edges were contributed by this
  run.
- `graphify-out/` remains outside Git. Only this sanitized summary is committed.
- The Graphify package version is now 0.9.57; `RUN_STATE.json` previously
  recorded 0.9.53 and the installed skill text 0.9.17. The version mismatch is
  recorded rather than smoothed over.

---

# P17-T002 addendum — OCR benchmark corpus delta (2026-09-17)

Real run, `graphify` 0.9.57, incremental structural re-extraction of `App/app`
after the P17-T002 benchmark work:

```
graphify update . --no-cluster
  AST extraction: 219/219 files (100%)
  Rebuilt: 1916 nodes, 5234 edges
graphify cluster-only . --no-label --no-viz
  Done — 89 communities
graphify diagnose multigraph --json
```

| Metric | Phase 17 foundation | After P17-T002 |
| --- | --- | --- |
| Nodes | 1,730 | 1,916 |
| Edges (raw extraction) | 3,917 | 5,234 |
| Edges (post-build, undirected) | — | 4,506 |
| Communities | 87 | 89 |
| Import cycles | 0 | **0** |
| Unverified nodes | — | 0 |
| Missing-endpoint edges | — | 0 |
| Dangling-endpoint edges | 435 | 462 |
| Collapsed same-endpoint groups | 251 | 250 |

New benchmark surface mapped: 144 nodes originate from
`server/ocr/benchmark/*` — the manifest/corpus schema, the Unicode comparison
rules, the scoring and disagreement utilities, the run/group records, the
private corpus store, the font-coverage + offline renderer, and the synthetic
corpus builder.

---

# P17-T005 addendum — specialist runtime, dual-engine Urdu, reading order, and OCR search (2026-09-17)

Real run, `graphify` 0.9.57, incremental structural re-extraction of `App/app`
after the runtime-completion work:

```
graphify update . --no-cluster
  AST extraction: 233/233 uncached files (100%) [18 workers]
  Rebuilt (no clustering): 2074 nodes, 5719 edges
graphify cluster-only . --no-label --no-viz
  Done — 92 communities
graphify diagnose multigraph --json
```

| Metric | After P17-T002 | After P17-T005 |
| --- | --- | --- |
| Nodes | 1,916 | **2,074** |
| Edges (post-build) | 4,506 | **4,926** |
| Communities | 89 | **92** |
| Import cycles | 0 | **0 (none detected)** |
| Unverified nodes | 0 | **0** |
| Missing-endpoint edges | 0 | **0** |
| Dangling-endpoint edges | 462 | **0** |
| Self-loop edges | — | **0** |
| Exact duplicate edges | — | **0** |
| Extraction mix | structural | 96% EXTRACTED · 4% INFERRED (207 edges, avg confidence 0.85) · 0% AMBIGUOUS |

## Required architecture map (present as first-class connected nodes)

A targeted traversal —
`graphify query "Urdu dual-engine OCR orchestration and the Nastaliq specialist provider boundary"`
— resolved 488 nodes across the specialist, orchestration, layout, search, and
worker-supervision surface. The nodes this run was required to map are all in the
graph:

| Required element | Graph nodes (file-level plus symbols) |
| --- | --- |
| Specialist provider | `provider-urdu-nastaliq.mjs` (3 nodes), `urdu-nastaliq-trocr` provider record, `createUrduNastaliqProvider`, `URDU_NASTALIQ_ID` |
| Model/runtime boundary | `specialist-provisioning.mjs` (13 nodes), `engine_driver.py` community, `createRuntimeBridge`, `_trocr_model`, `_trocr_recognize`, `op_recognize_line` |
| Urdu dual-engine orchestration | `urdu-pipeline.mjs` (12 nodes, its own community hub), `createUrduPipeline`, `DISAGREEMENT_POLICY`, `URDU_EXECUTION_STATE` |
| Line segmentation | `line-segmentation.mjs` (14 nodes), `segmentPageLines`, `lineCropPath`, `LINE_SEGMENTATION_REVISION` |
| Reading order | `reading-order.mjs` (19 nodes, its own community), `orderPageUnits`, `ORDER_SOURCE`, `ORDER_WARNING`, `READING_ORDER_REVISION` |
| Derived OCR search | `ocr-search.mjs` (15 nodes, grouped with the Urdu pipeline community), `createOcrDerivedSearch`, `foldWithMap`, `SEARCH_PROVENANCE`, `invalidationKey` |
| Provider-specific indexing/provenance | OCR contract community (`OCR_PROVIDERS`, `OCR_REQUIRED_PROVIDERS`, `providerSupportsUnit`) plus per-provider records persisted through `createOcrStore` |
| Cancellation | supervisor nodes shared with the runtime bridge; `ocr-urdu-cancellation.test.mjs` community (14 nodes) |
| Update/rollback | `engine-store.mjs` (`createEngineStore`, `writeActivation`), `update-manager.mjs` (`stageUpdate`, `activateUpdate`, `rollback`), `specialist-provisioning.mjs` staging hooks |
| Source immutability boundary | `pdf-adapter.ts` / `resource-boundary.ts` communities unchanged by this delta; OCR remains outside them |

OCR-related nodes in the graph now total **431** (`/ocr/` sources), up from 250 at
the Phase 17 foundation.

## Honest limitations of this audit

- Semantic (LLM) extraction is unavailable in this environment (no Gemini key),
  so the delta is **structural**; the 4% INFERRED edges come from the
  extractor's own heuristics, not from an LLM pass, and are labelled as such.
- `graphify-out/` stays outside Git. `GRAPH_REPORT.md`'s "Built from commit"
  line still names the previous HEAD (`1347f3f9`) because that metadata is
  captured at build time and was not regenerated with a label pass; the graph
  itself demonstrably contains every new file from this run (counts above), which
  is the fact that matters for coverage.
- The version mismatch carried from the earlier runs remains: package `0.9.57`
  versus the installed skill text (`0.9.17`).

Architecture-conformance queries answered from the graph:

- The benchmark modules import the provider contract (`OCR_PROVIDERS`,
  `OCR_REQUIRED_PROVIDERS`) and the existing Arabic text representations; they do
  **not** import any engine API, any reader component, or the PDF adapter.
- No import cycle was introduced by the new modules.
- `server/ocr/` remains the only production boundary that spawns a process
  (`child_process` appears only there, including the benchmark renderer).

Honest limitations of this addendum:

- Semantic (LLM) extraction was again **skipped** (no LLM backend is configured
  in this environment; the CLI reports that it needs an API key for semantic
  extraction). The delta is structural AST extraction only, and no inferred
  semantic edges were contributed by this run.
- The dangling-endpoint and collapsed same-endpoint counts are the same
  pre-existing extractor artefact class recorded in the Phase 17 foundation
  audit; they are recorded, not hidden, and are not import cycles.
- `graphify-out/` stays outside Git; only this sanitized summary is committed.
