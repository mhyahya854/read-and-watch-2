/**
 * Renders the lawful synthetic OCR benchmark corpus — Phase 17, task P17-T002.
 *
 * Everything lands in the private external benchmark root:
 *
 *   READ_WATCH_DATA_ROOT/ocr/benchmark/corpus/<category>/<sampleId>.png
 *   READ_WATCH_DATA_ROOT/ocr/benchmark/manifests/synthetic-starter-v1.manifest.json
 *   READ_WATCH_DATA_ROOT/ocr/benchmark/fonts/<fontfile> + FONT_PROVENANCE.json
 *
 * No image, font binary, or model artifact is ever written into Git. The script
 * refuses to run if the resolving benchmark root is inside the repository.
 *
 * Usage:
 *   node app/scripts/render-benchmark-fixtures.mjs [--download-fonts] [--check-fonts-only]
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveDataPaths } from '../server/data-paths.mjs';
import {
  FONT_PROVENANCE,
  SYNTHETIC_CORPUS_DESCRIPTION,
  SYNTHETIC_CORPUS_ID,
  SYNTHETIC_SAMPLES,
} from '../tests/fixtures/ocr-benchmark/synthetic-corpus.mjs';
import {
  REQUIRED_COVERAGE,
  assertFontCoversCodePoints,
  buildFixtureHtml,
  buildSyntheticCorpus,
  createBenchmarkCorpusStore,
  findBrowserPath,
  fixtureGeometry,
  readFontCoverage,
  renderPlanFor,
  screenshotFixture,
  sha256Hex,
} from '../server/ocr/benchmark/index.mjs';

const appDir = fileURLToPath(new URL('..', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

async function ensureFont({ fontsDir, key, provenance, download }) {
  const path = join(fontsDir, provenance.file);
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch {
    if (!download) {
      throw new Error(
        `font for "${key}" is missing at ${provenance.file}; re-run with --download-fonts (licence: ${provenance.license})`,
      );
    }
    const response = await fetch(provenance.downloadUrl);
    if (!response.ok) {
      throw new Error(`font download failed for ${key}: HTTP ${response.status} ${provenance.downloadUrl}`);
    }
    bytes = Buffer.from(await response.arrayBuffer());
    writeFileSync(path, bytes);
  }
  const coverage = readFontCoverage(bytes);
  assertFontCoversCodePoints({
    coverage,
    codePoints: REQUIRED_COVERAGE[key],
    fontLabel: `${provenance.family} (${key})`,
  });
  const observed = sha256Hex(bytes);
  if (provenance.sha256 && provenance.sha256 !== observed) {
    throw new Error(
      `font for "${key}" does not match the hash recorded in the committed fixture: observed ${observed}, recorded ${provenance.sha256}`,
    );
  }
  return {
    key,
    path,
    bytes,
    base64: bytes.toString('base64'),
    provenance: {
      family: provenance.family,
      file: provenance.file,
      license: provenance.license,
      upstreamUrl: provenance.upstreamUrl,
      downloadUrl: provenance.downloadUrl,
      script: provenance.script,
      notes: provenance.notes,
      sha256: observed,
      byteLength: bytes.length,
      cmapFormats: coverage.formats,
      requiredCoverageChecked: REQUIRED_COVERAGE[key].length,
      recordedAt: new Date().toISOString(),
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const download = args.includes('--download-fonts');
  const checkFontsOnly = args.includes('--check-fonts-only');

  const paths = resolveDataPaths({ appRoot: appDir, environment: process.env });
  const store = createBenchmarkCorpusStore({
    dataRoot: paths.dataRoot,
    repositoryRoot,
  });
  mkdirSync(store.directories.fonts, { recursive: true });

  const fonts = {};
  for (const key of ['ur', 'ar', 'en']) {
    fonts[key] = await ensureFont({
      fontsDir: store.directories.fonts,
      key,
      provenance: FONT_PROVENANCE[key],
      download,
    });
    console.log(
      `font ${key}: ${fonts[key].provenance.family} sha256=${fonts[key].provenance.sha256.slice(0, 12)}… coverage=ok`,
    );
  }

  writeFileSync(
    join(store.directories.fonts, 'FONT_PROVENANCE.json'),
    `${JSON.stringify({ recordedAt: new Date().toISOString(), fonts: Object.fromEntries(Object.entries(fonts).map(([key, value]) => [key, value.provenance])) }, null, 2)}\n`,
    'utf8',
  );

  if (checkFontsOnly) {
    console.log('font coverage checks passed; nothing rendered (--check-fonts-only)');
    return;
  }

  const browserPath = findBrowserPath();
  if (!browserPath) {
    throw new Error(
      'no Chromium-family browser found for shaping-capable rendering; set READ_WATCH_BENCHMARK_BROWSER to a chrome/msedge/chromium executable',
    );
  }

  const renderAttempts = [];
  const htmlTempPaths = [];
  const imageTempPaths = [];
  const { manifest, rendered } = await buildSyntheticCorpus({
    corpusId: SYNTHETIC_CORPUS_ID,
    description: SYNTHETIC_CORPUS_DESCRIPTION,
    definitions: SYNTHETIC_SAMPLES,
    render: async (definition) => {
      const plan = renderPlanFor(definition);
      const geometry = fixtureGeometry(plan);
      const fontKeys = [...new Set(plan.map((line) => line.fontKey))];
      const fontStack = fontKeys.map((key) => ({ ...fonts[key] }));
      const html = buildFixtureHtml({ plan, geometry, fonts: fontStack });

      const htmlPath = join(store.directories.temp, `${definition.benchmarkItemId}.html`);
      const outPath = join(store.directories.temp, `${definition.benchmarkItemId}.png`);
      imageTempPaths.push(outPath);
      const profileDir = join(store.directories.temp, 'browser-profile');
      mkdirSync(profileDir, { recursive: true });
      writeFileSync(htmlPath, html, 'utf8');
      htmlTempPaths.push(htmlPath);
      rmSync(outPath, { force: true });

      const result = screenshotFixture({ htmlPath, outPath, browserPath, geometry, profileDir });
      renderAttempts.push({
        benchmarkItemId: definition.benchmarkItemId,
        browser: result.browserVersion,
        width: geometry.width,
        height: geometry.height,
        fonts: fontStack.map((font) => font.provenance.family),
      });
      return { bytes: result.bytes, extension: 'png' };
    },
  });

  const sampleById = new Map(manifest.samples.map((entry) => [entry.benchmarkItemId, entry]));
  for (const sample of rendered) {
    const definition = SYNTHETIC_SAMPLES.find((entry) => entry.benchmarkItemId === sample.benchmarkItemId);
    const stored = store.recordRenderedSample({
      sampleId: sample.benchmarkItemId,
      language: definition.language,
      bytes: sample.bytes,
      extension: sample.extension,
    });
    if (stored.hash !== sha256Hex(sample.bytes)) {
      throw new Error(`${sample.benchmarkItemId}: stored image hash does not match the rendered bytes`);
    }
    store.finalizeGroundTruth({
      sampleId: sample.benchmarkItemId,
      exactText: sampleById.get(sample.benchmarkItemId).groundTruth.exactText,
      reviewedBy: 'synthetic-authored-text',
    });
  }

  const manifestFile = store.writeManifest(manifest);

  const browserVersion = renderAttempts[0]?.browser ?? 'not-reported';
  writeFileSync(
    join(store.directories.reports, 'synthetic-render-provenance.json'),
    `${JSON.stringify(
      {
        corpusId: SYNTHETIC_CORPUS_ID,
        renderedAt: new Date().toISOString(),
        manifestHash: manifest.manifestHash,
        manifestRef: 'ocr/benchmark/manifests/synthetic-starter-v1.manifest.json',
        browser: { executable: browserPath.split(/[\\/]/).pop(), version: browserVersion },
        renderer: {
          mode: 'chromium-headless-screenshot',
          deviceScaleFactor: 2,
          offlineFlags: true,
          fontsEmbeddedAsDataUri: true,
        },
        fonts: Object.fromEntries(
          Object.entries(fonts).map(([key, value]) => [
            key,
            { family: value.provenance.family, sha256: value.provenance.sha256, byteLength: value.provenance.byteLength },
          ]),
        ),
        samples: renderAttempts,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  for (const path of htmlTempPaths) rmSync(path, { force: true });
  for (const path of imageTempPaths) rmSync(path, { force: true });
  rmSync(join(store.directories.temp, 'browser-profile'), { recursive: true, force: true });

  console.log(`samples: ${manifest.samples.length}`);
  console.log(`images: ${rendered.length} written under ${store.layout().directories.corpus}`);
  console.log(`manifest: ${manifestFile.path}`);
  console.log(`manifestHash: ${manifest.manifestHash}`);
  console.log(`browser: ${browserVersion}`);
}

main().catch((error) => {
  console.error(`benchmark fixture rendering failed: ${error.message}`);
  process.exitCode = 1;
});
