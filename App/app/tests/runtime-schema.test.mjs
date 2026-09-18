/**
 * Synthetic schema tests only — no real library data or paths.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  RUNTIME_SCHEMA_TEMPLATES,
  RUNTIME_SCHEMA_VERSION,
  applyRuntimeSchema,
} from '../server/runtime-schema.mjs';

test('embedded runtime schema templates match the canonical migrations', () => {
  const migrations = resolve(import.meta.dirname, '..', '..', 'import', 'migrations');
  const initial = readFileSync(join(migrations, '001_initial.sql'), 'utf8')
    .replaceAll('\r\n', '\n');
  const relax = readFileSync(join(migrations, '002_relax_item_identity.sql'), 'utf8')
    .replaceAll('\r\n', '\n');
  assert.equal(RUNTIME_SCHEMA_TEMPLATES.initial, initial);
  assert.equal(RUNTIME_SCHEMA_TEMPLATES.relaxItemIdentity, relax);
  assert.equal(RUNTIME_SCHEMA_VERSION, 2);
});

test('a fresh runtime schema accepts portable 16-hex identities', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'rw-runtime-schema-'));
  const database = new DatabaseSync(join(root, 'fresh.sqlite3'));
  t.after(() => {
    database.close();
    return rm(root, { recursive: true, force: true });
  });

  const result = applyRuntimeSchema(database);
  assert.deepEqual(result, { schemaVersion: 2, created: true });
  database
    .prepare(
      "INSERT INTO items(id,collection,source_order,item_path,title,provenance_kind,created_at_utc,updated_at_utc) VALUES('read-0123456789abcdef','read',0,'Read/Books/A','A','manual','t','t')",
    )
    .run();
  database.prepare("INSERT INTO read_items(item_id) VALUES('read-0123456789abcdef')").run();
  assert.equal(database.prepare('SELECT count(*) AS n FROM items').get().n, 1);
  assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
});

test('an existing strict Phase 02 database is migrated without losing child rows', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'rw-runtime-schema-mig-'));
  const path = join(root, 'strict.sqlite3');
  const initial = readFileSync(
    resolve(import.meta.dirname, '..', '..', 'import', 'migrations', '001_initial.sql'),
    'utf8',
  );
  const seed = new DatabaseSync(path);
  seed.exec(initial.replace('__CHECKSUM__', 'a'.repeat(64)));
  seed
    .prepare(
      "INSERT INTO items(id,collection,source_order,item_path,title,provenance_kind,created_at_utc,updated_at_utc) VALUES('read-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','read',0,'Read/A','Legacy','manual','t','t')",
    )
    .run();
  seed.prepare("INSERT INTO read_items(item_id) VALUES('read-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')").run();
  seed.close();

  const database = new DatabaseSync(path);
  t.after(() => {
    database.close();
    return rm(root, { recursive: true, force: true });
  });
  const result = applyRuntimeSchema(database);
  assert.equal(result.schemaVersion, 2);
  assert.equal(database.prepare('SELECT count(*) AS n FROM items').get().n, 1);
  assert.equal(database.prepare('SELECT count(*) AS n FROM read_items').get().n, 1);
  database
    .prepare(
      "INSERT INTO items(id,collection,source_order,item_path,title,provenance_kind,created_at_utc,updated_at_utc) VALUES('watch-0123456789abcdef','watch',1,'Watch/A','Portable','manual','t','t')",
    )
    .run();
  database.prepare("INSERT INTO watch_items(item_id) VALUES('watch-0123456789abcdef')").run();
  assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
});
