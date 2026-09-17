# Phase 17 Report — OCR Foundation

Status: **IN_PROGRESS** (not complete)

Date: 2026-09-17
Repository: `mhyahya854/read-and-watch-2`

---

## 1. Starting state

| Item | Value |
| --- | --- |
| Starting HEAD (local and `origin/master`) | `ada8b20205cfe3e51e461b0bc6e249e9b14d7408` |
| Phase 16 | COMPLETE (Windows baseline) |
| Phase 17 before this run | `NOT_STARTED`, blocked behind a pre-Phase-17 platform gate |
| Baseline test suite | 229/229 passing |

The pre-existing working tree contained uncommitted Stage 1 Windows
cross-platform certification work from an earlier run. It was inspected, found
coherent, and preserved in its own commit before Phase 17 work began. It was not
reset, reverted, or discarded.

---

## 2. Governance sequencing correction

By explicit user authority, the durable order changed from
`Windows → Arch → Ubuntu → macOS → OCR` to:

```
PHASE-16  completed Windows baseline
PHASE-17  OCR foundation and selected provider implementation
PHASE-18  OCR verification / uncertainty / correction, as evidenced
   then
Stage 1   Windows regression / clean certification
Stage 2   Arch Linux clean VM
Stage 3   Ubuntu LTS clean VM
Stage 4   macOS on authentic Apple-backed infrastructure
   then
PHASE-20  final release certification
```

Updated: `docs/project/MASTER_PLAN.md`,
`docs/project/CROSS_PLATFORM_DESKTOP_CERTIFICATION.md`,
`docs/project/RUN_STATE.json`, `docs/project/PHASE_INDEX.json`,
`PROJECT_STATE.md`, `DECISIONS.md` (D-053), `CHANGELOG.md`,
`docs/project/UPSTREAM_AND_LICENSE_LEDGER.md`.

No phase was renumbered, no task or gate ID was reused or invented, the 21-phase
plan is intact, the historical Windows certification is preserved, and no
platform certification status was upgraded. Arch, Ubuntu, and macOS remain
`NOT_STARTED`.

---

## 3. Forks (upstream preservation)

Both forks were created under the project account. Neither fork contains any
source modification.

| Engine | Official upstream | Fork | Fork head = upstream head |
| --- | --- | --- | --- |
| Unlimited-OCR | `https://github.com/baidu/Unlimited-OCR` | `https://github.com/mhyahya854/Unlimited-OCR` | `d49ff64afffc1f47ab563dc1c589bc2f78808fa4` (both) |
| PaddleOCR | `https://github.com/PaddlePaddle/PaddleOCR` | `https://github.com/mhyahya854/PaddleOCR` | `dab3fe35379033fdcb2d0e9572fac0b36c9a9ebf` (both) |

No upstream class, directory, or identity was renamed. No history was rewritten,
squashed, or force-pushed. No Read & Watch UI was injected into either upstream.
Neither repository was vendored into `App/app/`, and no Git submodule was
introduced.

**Update authority is official upstream, not the fork.** The application resolves
candidate revisions from `baidu/Unlimited-OCR` and `PaddlePaddle/PaddleOCR`
directly (`server/ocr/upstream-resolver.mjs`). The forks exist for continuity,
inspection, and as a patch escape hatch.

---

## 4. Selected engines, exact identifiers

### English — Baidu Unlimited-OCR

- Repository code licence: MIT.
- Model: `baidu/Unlimited-OCR` on Hugging Face (its own model-card terms apply;
  the MIT code licence does not automatically cover the weights).
- Upstream-documented runtime: Python 3.12, `torch==2.10.0`,
  `transformers==4.57.1`, NVIDIA GPU + CUDA 12.9.
- Read & Watch therefore does **not** claim universal execution. Hardware is
  probed and reported; without CUDA the provider returns `UNSUPPORTED_HARDWARE`.

### Arabic and Urdu — PaddleOCR PP-OCRv5 Arabic script

- Repository code licence: Apache-2.0.
- Detection model: `PP-OCRv5_server_det`.
- Recognition model: `arabic_PP-OCRv5_mobile_rec`.
- Dictionary: `ppocr/utils/dict/ppocrv5_arabic_dict.txt`.
- Verified from upstream `paddleocr/_pipelines/ocr.py`: every language in
  `ARABIC_LANGS = {ar, fa, ug, ur, ps, ku, sd, bal}` resolves to that same
  recognition head, so Arabic and Urdu share one model without a separate Urdu
  model name being invented.
- The dictionary was inspected directly and confirmed to contain fatha, damma,
  kasra, shadda, sukun, fathatan, dammatan, kasratan, superscript alef (U+0670),
  Quranic marks including saktah (U+06DC), and the Urdu-specific letters heh goal
  (U+06C1) and yeh barree (U+06D2) — 748 entries.

---

## 5. Runtime architecture

```
Read & Watch (Electron main / Node ESM)
  └── server/ocr/
        ocr-contract.mjs        provider contract, states, provenance, routing table
        native-text-gate.mjs    usable-native-text decision (P17-T001)
        router.mjs              gate + language routing + cache
        managed-provider.mjs    shared provider lifecycle (one factory, two engines)
        provider-unlimited-ocr.mjs   metadata binding only
        provider-paddleocr.mjs       metadata binding only
        runtime-bridge.mjs      supervised child process, JSON lines, token, cancel, teardown
        engine-store.mjs        external versions/, activation pointer, failure record
        update-manager.mjs      stage -> verify -> smoke -> activate / rollback
        ocr-store.mjs           derived, source-hash-bound result cache
        text-representations.mjs raw / display / canonical / search text
        upstream-resolver.mjs   official upstream revision resolution
        ocr-http.mjs            one HTTP surface shared by desktop and dev servers
        driver/engine_driver.py the ONLY place upstream Python APIs are touched
```

No reader component, store, or annotation layer imports a Baidu or Paddle API.
The engine never enters the Node/Electron dependency tree.

### Transport

Newline-delimited JSON over the child process's stdin/stdout. There is no network
listener, so there is nothing to bind publicly and no localhost service to
secure. A per-session token is passed through `argv` and echoed on every request;
the runtime rejects any request without it. Timeouts, in-band cancellation, and
guaranteed teardown are implemented; a test asserts the child process is really
gone after `dispose()`.

### External storage

```
READ_WATCH_DATA_ROOT/
  ocr/
    engines/<providerId>/versions/<revision>/
    engines/<providerId>/active.json        portable activation pointer
    engines/<providerId>/failed.json        last failed attempt
    models/<providerId>/<revision>/
    runtimes/<providerId>/<revision>/
    cache/<providerId>/<sourceHash>/
    temp/
    evidence/
```

Activation uses a JSON pointer, never a symbolic link. No absolute machine path
appears in committed source; a test scans the OCR sources for developer-machine
path patterns.

---

## 6. Native-text gate

Implemented and tested (`server/ocr/native-text-gate.mjs`, P17-T001). A usable
PDF.js text layer always wins; OCR runs only when the layer is absent,
whitespace-only, too sparse, or not meaningful (letter-ratio threshold). The
thresholds are frozen constants, and the decision carries its reason so it can
be audited. The router test proves the provider is never called for a page with
usable native text.

---

## 7. Arabic tashkeel policy

Three representations, plus one comparison key:

| Field | Rule |
| --- | --- |
| `rawText` | Exact provider output. Never rewritten. |
| `displayText` | Control characters and line endings normalised only. **No Unicode normalisation** — NFC canonically reorders Arabic combining marks (fatha has a lower combining class than shadda), which would silently change the string a user copies. Harakat are preserved. |
| `canonicalText` | NFC form used only for equality comparison, never for display. |
| `searchText` | Derived diacritic-insensitive key (marks and tatweel removed, alef/yeh variants folded) used only for matching. It never overwrites `rawText` or `displayText`. |

A `verifyTashkeelPreserved()` guard counts marks in `rawText` versus
`displayText`; a dropped harakah fails the guard, which is also how the future
Arabic tashkeel accuracy metric will treat it.

Tests prove that fatha, damma, kasra, shadda, sukun, all three tanween marks,
superscript alef, and Quranic marks survive the pipeline; that display text is
not re-ordered by normalisation; and that unvocalised queries still match
vocalised OCR output through the search key alone.

---

## 8. Urdu policy

Urdu routes to the same PP-OCRv5 Arabic-script head. Tests assert that Urdu
specific letters (heh goal U+06C1, yeh barree U+06D2, tteh U+0679, doachashmee
heh U+06BE) and diacritics survive the round trip, that raw output stays
available, that nothing is transliterated, and that search normalisation is a
separate derived value.

---

## 9. Canonical OCR result and provenance

Every result carries: `rawText`, `displayText`, `canonicalText`, `searchText`,
`blocks` with bounding boxes, page index, language, provider, provider (engine)
revision, model revision, confidence, `confidenceSource`, source hash, settings
key, render key, creation timestamp, and tashkeel verdict.

Confidence is reported as `null` with `confidenceSource: 'not-supplied'` when the
engine does not supply a trustworthy value. No confidence number is invented.

Cache validity is computed, not assumed: a record is stale if the source hash,
engine revision, model revision, or settings key changed.

---

## 10. Source immutability

OCR is derived data. A test runs the full routing pipeline and asserts the source
PDF remains byte-identical. The PDF adapter gained only an optional overlay
mount; it still contains no write API and no OCR-engine reference, and the
existing "no source-write path" gate still passes.

---

## 11. Update and rollback design

```
check official upstream
  -> stage into a new version directory (never touching the active revision)
  -> verify artifact hashes and sizes
  -> run staged runtime health check
  -> run synthetic smoke fixtures
  -> validate the adapter contract
  -> PASS: atomically switch the activation pointer (previous revision retained)
     FAIL: keep the current revision, record the failure, allow retry
rollback(): atomically switch back to the retained previous revision
```

Tests cover: staging does not activate; activation is refused without a passing
verification record; a failed stage or smoke test leaves the working revision
intact and records the failure; a successful update moves the pointer and keeps
the previous revision; rollback restores it; a corrupted artifact is rejected
and the tree is removed; provenance is persisted with the activation record.

**Documented limitation:** hashes are recorded at staging time and re-verified
afterwards, which detects post-staging corruption. Upstream publishes no
independent release checksums for these engines, so this is not a supply-chain
attestation.

---

## 12. Settings UI

An OCR section was added inside the existing Settings surface using the existing
visual language (section header, bordered surface, definition list, outline
buttons). It exposes: enable (default off), default language, update policy
(manual / check-for-updates only — never auto-activate), processing-location
statement, tashkeel statement, and per-provider status, installed revision,
previous revision, model revision, hardware/runtime notes, last update attempt,
install, check for update, update, rollback, and "Update all OCR engines".

No emoji, no gradients, no pill-everywhere layout, no fake progress, no invented
version numbers. Unknown values render as "Not reported" / "Not installed".

The overlay is marked in the DOM as `data-ocr-text-layer="derived"` with the
provider and language, so machine transcription is distinguishable from native
document text.

---

## 13. Tests

| Suite | Focus |
| --- | --- |
| `tests/ocr-native-text-gate.test.mjs` | usable-text bypass, sparse/noisy layers, non-Latin metrics |
| `tests/ocr-routing.test.mjs` | en→Unlimited-OCR, ar/ur→PP-OCRv5, refusal of unauthorised languages, structured unavailability, native bypass |
| `tests/ocr-text-representations.test.mjs` | tashkeel preservation, no normalisation reordering, search folding, tashkeel metric, Urdu round trip |
| `tests/ocr-update-manager.test.mjs` | staging, activation gating, failed/failed-smoke retention, atomic pointer switch, rollback, corrupt download rejection, provenance |
| `tests/ocr-runtime-bridge.test.mjs` | transport, token enforcement, readiness timeout, structured failure, cancellation, no orphan after shutdown |
| `tests/ocr-provenance-and-safety.test.mjs` | source immutability, source-hash binding, staleness, no network during recognition, driver has no network client, no machine paths, metadata provenance, external storage, path-escaping rejection |
| `tests/ocr-settings.test.mjs` | OCR defaults, patching, invalid values, reset data safety, export/import round trip |
| `tests/ocr-http.test.mjs` | inventory, unknown provider, method guard, structured update failure, update-all resilience, derived text validation |
| `tests/ocr-overlay.test.mjs` | percentage geometry, dropped-line retention, tashkeel in overlay, derived marking, clamping |

Two pre-existing tests were re-scoped rather than weakened (see DECISIONS.md
D-053 §8): `tests/no-active-readest.test.mjs` now proves `child_process` exists
only inside `server/ocr/` and never spawns a shell, and
`tests/pdf-source-immutability.test.mjs` now proves OCR stays out of the Node
dependency tree and out of the PDF adapter.

---

## 14. Real-engine smoke results

| Engine | Result |
| --- | --- |
| Unlimited-OCR (English) | **BLOCKED BY CURRENT HARDWARE.** Upstream documents Transformers inference on NVIDIA GPU/CUDA only; `nvidia-smi` is absent on this host and `torch.cuda.is_available()` is false. The driver returns `UNSUPPORTED_HARDWARE`. No result is claimed. |
| PP-OCRv5 (Arabic/Urdu) | **Runtime blocked on this host.** Official models downloaded and the pipeline initialised; inference fails deterministically inside PaddlePaddle's new executor. See §14.1. |

### 14.1 PaddleOCR PP-OCRv5 attempt

A real, isolated Python runtime was provisioned under the external data root
(`ocr/_smoke-venv`) and the shipped `engine_driver.py` was exercised against it
with `--provider paddleocr`.

**What genuinely succeeded:**

| Step | Result |
| --- | --- |
| `pip install paddlepaddle paddleocr` into an isolated venv | Succeeded — `paddlepaddle 3.3.1`, `paddleocr 3.7.0`, `paddlex 3.7.2`, `numpy 2.3.5`, `opencv-contrib-python 4.10.0.84` |
| Driver `health` op | Succeeded; reported Python 3.12, `win32`, CUDA unavailable |
| Official model resolution and download into the external data root | Succeeded — `PP-OCRv5_server_det` (84.2 MB), `arabic_PP-OCRv5_mobile_rec` (7.8 MB), `PP-LCNet_x1_0_textline_ori` (6.5 MB), all under `<dataRoot>/ocr/models/paddleocr/official_models/` |
| Pipeline construction for `lang=ar` / `ocr_version=PP-OCRv5` | Succeeded |
| Actual inference (`ocr.predict`) | **Failed** |

**Exact failure (verbatim, both attempts):**

```
NotImplementedError: (Unimplemented) ConvertPirAttribute2RuntimeAttribute not support
[pir::ArrayAttribute<pir::DoubleAttribute>]
  (at ..\paddle\fluid\framework\new_executor\instruction\onednn\onednn_instruction.cc:118)
  ... paddlex/inference/models/runners/paddle_static/runner.py line 265 in __call__ -> self.predictor.run()
```

Two bounded repair attempts were made: the default run, and a second run with
`FLAGS_use_mkldnn=0` and `FLAGS_enable_pir_api=0`. Both reproduce the identical
failure at the same frame. This is a genuine incompatibility between
PaddlePaddle 3.3.1's PIR/oneDNN execution path and this host's CPU, not a defect
in the Read & Watch adapter — the adapter correctly surfaced it as a structured
`OCR_FAILED` result with no fabricated text.

**Conclusion:** PP-OCRv5 real-engine smoke testing is **BLOCKED BY CURRENT
RUNTIME (CPU / Paddle PIR-Executor)** on this host. The model identities are
nonetheless verified end-to-end: the exact documented identifiers resolved and
downloaded from official PaddlePaddle sources.

No accuracy, speed, VRAM, CER, or WER figure is claimed from any run, because
none was measured against a ground-truth corpus.

The probe runtime lives at `<dataRoot>/ocr/_smoke-venv` (825.9 MB) with its
models at `<dataRoot>/ocr/models/paddleocr/official_models/`. It sits outside the
documented `runtimes/<providerId>/<revision>` layout, so it is inert with respect
to the application's activation logic; it is left in place for inspection and
can be deleted at any time.

---

## 15. License findings

- Repositories: Unlimited-OCR MIT, PaddleOCR Apache-2.0 (verified from upstream
  metadata).
- **Model weights are licensed separately from the code.** Unlimited-OCR weights
  are hosted on Hugging Face under their own terms; PP-OCRv5 weights are
  distributed by PaddlePaddle under their own model terms. Read & Watch does not
  redistribute either set and does not claim the code licence covers the weights.
- No copyleft obligation is introduced: neither engine is vendored, linked, or
  redistributed. They are downloaded at the user's request into an external
  managed runtime.

---

## 16. Graphify

Real run, `graphify` 0.9.57, incremental structural flow on `App/app`:

| Metric | Before | After |
| --- | --- | --- |
| Nodes | 1,464 | 1,730 |
| Edges | 3,343 | 3,917 |
| Communities | 60 | 87 |
| Import cycles | 0 | 0 |

250 OCR-related nodes were mapped across the native-text gate, router, provider
contract, both engine boundaries, engine store, update manager, runtime bridge,
derived cache, text representations, overlay, settings, and HTTP surface. Health
diagnostic reported 435 dangling-endpoint and 251 collapsed AST edges (recorded,
not hidden; pre-existing extractor artefact class, not import cycles). Semantic
extraction was skipped for this code-dominated delta and is stated as such.

Full detail: `docs/project/reports/PHASE_17_GRAPHIFY_AUDIT.md`.

---

## 17. Ponytail

Real audit. Anti-bloat decisions recorded (no new npm dependency, stdlib process
supervision, one managed-provider factory instead of two near-duplicate files,
one shared HTTP handler, portable pointer instead of symlinks, CSS-percentage
overlay, no Docker, no queue, no microservice). Five pieces of genuinely dead
code introduced during the run were found by the review pass and deleted in the
same run. Three deliberate simplifications were recorded with their ceilings
(staging-time hashes, engine detection order as reading order, one page per
driver invocation). Trust boundaries were not simplified.

Full detail: `docs/project/reports/PHASE_17_PONYTAIL_AUDIT.md`.

---

## 18. Quality gates

| Gate | Result |
| --- | --- |
| `npm test` | 303 passing, 0 failing (baseline 229) |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `python scripts/check_repository_hygiene.py` | PASS |
| `python scripts/validate_project_state.py` | PASS |

No existing test was weakened to make the build green; the two re-scoped tests
are stricter in the areas that still matter and are documented.

---

## 19. Blockers and outstanding evidence

1. **P17-T002 outstanding** — no representative, lawful, private benchmark
   corpus or ground-truth protocol exists yet. This is now the first incomplete
   Phase 17 task.
2. **P17-T004 outstanding** — the selected architecture comes from explicit user
   authority, not from a measured benchmark. No benchmark was run.
3. **P17-T005 partially implemented** — orchestration, regions, boxes, overlay,
   caching, and cancellation exist and are tested; explicit reading-order
   reconstruction is not implemented.
4. **P17-T007 outstanding** — English, Urdu, Arabic, and mixed-language
   verification against representative pages has not been performed.
5. **P17-G002 outstanding** — no accuracy/performance evidence exists, therefore
   no engine has been accepted on benchmark evidence.
6. **Reader-side OCR search wiring outstanding** — derived OCR text is exposed
   through the OCR service and `/api/ocr/text` with diacritic-insensitive keys,
   but book-local search does not yet merge that text into its result set.
7. **Real-engine verification is environment-bound** — Unlimited-OCR is blocked
   by the absence of a CUDA device; PP-OCRv5 is blocked by a reproducible
   PaddlePaddle 3.3.1 PIR/oneDNN executor failure on this host's CPU. Neither is
   faked, and neither is claimed as passing. See §14.
8. **Post-OCR platform certification not started** — by explicit user
   instruction. Arch Linux, Ubuntu LTS, and macOS remain `NOT_STARTED`.

No fake PASS exists anywhere in this report. Everything above that is not
evidenced is stated as outstanding.
