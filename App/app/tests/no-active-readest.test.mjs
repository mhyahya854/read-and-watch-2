import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = resolve(appDir, '..');

function scanSourceFiles(dir, fileList = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.vinext') {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanSourceFiles(full, fileList);
    } else if (['.ts', '.tsx', '.js', '.mjs', '.cjs'].includes(extname(entry.name))) {
      fileList.push(full);
    }
  }
  return fileList;
}

/**
 * Phase 17 re-scope (see DECISIONS.md, 2026-09-17).
 *
 * The original assertion was "zero child_process anywhere in production code".
 * That guarantee existed to prove the retired Readest reader binary was no
 * longer shelled out to. It is now narrower but still enforced: the ONLY
 * production module allowed to touch child_process is the supervised OCR
 * runtime boundary under server/ocr/, which Phase 17 explicitly authorises.
 * Everything else — UI, document adapters, stores, routes — must stay free of
 * process spawning.
 */
test('Production application code spawns processes only inside the OCR runtime boundary', () => {
  const prodDirs = [
    join(appDir, 'server'),
    join(appDir, 'components'),
    join(appDir, 'lib'),
    join(appDir, 'app'),
  ];
  const prodFiles = prodDirs.flatMap((dir) => scanSourceFiles(dir));
  const ocrBoundary = join(appDir, 'server', 'ocr');
  const offenders = [];

  for (const file of prodFiles) {
    if (file.startsWith(ocrBoundary)) continue;
    const content = readFileSync(file, 'utf8');
    if (content.includes('child_process') || /\bspawn\s*\(/.test(content)) {
      offenders.push(file);
    }
  }

  assert.deepEqual(offenders, [], 'only server/ocr/ may spawn the managed OCR runtime');
});

test('The OCR runtime boundary never spawns a legacy reader or a shell', () => {
  const ocrFiles = scanSourceFiles(join(appDir, 'server', 'ocr'));
  assert.ok(ocrFiles.length > 0, 'the OCR runtime boundary must exist');
  for (const file of ocrFiles) {
    const content = readFileSync(file, 'utf8');
    assert.equal(content.includes('readest'), false, `${file} must not reference the retired Readest reader`);
    assert.equal(
      /spawn\s*\([^)]*shell\s*:\s*true/.test(content),
      false,
      `${file} must never spawn through a shell (no command injection surface)`,
    );
  }
});

test('Production application code contains zero imports from forks/readest', () => {
  const prodDirs = [
    join(appDir, 'server'),
    join(appDir, 'components'),
    join(appDir, 'lib'),
    join(appDir, 'app'),
  ];
  const prodFiles = prodDirs.flatMap((dir) => scanSourceFiles(dir));

  for (const file of prodFiles) {
    const content = readFileSync(file, 'utf8');
    assert.equal(
      content.includes('forks/readest'),
      false,
      `File ${file} must not reference forks/readest`
    );
  }
});

test('Legacy desktop reader binary path is retired to null in default data paths', async () => {
  const { resolveDataPaths } = await import('../server/data-paths.mjs');
  const paths = resolveDataPaths({ appRoot: appDir, environment: {} });
  assert.equal(paths.readerExecutable, null);
});
