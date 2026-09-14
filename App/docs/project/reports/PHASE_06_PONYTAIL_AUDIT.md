# Phase 06 Ponytail Audit

Result: PASS

Scope: Phase 06 PDF Engine, Mozilla PDF.js integration, high-DPI canvas rendering, synchronized text layer, local worker routes, and capability-driven reader controls.

## Complexity & Dependency Review

1. **Exact Minimal Dependency Pin**:
   - Pinned exact official npm package: `"pdfjs-dist": "4.10.38"` (Apache-2.0, SHA-1 `3ee698003790dc266cc8b55c0e662ccb9ae18f53`).
   - Production security audit verified: `npm audit --omit=dev` reports **0 vulnerabilities**.
   - Zero additional wrapper packages or helper libraries added.

2. **Rejection of Mozilla Viewer Bloat**:
   - Mozilla PDF.js distribution ships with a heavyweight default viewer (`viewer.html`, `viewer.js`, extensive toolbars, sidebars, print managers, and presentation modes exceeding 15,000 lines).
   - Intentionally rejected and excluded the entire Mozilla viewer layer.
   - Built a lightweight, production-grade `PdfAdapter` (~1,000 lines) that talks directly to the PDF.js core engine (`getDocument`, `getPage`, `getTextContent`, `render`), encapsulated behind the canonical `DocumentAdapter` contract.
   - All reader UI is 100% Read & Watch owned using Phase 03 Warm Editorial design tokens.

3. **Self-Contained High-DPI & Text Layer Geometry**:
   - High-DPI canvas backing store scaling implemented with native browser math (`Math.floor(viewport.width * boundedDpr)`), bounded by `MAX_CANVAS_DIMENSION = 8192` to prevent memory exhaustion on mobile or extreme zoom levels.
   - Synchronized text layer uses PDF.js's standard `TextLayer` class mapped directly to the unscaled CSS viewport, achieving zero coordinate drift without custom positioning libraries.

4. **Zero OCR Footprint**:
   - Strictly rejected all OCR libraries (`tesseract.js`, `paddleocr`, etc.), eliminating ~30MB of bloated node modules, heavy wasm binaries, and CPU overhead.
   - Scanned and image-only PDFs degrade capabilities truthfully (`hasText: false`, `textSearch: false`, etc.) without faking OCR text.

5. **Minimal Server-Side Asset Delivery**:
   - Added minimal (~30 lines) in `reader-vite-plugin.mjs` to serve local PDF.js worker, CMaps, and standard fonts directly from `node_modules/pdfjs-dist/` with `X-Content-Type-Options: nosniff` and immutable caching headers.
   - Zero third-party CDN connections required; 100% offline-capable.

6. **Format-Branching Elimination**:
   - Presentation components in `app/reader/[id]/page.tsx` query adapter capabilities (`canZoom`, `canPaginate`, `canSearch`, `canAdjustFont`) and instantiate adapters via `defaultAdapterRegistry.createAdapter(source)`, eliminating all format-conditional branching (`format === 'pdf'`).

## Findings

- `delete:` Mozilla viewer chrome and unused helper packages. Replacement: nothing.
- `native:` Canvas high-DPI scaling using `window.devicePixelRatio`.
- `stdlib:` URL parameter decoding and Node 24 native streams for local worker serving.
- `yagni:` OCR worker pipelines and cloud vision dependencies. Replacement: truthful capability reporting.

Lean already. Ship.
