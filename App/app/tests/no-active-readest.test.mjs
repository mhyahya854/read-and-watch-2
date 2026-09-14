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

test('Production application code contains zero child_process spawn calls', () => {
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
      content.includes('child_process'),
      false,
      `File ${file} must not import child_process after Readest retirement`
    );
    assert.equal(
      /\bspawn\s*\(/.test(content),
      false,
      `File ${file} must not invoke spawn() after Readest retirement`
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
