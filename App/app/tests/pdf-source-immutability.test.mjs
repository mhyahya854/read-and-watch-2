import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  PdfAdapter,
  serializeDocumentLocation,
  deserializeDocumentLocation,
} from '../lib/document/index.ts';
import { resolveDataPaths } from '../server/data-paths.mjs';

async function findPdfsRecursively(dir) {
  const results = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = await findPdfsRecursively(full);
        results.push(...sub);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        results.push(full);
      }
    }
  } catch {
    // Directory may not exist in all test environments
  }
  return results;
}

async function computeSha256(filePath) {
  const bytes = await readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

test('Source Immutability Gate: Real local PDFs remain 100% byte-identical after engine operations', async () => {
  const appRoot = resolve(process.cwd());
  const { dataRoot } = resolveDataPaths({ appRoot });
  const bookDir = join(dataRoot, 'Read', 'Book');

  let pdfPaths = await findPdfsRecursively(bookDir);
  const isFallback = pdfPaths.length === 0;
  if (isFallback) {
    const fixtureDir = resolve(appRoot, 'tests', 'fixtures', 'pdf');
    pdfPaths = await findPdfsRecursively(fixtureDir);
  }

  assert.ok(
    pdfPaths.length >= (isFallback ? 1 : 10),
    `Expected at least ${isFallback ? 1 : 10} PDF files in ${isFallback ? 'test fixtures' : 'local data directory'}, found ${pdfPaths.length}`
  );

  // Select a sample of representative PDFs to verify
  const samplePdfPaths = pdfPaths.slice(0, 15);

  // 1. Hash all selected PDFs BEFORE adapter operations
  const preHashes = new Map();
  const preStats = new Map();
  for (const filePath of samplePdfPaths) {
    const hash = await computeSha256(filePath);
    const st = await stat(filePath);
    preHashes.set(filePath, hash);
    preStats.set(filePath, { size: st.size, mtimeMs: st.mtimeMs });
  }

  // 2. Find target PDF with bookmarks: local cookbook PDF
  const targetPdfPath =
    samplePdfPaths.find((p) => p.toLowerCase().includes('cookbook')) || samplePdfPaths[0];

  const fileBytes = await readFile(targetPdfPath);
  const realHash = preHashes.get(targetPdfPath);

  const realSource = {
    itemId: 'read-real-pdf-test-target',
    formatId: 'read-media-target',
    format: 'pdf',
    sourceHash: realHash,
    byteSize: fileBytes.length,
    title: 'Cookbook.pdf',
  };

  // Perform full lifecycle of reader operations
  const adapter = new PdfAdapter({ initialData: new Uint8Array(fileBytes) });
  await adapter.open(realSource);

  // Verify metadata extraction
  const metadata = await adapter.getMetadata();
  assert.equal(metadata.format, 'pdf');
  assert.ok(metadata.pageCount > 0);

  // Verify TOC outline extraction
  const toc = await adapter.getTOC();
  assert.ok(Array.isArray(toc));
  if (toc.length > 0) {
    // Navigate via TOC entry
    await adapter.goTo(toc[0].targetLocation);
    const loc = await adapter.getCurrentLocation();
    assert.equal(loc.sourceHash, realHash);
  }

  // Navigate multiple pages
  await adapter.nextPage();
  await adapter.nextPage();
  await adapter.prevPage();

  // Test search
  const searchHits = await adapter.search('recipe', { maxResults: 5 });
  assert.ok(Array.isArray(searchHits));

  // Test selection and anchor creation
  const selection = await adapter.getSelection();
  if (selection) {
    const anchor = await adapter.createTextAnchor(selection);
    assert.equal(anchor.sourceHash, realHash);
    const resolved = await adapter.resolveTextAnchor(anchor);
    assert.equal(resolved.status, 'exact');
  }

  // Test position serialization & deserialization
  const currentLoc = await adapter.getCurrentLocation();
  const serialized = serializeDocumentLocation(currentLoc);
  const deserialized = deserializeDocumentLocation(serialized, realHash);
  assert.equal(deserialized.sourceHash, realHash);

  await adapter.close();
  assert.equal(adapter.lifecycleState, 'closed');

  // 3. Hash all PDFs AFTER adapter operations and assert strict 100% byte-identity
  for (const filePath of samplePdfPaths) {
    const postHash = await computeSha256(filePath);
    const postStat = await stat(filePath);
    const preHash = preHashes.get(filePath);
    const preSt = preStats.get(filePath);

    assert.equal(
      postHash,
      preHash,
      `DATA SAFETY VIOLATION: Source PDF was modified! File: "${filePath}"`
    );
    assert.equal(
      postStat.size,
      preSt.size,
      `DATA SAFETY VIOLATION: File size changed for "${filePath}"`
    );
    assert.equal(
      postStat.mtimeMs,
      preSt.mtimeMs,
      `DATA SAFETY VIOLATION: Modification timestamp changed for "${filePath}"`
    );
  }
});

test('No-OCR Enforcement: Architecture strictly forbids OCR dependencies and OCR execution', async () => {
  // 1. Verify package.json contains zero OCR libraries
  const packageJsonPath = resolve(process.cwd(), 'package.json');
  const pkg = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  const forbiddenOcrPackages = [
    'tesseract.js',
    'tesseract',
    'paddleocr',
    'ocrmypdf',
    'easyocr',
    'pdf-parse',
    'tesseract-ocr',
    '@tesseract.js/worker',
  ];

  for (const forbidden of forbiddenOcrPackages) {
    assert.equal(
      allDeps[forbidden],
      undefined,
      `Forbidden OCR dependency "${forbidden}" detected in package.json!`
    );
  }

  // 2. Verify PdfAdapter does not import or invoke OCR
  const adapterSourcePath = resolve(process.cwd(), 'lib/document/pdf-adapter.ts');
  const adapterSource = await readFile(adapterSourcePath, 'utf-8');

  assert.equal(
    adapterSource.includes('tesseract'),
    false,
    'PdfAdapter must not reference tesseract'
  );
  assert.equal(
    adapterSource.includes('paddleocr'),
    false,
    'PdfAdapter must not reference paddleocr'
  );
  assert.equal(
    adapterSource.includes('ocrMyPdf'),
    false,
    'PdfAdapter must not reference ocrMyPdf'
  );
});

test('No Source-Write Path: Document adapters operate strictly with read-only data access', async () => {
  const adapterSourcePath = resolve(process.cwd(), 'lib/document/pdf-adapter.ts');
  const adapterSource = await readFile(adapterSourcePath, 'utf-8');

  // Verify no write file APIs exist in adapter
  const forbiddenWriteApis = [
    'writeFile',
    'writeFileSync',
    'createWriteStream',
    'appendFile',
    'appendFileSync',
    'truncate',
    'unlink',
  ];

  for (const api of forbiddenWriteApis) {
    assert.equal(
      adapterSource.includes(api),
      false,
      `Forbidden write operation "${api}" detected in PdfAdapter source!`
    );
  }
});
