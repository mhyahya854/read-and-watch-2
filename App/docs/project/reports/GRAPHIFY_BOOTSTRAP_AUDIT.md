# Graphify Bootstrap Audit

Run: 2026-09-08

Result: PASS

## Scope

The existing Graphify corpus is the authored React application subtree. The 9,000-plus-file vendored Readest tree remains a provenance-pinned third-party unit and was not folded into the authored-app architecture graph. Generated graph artifacts remain under the external data root.

## Refresh

- Existing graph inspected before refresh: 237 nodes, 254 edges, 14 communities
- Detected authored corpus: 35 supported files, approximately 7,759 words
- Incremental change set: 23 files (21 code, one document, one image), no deletions
- Sensitive files skipped: 0
- Refreshed graph: 326 nodes, 402 edges, 22 communities
- Diff: 112 new nodes, 171 new edges, 23 removed nodes, 23 removed edges
- Semantic extraction token accounting: 0 input, 0 output; host extraction covered the document/image chunks

## Integrity

- Missing endpoint edges: 0
- Dangling endpoint edges: 0
- Self-loops: 0
- Exact duplicate edges: 0
- Directed or undirected same-endpoint collapsed edges: 0
- Relation/source/source-location variant groups: 0
- Post-build graph type: Graph

## Architecture signals

The refreshed communities separate library UI, reader resolution/security, reader client UI, user-data persistence/editing, data-path boundaries, configuration/tooling, and application identity. The graph now includes the Task 2 and Task 3 code absent from the prior map.

## Tooling note

The executable package reports Graphify 0.9.53 while the installed Codex skill package reports 0.9.17. The prescribed refresh, HTML export, report generation, graph diff, and integrity diagnostics all passed. This is a non-blocking tooling-maintenance item, not a fabricated version match.

## Outputs

Heavy/generated `graph.json`, `graph.html`, health data, cache, manifest, and full report remain external. This sanitized summary is the only Git-tracked Graphify output.
