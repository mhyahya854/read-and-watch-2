# Upstream and License Ledger

Verified against official upstream repository metadata on 2026-09-08. License conclusions are engineering records, not legal advice; model weights, datasets, assets, fonts, plugins, and transitive dependencies require their own review when adopted.

| Project | Intended relationship | Official upstream | License observed | Source present now | Adoption policy |
| --- | --- | --- | --- | --- | --- |
| Read & Watch | Canonical application | `https://github.com/mhyahya854/read-and-watch-2` | **FORMALLY DEFERRED:** no project-level license file | Yes | Phase 01 confirms no grant may be inferred; user/legal decision required before direct adoption or external distribution |
| Readest | Certified legacy fallback/reference | `https://github.com/readest/readest` | GNU AGPL-3.0, local notice says v3.0 or later | Yes, vendored and pinned | Preserve notices/provenance; keep separate fallback; legal review before changed distribution |
| Foliate-JS | Reflowable engine / possible pinned fork | `https://github.com/johnfactotum/foliate-js` | MIT | No deferred clone | Research capability and pin exact commit in Phase 05 |
| PDF.js | PDF runtime engine | `https://github.com/mozilla/pdf.js` | Apache-2.0 | No direct source; no planned bootstrap install | Pin package/source and notices in Phase 06 |
| pdf-lib | Derived export tool | `https://github.com/Hopding/pdf-lib` | MIT | npm dependency present; unused | Keep only when a verified export task needs it; otherwise remove in phase scope |
| Excalidraw | Book-linked canvas engine | `https://github.com/excalidraw/excalidraw` | MIT | No | Pin package/source and review assets/notices in Phase 10 |
| React Flow / xyflow | Structured graph tool | `https://github.com/xyflow/xyflow` | MIT | No | Adopt only for topology-dependent Phase 13 work |
| Mermaid | Text-defined diagrams | `https://github.com/mermaid-js/mermaid` | MIT | Placeholder only | Research and pin only when Phase 13 authorizes integration |
| Calibre | Feature/reference system | `https://github.com/kovidgoyal/calibre` | GPL-3.0 | No | Reference concepts only; no canonical DB or wholesale embedding |
| PaddleOCR / PaddleOCR-VL | Deferred OCR candidate | `https://github.com/PaddlePaddle/PaddleOCR` | Apache-2.0 for repository code | No | Phase 17 must verify exact code, model, weight, and dataset terms separately |
| Tesseract | Deferred OCR validator | `https://github.com/tesseract-ocr/tesseract` | Apache-2.0 | No | Phase 17/18 must verify engine and language-data licensing separately |
| Urdu/Nastaliq specialist | Deferred benchmark candidate | TBD | UNKNOWN | No | No adoption until official source, license, model provenance, and benchmark evidence exist |
| Tauri | Provisional desktop shell | `https://github.com/tauri-apps/tauri` | Apache-2.0 OR MIT per upstream license files | Indirectly present inside vendored Readest only | Phase 14 decision and exact-version pin required before direct adoption |

## Provenance rules

- Record upstream URL, exact commit/tag, retrieval date, license files, local modifications, and build/runtime role before source or package adoption.
- Never add nested Git metadata.
- Runtime, development, reference-only, deferred, and vendored roles must remain explicit.
- Preserve required notices and corresponding-source obligations.
- Copyleft or model-license uncertainty is recorded as a decision/blocker; it is never guessed away.
- Deferred projects are not cloned during governance or earlier roadmap phases.
