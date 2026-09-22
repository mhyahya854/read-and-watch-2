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

1. **P17-T002 complete (2026-09-17)** — the benchmark corpus structure,
   ground-truth protocol, scoring utilities, synthetic starter corpus, private
   sampling workflow, and the mandatory multi-engine Urdu schema now exist. See
   section 21. No engine has been measured yet.
2. **P17-T004 outstanding** — the selected architecture comes from explicit user
   authority, not from a measured benchmark. No benchmark was run.
3. **P17-T005 now COMPLETE (2026-09-17, second run)** — orchestration (single
   engine plus the mandatory dual-engine Urdu pipeline), regions, deterministic
   reading order, boxes, overlay, caching, and cancellation are all implemented
   and tested. See sections 22–26.
4. **P17-T007 outstanding** — English, Urdu, Arabic, and mixed-language
   verification against representative pages has not been performed.
5. **P17-G002 outstanding** — no accuracy/performance evidence exists, therefore
   no engine has been accepted on benchmark evidence.
6. **Reader-side OCR search wiring complete (2026-09-17, second run)** — derived
   OCR text is searchable in the reader through `GET /api/ocr/search`, tagged
   `OCR_DERIVED`, never duplicated from pages with usable native text, and no
   longer outstanding. See section 25.
7. **Real-engine verification is environment-bound** — Unlimited-OCR is blocked
   by the absence of a CUDA device; PP-OCRv5 is blocked by a reproducible
   PaddlePaddle 3.3.1 PIR/oneDNN executor failure on this host's CPU. Neither is
   faked, and neither is claimed as passing. See §14.
8. **Post-OCR platform certification not started** — by explicit user
   instruction. Arch Linux, Ubuntu LTS, and macOS remain `NOT_STARTED`.

No fake PASS exists anywhere in this report. Everything above that is not
evidenced is stated as outstanding.

---

## 20. Final state and GitHub verification

| Item | Value |
| --- | --- |
| Starting HEAD | `ada8b20205cfe3e51e461b0bc6e249e9b14d7408` |
| Commit 1 — preserved pending Stage 1 Windows artifacts | `17e37d6` |
| Commit 2 — Phase 17 OCR provider foundation, engines, updates | `364f061` |
| Commit 3 — governance sequencing correction and reports | `82d6224` |
| Final local HEAD | `82d6224de55a442134a7a991221ae94bb4becd97` |
| `origin/master` after fetch | `82d6224de55a442134a7a991221ae94bb4becd97` (identical) |
| Live GitHub `commits/master` | `82d6224de55a442134a7a991221ae94bb4becd97` (2026-09-17T12:23:54Z) |

Verified against the live GitHub API after the push:

- All three commits are present on `master` in the pushed order.
- Expected files exist remotely with non-trivial sizes: `App/app/server/ocr/ocr-contract.mjs`
  (7,736 bytes), `App/app/server/ocr/driver/engine_driver.py` (18,564 bytes),
  `App/app/tests/ocr-routing.test.mjs` (4,280 bytes),
  `App/docs/project/reports/PHASE_17_REPORT.md` (20,507 bytes at commit time).
- Fork relationship confirmed: `mhyahya854/Unlimited-OCR` → parent
  `baidu/Unlimited-OCR`; `mhyahya854/PaddleOCR` → parent `PaddlePaddle/PaddleOCR`,
  both with default branch `main`.
- Remote governance is internally consistent: `PHASE-16 COMPLETE`,
  `PHASE-17 IN_PROGRESS` (first incomplete `P17-T002`), `PHASE-18 NOT_STARTED`,
  `PHASE-20 NOT_STARTED`; `RUN_STATE.json` agrees.
- No OCR models, runtimes, caches, engines, databases, virtual machines, ISOs, or
  package artifacts are tracked. The largest tracked blobs remain the pre-existing
  test fixtures and `package-lock.json`.
- Repository hygiene passed on the pushed content (369 tracked paths) with no
  private markers and no absolute developer-machine paths.
- The working tree is clean and `master` is in sync with `origin/master`.

---

## 21. P17-T002 — OCR benchmark corpus and ground-truth protocol (2026-09-17)

### 21.1 Governance correction recorded first

By explicit user authority, **Urdu OCR is a mandatory multi-engine pipeline**,
not an engine-selection question: PP-OCRv5 Arabic-script recognition **and** the
dedicated Nastaliq specialist `qandeelasim13/urdu-ocr-trocr-si26` are both
required evidence sources, and both raw outputs must be preserved. There is no
fallback chain, no backup engine, no automatic substitution, and no
majority-vote truth. Recorded in `DECISIONS.md` (D-054), `MASTER_PLAN.md`
(Phase 17 header correction), `PROJECT_STATE.md`, `CHANGELOG.md`, and
`docs/project/UPSTREAM_AND_LICENSE_LEDGER.md`. No phase was renumbered, no task
or gate ID was reused, and Phase 18 remains `NOT_STARTED`.

### 21.2 What was built

| Deliverable | Location |
| --- | --- |
| Canonical protocol | `docs/project/OCR_BENCHMARK_PROTOCOL.md` |
| Schema, validation, hashing | `app/server/ocr/benchmark/schema.mjs` |
| Unicode comparison rules | `app/server/ocr/benchmark/unicode.mjs` |
| Scoring + disagreement evidence | `app/server/ocr/benchmark/scoring.mjs` |
| Run/group records, completion states | `app/server/ocr/benchmark/run-record.mjs` |
| Manifest I/O + truth hashing | `app/server/ocr/benchmark/manifest.mjs` |
| Private corpus store + sampling | `app/server/ocr/benchmark/corpus-store.mjs` |
| Font-coverage + offline renderer | `app/server/ocr/benchmark/render.mjs` |
| Synthetic corpus builder | `app/server/ocr/benchmark/synthetic-corpus.mjs` |
| Synthetic fixture definitions (14 samples) | `app/tests/fixtures/ocr-benchmark/synthetic-corpus.mjs` |
| Rendering tool | `app/scripts/render-benchmark-fixtures.mjs` |
| Private sample importer | `app/scripts/import-benchmark-sample.mjs` |
| Tests (34) | `app/tests/ocr-benchmark-{corpus,scoring,engines}.test.mjs` |

Private layout (never committed): `READ_WATCH_DATA_ROOT/ocr/benchmark/` with
`corpus/{english,arabic,urdu,mixed}`, `ground-truth`, `manifests`,
`runs/{unlimited-ocr,paddleocr,urdu-nastaliq-specialist,combined}`, `reports`,
`temp`, and `fonts`. The store throws `BENCHMARK_INSIDE_REPOSITORY` if asked to
create that tree inside Git.

### 21.3 Mandatory-provider policy, machine-enforced

| Language | Mandatory engines |
| --- | --- |
| English | `unlimited-ocr` |
| Arabic | `paddleocr` |
| Urdu | `paddleocr` **and** `urdu-nastaliq-trocr` |

`requiredProviders` is a requirement set, never an attempt order. Tests assert
that English, Arabic, and Urdu mandates are enforced; that a formal Urdu sample
missing either engine is rejected; that single-engine Urdu completion is refused
(`PARTIAL_ENGINE_FAILURE`, not `COMPLETE`); that a failed engine's sibling output
is preserved; that an engine outside the mandatory set is refused
(`PROVIDER_NOT_REQUIRED`); and that no fallback/backup/winner/bestText semantic
exists in the manifest, provider schema, or run records.

### 21.4 Specialist provenance and honest limits

Verified from the live model card, the live Hugging Face API record, and the
project repository on 2026-09-17: model revision
`a9ef072320b50014f6df7ed9db807810157a410e`; Apache-2.0 model card; TrOCR /
`VisionEncoderDecoderModel` fine-tuned from `microsoft/trocr-base-printed`;
**single-line printed-image intended input**; the project repository declares
**no licence file**; training data includes CC BY-NC-SA 4.0 material; the
project's own evaluation reports CER 0.52 / character accuracy 47.66%. Read &
Watch marks it `integrationStatus: NOT_INTEGRATED`, gives it
`supportedUnitTypes: ['LINE']`, requires a line association for page/region use,
and makes no claim about handwriting, full pages, or accuracy.

### 21.5 Synthetic starter corpus (real render)

14 authored samples (English page + 2 lines; Arabic page, region, line; Urdu
page, region, 5 lines including an infrastructure-only sample; one mixed
Urdu/English page). Rendered on this host with lawfully redistributable OFL-1.1
fonts whose sha256 and `cmap` glyph coverage are verified before rasterising:

| Font | Licence | sha256 (first 12) | Coverage checked |
| --- | --- | --- | --- |
| Noto Nastaliq Urdu | OFL-1.1 | `98a4787f34eb` | Urdu-specific letters + marks |
| Noto Naskh Arabic | OFL-1.1 | `67b5a525a661` | 8 Arabic marks |
| Noto Sans | OFL-1.1 | `bfb7bb691513` | Latin + digits + punctuation |

Renderer: headless Chromium (`153.0.8010.48`), device scale factor 2, fonts
embedded as data URIs, DNS refused (`--host-resolver-rules=MAP * ~NOTFOUND`),
background networking/sync/component-update disabled, throwaway profile cleared
afterwards, no leaked browser process. 14/14 samples rendered with real
Nastaliq/Naskh shaping and RTL order; images, ground truth, fonts, and the render
provenance report all live under the private root.

This corpus proves plumbing only. It is not representative of real books and is
not acceptance evidence.

### 21.6 Scoring

General CER/WER/exact-match plus line-preservation measures; Arabic split into
three families (huroof, tashkeel, fully vocalised) so a dropped harakah cannot be
hidden by correct letters; Urdu scored per engine with Urdu-specific character
analysis and diacritic analysis, plus a separate comparison record carrying both
outputs, per-engine scores, and character-level disagreement locations. Ground
truth is the only correctness authority: engine agreement is recorded as
evidence and never treated as truth, and no engine is ever declared a winner.
Only `FINAL` ground truth may be scored formally.

### 21.7 Quality gates

| Gate | Result |
| --- | --- |
| `npm test` | 337 passing, 0 failing (303 before this task; +34) |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `python scripts/check_repository_hygiene.py` | PASS |
| `python scripts/validate_project_state.py` | PASS |
| Graphify (0.9.57, structural) | 1,916 nodes / 5,234 raw edges / 89 communities / 0 import cycles; 144 benchmark nodes mapped |
| Ponytail | 8 dead helpers/exports removed, 2 decorative constants promoted to live enforcement, 5 deliberate simplifications recorded with ceilings |

### 21.8 What P17-T002 does not claim

No engine acceptance, no measured accuracy, no speed figure, no CER/WER number,
no comparison verdict between the two Urdu engines, no reading-order algorithm,
no Urdu runtime pipeline, and no Phase 18 work.

### 21.9 Commit chain and live GitHub verification

| Item | Value |
| --- | --- |
| Starting HEAD (local and `origin/master`) | `0086ae092290dc498a264e400944b1adc6e63ac3` |
| P17-T002 content commit | `73bc42772f42df7fdd212bd8592d103110da5f74` |
| Push | `0086ae0..73bc427 master -> master` (normal push, no force, no history rewrite) |
| Live GitHub `commits/master` | `73bc42772f42df7fdd212bd8592d103110da5f74` (2026-09-17T15:06:23Z) |

Verified against the live GitHub API and raw content after the push:

- Remote tree is complete (not truncated) and contains **no** benchmark images,
  fonts, model weights, caches, virtual environments, or private transcriptions.
  The only binary-ish tracked paths are the two pre-existing PDF test fixtures
  under `App/app/tests/fixtures/pdf/`.
- New remote files exist with non-trivial sizes: `OCR_BENCHMARK_PROTOCOL.md`
  (25,343 bytes), `server/ocr/benchmark/` (9 modules, 2.2 KB–24.5 KB),
  `synthetic-corpus.mjs` (15,662 bytes), both scripts, all three test suites.
- Remote governance is consistent: `DECISIONS.md` contains D-054 and the
  mandatory two-engine Urdu rule; `MASTER_PLAN.md` contains the Phase 17
  dual-engine correction with `P17-T002` checked and `P17-T004` unchecked;
  `PHASE_INDEX.json`/`RUN_STATE.json` agree on `PHASE-17 IN_PROGRESS` with
  `P17-T004` as the first incomplete task and `PHASE-18 NOT_STARTED`
  (`P18-T001`).
- `server/ocr/ocr-contract.mjs` on the remote declares
  `ur: ['paddleocr', 'urdu-nastaliq-trocr']`, marks the specialist
  `NOT_INTEGRATED`, and contains no fallback provider identifier.
- Repository hygiene and governance validation pass on the pushed content, and
  the working tree is clean and in sync with `origin/master`.

### 21.10 Corrective commit — hygiene marker in the new test source

The first hygiene run before this task's push reported PASS because the new
files were still untracked and `check_repository_hygiene.py` inspects tracked
paths only. After the content commit, the gate correctly failed on one new file:
`app/tests/ocr-benchmark-corpus.test.mjs` embedded the literal machine-path
markers it was asserting against, so the file itself carried a private marker
string.

Fixed without weakening the check: the assertion now uses a character-class
pattern (`[A-Za-z]:[\\/]+[Uu]sers[\\/]+`) that catches a developer path without
containing a literal marker, the redundant private-hash assertion was removed
(the repository hygiene gate is the authority for markers), and the gate was
re-run with the files tracked.

| Commit | Purpose | Head after |
| --- | --- | --- |
| `73bc42772f42df7fdd212bd8592d103110da5f74` | P17-T002 content: benchmark foundation, corpus, protocol, governance correction | verified |
| `bba9668` | record P17-T002 verification, commit chain, and next task | pushed |
| `e60397729a6281f24f359bd58a04a791ea0f69de` | keep machine-path markers out of the benchmark test source | verified live |

Re-run after the fix, with every new file tracked:

| Gate | Result |
| --- | --- |
| `npm test` | 337 passing, 0 failing |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `python scripts/check_repository_hygiene.py` | PASS (385 tracked paths) |
| `python scripts/validate_project_state.py` | PASS (21 phases, 231 task/gate IDs) |
| Local HEAD / `origin/master` | `e60397729a6281f24f359bd58a04a791ea0f69de` (identical) |

No history was rewritten, nothing was force-pushed, and no gate was weakened to
make the build green.

---

## 22. P17-T005 runtime completion — governance wording correction (2026-09-17, second run)

By explicit user authority, and **without reopening or renumbering any task**:

- **P17-T002 stays COMPLETE** and now reads: "Build the OCR benchmark corpus
  framework, lawful/private corpus workflow, ground-truth protocol, schemas,
  scoring utilities, and synthetic validation corpus."
- **P17-T004 stays INCOMPLETE** and now reads: "Populate/use representative
  lawful private real-world samples and run measured engine benchmarks
  sufficient for evidence-based acceptance."

The earlier wording implied the completed task already held a fully
representative private real-world corpus, which contradicted the implementation
note that the 14-sample synthetic corpus proves plumbing only. The contradiction
is removed; no task or gate id was reused, invented, or reordered. Recorded in
`DECISIONS.md` (D-055), `MASTER_PLAN.md`, `PROJECT_STATE.md`,
`RUN_STATE.json`, and `CHANGELOG.md`.

## 23. Nastaliq specialist — now a real runtime provider

Provider id `urdu-nastaliq-trocr`; upstream `qandeelasim13/urdu-ocr-trocr-si26`;
pinned revision `a9ef072320b50014f6df7ed9db807810157a410e` (re-verified live on
2026-09-17: unchanged, last modified 2026-08-08T18:35:19Z; card licence
`apache-2.0`; project repository still declares **no** licence file).

| Piece | Where |
| --- | --- |
| Thin provider adapter | `server/ocr/provider-urdu-nastaliq.mjs` |
| Hugging Face revision resolution | `server/ocr/upstream-resolver.mjs` (`resolveHuggingFaceModelRevision`) |
| Transactional staging / hashing / model-dir resolution / staged smoke | `server/ocr/specialist-provisioning.mjs` |
| LINE recognition (`recognize_line`) | `server/ocr/driver/engine_driver.py` (`_trocr_model`, `_trocr_recognize`) |
| Capability honesty | `supportedUnitTypes: ['LINE']`; PAGE/REGION refused with `UNSUPPORTED_UNIT` |
| Storage | `READ_WATCH_DATA_ROOT/ocr/runtimes|models/urdu-nastaliq-trocr/<revision>/` |

No weights are bundled, vendored, committed, or shipped in an installer; a test
enforces that (including a `git ls-files` scan). Licensing is recorded honestly:
Apache-2.0 model card, no licence file in the project repository, training data
including UTRSet-Real (CC BY-NC-SA 4.0). Read & Watch claims no redistribution
right and redistributes nothing.

## 24. Mandatory dual-engine Urdu runtime, with no fallback semantics

`server/ocr/urdu-pipeline.mjs` orchestrates the two mandatory engines:

```
Urdu page -> native-text gate (native text still wins)
  -> PP-OCRv5 page detection + recognition (geometry + text)
  -> deterministic line segmentation (stable pageId/regionId/lineId)
  -> per-line Nastaliq specialist recognition on the same line crops
  -> both outputs preserved independently, per provider
  -> character-level disagreement evidence (no winner, no merged text)
  -> execution state: COMPLETE only if every mandatory engine completed
```

| State | Meaning as implemented |
| --- | --- |
| `COMPLETE` | every mandatory engine produced output for the page and no material disagreement was recorded |
| `PARTIAL_ENGINE_FAILURE` | at least one mandatory engine produced nothing (its structured error is kept) |
| `REVIEW_REQUIRED` | every mandatory engine completed but material disagreement exists |
| `BLOCKED` | no mandatory engine produced usable output |

Cancellation stops outstanding work for both engines, disposes both supervised
workers, never marks the job complete, and preserves already-completed engine
output. There is no `fallbackProvider`, `backupProvider`, `tryNextEngine`,
`secondaryOnFailure`, `bestText`, or winner field anywhere in the pipeline, and
the benchmark module's forbidden-semantics scan is run over the produced record
in tests.

## 25. Reading order, line segmentation, overlay, caching, and reader search

- `server/ocr/reading-order.mjs`: deterministic geometry-only ordering —
  column clustering before row ordering, full-width bands read before the
  columns beneath them, in-band order by script direction, headings before body,
  captions after their band, footnotes after the main flow, detector emission
  order preserved as `detectionOrder`, and named warnings
  (`AMBIGUOUS_COLUMN_STRUCTURE`, `MIXED_DIRECTION_PAGE`,
  `MIXED_DIRECTION_COLUMN`, `UNUSABLE_GEOMETRY`) instead of invented confidence.
- `server/ocr/line-segmentation.mjs`: stable `pageId/regionId/lineId`
  identities, PP-OCRv5 detection boxes reused as line geometry (no second
  detector), a documented fallback when a region carries no line geometry, and
  `lineCropPath()` refusing any path that escapes the managed OCR temp root.
- `server/ocr/ocr-search.mjs` + `GET /api/ocr/search` + reader search
  integration: `OCR_DERIVED` provenance on every hit, pages with usable native
  text excluded (no duplication), per-provider Urdu indexing that preserves both
  provenances, Arabic tashkeel preserved in displayed text while matching folds
  marks, partial Urdu results visibly partial, and invalidation bound to source
  hash, engine revision, model revision, settings key, line-segmentation
  revision, reading-order revision, and Urdu pipeline revision.
- `POST /api/ocr/recognize/urdu` exposes the dual-engine pipeline; the existing
  single-engine route is unchanged.

## 26. Real specialist smoke test (SMOKE TEST ONLY) and host findings

| Item | Value |
| --- | --- |
| Result | **PASS** — shipped driver loaded the exact pinned revision and ran a synthetic single-line fixture |
| Model | `qandeelasim13/urdu-ocr-trocr-si26` @ `a9ef072320b50014f6df7ed9db807810157a410e` |
| Runtime | Python 3.12.10, torch 2.14.0+cpu, transformers 5.17.0, safetensors 0.8.0, pillow 12.3.0, numpy 2.5.3 |
| Hardware | Windows (win32, AMD64), **no CUDA device** |
| Weights verification | `model.safetensors` 1,335,747,032 bytes, sha256 `420c828e…9276` — identical to the published upstream LFS object id |
| Elapsed | 16,739 ms (download already cached from the preceding staged attempt) |
| Claim made | execution only. No accuracy, CER, WER, speed, or VRAM figure. |
| Evidence | `READ_WATCH_DATA_ROOT/ocr/evidence/smoke/urdu-nastaliq-trocr-smoke-2026-09-17.json` and the model-file hash inventory beside it |

Two genuine defects were found and fixed rather than worked around:

1. **Windows pipe encoding.** The driver's stdio now pins UTF-8 (and the bridge
   sets `PYTHONUTF8`/`PYTHONIOENCODING`); without this, Arabic/Urdu text would be
   re-encoded by the legacy code page on the way to the parent process.
2. **Tokenizer resolution.** The repository's `tokenizer_config.json` declares
   `RobertaTokenizer` while shipping `vocab.json` + `merges.txt` and no
   `tokenizer.json`; newer transformers majors cannot auto-resolve that. The
   driver now instantiates the documented tokenizer class explicitly (with the
   byte-level BPE sibling as a bounded fallback) — the intended inference
   behaviour is unchanged.

One host limitation remains and is reported as such:

- **App-managed staged runtime provisioning is blocked on this host.** With
  `LongPathsEnabled = 0`, pip cannot materialise torch's deep include tree under
  the staged runtime path. The failure is surfaced as a structured
  `UNSUPPORTED_PLATFORM` with remediation ("enable long-path support or move the
  data root"), the partially staged runtime is removed, and the activation
  pointer is never touched. The specialist itself was proven to work through the
  shipped driver using a short-path interpreter, so this is a staging-path
  limitation, not an adapter or model defect.

Unlimited-OCR remains blocked by the absence of a CUDA device, and PP-OCRv5
remains blocked by the reproducible Paddle 3.3.1 PIR/oneDNN CPU failure. Neither
is faked, and neither is claimed as passing.

## 27. Tests and gates for this run

| Suite | Focus |
| --- | --- |
| `tests/ocr-reading-order.test.mjs` | LTR/RTL single column, two-column LTR/RTL, mixed direction, heading/caption/footnote ordering, determinism, ambiguity warnings, geometry-less units, empty page |
| `tests/ocr-line-segmentation.test.mjs` | stable identities, single-line regions, documented fallback, detection blocks outside regions, crop-path containment, invalid input refusal |
| `tests/ocr-specialist-provider.test.mjs` | provider registration, upstream identity, LINE-only enforcement, external model storage, repository weight scan, staged-then-activate, failed update retention, smoke failure, rollback, Update-All coverage, no network during recognition, structured platform failure |
| `tests/ocr-urdu-dual-engine.test.mjs` | both engines required, independent preservation, single-engine completion refusal both ways, review evidence without a winner, no fallback invocation, unregistered engine reporting, native-text bypass, cancellation semantics, per-engine persistence, derived cache |
| `tests/ocr-urdu-cancellation.test.mjs` | real supervised worker termination for PP-OCRv5 and the specialist, no orphan process after a cancelled Urdu job |
| `tests/ocr-derived-search.test.mjs` | native-text duplication prevention, OCR provenance, Arabic diacritic-insensitive search with tashkeel preserved, Urdu per-provider search, disagreement not merged, partial stays partial, invalidation by source/engine/model/segmentation/reading-order/pipeline revision |
| `tests/ocr-search-http-and-safety.test.mjs` | `/api/ocr/search` surface, dual-engine provider inventory, Urdu pipeline route, source immutability, no developer paths in OCR responses |

| Gate | Result |
| --- | --- |
| `npm test` | **409 passing, 0 failing** (337 before this run) |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `python scripts/check_repository_hygiene.py` | PASS |
| `python scripts/validate_project_state.py` | PASS |
| Graphify (0.9.57, real incremental run) | 2,074 nodes / 4,926 edges / 92 communities / 0 import cycles / 0 unverified / 0 dangling; 431 OCR-related nodes |
| Ponytail | PASS — 6 dead or duplicated items deleted in the same run; no new dependencies; trust boundaries untouched |

One existing assertion was updated rather than weakened: the benchmark engine
suite previously asserted the specialist is `NOT_INTEGRATED`, which was true
before this run and is now false. It asserts the new, evidenced `INTEGRATED`
state while keeping the LINE-only contract assertions intact.

## 28. Scope discipline for this run

P17-T004 and P17-T007 remain open; no formal benchmark was run; no accuracy,
speed, CER, WER, or VRAM figure is claimed; Phase 18 remains `NOT_STARTED`; and
Windows/Arch/Ubuntu/macOS certification stages were not started.

## 29. Commit chain and live GitHub verification (this run)

| Item | Value |
| --- | --- |
| Starting HEAD (local = `origin/master`) | `1347f3f9b9e8a6493d39ba5da0748fdab6f66467` |
| Content commit | `722bf403d759d82cecc0f43ef98c8a679aa1e00f` — "Integrate mandatory Urdu Nastaliq provider, dual-engine orchestration, reading order, and OCR search" |
| Push | `1347f3f..722bf40 master -> master` (normal push, no force, no history rewrite) |
| Live GitHub `commits/master` | `722bf403d759d82cecc0f43ef98c8a679aa1e00f` (2026-09-17T16:54:28Z) |
| Remote tree | complete, not truncated (481 entries); **0** forbidden paths |
| Largest tracked blobs | pre-existing fixtures only (`sample-alice.pdf` 711,671 · `package-lock.json` 441,586 · `sample-paper.pdf` 90,191) |

Verified against live GitHub raw content and the GitHub API after the push
(not from the local working copy):

- Every new module exists remotely with a non-trivial size:
  `provider-urdu-nastaliq.mjs` 1,455 · `urdu-pipeline.mjs` 23,692 ·
  `reading-order.mjs` 12,678 · `line-segmentation.mjs` 9,601 ·
  `ocr-search.mjs` 16,246 · `specialist-provisioning.mjs` 10,817 ·
  `ocr-specialist-smoke.mjs` 7,317; and all seven new test suites (4,991–17,441).
- `ocr-contract.mjs` on the remote declares `ur: ['paddleocr',
  'urdu-nastaliq-trocr']`, `integrationStatus: INTEGRATED` for the specialist, and
  `supportedUnitTypes: ['LINE']`; it contains **no** `fallbackProvider`,
  `backupProvider`, `tryNextEngine`, or `secondaryOnFailure` identifier.
- `urdu-pipeline.mjs` on the remote references `PARTIAL_ENGINE_FAILURE`, and the
  words `bestText`/`winner` appear **only** in prose that prohibits them (a
  docstring line and the disagreement-policy description); the executable code
  contains no such field or assignment.
- `engine_driver.py` on the remote contains `op_recognize_line`, the
  `--model-dir` argument, and UTF-8 stream pinning.
- `index.mjs` registers `'urdu-nastaliq-trocr': createUrduNastaliqProvider`, and
  `components/reader/reader-search.tsx` wires `searchOcrDerivedText` with a
  "Machine transcription" provenance label.
- No model weights, virtual environments, site-packages, caches, or OCR
  engines/models/runtimes/temp paths are tracked anywhere in the remote tree.
- Remote governance agrees: `RUN_STATE.json` reports `PHASE-17 IN_PROGRESS` with
  `current_task_id = P17-T004`; `PHASE_INDEX.json` reports `PHASE-17
  IN_PROGRESS`/first incomplete `P17-T004` and `PHASE-18 NOT_STARTED`/`P18-T001`;
  `MASTER_PLAN.md` has P17-T002 and P17-T005 checked with P17-T004 and P17-T007
  unchecked; the cross-platform certification document still reports Arch,
  Ubuntu, and macOS as `NOT_STARTED`.
- `python scripts/check_repository_hygiene.py` was re-run **after** staging the
  new files: PASS (399 tracked paths), and
  `python scripts/validate_project_state.py`: PASS (21 phases, 231 task/gate
  IDs).

No action in this run marked P17-T004 or P17-T007 complete, started Phase 18, or
began a platform certification stage.

---

## 29. Final evidence pass — 2026-09-23 (current status; earlier sections are historical)

Starting local and fetched `origin/master`: `7e6dd5e659c03358f439b27a51f20be12d2b03ac`.
The repair commit `d1a910f83c26130ec6b16c75263642e2900f16da` remains in the
baseline. This pass makes no Phase 18 or product-policy change.

### Private corpus readiness (metadata only)

The application-resolved external benchmark root exists. Its 16 registered
formal candidate items come from 10 distinct source hashes: 4 English, 4 Arabic,
6 Urdu, and 2 mixed English/Arabic. There are 14 PAGE, 0 REGION, and 2 LINE
items. Required-provider sets match the declared languages: English requires
Unlimited-OCR; Arabic requires PP-OCRv5; Urdu requires both PP-OCRv5 and
`urdu-nastaliq-trocr`; the two mixed pages require Unlimited-OCR plus PP-OCRv5.
No mixed Urdu/English candidate is registered. Sources are 11 born-digital
rendered, 4 clean scans, and 1 photograph; quality labels are 11 clean, 4 mild
noise, and 1 skewed. No low-contrast, compression, blur, or uneven-illumination
candidate is registered. Arabic lacks fully vocalised/shadda/tanween/sukun
feature labels; the current sample set has no REGION-level item. The protocol
sets no numerical minimum for any category. These are coverage gaps, not
invented sample quotas.

The manifest schema and manifest hash validate. All 16 source paths exist and
their current hashes match the registered source hashes. All 16 rendered sample
hashes match, and the 16 draft files match their manifest drafts. Source hashes
were rechecked after regression: 10/10 still match. No sample is locked; all
16 ground truths are `DRAFT`, 0 `REVIEWED`, 0 `FINAL`. Seven drafts carry the
origin label `BOOTSTRAPPED_FROM_NATIVE_TEXT` and require independent human
verification; nine carry `MANUAL_TRANSCRIPTION_REQUIRED`. Candidate metadata
does not include an explicit lawful-use declaration. The four run folders are
empty. No private transcription, title, path, hash, image, or prediction is
reproduced in this report.

The committed 14-item synthetic starter remains plumbing evidence only. With
zero FINAL and locked real candidates, no formal engine call or score was
permitted, and no accuracy, CER, WER, layout-quality, or representative
performance result is claimed.

### P17-T004, P17-T007, and P17-G002

| Item | Current evidence and blocker | Result |
| --- | --- | --- |
| P17-T004 | Real candidate corpus exists, but every truth is DRAFT, none is locked, lawful-use declarations are absent, and the coverage has material gaps. No formal provider run. | OPEN |
| English | Unlimited-OCR cannot execute on this Intel Arc host without supported NVIDIA CUDA; no FINAL truth. | BLOCKED |
| Arabic | PP-OCRv5 CPU capability was previously proven on the pinned runtime, but no FINAL representative truth or formal run exists. | BLOCKED |
| Urdu | Both engines remain mandatory and independent; no FINAL truth or formal dual-engine run exists. The specialist is LINE-only. | BLOCKED |
| Mixed | Two English/Arabic candidate pages exist, but neither is FINAL; Urdu/English is not represented. | BLOCKED / NOT REPRESENTED |
| Layout | PAGE metadata and some region/line truth fields exist, but no FINAL representative PAGE/REGION comparison was possible; there is no REGION item. | BLOCKED |
| Source preservation | Read-only source validation before and after all regressions found 10/10 source hashes unchanged. End-to-end real OCR source preservation remains untested. | VERIFIED for this pass; formal task OPEN |
| P17-T007 | All required recognition and layout dimensions remain incomplete. | OPEN |
| P17-G002 | No formal accuracy/performance evidence; no approved numerical threshold or sufficiently explicit qualitative acceptance authority; model/dataset rights cannot be inferred from code licences. | OPEN |

The current host exposes Intel Arc graphics, no `nvidia-smi`, and no NVIDIA CUDA
device. The application-resolved external OCR engine/model/runtime directories
contain no activated provider. Current source pins the previously proven
PP-OCRv5 CPU stack (`paddlepaddle 3.0.0`, `paddleocr 3.3.1`, `paddlex 3.3.13`,
`numpy 1.26.4`, `scipy 1.13.1`, `scikit-learn 1.5.2`, `langchain<0.3`,
`setuptools`); it does not revert to the failing PaddlePaddle 3.3.1 stack.
The specialist remains pinned to
`a9ef072320b50014f6df7ed9db807810157a410e`; the short external runtime
root remains in source and its synthetic long-path regression passes. Earlier
successful smoke evidence is capability evidence only. The older CPU/MAX_PATH
failures in preceding dated sections are superseded, not erased.

Current upstream metadata recheck: Unlimited-OCR code and model card declare
MIT separately; PaddleOCR repository code declares Apache-2.0 while exact model
weight rights require separate review; the specialist model card declares
Apache-2.0 at the unchanged pinned revision, its project repository still has
no declared licence file, and its stated training sources include UTRSet-Real
(CC BY-NC-SA 4.0 per the project repository). No redistribution or commercial
right is inferred. The accepted licence scope for P17-G002 requires an explicit
decision. The protocol has no held-out/tuning split; the 16 candidates have not
been used to tune recognition or layout.

### Regression and project gates

`npm test`: 627 total / 626 pass / 0 fail / 1 skip. OCR-targeted tests:
180/180 pass. Electron packaged Read parity: 5/5 pass, including the production
canvas create/open/save/rename/link/asset/export/restore path and cross-book
ownership guards. Typecheck, lint, build, repository hygiene, and governance
validation pass. The Read synthetic-root visual harness passed 30/30 asserted
captures; the Watch synthetic-root harness passed 28/28. The first concurrent
Read harness attempt exited before testing because the Watch dev server already
owned Vinext; the standalone rerun passed.

Graphify's real incremental `App/app` code update produced 2,627 nodes, 6,684
edges, and 115 communities. The rebuilt graph diagnostic reports 0 unverified
nodes, 0 missing/dangling endpoints, 0 self-loops, and 0 duplicate edges; OCR
nodes remain mapped. Semantic extraction was not run because no supported LLM
backend is configured. Generated graph files remain ignored. Ponytail's
read-only review found no duplicate OCR provider lifecycle, fallback chain,
duplicate preprocessing framework, dead benchmark layer, or Phase 18 addition.
The thin provider bindings and provenance guards are justified; no deletion was
made. Lean already. Ship.

Phase 17 remains `IN_PROGRESS` with P17-T004, P17-T007, and P17-G002 open;
Phase 18 remains `NOT_STARTED`. Required human actions: document lawful
benchmark use, independently transcribe/verify and finalise the 16 drafts,
lock exact source/image/truth hashes, add representative gaps where lawful,
approve an acceptance decision rule and intended licence scope, and provide a
supported NVIDIA CUDA host for unchanged Unlimited-OCR execution.
