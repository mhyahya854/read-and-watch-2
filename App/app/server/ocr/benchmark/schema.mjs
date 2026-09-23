/**
 * Read & Watch OCR benchmark schema — Phase 17, task P17-T002.
 *
 * This module owns the vocabulary and the validators for the private OCR
 * benchmark corpus. Nothing here runs OCR, imports an engine, or touches a user
 * document: it declares what a benchmark sample IS, what ground truth IS, and
 * which engines are mandatory for it.
 *
 * Hard rules enforced here:
 *
 *   1. Every sample declares `requiredProviders`. That is a REQUIREMENT SET,
 *      not an attempt order. There is no fallback engine, no backup engine, no
 *      "try the next one", and no automatic substitution anywhere in the model.
 *      `findForbiddenSemantics()` exists so a schema addition that reintroduces
 *      those concepts fails a test instead of shipping.
 *   2. Urdu samples require BOTH PP-OCRv5 and the dedicated Nastaliq specialist.
 *      A single-provider Urdu sample is only legal when it is explicitly marked
 *      as infrastructure plumbing rather than formal Urdu acceptance.
 *   3. Identity is explicit (`benchmarkItemId`, parent ids, line ids). Nothing
 *      is derived from a file name.
 *   4. Ground truth carries exact Unicode text, a revision, a state, and a hash.
 *      Only FINAL ground truth may be scored formally.
 */

import { createHash } from 'node:crypto';

import { OCR_PROVIDERS, OCR_REQUIRED_PROVIDERS, OCR_UNIT_TYPES } from '../ocr-contract.mjs';

export const BENCHMARK_MANIFEST_VERSION = 1;

/** PAGE / REGION / LINE. The Nastaliq specialist is scored at LINE granularity. */
export const UNIT_TYPES = Object.freeze([...OCR_UNIT_TYPES]);

export const LANGUAGES = Object.freeze(['en', 'ar', 'ur', 'mixed']);

export const SCRIPTS = Object.freeze([
  'latin',
  'arabic',
  'arabic-nastaliq',
  'arabic-naskh',
  'mixed',
]);

export const SOURCE_TYPES = Object.freeze([
  'born-digital-rendered',
  'clean-scan',
  'degraded-scan',
  'photographed',
  'mixed-text-image',
]);

export const LAYOUT_CLASSES = Object.freeze([
  'single-column',
  'multi-column',
  'heading-paragraph',
  'table',
  'footnote',
  'caption',
  'list',
  'mixed-direction',
  'dense-textbook',
  'isolated-line',
  'multi-line-nastaliq-region',
]);

export const QUALITY_CLASSES = Object.freeze([
  'clean',
  'mild-noise',
  'skewed',
  'low-contrast',
  'compression-artifact',
  'blur',
  'uneven-illumination',
]);

/** Script features are declared per language so a typo cannot silently pass. */
export const SCRIPT_FEATURES = Object.freeze({
  en: Object.freeze([
    'normal-prose',
    'punctuation',
    'numbers',
    'headings',
    'mixed-formatting',
  ]),
  ar: Object.freeze([
    'unvocalized',
    'partially-vocalized',
    'fully-vocalized',
    'shadda-vowel-combination',
    'tanween',
    'sukun',
    'superscript-alef',
    'quranic-annotation-marks',
    'arabic-punctuation',
    'arabic-indic-numerals',
    'latin-arabic-mixed',
  ]),
  ur: Object.freeze([
    'urdu-specific-letters',
    'nastaliq',
    'naskh-urdu',
    'ligature-heavy-nastaliq',
    'diagonal-baseline',
    'connected-words',
    'punctuation',
    'urdu-digits',
    'mixed-urdu-english',
    'diacritics',
    'isolated-line',
    'multiple-lines',
    'heading',
    'body-text',
    'dense-printed-book-page',
  ]),
});

export const GROUND_TRUTH_STATES = Object.freeze(['DRAFT', 'REVIEWED', 'FINAL']);

/**
 * Execution/completion states for a benchmark run.
 *
 *  COMPLETE               every mandatory provider for the sample ran successfully
 *  PARTIAL_ENGINE_FAILURE at least one mandatory provider failed or was unavailable
 *  BLOCKED                no mandatory provider produced output at all
 *  REVIEW_REQUIRED        all mandatory providers completed but materially disagree
 *  MACHINE_TRANSCRIBED    machine outputs with full provenance exist (transcription
 *                         state, reported alongside the execution state)
 */
export const EXECUTION_STATES = Object.freeze([
  'COMPLETE',
  'PARTIAL_ENGINE_FAILURE',
  'BLOCKED',
  'REVIEW_REQUIRED',
  'MACHINE_TRANSCRIBED',
]);

/** Reserved for Phase 18 and later. Never claimed by this task. */
export const FUTURE_VERIFICATION_STATES = Object.freeze([
  'CONSENSUS_VERIFIED',
  'HUMAN_VERIFIED',
  'FULLY_PROOFREAD',
]);

export const SAMPLE_PURPOSES = Object.freeze(['formal-acceptance', 'infrastructure']);

export const SCORING_MODES = Object.freeze([
  'text',
  'arabic-huroof',
  'arabic-tashkeel',
  'arabic-fully-vocalized',
  'urdu-per-engine',
]);

/**
 * Which metric families a language is scored with. Derived, never guessed: an
 * English sample is not scored with Arabic tashkeel families, and an Urdu sample
 * is scored per engine rather than as one collapsed number.
 */
export function expectedScoringModesFor(language) {
  if (language === 'ar') return ['arabic-huroof', 'arabic-tashkeel', 'arabic-fully-vocalized'];
  if (language === 'ur') return ['urdu-per-engine'];
  if (language === 'mixed') return ['text', 'arabic-huroof', 'arabic-tashkeel', 'arabic-fully-vocalized', 'urdu-per-engine'];
  return ['text'];
}

/**
 * Engine-substitution concepts this project prohibits in provider/benchmark
 * records. Keys are matched case-insensitively, and `Substitution`/`bestText`
 * style names are caught by the same scan.
 */
export const FORBIDDEN_SEMANTIC_KEY_PATTERNS = Object.freeze([
  /fallback/i,
  /backup/i,
  /try.?next/i,
  /secondary/i,
  /best.?text/i,
  /combined.?text/i,
  /winner/i,
  // Engine substitution specifically. Mark-level metrics legitimately use the
  // words "substituted"/"substitution" for edit operations.
  /substitut(e|ed|ion)?(provider|engine|source|ocr)/i,
  /(provider|engine).?substitut/i,
  /primary.?provider/i,
  /if.*fail/i,
  /onFailureProvider/i,
]);

const ITEM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,119}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ABSOLUTE_PATH_PATTERN = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/;

export function isSha256(value) {
  return typeof value === 'string' && SHA256_PATTERN.test(value);
}

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** Deterministic JSON: keys sorted, `undefined` members dropped, no whitespace. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function manifestHash(manifest) {
  return sha256Hex(canonicalJson(manifest));
}

/**
 * Deep scan for prohibited engine-substitution semantics in any record that is
 * produced by (or validated by) this module.
 */
export function findForbiddenSemantics(value, path = '$', found = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findForbiddenSemantics(entry, `${path}[${index}]`, found));
    return found;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (FORBIDDEN_SEMANTIC_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
        found.push(`${path}.${key}`);
      }
      findForbiddenSemantics(entry, `${path}.${key}`, found);
    }
  }
  return found;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function checkBox(box, label, problems) {
  if (!isPlainObject(box)) {
    problems.push(`${label} must be an object`);
    return;
  }
  for (const field of ['x', 'y', 'width', 'height']) {
    if (typeof box[field] !== 'number' || !Number.isFinite(box[field])) {
      problems.push(`${label}.${field} must be a finite number`);
    }
  }
  if (typeof box.width === 'number' && box.width <= 0) problems.push(`${label}.width must be > 0`);
  if (typeof box.height === 'number' && box.height <= 0) problems.push(`${label}.height must be > 0`);
}

/**
 * The mandatory engine set for a language. English -> 1 engine, Arabic -> 1
 * engine, Urdu -> 2 engines. Never an ordered attempt list.
 */
export function mandatoryProvidersForLanguage(language) {
  const providerIds = OCR_REQUIRED_PROVIDERS[language];
  return providerIds ? [...providerIds] : null;
}

function authorisedProvidersFor(language) {
  return Object.values(OCR_PROVIDERS)
    .filter((provider) => provider.languages.includes(language))
    .map((provider) => provider.id);
}

function sameProviderSet(left, right) {
  const compare = (first, second) => (first < second ? -1 : first > second ? 1 : 0);
  const a = [...new Set(left)].sort(compare);
  const b = [...new Set(right)].sort(compare);
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}

function checkProviderIds(providerIds, language, label, problems) {
  if (!Array.isArray(providerIds) || providerIds.length === 0) {
    problems.push(`${label} must be a non-empty array`);
    return;
  }
  if (new Set(providerIds).size !== providerIds.length) {
    problems.push(`${label} must not repeat a provider`);
  }
  for (const providerId of providerIds) {
    if (!OCR_PROVIDERS[providerId]) {
      problems.push(`${label} names an unknown provider: ${String(providerId)}`);
      continue;
    }
    if (language && language !== 'mixed' && !OCR_PROVIDERS[providerId].languages.includes(language)) {
      problems.push(
        `${label} names "${providerId}", which is not an engine for language "${language}"`,
      );
    }
  }
}

function checkGroundTruth(groundTruth, problems) {
  if (!isPlainObject(groundTruth)) {
    problems.push('groundTruth must be an object');
    return;
  }
  if (!Number.isInteger(groundTruth.revision) || groundTruth.revision < 1) {
    problems.push('groundTruth.revision must be an integer >= 1');
  }
  if (!GROUND_TRUTH_STATES.includes(groundTruth.status)) {
    problems.push(`groundTruth.status must be one of ${GROUND_TRUTH_STATES.join(', ')}`);
  }
  if (typeof groundTruth.exactText !== 'string' || groundTruth.exactText.length === 0) {
    problems.push('groundTruth.exactText must be a non-empty exact Unicode string');
  }
  if (typeof groundTruth.updatedAt !== 'string' || Number.isNaN(Date.parse(groundTruth.updatedAt))) {
    problems.push('groundTruth.updatedAt must be an ISO timestamp');
  }
  if (groundTruth.status === 'FINAL' || groundTruth.status === 'REVIEWED') {
    if (!isSha256(groundTruth.hash)) {
      problems.push('groundTruth.hash (sha256) is required once ground truth is REVIEWED or FINAL');
    }
  } else if (groundTruth.hash !== null && !isSha256(groundTruth.hash)) {
    problems.push('groundTruth.hash must be null or a sha256 while ground truth is DRAFT');
  }
}

function checkLines(lines, ownerLabel, language, problems) {
  if (!Array.isArray(lines)) {
    problems.push(`${ownerLabel}.lines must be an array`);
    return;
  }
  const indices = [];
  const seen = new Set();
  lines.forEach((line, position) => {
    const label = `${ownerLabel}.lines[${position}]`;
    if (!isPlainObject(line)) {
      problems.push(`${label} must be an object`);
      return;
    }
    if (typeof line.lineId !== 'string' || !ITEM_ID_PATTERN.test(line.lineId)) {
      problems.push(`${label}.lineId must be a stable identifier`);
    } else if (seen.has(line.lineId)) {
      problems.push(`${label}.lineId is duplicated: ${line.lineId}`);
    } else {
      seen.add(line.lineId);
    }
    if (!Number.isInteger(line.index) || line.index < 0) {
      problems.push(`${label}.index must be an integer >= 0`);
    } else {
      indices.push(line.index);
    }
    if (!LANGUAGES.includes(line.language)) {
      problems.push(`${label}.language must be a known language`);
    }
    if (typeof line.exactText !== 'string' || line.exactText.length === 0) {
      problems.push(`${label}.exactText must be the exact Unicode line text`);
    }
    checkBox(line.box, `${label}.box`, problems);
  });
  const sorted = [...indices].sort((a, b) => a - b);
  if (sorted.some((value, position) => value !== position)) {
    problems.push(`${ownerLabel}.lines reading order must be contiguous and 0-based`);
  }
  if (language && language !== 'mixed') {
    for (const line of lines) {
      if (isPlainObject(line) && line.language && line.language !== language) {
        problems.push(`${ownerLabel}.lines declares language "${line.language}" inside a "${language}" sample`);
      }
    }
  }
}

function checkRegions(regions, label, problems) {
  if (!Array.isArray(regions) || regions.length === 0) {
    problems.push(`${label} must be a non-empty array for a mixed-language sample`);
    return;
  }
  const orders = [];
  const seen = new Set();
  regions.forEach((region, position) => {
    const regionLabel = `${label}[${position}]`;
    if (!isPlainObject(region)) {
      problems.push(`${regionLabel} must be an object`);
      return;
    }
    if (typeof region.regionId !== 'string' || !ITEM_ID_PATTERN.test(region.regionId)) {
      problems.push(`${regionLabel}.regionId must be a stable identifier`);
    } else if (seen.has(region.regionId)) {
      problems.push(`${regionLabel}.regionId is duplicated: ${region.regionId}`);
    } else {
      seen.add(region.regionId);
    }
    if (!['en', 'ar', 'ur'].includes(region.language)) {
      problems.push(`${regionLabel}.language must be en, ar, or ur`);
    }
    if (!LAYOUT_CLASSES.includes(region.regionType)) {
      problems.push(`${regionLabel}.regionType must be a known layout class`);
    }
    if (!Number.isInteger(region.readingOrder) || region.readingOrder < 0) {
      problems.push(`${regionLabel}.readingOrder must be an integer >= 0`);
    } else {
      orders.push(region.readingOrder);
    }
    checkBox(region.box, `${regionLabel}.box`, problems);
    checkProviderIds(region.requiredProviders, region.language, `${regionLabel}.requiredProviders`, problems);
    if (region.lines !== undefined) checkLines(region.lines, regionLabel, region.language, problems);
    if (
      region.singleLine !== undefined &&
      typeof region.singleLine !== 'boolean'
    ) {
      problems.push(`${regionLabel}.singleLine must be a boolean when present`);
    }
  });
  const sorted = [...orders].sort((a, b) => a - b);
  if (sorted.some((value, position) => value !== position)) {
    problems.push(`${label} reading order must be contiguous and 0-based`);
  }
}

/**
 * Validates one benchmark sample.
 *
 * @param {object} item candidate sample
 * @param {{requireRenderedHash?: boolean}} [options]
 */
export function validateBenchmarkItem(item, options = {}) {
  const { requireRenderedHash = true } = options;
  const problems = [];
  if (!isPlainObject(item)) {
    return { ok: false, problems: ['sample must be an object'] };
  }

  if (typeof item.benchmarkItemId !== 'string' || !ITEM_ID_PATTERN.test(item.benchmarkItemId)) {
    problems.push('benchmarkItemId must be a stable identifier (not derived from a file name)');
  }
  if (!UNIT_TYPES.includes(item.unitType)) {
    problems.push(`unitType must be one of ${UNIT_TYPES.join(', ')}`);
  }
  if (!LANGUAGES.includes(item.language)) {
    problems.push(`language must be one of ${LANGUAGES.join(', ')}`);
  }
  if (!SCRIPTS.includes(item.script)) {
    problems.push(`script must be one of ${SCRIPTS.join(', ')}`);
  }
  if (!SOURCE_TYPES.includes(item.sourceType)) {
    problems.push(`sourceType must be one of ${SOURCE_TYPES.join(', ')}`);
  }
  if (!QUALITY_CLASSES.includes(item.qualityClass)) {
    problems.push(`qualityClass must be one of ${QUALITY_CLASSES.join(', ')}`);
  }
  const layoutClasses = Array.isArray(item.layoutClass) ? item.layoutClass : [item.layoutClass];
  if (layoutClasses.length === 0) {
    problems.push(`layoutClass must be one of ${LAYOUT_CLASSES.join(', ')}`);
  } else if (layoutClasses.some((entry) => !LAYOUT_CLASSES.includes(entry))) {
    problems.push(`layoutClass must be one of ${LAYOUT_CLASSES.join(', ')}`);
  }

  if (!SAMPLE_PURPOSES.includes(item.purpose)) {
    problems.push(`purpose must be one of ${SAMPLE_PURPOSES.join(', ')}`);
  }

  const featureVocabulary =
    item.language === 'mixed'
      ? new Set([...SCRIPT_FEATURES.en, ...SCRIPT_FEATURES.ar, ...SCRIPT_FEATURES.ur])
      : new Set(SCRIPT_FEATURES[item.language] ?? []);
  if (!Array.isArray(item.scriptFeatures) || item.scriptFeatures.length === 0) {
    problems.push('scriptFeatures must be a non-empty array');
  } else {
    for (const feature of item.scriptFeatures) {
      if (!featureVocabulary.has(feature)) {
        problems.push(`scriptFeatures contains "${String(feature)}", which is not valid for ${item.language}`);
      }
    }
  }

  if (!isSha256(item.sourceHash)) {
    problems.push('sourceHash (sha256 of the lawful source document) is required');
  }
  if (requireRenderedHash && !isSha256(item.renderedSampleHash)) {
    problems.push('renderedSampleHash (sha256 of the rendered benchmark image) is required');
  }
  if (typeof item.renderedSampleRef !== 'string' || item.renderedSampleRef.length === 0) {
    problems.push('renderedSampleRef must be a data-root-relative path');
  } else if (ABSOLUTE_PATH_PATTERN.test(item.renderedSampleRef)) {
    problems.push('renderedSampleRef must never be an absolute machine path');
  }

  if (item.unitType === 'PAGE') {
    if (item.parentPageId !== null) problems.push('a PAGE sample must have parentPageId === null');
    if (item.parentRegionId !== null) problems.push('a PAGE sample must have parentRegionId === null');
  } else if (item.unitType === 'REGION') {
    if (typeof item.parentPageId !== 'string' || item.parentPageId.length === 0) {
      problems.push('a REGION sample requires parentPageId');
    }
    if (item.parentRegionId !== null) problems.push('a REGION sample must have parentRegionId === null');
    if (!isPlainObject(item.region)) {
      problems.push('a REGION sample requires its region record (regionId, box, readingOrder)');
    } else {
      checkBox(item.region.box, 'region.box', problems);
      if (!Number.isInteger(item.region.readingOrder) || item.region.readingOrder < 0) {
        problems.push('region.readingOrder must be an integer >= 0');
      }
      if (typeof item.region.regionId !== 'string' || !ITEM_ID_PATTERN.test(item.region.regionId)) {
        problems.push('region.regionId must be a stable identifier');
      }
    }
    if (item.lines !== undefined) checkLines(item.lines, 'lines', item.language, problems);
  } else if (item.unitType === 'LINE') {
    if (typeof item.parentPageId !== 'string' || item.parentPageId.length === 0) {
      problems.push('a LINE sample requires parentPageId');
    }
    if (typeof item.parentRegionId !== 'string' || item.parentRegionId.length === 0) {
      problems.push('a LINE sample requires parentRegionId');
    }
    if (!isPlainObject(item.line)) {
      problems.push('a LINE sample requires its line record (lineId, index, box, exactText)');
    } else {
      checkBox(item.line.box, 'line.box', problems);
      if (!Number.isInteger(item.line.index) || item.line.index < 0) {
        problems.push('line.index must be an integer >= 0');
      }
      if (typeof item.line.lineId !== 'string' || !ITEM_ID_PATTERN.test(item.line.lineId)) {
        problems.push('line.lineId must be a stable identifier');
      }
      if (typeof item.line.exactText !== 'string' || item.line.exactText.length === 0) {
        problems.push('line.exactText must be the exact Unicode line text');
      }
      if (
        typeof item.line.exactText === 'string' &&
        isPlainObject(item.groundTruth) &&
        item.line.exactText !== item.groundTruth.exactText
      ) {
        problems.push('line.exactText must equal groundTruth.exactText for a LINE sample');
      }
    }
  }

  if (item.language === 'mixed') {
    checkRegions(item.regions, 'regions', problems);
    if (Array.isArray(item.regions)) {
      const union = new Set(item.regions.flatMap((region) => region?.requiredProviders ?? []));
      if (!sameProviderSet([...union], item.requiredProviders ?? [])) {
        problems.push('a mixed sample must declare exactly the union of its region providers');
      }
    }
  } else if (item.regions !== undefined) {
    checkRegions(item.regions, 'regions', problems);
  }

  checkProviderIds(item.requiredProviders, item.language, 'requiredProviders', problems);
  if (item.language !== 'mixed' && item.purpose === 'formal-acceptance') {
    const mandatory = mandatoryProvidersForLanguage(item.language) ?? [];
    if (!sameProviderSet(item.requiredProviders ?? [], mandatory)) {
      problems.push(
        `a formal ${item.language} sample must require exactly ${mandatory.join(' + ')}`,
      );
    }
  } else if (item.purpose === 'infrastructure' && item.language !== 'mixed') {
    const authorised = authorisedProvidersFor(item.language);
    for (const providerId of item.requiredProviders ?? []) {
      if (!authorised.includes(providerId)) {
        problems.push(`infrastructure sample names "${providerId}", which is not an engine for ${item.language}`);
      }
    }
  }

  checkGroundTruth(item.groundTruth, problems);

  for (const rejected of findForbiddenSemantics(item)) {
    problems.push(`prohibited engine-substitution semantic at ${rejected}`);
  }

  return { ok: problems.length === 0, problems };
}

/**
 * Validates a whole manifest: version, no duplicate ids, every sample valid, and
 * every parent reference resolvable.
 */
export function validateManifest(manifest) {
  const problems = [];
  if (!isPlainObject(manifest)) {
    return { ok: false, problems: ['manifest must be an object'] };
  }
  if (manifest.manifestVersion !== BENCHMARK_MANIFEST_VERSION) {
    problems.push(`manifestVersion must be ${BENCHMARK_MANIFEST_VERSION}`);
  }
  if (typeof manifest.corpusId !== 'string' || manifest.corpusId.length === 0) {
    problems.push('corpusId must be a non-empty string');
  }
  if (!Array.isArray(manifest.samples) || manifest.samples.length === 0) {
    return { ok: false, problems: [...problems, 'samples must be a non-empty array'] };
  }

  const byId = new Map();
  manifest.samples.forEach((sample, index) => {
    const result = validateBenchmarkItem(sample);
    for (const problem of result.problems) problems.push(`samples[${index}]: ${problem}`);
    const id = sample?.benchmarkItemId;
    if (typeof id === 'string') {
      if (byId.has(id)) problems.push(`duplicate benchmarkItemId: ${id}`);
      byId.set(id, sample);
    }
  });

  for (const [id, sample] of byId) {
    if (!sample || sample.unitType === 'PAGE') continue;
    if (typeof sample.parentPageId === 'string' && !byId.has(sample.parentPageId)) {
      problems.push(`${id}: parentPageId "${sample.parentPageId}" is not in the manifest`);
      continue;
    }
    const page = byId.get(sample.parentPageId);
    if (!page) continue;
    const regions = Array.isArray(page.regions) ? page.regions : [];
    if (sample.parentRegionId) {
      const parentRegion = regions.find((region) => region?.regionId === sample.parentRegionId);
      if (!parentRegion) {
        problems.push(
          `${id}: parentRegionId "${sample.parentRegionId}" is not declared by page ${page.benchmarkItemId}`,
        );
      } else if (sample.unitType === 'LINE' && Array.isArray(parentRegion.lines)) {
        const declared = parentRegion.lines.find((line) => line?.lineId === sample.line?.lineId);
        if (!declared) {
          problems.push(
            `${id}: line "${sample.line?.lineId}" is not declared by region ${sample.parentRegionId}`,
          );
        } else if (declared.index !== sample.line?.index) {
          problems.push(`${id}: line index disagrees with the parent region ground truth`);
        }
      }
    }
  }

  if (manifest.manifestHash !== undefined) {
    const { manifestHash: declared, ...content } = manifest;
    if (declared !== manifestHash(content)) {
      problems.push('manifestHash does not match the manifest content');
    }
  }

  for (const rejected of findForbiddenSemantics(manifest)) {
    problems.push(`prohibited engine-substitution semantic at ${rejected}`);
  }

  return { ok: problems.length === 0, problems, samplesById: byId };
}

/**
 * Data integrity failure raised when a caller tries to do something the
 * benchmark protocol forbids (for example scoring draft ground truth).
 */
export class BenchmarkProtocolError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'BenchmarkProtocolError';
    this.code = code;
    this.details = details;
  }
}
