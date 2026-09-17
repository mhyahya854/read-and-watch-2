/**
 * Synthetic corpus builder — Phase 17, task P17-T002.
 *
 * Turns committed, authored fixture DEFINITIONS into a valid benchmark manifest
 * plus rendered sample bytes. The definitions are injected by the caller (the
 * test suite or the fixture-rendering script), so no production module imports a
 * test fixture and no image or private text is ever committed.
 *
 * The synthetic corpus proves the plumbing. It is not representative of real
 * books and must never be presented as final accuracy evidence.
 */

import {
  mandatoryProvidersForLanguage,
  sha256Hex,
  validateManifest,
} from './schema.mjs';
import { createManifest, groundTruthHashForText } from './manifest.mjs';

const CORPUS_FOLDER_BY_LANGUAGE = Object.freeze({
  en: 'english',
  ar: 'arabic',
  ur: 'urdu',
  mixed: 'mixed',
});

function lineRecord(line) {
  return {
    lineId: line.lineId,
    index: line.index,
    language: line.language,
    box: { ...line.box },
    exactText: line.text,
  };
}

/** The authored text drawn for one definition, in declared order. */
function definitionText(definition) {
  if (definition.unitType === 'PAGE') {
    return definition.regions
      .flatMap((region) => region.lines)
      .map((line) => line.text)
      .join('\n');
  }
  return definition.lines.map((line) => line.text).join('\n');
}

/**
 * The "source document" of a synthetic sample is its own authored text. Hashing
 * it keeps the synthetic workflow byte-for-byte identical to the real workflow,
 * where the source hash covers a lawful source document.
 */
function syntheticSourceText(definition) {
  return `synthetic-source:${definition.benchmarkItemId}\n${definitionText(definition)}`;
}

function syntheticSampleImageRef(definition, extension = 'png') {
  const folder = CORPUS_FOLDER_BY_LANGUAGE[definition.language] ?? 'mixed';
  return `ocr/benchmark/corpus/${folder}/${definition.benchmarkItemId}.${extension}`;
}

function realizeItem(definition, { sourceHash, renderedSampleHash, renderedSampleRef, groundTruth, timestamp }) {
  const text = definitionText(definition);
  const item = {
    benchmarkItemId: definition.benchmarkItemId,
    unitType: definition.unitType,
    language: definition.language,
    script: definition.script,
    sourceType: definition.sourceType,
    layoutClass: [...definition.layoutClass],
    qualityClass: definition.qualityClass,
    scriptFeatures: [...definition.scriptFeatures],
    purpose: definition.purpose,
    requiredProviders: [...definition.requiredProviders],
    parentPageId: definition.parentPageId,
    parentRegionId: definition.parentRegionId,
    sourceHash,
    renderedSampleHash,
    renderedSampleRef,
    groundTruth,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (definition.unitType === 'PAGE') {
    item.regions = definition.regions.map((region) => ({
      regionId: region.regionId,
      language: region.language,
      regionType: region.regionType,
      box: { ...region.box },
      readingOrder: region.readingOrder,
      ...(region.singleLine === undefined ? {} : { singleLine: region.singleLine }),
      requiredProviders: region.requiredProviders
        ? [...region.requiredProviders]
        : [...(mandatoryProvidersForLanguage(region.language) ?? [])],
      lines: region.lines.map(lineRecord),
    }));
  } else if (definition.unitType === 'REGION') {
    item.region = { ...definition.region, box: { ...definition.region.box } };
    item.lines = definition.lines.map(lineRecord);
  } else {
    item.line = { ...definition.line, box: { ...definition.line.box }, exactText: text };
  }
  return item;
}

/**
 * Builds the realized corpus.
 *
 * @param {{
 *   corpusId: string,
 *   description?: string,
 *   definitions: readonly object[],
 *   render: (definition: object, context: {imageRef: string}) => Promise<{bytes: Uint8Array, extension?: string}> | {bytes: Uint8Array, extension?: string},
 *   now?: () => string,
 * }} input
 */
export async function buildSyntheticCorpus({
  corpusId,
  description = '',
  definitions,
  render,
  now = () => new Date().toISOString(),
}) {
  if (typeof render !== 'function') {
    throw new TypeError('buildSyntheticCorpus requires a render function');
  }
  if (!Array.isArray(definitions) || definitions.length === 0) {
    throw new TypeError('buildSyntheticCorpus requires fixture definitions');
  }

  const timestamp = now();
  const samples = [];
  const rendered = [];

  for (const definition of definitions) {
    const text = definitionText(definition);
    const extension = 'png';
    const renderedSampleRef = syntheticSampleImageRef(definition, extension);
    const { bytes } = await render(definition, { imageRef: renderedSampleRef });
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    rendered.push({ benchmarkItemId: definition.benchmarkItemId, extension, bytes: buffer, ref: renderedSampleRef });
    samples.push(
      realizeItem(definition, {
        sourceHash: sha256Hex(syntheticSourceText(definition)),
        renderedSampleHash: sha256Hex(buffer),
        renderedSampleRef,
        groundTruth: {
          revision: 1,
          status: 'FINAL',
          exactText: text,
          hash: groundTruthHashForText(text),
          updatedAt: timestamp,
          provenance: 'synthetic-authored-text',
        },
        timestamp,
      }),
    );
  }

  const manifest = createManifest({
    corpusId,
    description,
    samples,
    createdAt: timestamp,
  });
  const validation = validateManifest(manifest);
  if (!validation.ok) {
    throw new Error(`synthetic corpus produced an invalid manifest: ${validation.problems.join('; ')}`);
  }
  return { manifest, rendered, samples };
}
