# PDF.js Provenance & Upstream Ledger

## 1. Upstream Identity

- **Project**: Mozilla PDF.js
- **Official Repository**: `https://github.com/mozilla/pdf.js`
- **Official Distribution Package**: `pdfjs-dist` (npm)
- **Maintainer / Organization**: Mozilla Corporation & Community
- **License**: Apache License 2.0 (`Apache-2.0`)
- **Package Version**: `4.10.38` (Pinned exactly without caret or tilde)
- **Release Date**: 2025-01-01
- **Package Tarball**: `https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-4.10.38.tgz`
- **Tarball SHA-1**: `3ee698003790dc266cc8b55c0e662ccb9ae18f53`
- **Tarball Integrity**: `sha512-/Y3fcFrXEAsMjJXeL9J8+ZG9U01LbuWaYypvDW2ycW1jL269L3js3DVBjDJ0Up9Np1uqDXsDrRihHANhZOlwdQ==`

## 2. Acquisition & Boundary Rationale

1. **Package vs Source Vendoring**:
   - The full Mozilla PDF.js upstream repository is over 150 MB containing demo viewer UI, Firefox extension code, automated browser harness, and legacy build pipelines.
   - The official `pdfjs-dist` package contains solely the compiled engine runtime: `build/pdf.mjs`, `build/pdf.worker.mjs`, `cmaps/`, `standard_fonts/`, and TypeScript definitions (`types/`).
   - `pdfjs-dist` contains zero demo viewer chrome and zero third-party runtime dependencies.
   - Pinned exact acquisition via `pdfjs-dist@4.10.38` provides an immutable, reproducible, clean installation without vendoring the entire Mozilla repository.

2. **Security & Vulnerability Analysis**:
   - Historical CVE-2024-4367 (arbitrary code execution via font matrix evaluation) was patched in PDF.js 4.2.67.
   - Version `4.10.38` represents the final, stable, cumulative bugfix release of the v4 series, incorporating all security fixes.
   - `npm audit --omit=dev` confirms **0 vulnerabilities** in the production dependency tree.

3. **Runtime & Engine Constraints**:
   - Zero PDF JavaScript execution (`isEvalSupported: false`, `enableScripting: false`).
   - Zero Launch actions or external process triggers.
   - Zero automatic fetching of remote network assets.
   - Worker runtime is strictly version-matched and served from local controlled assets (`/api/reader/pdfjs/worker.mjs`), with zero public CDN dependencies.
   - Text layers are rendered with pure CSS/DOM synchronized over canvas geometry without third-party viewer wrappers.
