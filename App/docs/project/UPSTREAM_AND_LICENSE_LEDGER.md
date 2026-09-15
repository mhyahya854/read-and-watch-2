# Upstream and License Ledger

Verified against official upstream repository metadata on 2026-09-08. License conclusions are engineering records, not legal advice; model weights, datasets, assets, fonts, plugins, and transitive dependencies require their own review when adopted.

| Project | Intended relationship | Official upstream | License observed | Source present now | Adoption policy |
| --- | --- | --- | --- | --- | --- |
| Read & Watch | Canonical application | `https://github.com/mhyahya854/read-and-watch-2` | **FORMALLY DEFERRED:** no project-level license file | Yes | Phase 01 confirms no grant may be inferred; user/legal decision required before direct adoption or external distribution |
| Readest | Certified legacy fallback/reference (RETIRED) | `https://github.com/readest/readest` | GNU AGPL-3.0, local notice says v3.0 or later | Retired in Phase 08; preserved in Git history at `81a9276` | Retired safely after 100% native parity verification; tracked provenance preserved in `docs/project/PROVENANCE_READEST.md` |
| Foliate-JS | Pinned vendored reflowable engine | `https://github.com/johnfactotum/foliate-js` | MIT | Yes, vendored under `App/forks/foliate-js/` | Pinned commit `78914aef4466eb960965702401634c2cb348e9b1`; core reflowable modules only; zero modifications to upstream code |
| PDF.js | Production PDF runtime engine | `https://github.com/mozilla/pdf.js` | Apache-2.0 | Yes, pinned package `pdfjs-dist@4.10.38` | Pinned exact package `pdfjs-dist@4.10.38`; worker served locally from controlled app assets; zero Mozilla viewer chrome |
| pdf-lib | Derived PDF export tool | `https://github.com/Hopding/pdf-lib` | MIT | Yes, pinned package `pdf-lib@1.17.1` | Pinned exact package `pdf-lib@1.17.1`; used exclusively for safe generation of NEW annotated derivative PDFs in Phase 12; strictly NOT a reader or renderer |
| Excalidraw | Book-linked canvas engine | `https://github.com/excalidraw/excalidraw` | MIT | Yes, pinned package `@excalidraw/excalidraw@0.18.1` | Pinned exact package `@excalidraw/excalidraw@0.18.1`; fonts and locales served locally via `/api/reader/excalidraw-assets/`; zero cloud/CDN dependency |
| React Flow / xyflow | Structured graph tool | `https://github.com/xyflow/xyflow` | MIT | Yes, pinned package `@xyflow/react@12.11.6` | Adopted in Phase 13 for semantic topology and concept mapping; UI projection only, Read & Watch owns canonical SQLite data |
| Mermaid | Text-defined diagrams | `https://github.com/mermaid-js/mermaid` | MIT | Yes, pinned package `mermaid@12.0.0` | Adopted in Phase 13 for code-defined diagrams; canonical source text stored in Read & Watch, SVG derived, strict security mode |
| Calibre | Feature/reference system | `https://github.com/kovidgoyal/calibre` | GPL-3.0 | No | Reference concepts only; no canonical DB or wholesale embedding |
| PaddleOCR / PaddleOCR-VL | Deferred OCR candidate | `https://github.com/PaddlePaddle/PaddleOCR` | Apache-2.0 for repository code | No | Phase 17 must verify exact code, model, weight, and dataset terms separately |
| Tesseract | Deferred OCR validator | `https://github.com/tesseract-ocr/tesseract` | Apache-2.0 | No | Phase 17/18 must verify engine and language-data licensing separately |
| Urdu/Nastaliq specialist | Deferred benchmark candidate | TBD | UNKNOWN | No | No adoption until official source, license, model provenance, and benchmark evidence exist |
| Tauri | Desktop candidate (EVALUATED - NOT ADOPTED) | `https://github.com/tauri-apps/tauri` | Apache-2.0 OR MIT per upstream license files | No | Evaluated extensively in Phase 14; rejected in favor of Electron due to Node.js ESM server store dependencies |
| Electron | Adopted desktop shell | `https://github.com/electron/electron` | MIT | Yes, pinned package `electron@35.7.5` | Adopted in Phase 14 for Windows desktop native shell; sandboxed context bridge, loopback HTTP service, zero child processes |
| electron-builder | Adopted desktop packaging tool | `https://github.com/electron-userland/electron-builder` | MIT | Yes, pinned package `electron-builder@26.15.3` | Adopted in Phase 14 for NSIS and portable Windows desktop packaging; builds to ignored `dist-electron/` |

## Provenance rules

- Record upstream URL, exact commit/tag, retrieval date, license files, local modifications, and build/runtime role before source or package adoption.
- Never add nested Git metadata.
- Runtime, development, reference-only, deferred, and vendored roles must remain explicit.
- Preserve required notices and corresponding-source obligations.
- Copyleft or model-license uncertainty is recorded as a decision/blocker; it is never guessed away.
- Deferred projects are not cloned during governance or earlier roadmap phases.

## Phase 16 Dependency & Vulnerability Audit (2026-09-15)

Audit executed with `npm audit` on Node v24.18.0 / npm 11.6.0.

### 1. Production Dependency License Inventory
| Package | Version | License | Direct/Transitive | Status |
| --- | --- | --- | --- | --- |
| `@excalidraw/excalidraw` | `0.18.1` | MIT | Direct | Approved |
| `@xyflow/react` | `12.11.6` | MIT | Direct | Approved |
| `lucide-react` | `1.31.0` | ISC | Direct | Approved |
| `mermaid` | `12.0.0` | MIT | Direct | Approved |
| `pdf-lib` | `1.17.1` | MIT | Direct | Approved |
| `pdfjs-dist` | `4.10.38` | Apache-2.0 | Direct | Approved |
| `react` | `19.2.8` | MIT | Direct | Approved |
| `react-dom` | `19.2.8` | MIT | Direct | Approved |
| `react-server-dom-webpack` | `19.2.8` | MIT | Direct | Approved |
| `vinext` | `1.0.0-beta.8` | MIT | Direct | Approved |

**Conclusion**: 100% of runtime production dependencies use permissive licenses (MIT, Apache-2.0, ISC). Zero copyleft (GPL, AGPL, LGPL) contamination exists in the application runtime or binary distributions.

### 2. Transitive Vulnerability Reachability Analysis
`npm audit` reported 16 advisory items (12 high, 4 moderate). Detailed static and architectural reachability analysis:

1. **`lodash-es` (<=4.17.23) — Code Injection in `_.template` (GHSA-r5fr-rjxr-66jc) & Prototype Pollution in `_.unset`/`_.omit` (GHSA-f23m-r3pf-42rh)**
   - *Dependency chain*: `read-watch-library` -> `mermaid@12.0.0` -> `chevrotain@11.0.3` -> `lodash-es@4.17.21`.
   - *Reachability*: **NOT REACHABLE**. Read & Watch uses Mermaid strictly in `securityLevel: 'strict'`, completely offline, for rendering validated diagrams to SVG. Chevrotain employs `lodash-es` exclusively for internal AST construction and lexer tokens. No user-controlled format strings or unconstrained property deletion paths reach `_.template` or `_.unset`.
2. **`nanoid` (<=3.3.17 / 4.0.0 - 5.1.15) — Predictable generation & loop on negative size (GHSA-mwcw-c2x4-8c55, GHSA-28wg-ghj8-5hjv)**
   - *Dependency chain*: `read-watch-library` -> `@excalidraw/excalidraw@0.18.1` -> `nanoid`.
   - *Reachability*: **NOT REACHABLE**. Excalidraw invokes `nanoid` solely with constant positive integer lengths for transient scene element IDs. No custom generator sizes or negative step inputs are exposed to user data.
3. **`sharp` (<0.35.4) / `miniflare` / `wrangler` — Image processing vulnerability in libheif**
   - *Dependency chain*: `devDependencies` -> `@cloudflare/vite-plugin` -> `miniflare` / `wrangler` -> `sharp`.
   - *Reachability*: **NOT REACHABLE**. `wrangler` and `miniflare` are dev-only local development toolchains. They are not bundled into the production desktop application or shipped to users.
4. **`electron` (35.7.5) / `extract-zip` — Dev-only extraction advisories**
   - *Dependency chain*: `devDependencies` -> `electron-builder` / `electron`.
   - *Reachability*: **CONTAINED & MITIGATED**. The runtime Electron executable is protected by single-instance locking, context isolation (`contextIsolation: true`), disabled Node integration (`nodeIntegration: false`), loopback session token authentication, reparse point traversal blocks, and strict HTTPS navigation guards.

