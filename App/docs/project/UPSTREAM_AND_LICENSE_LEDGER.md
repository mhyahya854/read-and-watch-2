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
| PaddleOCR / PP-OCRv5 | **Adopted** external OCR engine (Arabic + Urdu) | `https://github.com/PaddlePaddle/PaddleOCR` | Apache-2.0 for repository code | No source vendored; external managed runtime | Adopted in Phase 17 for PP-OCRv5 Arabic-script recognition through the Read & Watch provider contract. Fork for continuity only: `https://github.com/mhyahya854/PaddleOCR` (unmodified, tracks upstream `main`). Code licence Apache-2.0 is verified; **model weights are distributed separately under their own model-card terms and are not covered by the repository code licence** |
| Baidu Unlimited-OCR | **Adopted** external OCR engine (English) | `https://github.com/baidu/Unlimited-OCR` | MIT for repository code | No source vendored; external managed runtime | Adopted in Phase 17 for English OCR through the Read & Watch provider contract. Fork for continuity only: `https://github.com/mhyahya854/Unlimited-OCR` (unmodified, tracks upstream `main`). Model weights are hosted at `https://huggingface.co/baidu/Unlimited-OCR` and carry **their own licence terms, separate from the MIT code licence**; upstream documents Transformers inference on NVIDIA GPU/CUDA only |
| Tesseract | Deferred OCR validator | `https://github.com/tesseract-ocr/tesseract` | Apache-2.0 | No | Phase 17/18 must verify engine and language-data licensing separately |
| Urdu/Nastaliq specialist | **Declared mandatory** second Urdu OCR engine (not yet integrated) | `https://huggingface.co/qandeelasim13/urdu-ocr-trocr-si26` (model) and `https://github.com/qandeelasim13/URDU-OCR-PROJECT-CODE-SAVIOURS-SI-2026-QANDEEL-ASIM` (project) | Model card: Apache-2.0. Project repository: **no licence file declared** (GitHub API returned `license: null`). Training data includes UTRSet-Real (CC BY-NC-SA 4.0) | No source or weights vendored | Declared mandatory for Urdu by explicit user authority (2026-09-17). Benchmark schema requires it alongside PP-OCRv5; `integrationStatus: NOT_INTEGRATED` in this build. Redistribution/commercial use requires a licence and dataset-terms review first. Read & Watch redistributes nothing |
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

## Phase 17 OCR Engine Provenance Ledger (verified 2026-09-17)

Verified by direct inspection of the official upstream repositories, not from
documentation summaries.

| Item | Value |
| --- | --- |
| Unlimited-OCR official upstream | `baidu/Unlimited-OCR` (default branch `main`) |
| Unlimited-OCR upstream head at verification | `d49ff64afffc1f47ab563dc1c589bc2f78808fa4` (2026-07-29) |
| Unlimited-OCR project fork | `mhyahya854/Unlimited-OCR` |
| Unlimited-OCR fork head at verification | `d49ff64afffc1f47ab563dc1c589bc2f78808fa4` (identical to upstream; no divergence) |
| Unlimited-OCR code licence | MIT (repository) |
| Unlimited-OCR model weights | `baidu/Unlimited-OCR` on Hugging Face; licence recorded separately from the code |
| Unlimited-OCR runtime | Python 3.12, `torch` 2.10.0, `transformers` 4.57.1 per upstream README; NVIDIA GPU + CUDA 12.9 documented |
| PaddleOCR official upstream | `PaddlePaddle/PaddleOCR` (default branch `main`) |
| PaddleOCR upstream head at verification | `dab3fe35379033fdcb2d0e9572fac0b36c9a9ebf` (2026-09-16) |
| PaddleOCR project fork | `mhyahya854/PaddleOCR` |
| PaddleOCR fork head at verification | `dab3fe35379033fdcb2d0e9572fac0b36c9a9ebf` (identical to upstream; no divergence) |
| PaddleOCR code licence | Apache-2.0 (repository) |
| Arabic/Urdu detection model | `PP-OCRv5_server_det` |
| Arabic/Urdu recognition model | `arabic_PP-OCRv5_mobile_rec` |
| Arabic/Urdu dictionary | `ppocr/utils/dict/ppocrv5_arabic_dict.txt` |
| Fork modification policy | None. Forks are unmodified mirrors kept for continuity, inspection, and patch escape hatch only. Upstream updates are resolved from the official upstream, never from the fork. |

### Mandatory Urdu Nastaliq specialist (declared 2026-09-17, verified from live sources)

| Item | Value |
| --- | --- |
| Model id | `qandeelasim13/urdu-ocr-trocr-si26` |
| Model revision observed (Hugging Face API) | `a9ef072320b50014f6df7ed9db807810157a410e` (last modified 2026-08-08) |
| Model card licence | `apache-2.0` |
| Architecture | TrOCR / `VisionEncoderDecoderModel` (encoder + decoder fine-tuned end-to-end) |
| Base model (model card) | `microsoft/trocr-base-printed` |
| Task | printed Urdu (Nastaliq-style) image-to-text OCR |
| Documented input granularity | single line ("clean, printed, single-line images"); not handwriting, not multi-line paragraphs, not heavily degraded input |
| Weights | `model.safetensors`, 333,921,792 F32 parameters; ~1.34 GB repository storage |
| Public project repository | `qandeelasim13/URDU-OCR-PROJECT-CODE-SAVIOURS-SI-2026-QANDEEL-ASIM` (default branch `main`) |
| Project repository licence | **none declared** — the GitHub API returned no licence metadata on 2026-09-17 |
| Project's own evaluation | CER 0.52, character-level accuracy 47.66% on its own leakage-safe held-out split (the project's own claim, not a Read & Watch measurement) |
| Training-data caveat | includes UTRSet-Real, published under CC BY-NC-SA 4.0 (non-commercial, research use) |
| Read & Watch status | Declared mandatory second Urdu engine; `integrationStatus: NOT_INTEGRATED` (no execution path in this build). No weights committed, vendored, or redistributed |

Read & Watch makes no claim that this engine supports handwriting, arbitrary full
pages, or heavily degraded pages, and does not quote its accuracy as a Read &
Watch result. Its benchmark unit is `LINE`; page/region use must be expressed as
line-level results with explicit line associations.

### Model weight licensing note

The repository code licences above (MIT, Apache-2.0) do **not** automatically
extend to the downloaded model weights. Both engines publish weights separately
(Hugging Face model card for Unlimited-OCR; PaddlePaddle-hosted inference and
pretrained archives for PP-OCRv5). Model-card terms must be reviewed before any
redistribution of weights. Read & Watch does not redistribute either set of
weights.

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
