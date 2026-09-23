/**
 * Registers ONE private benchmark sample from a lawful source — P17-T002.
 *
 * Workflow (see docs/project/OCR_BENCHMARK_PROTOCOL.md section 10):
 *
 *   lawful source document
 *     -> hash the source (the document is NOT copied, NOT modified)
 *     -> the user/benchmark selects the representative page/region/line image
 *     -> the image is stored under READ_WATCH_DATA_ROOT/ocr/benchmark/corpus/<category>/
 *     -> an EDITABLE ground-truth draft is created
 *     -> the sample is written as a draft item, ready to finalise and lock
 *
 * Ground truth is written by a human. This script never invents transcription,
 * never calls an OCR engine, and never writes inside Git.
 *
 * Usage:
 *   node app/scripts/import-benchmark-sample.mjs \
 *     --sample-id ur-book01-p0042-l03 --language ur --unit line \
 *     --source "D:\books\owned-urdu-book.pdf" \
 *     --image "D:\work\owned-urdu-book-p0042-l03.png" \
 *     --text-file "D:\work\owned-urdu-book-p0042-l03.txt" \
 *     --page syn-real-book01-page-0042 --region syn-real-book01-region-0001 --line-index 3 \
 *     --script-features nastaliq,isolated-line,urdu-specific-letters \
 *     --layout isolated-line --quality clean --source-type clean-scan
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveDataPaths } from '../server/data-paths.mjs';
import {
  createBenchmarkCorpusStore,
  mandatoryProvidersForLanguage,
  validateBenchmarkItem,
} from '../server/ocr/benchmark/index.mjs';

const appDir = fileURLToPath(new URL('..', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    values[key] = next === undefined || next.startsWith('--') ? true : ((index += 1), next);
  }
  return values;
}

function requireArg(args, key, hint) {
  const value = args[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`--${key} is required (${hint})`);
  }
  return value;
}

function requireLanguage(args) {
  const language = requireArg(args, 'language', 'en | ar | ur');
  if (!['en', 'ar', 'ur'].includes(language)) {
    throw new Error('--language must be en, ar, or ur; mixed pages are declared per region');
  }
  return language;
}

/** PNG pixel size straight from the IHDR chunk; no image library needed. */
function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function parseBox(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const parts = value.split(',').map((entry) => Number.parseFloat(entry.trim()));
  if (parts.length !== 4 || parts.some((entry) => !Number.isFinite(entry))) {
    throw new Error('--box must be "x,y,width,height"');
  }
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sampleId = requireArg(args, 'sample-id', 'stable sample identity, not a file name');
  const language = requireLanguage(args);
  const unitType = requireArg(args, 'unit', 'page | region | line').toUpperCase();
  if (!['PAGE', 'REGION', 'LINE'].includes(unitType)) {
    throw new Error('--unit must be page, region, or line');
  }
  const sourcePath = requireArg(args, 'source', 'the lawful source document you own or may use');
  const imagePath = requireArg(args, 'image', 'the selected page/region/line image for this sample');
  const textFile = requireArg(
    args,
    'text-file',
    'a file containing YOUR exact transcription; the tool never invents ground truth',
  );

  const paths = resolveDataPaths({ appRoot: appDir, environment: process.env });
  const store = createBenchmarkCorpusStore({ dataRoot: paths.dataRoot, repositoryRoot });
  const { sourceHash, byteLength } = store.registerSampleSource({ sourcePath });
  const image = readFileSync(resolve(imagePath));
  const size = pngSize(image) ?? { width: 1, height: 1 };
  const stored = store.recordRenderedSample({ sampleId, language, bytes: image, extension: 'png' });
  const exactText = readFileSync(resolve(textFile), 'utf8').replace(/\r\n?/g, '\n').replace(/\n$/, '');
  const draft = store.writeGroundTruthDraft({ sampleId, exactText });

  const scriptFeatures = String(args['script-features'] ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const layoutClass = String(args.layout ?? 'single-column')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const providerOverride = String(args.providers ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const requiredProviders = providerOverride.length > 0 ? providerOverride : mandatoryProvidersForLanguage(language);

  const itemPath = join(store.directories.manifests, `${sampleId}.item.json`);
  mkdirSync(store.directories.manifests, { recursive: true });
  const draftItem = {
    benchmarkItemId: sampleId,
    unitType,
    language,
    script: String(args.script ?? (language === 'ur' ? 'arabic-nastaliq' : language === 'ar' ? 'arabic' : 'latin')),
    sourceType: String(args['source-type'] ?? 'clean-scan'),
    layoutClass,
    qualityClass: String(args.quality ?? 'clean'),
    scriptFeatures,
    purpose: String(args.purpose ?? 'formal-acceptance'),
    requiredProviders,
    parentPageId: typeof args.page === 'string' ? args.page : null,
    parentRegionId: typeof args.region === 'string' ? args.region : null,
    sourceHash,
    renderedSampleHash: stored.hash,
    renderedSampleRef: stored.ref,
    groundTruth: { revision: 1, status: 'DRAFT', exactText, hash: null, updatedAt: new Date().toISOString() },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (unitType === 'LINE') {
    draftItem.line = {
      lineId: sampleId,
      index: Number.parseInt(String(args['line-index'] ?? '0'), 10),
      box: parseBox(args.box, { x: 0, y: 0, width: size.width, height: size.height }),
      exactText,
    };
  }
  if (unitType === 'REGION') {
    draftItem.region = {
      regionId: sampleId,
      box: parseBox(args.box, { x: 0, y: 0, width: size.width, height: size.height }),
      readingOrder: Number.parseInt(String(args['reading-order'] ?? '0'), 10),
    };
  }
  writeFileSync(itemPath, `${JSON.stringify(draftItem, null, 2)}\n`, 'utf8');

  const validation = validateBenchmarkItem(draftItem);
  console.log(`source: ${basename(sourcePath)} (${byteLength} bytes) sha256=${sourceHash}`);
  console.log(`image:  ${stored.ref} sha256=${stored.hash}`);
  console.log(`draft:  ${draft.path} (editable ground truth, DRAFT)`);
  console.log(`item:   ${itemPath}`);
  console.log(`providers (mandatory): ${requiredProviders.join(' + ')}`);
  if (!validation.ok) {
    console.log('item is a DRAFT and does not yet satisfy the manifest schema:');
    for (const problem of validation.problems) console.log(`  - ${problem}`);
    console.log('fix the listed fields (boxes, script features, layout classes), then finalise and lock the sample.');
  } else {
    console.log('item satisfies the manifest schema. Finalise the ground truth, then lock the sample.');
  }
}

try {
  main();
} catch (error) {
  console.error(`benchmark sample import failed: ${error.message}`);
  process.exitCode = 1;
}
