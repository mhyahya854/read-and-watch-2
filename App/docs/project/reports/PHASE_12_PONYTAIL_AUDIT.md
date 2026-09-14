# Phase 12 Ponytail Audit — Export and Portability

**Date:** 2026-09-14  
**Phase:** PHASE-12  
**Auditor:** Antigravity automated audit

---

## Summary

| Metric | Value | Status |
|---|---|---|
| New runtime npm packages added | **1** (`pdf-lib@1.17.1` exact-pinned) | PASS (Planned) |
| Unneeded zip / archive libraries | **0** (JSON with base64 asset payload) | PASS |
| Over-engineered backup daemon / scheduler | **0** (Pure user-triggered export) | PASS |
| Speculative cross-cloud export sync adapters | **0** (100% local-only) | PASS |
| Reinvented standard library / platform features | **0** | PASS |
| Source publication files touched | **0** (Byte-identical) | PASS |

---

## Dependency & Surface Area Audit

### 1. Minimal Dependency Sizing: `pdf-lib` Only
- The phase required a mechanism to produce valid PDF derivatives with embedded highlight annotations and a summary page.
- Rather than importing heavy multi-megabyte PDF toolkits, CLI wrappers, or native binaries, `pdf-lib@1.17.1` was exact-pinned in `package.json`.
- It is strictly restricted to `server/portability-store.mjs` for *exporting* new derivative files; it is forbidden from acting as a reader or viewer.
- The Technology Ledger (`TECHNOLOGY_LEDGER.md`) and Upstream Ledger (`UPSTREAM_AND_LICENSE_LEDGER.md`) were updated with strict role boundaries.

### 2. Zero Archive Library Bloat
- Full backup bundles (`.rwbackup`) use a clean, structured JSON document with base64-encoded image payloads for canvas assets (following the existing `.rwcanvas` pattern).
- Avoided adding `archiver`, `adm-zip`, `jszip`, or `tar` npm packages.
- A standard `.rwbackup` is self-contained, human-inspectable, and streamable directly over standard HTTP with zero compression artifacts or zip-slip attack vectors.

### 3. Native Platform Features
- **File Downloads**: Standard HTML5 `<a>` blob downloads with `URL.createObjectURL`.
- **Atomic File Writing**: Native Node `renameSync` with process PID and timestamp guards (`writeAtomic`).
- **Cryptographic Hashes**: Built-in `node:crypto` `createHash('sha256')` for content fingerprinting and provenance verification.
- **Path Sanitization**: Standard regex matching and path resolution guards (`assertSafePath`) without third-party path validators.

---

## Code Simplicity & Net Sizing

| Component | Lines | Role |
|---|---|---|
| `lib/portability/types.ts` | ~160 | Portable schema definitions & types |
| `lib/portability/validation.ts` | ~170 | Fail-closed schema & path security guards |
| `lib/portability/client.ts` | ~140 | Browser export triggers & preflight/restore client |
| `server/portability-store.mjs` | ~1000 | Core export, backup, restore & derivative engine |
| `server/portability-vite-plugin.mjs` | ~190 | HTTP API route integration |
| `components/settings/portability-settings.tsx` | ~460 | User-facing backup & restore preflight UI |
| `tests/portability-store.test.mjs` | ~460 | Unit & round-trip integration test suite |

### What was cut or simplified:
- **No Over-Engineered Streaming Formats**: Structured JSON handles full library backups quickly and transparently.
- **No Background Polling or Sync Daemons**: Backups are generated on-demand at user request.
- **No Lossy Markdown Conversion for Core Backups**: Markdown is truthfully documented and treated as a human-readable projection; canonical lossless restores use versioned JSON schemas.
- **No Source Book Ingestion in Backups**: Source EPUB/PDF publications are never copied into the backup, avoiding multi-gigabyte bloat and preventing accidental file overwrites.

---

## Conclusion
Phase 12 delivers complete, verified export and portability capabilities with minimal code, zero archive library bloat, and standard platform simplicity.
