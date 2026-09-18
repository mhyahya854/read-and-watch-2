#!/usr/bin/env node
/**
 * Rebuild runtime SQLite from the selected portable library.
 *
 *   node scripts/rebuild-portable-library.mjs --root "<library root>" [--apply] [--rebuild-search]
 *
 * Dry run is the default. Private reports stay under
 * `<root>/App/migration/portable-rebuild/<timestamp>/` and are never committed.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { argv, exit } from 'node:process';

import { createSearchStore } from '../server/search-store.mjs';
import { rebuildPortableLibrary } from '../server/portable-rebuild.mjs';

function argument(name, fallback = null) {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
}

const root = resolve(argument('root', '') || '');
const apply = argv.includes('--apply');
const rebuildSearch = argv.includes('--rebuild-search');
if (!root) {
  console.error('usage: rebuild-portable-library.mjs --root <library root> [--apply] [--rebuild-search]');
  exit(2);
}

const databasePath = resolve(
  argument('database', '') || join(root, 'App', 'state', 'read-watch.sqlite3'),
);
const userDataRoot = join(root, 'App', 'user-data');

let database = null;
let searchStore = null;
if (apply) {
  await mkdir(dirname(databasePath), { recursive: true });
  database = new DatabaseSync(databasePath);
  if (rebuildSearch) {
    searchStore = createSearchStore({
      databasePath,
      userDataRoot,
      libraryDatabase: database,
    });
  }
}

try {
  const result = await rebuildPortableLibrary({
    root,
    database,
    databasePath,
    searchStore,
    apply,
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportRoot = join(root, 'App', 'migration', 'portable-rebuild', stamp);
  await mkdir(reportRoot, { recursive: true });
  await writeFile(
    join(reportRoot, 'REBUILD_REPORT.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8',
  );

  const summary = {
    status: result.status,
    counts: result.counts,
    changed: result.changed ?? 0,
    skipped: result.skipped?.length ?? 0,
    diagnostics: (result.diagnostics ?? []).map(({ code, severity }) => ({
      code,
      severity,
    })),
    duplicateIds: result.duplicateIds?.length ?? 0,
    searchStatus: result.search?.status ?? null,
    reportRoot,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!result.ok) exit(1);
} finally {
  searchStore?.close();
  database?.close();
}
