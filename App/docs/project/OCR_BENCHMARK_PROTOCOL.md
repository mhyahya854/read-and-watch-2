# OCR Benchmark Protocol — Corpus, Ground Truth, and Mandatory Multi-Engine Urdu

Status: **ACTIVE** (Phase 17, task P17-T002)
Date: 2026-09-17
Repository: `mhyahya854/read-and-watch-2`
Implementation: `App/app/server/ocr/benchmark/`, `App/app/scripts/render-benchmark-fixtures.mjs`,
`App/app/scripts/import-benchmark-sample.mjs`

This document is the canonical protocol for measuring the selected OCR engines.
It defines what a benchmark sample is, how ground truth is produced and bound to
a sample, which engines are mandatory for which language, how results are scored,
and where every byte of private material lives.

---

## 1. Scope

In scope: benchmark architecture, corpus and manifest schema, ground-truth
protocol, scoring utilities, corpus validation, synthetic lawful starter
fixtures, the private-corpus workflow, the multi-engine Urdu comparison schema,
engine-specific result records, and the tests that hold these in place.

Explicitly out of scope for this task:

- No engine acceptance decision (that is P17-T004, and it requires measured
  results that do not exist yet).
- No real-model benchmark run. Unlimited-OCR, PP-OCRv5, and the Nastaliq
  specialist have **not** been measured against this corpus in this task.
- No final Urdu alignment/uncertainty algorithm (Phase 18).
- No reading-order algorithm (P17-T005 is still outstanding).
- No cross-platform certification (post-OCR gate, `NOT_STARTED`).
- No Phase 18 work of any kind.

---

## 2. Privacy: what may be committed, what never may

Committed to Git:

- schema, validators, scoring algorithms, runner, and importer tooling;
- provider identities and provenance;
- tiny synthetic text fixtures authored for this benchmark;
- tests and documentation;
- anonymised example metadata.

Never committed (these live only under `READ_WATCH_DATA_ROOT`):

- owned books, scans, private PDFs, page images, private transcriptions;
- rendered benchmark images for real sources;
- ground truth for real sources;
- OCR model weights, Hugging Face/Paddle model caches, Python virtual
  environments, engine runtimes;
- benchmark run outputs, disagreement evidence and reports with private content;
- any absolute developer-machine path.

Enforcement: `python scripts/check_repository_hygiene.py` runs before every
commit, and `tests/ocr-benchmark-corpus.test.mjs` (case 24) additionally asserts
that the committed fixture directory contains only small text files and that a
rendered sample can only be written under the private benchmark root.

---

## 3. Lawful sourcing

Every real sample must come from a source the user owns or is otherwise legally
entitled to use. The protocol requires:

1. the source document is hashed and never copied, moved, renamed, or modified;
2. only representative pages/regions/lines are rendered or exported, never a
   whole book unless the user explicitly asks for that;
3. the human writes the transcription; no engine output is ever promoted to
   ground truth;
4. the source is referenced by hash and a non-personal identifier, not by an
   absolute path.

Synthetic fixtures are authored specifically for this benchmark and are lawful by
construction. They are deliberately small.

---

## 4. Private corpus location

```
READ_WATCH_DATA_ROOT/
  ocr/
    benchmark/
      corpus/
        english/            rendered/selected sample images (English)
        arabic/             rendered/selected sample images (Arabic)
        urdu/               rendered/selected sample images (Urdu)
        mixed/              mixed-script page samples
      ground-truth/         <sampleId>.draft.txt, <sampleId>.final.json, <sampleId>.lock.json
      manifests/            versioned manifests and draft items
      runs/
        unlimited-ocr/      per-engine run records
        paddleocr/
        urdu-nastaliq-specialist/
        combined/           multi-engine comparison records
      reports/              run reports and render provenance
      temp/                 rendering scratch space (cleared after a run)
      fonts/                lawfully redistributable rendering fonts
```

`App/app/server/ocr/benchmark/corpus-store.mjs` creates this layout and **refuses**
to create it inside the repository (`BENCHMARK_INSIDE_REPOSITORY`).

The rendering fonts are declared in
`App/app/tests/fixtures/ocr-benchmark/synthetic-corpus.mjs` with their licence,
upstream URL, and the sha256 observed when they were first downloaded. The
renderer verifies the hash and the glyph coverage before it draws anything.

---

## 5. Corpus categories

Every sample declares, explicitly and machine-checkably:

| Field | Values |
| --- | --- |
| `language` | `en`, `ar`, `ur`, `mixed` |
| `script` | `latin`, `arabic`, `arabic-nastaliq`, `arabic-naskh`, `mixed` |
| `unitType` | `PAGE`, `REGION`, `LINE` |
| `sourceType` | `born-digital-rendered`, `clean-scan`, `degraded-scan`, `photographed`, `mixed-text-image` |
| `layoutClass` | `single-column`, `multi-column`, `heading-paragraph`, `table`, `footnote`, `caption`, `list`, `mixed-direction`, `dense-textbook`, `isolated-line`, `multi-line-nastaliq-region` |
| `qualityClass` | `clean`, `mild-noise`, `skewed`, `low-contrast`, `compression-artifact`, `blur`, `uneven-illumination` |
| `scriptFeatures` | per-language lists, validated against a fixed vocabulary |
| `purpose` | `formal-acceptance`, `infrastructure` |

Script features:

- English: normal prose, punctuation, numbers, headings, mixed formatting.
- Arabic: unvocalized, partially vocalized, fully vocalized, shadda + vowel
  combination, tanween, sukun, superscript alef, Quranic/annotation marks where
  lawful representative text exists, Arabic punctuation, Arabic-Indic numerals,
  Latin + Arabic mixed.
- Urdu: Urdu-specific letters, Nastaliq, Naskh-style Urdu, ligature-heavy
  Nastaliq, diagonal baseline, connected words, punctuation, Urdu digits, mixed
  Urdu/English, diacritics, isolated line, multiple lines, heading, body text,
  dense printed book page.

---

## 6. Sample identity

Filenames never establish identity. Every sample carries:

`benchmarkItemId`, `parentPageId`, `parentRegionId`, `unitType`, `language`,
`script`, `sourceType`, `sourceHash`, `renderedSampleHash`,
`renderedSampleRef` (data-root-relative, never absolute), `layoutClass`,
`qualityClass`, `scriptFeatures`, `requiredProviders`, `groundTruth`
(`revision`, `status`, `exactText`, `hash`, `updatedAt`), `createdAt`,
`updatedAt`, plus unit-specific geometry:

- `PAGE`: `regions[]`, each with `regionId`, `language`, `regionType`, `box`,
  `readingOrder`, `requiredProviders`, and ordered `lines[]`.
- `REGION`: `region{regionId, box, readingOrder}` and ordered `lines[]`.
- `LINE`: `line{lineId, index, box, exactText}` where `exactText` must equal the
  sample's ground-truth text.

Reading order inside a page or region is contiguous and 0-based; a gap or a
duplicate is a validation failure.

---

## 7. Manifests

`App/app/server/ocr/benchmark/manifest.mjs` writes plain JSON:

```json
{
  "manifestVersion": 1,
  "corpusId": "synthetic-starter-v1",
  "description": "…",
  "createdAt": "…",
  "samples": [ { "benchmarkItemId": "…", "…": "…" } ],
  "manifestHash": "<sha256 of the canonical JSON content>"
}
```

Validation rejects, explicitly and by name: a missing or malformed `sourceHash`,
a missing `renderedSampleHash`, an absolute `renderedSampleRef`, a duplicate
`benchmarkItemId`, a duplicate line/region id, non-contiguous reading order,
dangling `parentPageId`/`parentRegionId`, a line index that disagrees with its
parent region's truth, a malformed ground-truth record, an unauthorised provider,
a formal sample whose provider set does not match the mandatory set for its
language, a mixed page whose provider set is not exactly the union of its region
providers, and any prohibited engine-substitution semantic.

Ground-truth binding is verified separately by `verifyManifestIntegrity()`:
`groundTruth.hash` must equal the sha256 of the exact stored Unicode text, and
`manifestHash` must match the manifest content. Editing ground truth without
re-hashing is therefore detected.

---

## 8. Ground truth

States: `DRAFT` → `REVIEWED` → `FINAL`.

- `DRAFT` lives in `<root>/ground-truth/<sampleId>.draft.txt` and is editable by
  a human. It has no hash.
- `REVIEWED` lives in `<sampleId>.reviewed.json` with the exact draft text,
  hash, timestamp, and review label. `FINAL` lives in `<sampleId>.final.json`.
  Both require a hash of the exact text. An assistant-created transcription is
  still a DRAFT until a person checks it against the image.
- **Only `FINAL` ground truth may be scored formally.** `scoreSample()` throws
  `GROUND_TRUTH_NOT_FINAL` otherwise, and a run record without a
  `groundTruthHash` fails validation.

Recorded with every truth: revision, status, exact text, sha256, timestamp, and
(optionally) who reviewed it. Personal identity is avoided beyond an optional
review label.

Locking a sample freezes `sourceHash`, `renderedSampleHash`, and
`groundTruthHash` together in `<sampleId>.lock.json`.
The corpus store now requires the recorded sequence DRAFT → REVIEWED → FINAL:
finalisation rejects a missing or stale review, and the stored FINAL record is
re-hashed on read. Locking requires the actual source file and a rendered image
inside the private corpus; it re-hashes both and checks the FINAL truth hash
before writing a lock. A locked image, truth, or lock cannot be overwritten.

### Exact text is never rewritten

- Arabic: harakat, shadda, sukun, tanween, superscript alef, and extended marks
  are preserved. Nothing is normalised in storage.
- Urdu: no transliteration; Urdu-specific letters (ٹ ڈ ڑ ں ھ ہ ی ے …) are never
  folded into Arabic variants; punctuation, digits, and diacritics are preserved;
  line segmentation is preserved where the unit is `LINE`.
- Derived comparison keys exist for scoring only and never overwrite stored text.

---

## 9. Mandatory providers — NO FALLBACKS

This is an explicit user-authority decision (2026-09-17) and it is not
negotiable in code:

| Language | Mandatory engines |
| --- | --- |
| English | `unlimited-ocr` (Baidu Unlimited-OCR) |
| Arabic | `paddleocr` (PP-OCRv5 Arabic-script recognition) |
| Urdu | `paddleocr` **and** `urdu-nastaliq-trocr` (dedicated Nastaliq specialist) |

`requiredProviders` is a **requirement set**, not an attempt order. Read & Watch
implements **no** fallback chain:

- no "try engine A, then engine B", no backup provider, no secondary provider,
  no automatic substitution, no "best text" selection;
- a mandatory provider that fails or is unavailable is recorded as a failure;
  available partial output is preserved and the run is labelled honestly;
- the forbidden semantics are machine-checked: `findForbiddenSemantics()` scans
  every produced record, and `tests/ocr-benchmark-engines.test.mjs` (case 38)
  asserts the manifest, the provider schema, and the run records are clean.

If a mandatory engine is unavailable, the honest outcomes are
`PARTIAL_ENGINE_FAILURE` (at least one mandatory engine produced output) or
`BLOCKED` (none did). Urdu is never reported as complete on one engine.

Current integration status (superseding the 2026-09-17 foundation snapshot):

- `unlimited-ocr`: `INTEGRATED` (execution blocked by hardware — no CUDA device
  on this host; reported as a structured state, never faked).
- `paddleocr`: `INTEGRATED`; the pinned PaddlePaddle 3.0.0 / PaddleOCR 3.3.1 /
  PaddleX 3.3.13 CPU combination passed a real synthetic inference on 2026-09-18.
  The earlier PaddlePaddle 3.3.1 PIR/oneDNN failure remains historical evidence.
- `urdu-nastaliq-trocr`: `INTEGRATED`, revision
  `a9ef072320b50014f6df7ed9db807810157a410e`, LINE only. The shipped
  driver passed a synthetic CPU smoke test. Its staged Python runtime now uses a
  short external root to avoid the earlier MAX_PATH provisioning failure.
  Neither smoke test is representative benchmark acceptance evidence.

---

## 10. Specialists: verified provenance and honest limitations

Verified from the live model card, the live Hugging Face API record, and the
associated public project repository on 2026-09-17:

| Item | Value |
| --- | --- |
| Model id | `qandeelasim13/urdu-ocr-trocr-si26` |
| Model revision observed | `a9ef072320b50014f6df7ed9db807810157a410e` |
| Model card licence | `apache-2.0` |
| Architecture | TrOCR / `VisionEncoderDecoderModel`, encoder + decoder fine-tuned end-to-end |
| Base model | `microsoft/trocr-base-printed` |
| Task | printed Urdu (Nastaliq-style) image-to-text OCR |
| Documented input granularity | **single line** (the model card states line-level printed images; not handwriting, not multi-line paragraphs, not heavily degraded input) |
| Runtime | PyTorch + Hugging Face `transformers`; the project's own deployment pins CPU-only torch wheels; Python ≥ 3.11 |
| Weights | `model.safetensors`, 333,921,792 F32 parameters, ~1.34 GB repository storage |
| Project repository | `qandeelasim13/URDU-OCR-PROJECT-CODE-SAVIOURS-SI-2026-QANDEEL-ASIM` |
| Project licence file | **none detected** by the GitHub API (`license: null`) |
| Training data caveat | includes UTRSet-Real (CC BY-NC-SA 4.0, non-commercial/research) |
| Project's own evaluation | CER 0.52, character accuracy 47.66% on its own held-out split; the project README states roughly half of characters may be misread |

Consequences adopted by this protocol:

1. The specialist is a **line-level** engine. `supportedUnitTypes: ['LINE']`.
   Page/region use must be expressed as line-level results with an explicit line
   association; a page-level specialist result is rejected
   (`LINE_ASSOCIATION_REQUIRED`).
2. Nothing in this repository claims the specialist supports handwriting,
   arbitrary full pages, or heavily degraded pages.
3. Its documented accuracy is not sufficient for unattended use, and no accuracy
   figure is quoted as a Read & Watch measurement — the numbers above are the
   upstream project's own claims.
4. Weight/dataset licensing (including the CC BY-NC-SA training data) must be
   resolved before any redistribution or commercial use. No weight is committed
   or redistributed here.

---

## 11. Metrics

All metrics are deterministic functions of stored prediction and finalised
ground truth. No LLM judges correctness, no "looks right" scoring, and no
semantic similarity as a primary OCR metric.

General: character error rate (CER, Levenshtein over code points, normalised by
the reference length), word error rate (WER, whitespace tokens), exact text
match (byte-exact, no normalisation), and line/block preservation measures
(missed lines, extra lines, ordering errors, per-line exact-match rate).

English: CER, WER, exact text accuracy.

Arabic is reported as **three separate families**:

- **A. Huroof (base letters)** — marks and tatweel are excluded from this metric
  only. Answers "were the letters recognised?".
- **B. Tashkeel (harakat)** — the ordered mark sequence per letter cluster, in
  canonical combining order, compared as deletions (missing), substitutions
  (wrong) and insertions (extra), plus `attachmentMismatches` for marks that
  moved between letters. With an empty mark reference each extra mark is one full
  error unit.
- **C. Fully vocalised combined** — the complete string including letters and
  marks, compared as NFC so canonically equivalent mark order compares equal.

Worked example from the test suite: ground truth `الْحَمْدُ` versus prediction
`الحمد` scores huroof-correct (letters recognised) while tashkeel reports four
missing marks and the fully-vocalised metric fails.

Urdu: each mandatory engine is scored **independently** — CER, WER, exact text
match, Urdu-specific character analysis, diacritic analysis, line exact-match
rate, and per-script-feature breakdowns. The two raw outputs are never collapsed
into one score.

---

## 12. Urdu dual-engine comparison

For every matched unit where both mandatory engines ran, the comparison record
preserves: both raw outputs, the ground truth, each engine's CER/WER/exact-match
status, and the pairwise disagreement evidence (agreement count, disagreement
count, substitution/insertion/deletion counts, and per-code-point disagreement
locations with a documented cap).

Rules:

- Two engines agreeing is **not** truth. Two engines can agree and both be wrong;
  `correctnessAuthority` is always `ground-truth`.
- Disagreement never selects a winner: the comparison record has no `winner`,
  `bestText`, `combinedText`, or `fallbackProvider` field, and a test asserts
  their absence.
- Material disagreement between mandatory engines produces `REVIEW_REQUIRED`.
- Neither engine's output is ever used as ground truth for the other.

---

## 13. Urdu line segmentation benchmark

Because the specialist is line-oriented, representative Urdu pages carry
page → text region → ordered line boxes with exact text per line. The truth
supports: correct number of lines, line bounding boxes, ordering, and exact text.
The scoring report measures missed lines, extra lines, ordering errors, and
post-segmentation recognition error, and reserves explicit `splitLines` and
`mergedLines` fields that a future segmenter comparison fills in. Recognition
quality and segmentation quality are reported separately and never conflated.

---

## 14. Layout and reading-order truth

The schema already carries what P17-T005 must later be measurable against: page
boxes, region boxes, region type, region reading order, line boxes, line order,
language per region and per line, and parent/child relationships. No
reading-order algorithm is implemented in this task; the benchmark only defines
how it will be measured.

---

## 15. Mixed-language pages

A mixed page declares page-level language `mixed`, region-level languages, and
per-region/per-line provider requirements. The page's `requiredProviders` must be
exactly the union of its regions' requirements. Example: an Urdu Nastaliq region
requires PP-OCRv5 **and** the Nastaliq specialist; an English caption region
requires Unlimited-OCR; no routing fallback exists anywhere.

---

## 16. Run records and provenance binding

A future benchmark result records: `runId`, `benchmarkManifestHash`, `sampleId`,
`provider`, `engineRevision`, `modelRevision`, `runtime`, `hardware`, `settings`,
`predictionHash`, `predictionText`, `CER`, `WER`, `exactMatch`,
`languageSpecificMetrics`, `layoutMetrics`, `durationMs` (only when genuinely
measured), `status`, and `error`.

For multi-engine samples the parent/group record additionally carries
`requiredProviders`, `completedProviders`, `failedProviders`, `missingProviders`,
`providerResults`, `pairwiseDisagreement`, `reviewState`,
`overallExecutionState`, `transcriptionState`, and `correctnessAuthority`.
There is deliberately no single opaque `bestText` field.

A benchmark number with unknown provenance is not permitted: the manifest hash,
source hash, rendered-sample hash, and ground-truth hash are all required, and a
failed run must not carry invented text.

---

## 17. Completion states

| State | Meaning |
| --- | --- |
| `COMPLETE` | every mandatory provider for the sample ran successfully |
| `PARTIAL_ENGINE_FAILURE` | at least one mandatory provider failed or produced no result |
| `BLOCKED` | no mandatory provider produced output |
| `REVIEW_REQUIRED` | every mandatory provider completed but they materially disagree |
| `MACHINE_TRANSCRIBED` | machine output with full provenance exists (reported alongside the execution state) |

Reserved for later phases and never claimed now: `CONSENSUS_VERIFIED`,
`HUMAN_VERIFIED`, `FULLY_PROOFREAD`.

`COMPLETE` is refused unless **every** mandatory provider completed. A
two-engine Urdu sample with one engine's output is `PARTIAL_ENGINE_FAILURE`, and
the successful engine's raw output is preserved rather than discarded.

---

## 18. Synthetic starter corpus

`App/app/tests/fixtures/ocr-benchmark/synthetic-corpus.mjs` defines 14 authored
samples (English page + 2 lines; Arabic page, region, and line; Urdu page,
region, 5 lines including an infrastructure-only one; one mixed page with an
Urdu Nastaliq region and an English caption region).

Purpose: prove schema, rendering, ground truth, hashing, scoring,
directionality, Unicode handling, reproducibility, multi-engine result handling,
and line/region identity.

**The synthetic corpus is not representative of real books and is not sufficient
for final accuracy acceptance.** No accuracy claim may be made from it.

Rendering (`node app/scripts/render-benchmark-fixtures.mjs [--download-fonts]`):

- fonts are lawfully redistributable OFL-1.1 fonts (Noto Nastaliq Urdu for Urdu,
  Noto Naskh Arabic for Arabic, Noto Sans for English) downloaded into
  `<root>/fonts/` and hash-verified against the committed provenance;
- glyph coverage is read from each font's own `cmap` table and checked against
  the fixture's code points **before** anything is drawn — Read & Watch never
  rasterises Arabic-script text with a font that lacks the required glyphs, and
  never draws Nastaliq with a non-Nastaliq font;
- rendering uses a Chromium-family headless browser with DNS refused
  (`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost`), background
  networking off, a throwaway profile directory, fonts embedded as data URIs, and
  device scale factor 2, so real shaping (HarfBuzz) and RTL order are exercised;
- the run writes `reports/synthetic-render-provenance.json` with the manifest
  hash, browser executable/version, font hashes, and per-fixture geometry, then
  clears its `temp/` scratch space.

Observed render on this host: 14/14 samples rendered, browser `153.0.8010.48`,
fonts verified by hash and coverage, no leaked browser process.

---

## 19. Private real-world sampling workflow

```
lawful source document
  → hash the source (never copied, never modified)
  → select representative page / region / line image
  → store that image under <root>/corpus/<category>/
  → create an editable ground-truth draft
  → write a draft benchmark item
  → validate → finalise (FINAL + hash) → lock (source + rendered + truth hashes)
  → later: run every mandatory engine for that language, independently
  → score each engine independently against FINAL truth
  → preserve disagreement evidence
  → score the combined verification layer separately (Phase 18)
```

Implemented by `node app/scripts/import-benchmark-sample.mjs`:

```bash
node app/scripts/import-benchmark-sample.mjs \
  --sample-id ur-book01-p0042-l03 --language ur --unit line \
  --source "D:\books\owned-urdu-book.pdf" \
  --image "D:\work\owned-urdu-book-p0042-l03.png" \
  --text-file "D:\work\owned-urdu-book-p0042-l03.txt" \
  --page real-book01-page0042 --region real-book01-region0001 --line-index 3 \
  --script-features nastaliq,isolated-line,urdu-specific-letters \
  --layout isolated-line --quality clean --source-type clean-scan
```

For Urdu, the declared mandatory providers default to PP-OCRv5 **and** the
Nastaliq specialist. The tool never invents ground truth (`--text-file` is
required), never copies the source document, and never writes inside Git.

Documented limitation: the tool ingests an already-selected page/region/line
image. Producing that image from a PDF page uses the application's own PDF.js
renderer or the user's lawful tooling; no image library was added to the
repository for this task, and no cropping is automated.

---

## 20. Deterministic Unicode comparison

`App/app/server/ocr/benchmark/unicode.mjs` documents and implements the
comparison rules:

- line-ending normalisation (CRLF → LF) and zero-width/control removal apply to
  **derived keys only**, never to stored text;
- Arabic huroof key: marks and tatweel removed, whitespace collapsed;
- Arabic tashkeel key: marks grouped per base letter, ordered by Unicode
  combining class (then code point), clusters separated so a mark that moves
  between letters is an error;
- fully vocalised / Urdu keys: NFC, so canonically equivalent mark order compares
  equal while nothing is folded, transliterated, or stripped;
- whitespace/token boundaries are preserved for WER; a whitespace-insensitive
  key exists only as a secondary indicator;
- comparisons are capped (`MAX_COMPARISON_CODE_POINTS`) so a pathological sample
  fails loudly instead of hanging.

Tested behaviours include shadda + vowel ordering, tanween, sukun, multiple
marks, Arabic letter variants, Urdu-specific letters, Urdu yeh/heh variants,
retroflex letters, zero-width/control handling, line-ending normalisation
separately from semantic text, whitespace/token boundaries, and RTL text.

---

## 21. Acceptance limitations

1. No engine has been benchmarked yet (P17-T004 outstanding). The schema and
   scoring exist; the measurements do not.
2. Engine acceptance cannot rest on the synthetic corpus.
3. Urdu recognition requires both PP-OCRv5 and the LINE-only specialist for every
   applicable line. Both are integrated, but neither has formal scored evidence
   against FINAL representative ground truth.
4. English remains blocked on this host by the absence of NVIDIA CUDA hardware.
   PP-OCRv5's earlier PaddlePaddle 3.3.1 CPU failure was superseded by the
   proven pinned runtime; no provider is substituted.
5. Specialist licence/dataset terms are unresolved for redistribution and
   commercial use.
6. P17-T005 now implements deterministic reading order and line segmentation;
   representative page/region truth has not yet verified their real-world quality.
7. The 2026-09-23 private inventory has 16 DRAFT candidate items and zero FINAL
   or locked items. The protocol defines coverage dimensions but no minimum
   sample counts, numerical accuracy/performance thresholds, held-out split, or
   explicit qualitative decision authority for P17-G002. These must be resolved
   before a formal acceptance decision; no threshold may be invented.

### 2026-09-23 continuation (current private corpus)

The previous 16-item inventory above is a historical snapshot. An assistant
visual pass inspected all 16 images and registered one useful English REGION
crop from an existing local-library source, giving 17 DRAFT items (14 PAGE,
2 LINE, 1 REGION). The new item remains subject to the same human truth and
lawful-use checks. No item is REVIEWED, FINAL, or locked. The private review
pack under `READ_WATCH_DATA_ROOT/ocr/benchmark/reports/` records each unresolved
image and draft. No formal provider run or accuracy result exists.

P17-G002 has a proposed decision rule in the Phase 17 report. It is not an
approved gate: corpus adequacy, measured language-specific accuracy, practical
runtime, and licence scope still require a user decision after lawful FINAL
truth and real provider runs exist.

---

## 22. Tooling reference

| Command | Purpose |
| --- | --- |
| `node app/scripts/render-benchmark-fixtures.mjs [--download-fonts] [--check-fonts-only]` | render the lawful synthetic corpus into the private root |
| `node app/scripts/import-benchmark-sample.mjs …` | register one private sample from a lawful source with editable ground truth |
| `node --test tests/ocr-benchmark-*.test.mjs` | corpus, scoring, and engine-policy tests |

Module map: `schema.mjs` (vocabulary + validation), `unicode.mjs` (comparison
rules), `scoring.mjs` (metrics + comparison), `run-record.mjs` (run/group
records + completion states), `manifest.mjs` (manifest I/O + hashing),
`corpus-store.mjs` (private layout + sampling), `render.mjs` (font coverage +
offline rendering), `synthetic-corpus.mjs` (definitions → manifest).
