# Read & Watch — Hardening Benchmarks and Budgets Specification

**Phase:** `PHASE-16` — Performance, Security, and Reliability Hardening  
**Task ID:** `P16-T001`  
**Status:** FROZEN  
**Effective Starting Commit:** `bfd6e0153ec9b745f48e2aac1801449f7072a8ce`  
**Application Version:** `0.1.0`  

---

## 1. Purpose & Authority

This document defines the binding performance budgets, memory stability invariants, security boundaries, and reliability criteria for *Read & Watch*. In accordance with Master Plan Phase 16 directives, this specification is committed **before** optimizations are designed or evaluated, guaranteeing that pass/fail thresholds cannot be retroactively manipulated to match observed results.

All measurements must be evaluated against these frozen budgets. If an honest architectural limitation prevents meeting a budget, governance requires recording a formal blocker rather than moving the target.

---

## 2. Benchmark Machine & Execution Environment

Measurements must be conducted on the canonical development and qualification host:

| Property | Canonical Specification |
| :--- | :--- |
| **Operating System** | Microsoft Windows 11 Build 26200 (64-bit) |
| **Processor (CPU)** | Intel(R) Core(TM) Ultra 5 125H (14 cores: 4P + 8E + 2LPE, 18 logical processors, base 1.2 GHz / boost 4.5 GHz) |
| **Physical Memory (RAM)** | 16.0 GB LPDDR5 |
| **Primary Storage** | NVMe SSD (KINGSTON SA2000M81000G PCIe 3.0 x4) |
| **Node.js Runtime** | v24.18.0 (Engine requirement: `>=22.13.0`) |
| **Electron Runtime** | 35.7.5 (Chromium 134, V8 13.4, Node 22.14) |
| **Packaging Tool** | electron-builder 26.15.3 |
| **SQLite Driver** | node:sqlite (native embedded C SQLite 3 engine) |

---

## 3. Methodological Definitions

### 3.1 Cold vs. Warm Executions
- **Cold Execution**: Measures latency from an unprimed state. Requires a fresh Node/Electron process, unprimed in-memory LRU/adapter caches, fresh SQLite statement cache, and newly resolved filesystem handles.
- **Warm Execution**: Measures in-process latency across repeated calls within an active session where SQLite connections, prepared statements, and V8 JIT optimizations are steady-state.

### 3.2 Sampling and Statistical Aggregation
- **Fast / Repetitive Operations** (library load, search, filter, sort, note load, bookmark save, location navigation): Minimum **10 iterations** per sample set. Evaluated using minimum, median ($p50$), 95th percentile ($p95$), and maximum.
- **Heavy / Lifecycle Operations** (cold desktop process start, initial large document parse, full FTS rebuild, full backup creation/restore): Minimum **3 to 5 iterations** under clean teardown.
- **Settling Period**: A mandatory 1,000ms idle settling interval must elapse between reader open/close cycles before sampling memory to allow garbage collection and asynchronous worker cleanup to settle.

### 3.3 Memory Metrics
- Process memory is evaluated using resident set size (`rss`), V8 heap allocated (`heapUsed`), and external worker allocations.
- Memory leak evaluation requires **5 consecutive reader open-and-close cycles** per engine family (PDF and reflowable). Monotonic net growth across the sequence is strictly forbidden: the memory plateau post-cycle 5 must not exceed post-cycle 1 by more than the failure threshold.

### 3.4 Known Sources of Noise
- Windows real-time Defender/Antivirus scanning on cold file access can introduce 50–150ms variance during cold file reads.
- Hybrid core scheduling (Intel Thread Director switching between P, E, and LPE cores) introduces minor statistical jitter; therefore, $p50$ (median) is the primary stability reference while $p95$ bounds tail latency.

---

## 4. Fixture Classifications & Scales

All benchmarks operate strictly on synthetic or lawful open fixtures. **No personal user publications, annotations, or paths are ever embedded in benchmark harnesses or committed artifacts.**

1. **Empty Library**: 0 items (baseline cold and empty state).
2. **Current-Scale Synthetic Library**: 151 items (mirroring the item count, format diversity, tag density, and metadata distribution of the current user collection).
3. **Medium Synthetic Library**: 1,000 items (10x current scale; tests quadratic UI regressions and query plan scaling).
4. **Large Synthetic Library**: 5,000 items (33x current scale; tests bounded virtualization and pagination stability).
5. **Large Text PDF**: Synthetic multi-page PDF document (>50 pages, dense selectable text layer).
6. **High-Page-Count PDF**: Multi-chapter synthetic PDF document (150+ pages with varying aspect ratios).
7. **Mixed/Rotated PDF**: PDF containing rotated orientations (90°, 180°, 270°) and heterogeneous page dimensions.
8. **Large Reflowable Book (EPUB)**: Multi-spine synthetic EPUB document (>20 chapters, deep TOC, internal images and CSS styling).

---

## 5. Frozen Performance & Memory Budgets

| Benchmark Scenario | Scope / Fixture | Metric | Frozen Budget (Max Allowable) |
| :--- | :--- | :--- | :--- |
| **Desktop Cold Launch** | Process spawn to loopback ready & UI rendered | $p50$ | $\le 3,500\text{ ms}$ |
| **Desktop Warm Status** | `/api/desktop/status` round-trip | $p95$ | $\le 50\text{ ms}$ |
| **Library Load (Current Scale)** | 151 catalog items fetch + JSON parse | $p50$ | $\le 50\text{ ms}$ |
| **Library Load (Medium Scale)** | 1,000 items fetch + JSON parse | $p50$ | $\le 150\text{ ms}$ |
| **Library Load (Large Scale)** | 5,000 items fetch + JSON parse | $p50$ | $\le 500\text{ ms}$ |
| **Library In-Memory Search** | 5,000 items title/author/tag filter | $p95$ | $\le 50\text{ ms}$ |
| **Library Multi-Criteria Sort** | 5,000 items sort by title/date/rating | $p95$ | $\le 50\text{ ms}$ |
| **Large PDF First Usable Page** | Open 100+ page PDF to page 1 render | $p50$ | $\le 1,500\text{ ms}$ |
| **Large PDF Page Navigation** | Sequential page flip with text layer | $p95$ | $\le 150\text{ ms}$ |
| **Large PDF Full-Text Search** | Multi-page text query across 50+ pages | $p50$ | $\le 1,000\text{ ms}$ |
| **Large EPUB Open & TOC** | Load multi-spine EPUB archive to chapter 1 | $p50$ | $\le 1,200\text{ ms}$ |
| **Large EPUB Navigation** | Cross-spine chapter flip & layout | $p95$ | $\le 300\text{ ms}$ |
| **Large EPUB In-Book Search** | Text search across all spine chapters | $p50$ | $\le 1,200\text{ ms}$ |
| **FTS Global Search Query** | SQLite FTS5 query with snippet extraction | $p95$ | $\le 50\text{ ms}$ |
| **FTS Full Index Rebuild** | 151 books + annotations + notes + canvas | $p50$ | $\le 1,500\text{ ms}$ |
| **FTS Scaled Index Rebuild** | 1,000 items + 2,000 annotations rebuild | $p50$ | $\le 5,000\text{ ms}$ |
| **Unified Backup Creation** | Complete catalog + user data export | $p50$ | $\le 2,500\text{ ms}$ |
| **Restore Validation & Preflight** | Parse manifest, verify checksums, dry run | $p50$ | $\le 2,000\text{ ms}$ |
| **Full Restore Round-Trip** | Unpack, write to clean disposable root | $p50$ | $\le 3,500\text{ ms}$ |
| **Idle Desktop Memory** | Main + Renderer + Loopback RSS | Plateau | $\le 250\text{ MB}$ |
| **Reader Peak Active Memory** | During active large document rendering | Peak | $\le 550\text{ MB}$ |
| **Post-Reader Settled Memory** | 1,000ms after closing active reader session | Plateau | $\le 300\text{ MB}$ |
| **Memory Growth (5 Cycles)** | Net change from cycle 1 to cycle 5 | Delta | $\le 30\text{ MB}$ (No runaway growth) |

---

## 6. Frozen Security Invariants & Attack Budgets

| Vector | Requirement | Budget |
| :--- | :--- | :--- |
| **Path Traversal (`../`, `..\`, `%2e%2e`, UNC, ADS)** | All relative and absolute paths must be strictly contained inside assigned root | **0 bypasses permitted** (Fail Closed) |
| **Windows Reparse Points (Symlinks / Junctions)** | Operations escaping approved root via junctions or symlinks must be rejected | **0 escapes permitted** |
| **Source Publication Immutability** | Under all operations (reads, exports, restores, searches, annotations), source file bytes and mtimes must remain 100% unchanged | **0 mutations permitted** |
| **Archive Traversal (Zip-Slip)** | Archives (EPUB, CBZ, rwbackup) with malicious entry paths must be rejected before extraction | **0 escapes permitted** |
| **Loopback Authentication** | All non-status `/api/*` endpoints must require valid `X-ReadWatch-Session-Token` and match `Origin: http://127.0.0.1:<port>` | **0 unauthenticated accesses permitted** |
| **Process Execution Boundary** | No generic `exec`, `spawn`, `shell`, or dynamic command execution from renderer or loopback | **0 runtime process spawns permitted** |
| **External URL Navigation** | Only explicit `https:` schemes via `openExternalHttps` permitted; dangerous schemes (`file:`, `javascript:`, `data:`, `vbscript:`, `shell:`) blocked | **0 dangerous protocol launches** |
| **Mermaid Diagram Security** | Mermaid must remain in `securityLevel: strict` with zero script execution | **0 script evaluations permitted** |
| **Content Security Policy (CSP)** | Packaged desktop runtime must enforce strict CSP with no unauthorized remote connect or script endpoints | **0 CSP bypasses permitted** |

---

## 7. Frozen Fault Injection & Reliability Invariants

| Failure Scenario | Target | Invariant |
| :--- | :--- | :--- |
| **Transaction Abort / Interruption** | SQLite stores (`annotations`, `canvases`, `knowledge`, `search`) | Database must roll back cleanly; zero half-committed rows or corrupted schemas |
| **Atomic File Write Interruption** | Settings, user notes, file recovery mirrors | Atomic temporary write (`.tmp`) + rename pattern; existing file never corrupted |
| **Malformed Document Input** | Corrupt PDF headers, truncated EPUB ZIPs, invalid JSON, oversized schemas | Safe graceful rejection via `DocumentError` or HTTP 400; zero process crashes |
| **Derived FTS Corruption / Loss** | SQLite FTS virtual tables deleted or unindexed | Canonical data unaffected; clean automatic or explicit rebuild restores full state |
| **Settings Corruption** | `app-settings.json` contains invalid JSON or future schema | Automatic fallback to safe default settings; zero deletion of user publications or notes |
| **Corrupt Backup Bundle** | Checksum mismatch, missing payload, truncated zip | Preflight rejection; zero modifications to canonical data root |
