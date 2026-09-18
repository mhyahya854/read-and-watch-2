/**
 * Corrupt runtime SQLite disaster recovery.
 *
 * This is a focused helper for portable-recovery.mjs, not a second recovery
 * framework. It preserves the whole SQLite family, rebuilds a new runtime
 * database at a staging path from portable Markdown plus the existing file-first
 * recovery stores, validates it, and only then activates it.
 */
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { rebuildPortableLibrary, planPortableRebuild } from './portable-rebuild.mjs';
import { RUNTIME_SCHEMA_VERSION } from './runtime-schema.mjs';
import { toLongPath } from './portable-library.mjs';
import {
  projectLibraryStateToDatabase,
  readLibraryState,
  validateLibraryState,
} from './library-state.mjs';

const CORRUPT_BACKUP_KEEP = 5;
const STAGING_KEEP = 2;
const FAMILY_SUFFIXES = ['', '-wal', '-shm', '-journal'];
const EXPECTED_TABLES = [
  'items',
  'item_assets',
  'annotations',
  'canvases',
  'canvas_links',
  'canvas_assets',
  'knowledge_graphs',
  'knowledge_nodes',
  'knowledge_edges',
  'mermaid_documents',
  'notes',
  'search_index_records',
];

export const CORRUPT_RUNTIME_CODES = Object.freeze({
  BACKUP_FAILED: 'CORRUPT_RUNTIME_BACKUP_FAILED',
  BACKUP_VERIFIED: 'CORRUPT_RUNTIME_BACKUP_VERIFIED',
  STAGING_FAILED: 'CORRUPT_RUNTIME_STAGING_FAILED',
  USER_STATE_INCOMPLETE: 'CORRUPT_RUNTIME_USER_STATE_INCOMPLETE',
  INTEGRITY_FAILED: 'CORRUPT_RUNTIME_INTEGRITY_FAILED',
  ACTIVATION_FAILED: 'CORRUPT_RUNTIME_ACTIVATION_FAILED',
  LEGACY_LIBRARY_PRESENT: 'LEGACY_MANAGED_LIBRARY_PRESENT',
  RECOVERED: 'RECOVERED_CORRUPT_RUNTIME',
});

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function timestamp(now) {
  return now.replace(/[:.]/g, '-');
}

function removeFile(path) {
  try {
    rmSync(toLongPath(path), { force: true });
  } catch {
    // Best-effort cleanup of our own staging artifacts only.
  }
}

function writeJson(target, value) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(toLongPath(target), Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'));
}

function databaseFamily(databasePath) {
  return FAMILY_SUFFIXES
    .map((suffix) => `${databasePath}${suffix}`)
    .filter((path) => existsSync(toLongPath(path)));
}

function bestEffortSchema(databasePath) {
  try {
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const userVersion = Number(
        database.prepare('PRAGMA user_version').get()?.user_version ?? 0,
      );
      return { readable: true, userVersion };
    } finally {
      database.close();
    }
  } catch (error) {
    return {
      readable: false,
      error: `${error?.code ?? 'ERROR'}: ${error?.message ?? String(error)}`,
    };
  }
}

async function preserveFamily(root, databasePath, now, reason, hooks = {}) {
  const backupRoot = join(root, 'App', 'backups', 'corrupt-runtime', timestamp(now));
  const originalRoot = join(backupRoot, 'original');
  mkdirSync(backupRoot, { recursive: true });
  mkdirSync(originalRoot, { recursive: true });
  const family = databaseFamily(databasePath);
  if (family.length === 0) {
    throw Object.assign(new Error('No runtime database family files were found.'), {
      code: CORRUPT_RUNTIME_CODES.BACKUP_FAILED,
    });
  }
  const files = [];
  for (const source of family) {
    const name = basename(source);
    const backup = join(backupRoot, name);
    copyFileSync(toLongPath(source), toLongPath(backup));
    if (typeof hooks.beforeBackupVerify === 'function') {
      await hooks.beforeBackupVerify({ source, backup, name });
    }
    const sourceBuffer = readFileSync(toLongPath(source));
    const backupBuffer = readFileSync(toLongPath(backup));
    const sourceHash = sha256(sourceBuffer);
    const backupHash = sha256(backupBuffer);
    if (
      sourceBuffer.length !== backupBuffer.length ||
      sourceHash !== backupHash
    ) {
      throw Object.assign(
        new Error(`Corrupt runtime backup verification failed for ${name}.`),
        { code: CORRUPT_RUNTIME_CODES.BACKUP_FAILED },
      );
    }
    files.push({
      name,
      relativeLocation: relative(root, source).split('\\').join('/'),
      byteSize: sourceBuffer.length,
      sha256: sourceHash,
    });
  }
  writeJson(join(backupRoot, 'manifest.json'), {
    capturedAtUtc: now,
    reason,
    runtimeSchema: bestEffortSchema(databasePath),
    files,
  });
  return {
    backupRoot,
    originalRoot,
    files: files.map((file) => file.name),
    verified: true,
  };
}

function pruneCorruptBackups(root, keep = CORRUPT_BACKUP_KEEP) {
  const backupRoot = join(root, 'App', 'backups', 'corrupt-runtime');
  if (!existsSync(toLongPath(backupRoot))) return;
  const captures = readdirSync(toLongPath(backupRoot), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  while (captures.length > keep) {
    const oldest = captures.pop();
    try {
      rmSync(toLongPath(join(backupRoot, oldest)), { recursive: true, force: true });
    } catch {
      // Retention cleanup is best effort and never touches the newest capture.
    }
  }
}

function pruneStaging(databasePath, keep = STAGING_KEEP) {
  const directory = dirname(databasePath);
  const prefix = `${basename(databasePath)}.recovery-`;
  if (!existsSync(toLongPath(directory))) return;
  const staging = readdirSync(toLongPath(directory))
    .filter((name) => name.startsWith(prefix) && name.endsWith('.staging'))
    .sort()
    .reverse();
  while (staging.length > keep) {
    removeFile(join(directory, staging.pop()));
  }
}

function readJsonIfPresent(path) {
  if (!existsSync(toLongPath(path))) return { present: false, value: null };
  try {
    return { present: true, value: JSON.parse(readFileSync(toLongPath(path), 'utf8')) };
  } catch (error) {
    return { present: true, value: null, error: String(error?.message ?? error) };
  }
}

function auditLegacyManagedLibrary(root) {
  const catalogPath = join(root, 'App', 'library', 'catalog.json');
  const catalog = readJsonIfPresent(catalogPath);
  if (!catalog.present) return { present: false, itemCount: 0 };
  if (!catalog.value || !Array.isArray(catalog.value.items)) {
    return { present: true, itemCount: 0, malformed: true };
  }
  return { present: true, itemCount: catalog.value.items.length, malformed: false };
}

function validateJsonRecoveryFiles(root) {
  const diagnostics = [];
  const notesDir = join(root, 'App', 'user-data', 'items');
  const canvasesDir = join(root, 'App', 'user-data', 'canvases');
  const graphsDir = join(root, 'App', 'user-data', 'knowledge', 'graphs');
  const diagramsDir = join(root, 'App', 'user-data', 'knowledge', 'diagrams');

  const itemIds = existsSync(toLongPath(notesDir))
    ? readdirSync(toLongPath(notesDir), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];

  for (const itemId of itemIds) {
    const annotations = join(notesDir, itemId, 'annotations.json');
    if (!existsSync(toLongPath(annotations))) continue;
    const parsed = readJsonIfPresent(annotations);
    if (!parsed.value || !Array.isArray(parsed.value.annotations)) {
      diagnostics.push({
        code: 'MALFORMED_ANNOTATION_RECOVERY_FILE',
        relativePath: relative(root, annotations).split('\\').join('/'),
        message: parsed.error ?? 'annotations.json does not contain an annotations array.',
      });
    }
    const bookmarks = readJsonIfPresent(join(notesDir, itemId, 'bookmarks.json'));
    if (bookmarks.present && bookmarks.value !== null && !Array.isArray(bookmarks.value)) {
      diagnostics.push({
        code: 'MALFORMED_BOOKMARK_RECOVERY_FILE',
        relativePath: relative(root, join(notesDir, itemId, 'bookmarks.json')).split('\\').join('/'),
        message: 'bookmarks.json is not an array.',
      });
    }
    const readingState = readJsonIfPresent(join(notesDir, itemId, 'reading-state.json'));
    if (
      readingState.present &&
      readingState.value !== null &&
      (typeof readingState.value !== 'object' || Array.isArray(readingState.value))
    ) {
      diagnostics.push({
        code: 'MALFORMED_READING_STATE_RECOVERY_FILE',
        relativePath: relative(root, join(notesDir, itemId, 'reading-state.json')).split('\\').join('/'),
        message: 'reading-state.json is not an object.',
      });
    }
  }

  if (existsSync(toLongPath(canvasesDir))) {
    for (const entry of readdirSync(toLongPath(canvasesDir), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(canvasesDir, entry.name);
      const canvas = join(dir, 'canvas.json');
      const recovery = join(dir, 'recovery.json');
      const primary = readJsonIfPresent(canvas);
      const fallback = readJsonIfPresent(recovery);
      if (!primary.value && !fallback.value) {
        diagnostics.push({
          code: 'MALFORMED_CANVAS_RECOVERY_FILE',
          relativePath: relative(root, primary.error ? canvas : recovery).split('\\').join('/'),
          message: primary.error ?? fallback.error ?? 'No readable canvas document was found.',
        });
      }
    }
  }

  for (const [dir, code] of [
    [graphsDir, 'MALFORMED_KNOWLEDGE_GRAPH_RECOVERY_FILE'],
    [diagramsDir, 'MALFORMED_KNOWLEDGE_DIAGRAM_RECOVERY_FILE'],
  ]) {
    if (!existsSync(toLongPath(dir))) continue;
    for (const name of readdirSync(toLongPath(dir)).filter((entry) => entry.endsWith('.json'))) {
      const path = join(dir, name);
      const parsed = readJsonIfPresent(path);
      if (
        !parsed.value ||
        typeof parsed.value.id !== 'string' ||
        typeof parsed.value.title !== 'string'
      ) {
        diagnostics.push({
          code,
          relativePath: relative(root, path).split('\\').join('/'),
          message: parsed.error ?? 'Recovery file is missing a title.',
        });
      }
    }
  }
  return diagnostics;
}

async function reconstructNotes(root, stagingDatabasePath, userDataRoot) {
  const itemsDir = join(userDataRoot, 'items');
  if (!existsSync(toLongPath(itemsDir))) {
    return { notes: 0, thoughts: 0, skipped: 0 };
  }
  const { createLibraryStore } = await import('./library-store.mjs');
  const libraryStore = createLibraryStore({ databasePath: stagingDatabasePath });
  let notes = 0;
  let thoughts = 0;
  let skipped = 0;
  try {
    for (const entry of readdirSync(toLongPath(itemsDir), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const itemId = entry.name;
      if (!/^(read|watch)-[0-9a-f]{8,64}$/i.test(itemId)) continue;
      for (const [kind, counter] of [['notes', 'notes'], ['thoughts', 'thoughts']]) {
        const path = join(itemsDir, itemId, `${kind}.md`);
        if (!existsSync(toLongPath(path))) continue;
        let content;
        try {
          content = readFileSync(toLongPath(path), 'utf8');
        } catch {
          skipped += 1;
          continue;
        }
        if (!content.trim()) continue;
        try {
          libraryStore.saveNote(kind, itemId, content, null);
          if (counter === 'notes') notes += 1;
          else thoughts += 1;
        } catch {
          skipped += 1;
        }
      }
    }
  } finally {
    libraryStore.close();
  }
  return { notes, thoughts, skipped };
}

async function reconstructAnnotations(root, stagingDatabasePath, userDataRoot) {
  const { createAnnotationStore } = await import('./annotation-store.mjs');
  const store = createAnnotationStore({
    databasePath: stagingDatabasePath,
    userDataRoot,
  });
  const itemsDir = join(userDataRoot, 'items');
  let recovered = 0;
  const diagnostics = [];
  try {
    if (existsSync(toLongPath(itemsDir))) {
      for (const entry of readdirSync(toLongPath(itemsDir), { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const itemId = entry.name;
        if (!/^(read|watch)-[0-9a-f]{8,64}$/i.test(itemId)) continue;
        const path = join(itemsDir, itemId, 'annotations.json');
        if (!existsSync(toLongPath(path))) continue;
        const result = store.recoverFromExternalFile(itemId);
        if (!result.ok) {
          diagnostics.push({
            code: 'ANNOTATION_RECOVERY_FAILED',
            itemId,
            message: result.error ?? 'Annotation recovery failed.',
          });
        } else {
          recovered += result.recovered ?? 0;
        }
      }
    }
  } finally {
    store.close();
  }
  return { recovered, diagnostics };
}

async function reconstructCanvases(root, stagingDatabasePath, userDataRoot) {
  const { createCanvasStore } = await import('./canvas-store.mjs');
  const store = createCanvasStore({
    databasePath: stagingDatabasePath,
    userDataRoot,
  });
  const canvasesDir = join(userDataRoot, 'canvases');
  let recovered = 0;
  let assets = 0;
  const diagnostics = [];
  try {
    if (existsSync(toLongPath(canvasesDir))) {
      for (const entry of readdirSync(toLongPath(canvasesDir), { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        try {
          const result = store.recoverCanvasFromExternal(entry.name);
          if (result.ok) recovered += result.recovered ? 1 : 0;
          const assetResult = store.recoverCanvasAssetsFromExternal(entry.name);
          assets += assetResult.recovered ?? 0;
        } catch (error) {
          diagnostics.push({
            code: 'CANVAS_RECOVERY_FAILED',
            canvasId: entry.name,
            message: String(error?.message ?? error),
          });
        }
      }
    }
  } finally {
    store.close();
  }
  return { recovered, assets, diagnostics };
}

async function reconstructKnowledge(stagingDatabasePath, userDataRoot) {
  const graphsDir = join(userDataRoot, 'knowledge', 'graphs');
  const diagramsDir = join(userDataRoot, 'knowledge', 'diagrams');
  const expectedGraphs = existsSync(toLongPath(graphsDir))
    ? readdirSync(toLongPath(graphsDir)).filter((name) => name.endsWith('.json')).length
    : 0;
  const expectedDiagrams = existsSync(toLongPath(diagramsDir))
    ? readdirSync(toLongPath(diagramsDir)).filter((name) => name.endsWith('.json')).length
    : 0;
  const { createKnowledgeStore } = await import('./knowledge-store.mjs');
  const store = createKnowledgeStore({
    databasePath: stagingDatabasePath,
    userDataRoot,
  });
  try {
    const result = store.rebuildFromFiles();
    if (
      result.restoredGraphs !== expectedGraphs ||
      result.restoredDiagrams !== expectedDiagrams
    ) {
      return {
        ...result,
        ok: false,
        error: 'One or more knowledge recovery files were skipped.',
      };
    }
    return result;
  } finally {
    store.close();
  }
}

function salvageDbOnlyTables(corruptDatabasePath, stagingDatabasePath) {
  const result = {
    savedViewsRecovered: 0,
    relationshipsRecovered: 0,
    unresolvedRelationships: 0,
    unrecoverable: [],
  };
  let source = null;
  let target = null;
  try {
    source = new DatabaseSync(corruptDatabasePath, { readOnly: true });
  } catch {
    result.unrecoverable.push('saved_views', 'relationships');
    return result;
  }
  try {
    target = new DatabaseSync(stagingDatabasePath);
    try {
      const savedViews = source.prepare('SELECT * FROM saved_views').all();
      const insert = target.prepare(
        `INSERT OR IGNORE INTO saved_views
         (id,name,definition_json,revision,created_at_utc,updated_at_utc)
         VALUES (?,?,?,?,?,?)`,
      );
      for (const row of savedViews) {
        insert.run(
          row.id,
          row.name,
          row.definition_json,
          row.revision,
          row.created_at_utc,
          row.updated_at_utc,
        );
        result.savedViewsRecovered += 1;
      }
    } catch {
      result.unrecoverable.push('saved_views');
    }
    try {
      const relationships = source.prepare('SELECT * FROM relationships').all();
      const itemExists = target.prepare('SELECT 1 FROM items WHERE id=?');
      const insert = target.prepare(
        `INSERT OR IGNORE INTO relationships
         (id,source_item_id,target_item_id,target_external_json,relationship_type,direction,position,provenance_json,created_at_utc)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      );
      for (const row of relationships) {
        if (!itemExists.get(row.source_item_id) || (row.target_item_id && !itemExists.get(row.target_item_id))) {
          result.unresolvedRelationships += 1;
          continue;
        }
        insert.run(
          row.id,
          row.source_item_id,
          row.target_item_id,
          row.target_external_json,
          row.relationship_type,
          row.direction,
          row.position,
          row.provenance_json,
          row.created_at_utc,
        );
        result.relationshipsRecovered += 1;
      }
    } catch {
      result.unrecoverable.push('relationships');
    }
  } finally {
    try {
      source?.close();
    } catch {}
    try {
      target?.close();
    } catch {}
  }
  return result;
}

function integrityCheck(databasePath) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const safeAll = (sql) => {
      try {
        return database.prepare(sql).all();
      } catch {
        return null;
      }
    };
    const safeCount = (table) => {
      try {
        return database.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
      } catch {
        return -1;
      }
    };
    const safeValue = (sql) => {
      try {
        return database.prepare(sql).get().n;
      } catch {
        return -1;
      }
    };
    const quick = safeAll('PRAGMA quick_check');
    const full = safeAll('PRAGMA integrity_check');
    const foreignKeys = safeAll('PRAGMA foreign_key_check');
    const userVersion = Number(
      database.prepare('PRAGMA user_version').get()?.user_version ?? 0,
    );
    const tables = new Set(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((row) => row.name),
    );
    const missingTables = EXPECTED_TABLES.filter((name) => !tables.has(name));
    const counts = {
      items: safeCount('items'),
      uniqueIds: safeValue('SELECT count(DISTINCT id) AS n FROM items'),
      uniquePaths: safeValue('SELECT count(DISTINCT item_path) AS n FROM items'),
      assets: safeCount('item_assets'),
      annotations: safeCount('annotations'),
      canvases: safeCount('canvases'),
      knowledgeGraphs: safeCount('knowledge_graphs'),
      mermaidDocuments: safeCount('mermaid_documents'),
      notes: safeCount('notes'),
      savedViews: safeCount('saved_views'),
      relationships: safeCount('relationships'),
    };
    return {
      ok:
        Boolean(quick) &&
        Boolean(full) &&
        Boolean(foreignKeys) &&
        quick.every((row) => String(Object.values(row)[0]).toLowerCase() === 'ok') &&
        full.every((row) => String(Object.values(row)[0]).toLowerCase() === 'ok') &&
        foreignKeys.length === 0 &&
        userVersion === RUNTIME_SCHEMA_VERSION &&
        missingTables.length === 0 &&
        Object.values(counts).every((value) => value >= 0),
      userVersion,
      missingTables,
      foreignKeyViolations: foreignKeys.length,
      counts,
    };
  } finally {
    database.close();
  }
}

async function rebuildSearch(stagingDatabasePath, userDataRoot) {
  const { createSearchStore } = await import('./search-store.mjs');
  const database = new DatabaseSync(stagingDatabasePath);
  try {
    const searchStore = createSearchStore({
      databasePath: stagingDatabasePath,
      userDataRoot,
      libraryDatabase: database,
    });
    const result = searchStore.rebuildIndex();
    return { ok: true, result };
  } finally {
    database.close();
  }
}

async function smokeStaged(root, stagingDatabasePath, userDataRoot) {
  const { createLibraryStore } = await import('./library-store.mjs');
  const { createReaderStore } = await import('./reader-store.mjs');
  const libraryStore = createLibraryStore({
    databasePath: stagingDatabasePath,
    readOnly: true,
  });
  try {
    const catalog = libraryStore.getUiCatalog();
    const readItem = catalog.items.find((item) => item.collection === 'read');
    const watchItem = catalog.items.find((item) => item.collection === 'watch');
    if (catalog.items.length > 0 && !readItem && !watchItem) return false;
    if (readItem) {
      const reader = createReaderStore({
        libraryRoot: join(root, 'App', 'library'),
        portableRoot: root,
        libraryDatabasePath: stagingDatabasePath,
        userDataRoot,
      });
      const status = reader.getStatus(readItem.id);
      if (!['available', 'multiple', 'missing', 'unsupported', 'no-readable-file'].includes(status.state)) {
        return false;
      }
    }
    return true;
  } finally {
    libraryStore.close();
  }
}

function activateStagedRuntime({ databasePath, stagingPath, backup }) {
  const family = databaseFamily(databasePath);
  const moved = [];
  try {
    for (const original of family) {
      const target = join(backup.originalRoot, basename(original));
      renameSync(toLongPath(original), toLongPath(target));
      moved.push({ original, target });
    }
    renameSync(toLongPath(stagingPath), toLongPath(databasePath));
  } catch (error) {
    for (const item of moved.reverse()) {
      try {
        renameSync(toLongPath(item.target), toLongPath(item.original));
      } catch {
        // The verified backup remains available even if compensation fails.
      }
    }
    throw Object.assign(
      new Error(`Runtime database activation failed: ${error?.message ?? error}`),
      { code: CORRUPT_RUNTIME_CODES.ACTIVATION_FAILED },
    );
  }
  for (const suffix of FAMILY_SUFFIXES.slice(1)) {
    removeFile(`${stagingPath}${suffix}`);
  }
  try {
    rmSync(toLongPath(backup.originalRoot), { recursive: true, force: true });
  } catch {
    // Keeping the duplicate original copy is harmless.
  }
}

/**
 * Recover a genuinely unusable runtime database. Returns `ok: false` with a
 * precise code when anything cannot be proven safe.
 */
export async function recoverCorruptRuntime({
  root,
  databasePath,
  userDataRoot,
  now = new Date().toISOString(),
  hooks = {},
} = {}) {
  const metrics = {
    backupVerified: false,
    stagingBuilt: false,
    userStateRecovered: false,
    searchRebuilt: false,
    integrityPassed: false,
    activated: false,
  };
  const diagnostics = [];

  let backup;
  try {
    backup = await preserveFamily(root, databasePath, now, 'RUNTIME_DB_UNUSABLE', hooks);
  } catch (error) {
    return {
      ok: false,
      code: CORRUPT_RUNTIME_CODES.BACKUP_FAILED,
      diagnostics: [{ code: CORRUPT_RUNTIME_CODES.BACKUP_FAILED, message: String(error?.message ?? error) }],
      metrics,
    };
  }
  metrics.backupVerified = backup.verified;

  const legacy = auditLegacyManagedLibrary(root);
  if (legacy.itemCount > 0) {
    return {
      ok: false,
      code: CORRUPT_RUNTIME_CODES.LEGACY_LIBRARY_PRESENT,
      diagnostics: [{
        code: CORRUPT_RUNTIME_CODES.LEGACY_LIBRARY_PRESENT,
        message: `A legacy managed library with ${legacy.itemCount} item(s) is present and cannot be rebuilt safely by this path.`,
      }],
      backup,
      metrics,
    };
  }

  const fileDiagnostics = validateJsonRecoveryFiles(root);
  if (fileDiagnostics.length > 0) {
    return {
      ok: false,
      code: CORRUPT_RUNTIME_CODES.USER_STATE_INCOMPLETE,
      diagnostics: fileDiagnostics,
      backup,
      metrics,
    };
  }

  const plan = await planPortableRebuild(root);
  if (!plan.ok || plan.partial) {
    return {
      ok: false,
      code: CORRUPT_RUNTIME_CODES.STAGING_FAILED,
      diagnostics: [{
        code: 'PORTABLE_REBUILD_CONFLICT',
        message: 'The portable library is not safe to rebuild automatically.',
        skipped: plan.skipped?.length ?? 0,
        duplicates: plan.duplicateIds?.length ?? 0,
      }],
      backup,
      metrics,
    };
  }

  pruneStaging(databasePath);
  const stagingPath = join(
    dirname(databasePath),
    `${basename(databasePath)}.recovery-${timestamp(now)}.staging`,
  );
  removeFile(stagingPath);
  let database = null;
  const counts = {};
  try {
    database = new DatabaseSync(stagingPath);
    const rebuilt = await rebuildPortableLibrary({
      root,
      database,
      searchStore: null,
      apply: true,
      now,
    });
    if (!rebuilt.ok || rebuilt.status === 'partial') {
      throw Object.assign(
        new Error('Portable library reconstruction failed.'),
        { code: CORRUPT_RUNTIME_CODES.STAGING_FAILED },
      );
    }
    counts.portableItemsRecovered = rebuilt.counts?.total ?? 0;
    counts.portableReadRecovered = rebuilt.counts?.read ?? 0;
    counts.portableWatchRecovered = rebuilt.counts?.watch ?? 0;
  } catch (error) {
    try {
      database?.close();
    } catch {}
    return {
      ok: false,
      code: error?.code ?? CORRUPT_RUNTIME_CODES.STAGING_FAILED,
      diagnostics: [{ code: error?.code ?? CORRUPT_RUNTIME_CODES.STAGING_FAILED, message: String(error?.message ?? error) }],
      backup,
      metrics,
    };
  } finally {
    try {
      database?.close();
    } catch {}
  }
  metrics.stagingBuilt = true;

  const notes = await reconstructNotes(root, stagingPath, userDataRoot);
  counts.notesRecoveredOrFileBacked = notes.notes + notes.thoughts;
  const annotations = await reconstructAnnotations(root, stagingPath, userDataRoot);
  counts.annotationsRecovered = annotations.recovered;
  diagnostics.push(...annotations.diagnostics);
  const canvases = await reconstructCanvases(root, stagingPath, userDataRoot);
  counts.canvasesRecovered = canvases.recovered;
  counts.canvasAssetsRecovered = canvases.assets;
  diagnostics.push(...canvases.diagnostics);
  const knowledge = await reconstructKnowledge(stagingPath, userDataRoot);
  if (knowledge.ok === false) {
    return {
      ok: false,
      code: CORRUPT_RUNTIME_CODES.USER_STATE_INCOMPLETE,
      diagnostics: [{
        code: 'KNOWLEDGE_RECOVERY_FAILED',
        message: knowledge.error ?? 'Knowledge recovery files were skipped.',
      }],
      backup,
      metrics,
    };
  }
  counts.knowledgeGraphsRecovered = knowledge.restoredGraphs;
  counts.mermaidDocumentsRecovered = knowledge.restoredDiagrams;
  const libraryStateFile = readLibraryState(userDataRoot);
  if (libraryStateFile.present && !libraryStateFile.ok) {
    return {
      ok: false,
      code: CORRUPT_RUNTIME_CODES.USER_STATE_INCOMPLETE,
      diagnostics: libraryStateFile.diagnostics,
      backup,
      metrics,
    };
  }
  let dbOnly = {
    savedViewsRecovered: 0,
    relationshipsRecovered: 0,
    unresolvedRelationships: 0,
    unrecoverable: [],
  };
  if (libraryStateFile.present) {
    const staging = new DatabaseSync(stagingPath);
    try {
      const validation = validateLibraryState(libraryStateFile.state, {
        itemExists: (itemId) =>
          Boolean(staging.prepare('SELECT 1 FROM items WHERE id=?').get(itemId)),
      });
      if (!validation.ok) {
        return {
          ok: false,
          code: CORRUPT_RUNTIME_CODES.USER_STATE_INCOMPLETE,
          diagnostics: validation.diagnostics,
          backup,
          metrics,
        };
      }
      const projected = projectLibraryStateToDatabase(staging, libraryStateFile.state);
      counts.savedViewsRecovered = projected.savedViews.length;
      counts.relationshipsRecovered = projected.relationships.length;
      counts.unresolvedRelationships = 0;
    } finally {
      staging.close();
    }
  } else {
    dbOnly = salvageDbOnlyTables(databasePath, stagingPath);
    counts.savedViewsRecovered = dbOnly.savedViewsRecovered;
    counts.relationshipsRecovered = dbOnly.relationshipsRecovered;
    counts.unresolvedRelationships = dbOnly.unresolvedRelationships;
  }
  metrics.userStateRecovered = true;

  if (diagnostics.some((entry) =>
    entry.code === 'ANNOTATION_RECOVERY_FAILED' ||
    entry.code === 'CANVAS_RECOVERY_FAILED'
  )) {
    return {
      ok: false,
      code: CORRUPT_RUNTIME_CODES.USER_STATE_INCOMPLETE,
      diagnostics,
      backup,
      metrics,
    };
  }

  let search;
  try {
    if (typeof hooks.beforeSearchRebuild === 'function') {
      await hooks.beforeSearchRebuild({ stagingPath, userDataRoot });
    }
    search = await rebuildSearch(stagingPath, userDataRoot);
    metrics.searchRebuilt = search.ok;
  } catch (error) {
    return {
      ok: false,
      code: CORRUPT_RUNTIME_CODES.STAGING_FAILED,
      diagnostics: [{ code: 'SEARCH_REBUILD_FAILED', message: String(error?.message ?? error) }],
      backup,
      metrics,
    };
  }

  if (typeof hooks.beforeIntegrityCheck === 'function') {
    await hooks.beforeIntegrityCheck({ stagingPath });
  }
  const integrity = integrityCheck(stagingPath);
  metrics.integrityPassed = integrity.ok;
  if (!integrity.ok) {
    return {
      ok: false,
      code: CORRUPT_RUNTIME_CODES.INTEGRITY_FAILED,
      diagnostics: [{
        code: CORRUPT_RUNTIME_CODES.INTEGRITY_FAILED,
        message: 'The staged runtime database failed integrity validation.',
        userVersion: integrity.userVersion,
        missingTables: integrity.missingTables,
        foreignKeyViolations: integrity.foreignKeyViolations,
      }],
      backup,
      metrics,
      integrity,
    };
  }
  Object.assign(counts, integrity.counts);

  if (!(await smokeStaged(root, stagingPath, userDataRoot))) {
    return {
      ok: false,
      code: CORRUPT_RUNTIME_CODES.STAGING_FAILED,
      diagnostics: [{ code: 'APPLICATION_SMOKE_FAILED', message: 'The staged runtime failed the application smoke test.' }],
      backup,
      metrics,
    };
  }

  try {
    if (typeof hooks.beforeActivation === 'function') {
      await hooks.beforeActivation({ stagingPath, databasePath, backup });
    }
    activateStagedRuntime({ databasePath, stagingPath, backup });
  } catch (error) {
    return {
      ok: false,
      code: CORRUPT_RUNTIME_CODES.ACTIVATION_FAILED,
      diagnostics: [{ code: CORRUPT_RUNTIME_CODES.ACTIVATION_FAILED, message: String(error?.message ?? error) }],
      backup,
      metrics,
      stagingPath,
    };
  }
  metrics.activated = true;
  pruneCorruptBackups(root);
  const post = integrityCheck(databasePath);
  if (!post.ok) {
    return {
      ok: false,
      code: CORRUPT_RUNTIME_CODES.INTEGRITY_FAILED,
      diagnostics: [{ code: 'POST_ACTIVATION_INTEGRITY_FAILED', message: 'The activated runtime database failed verification.' }],
      backup,
      metrics,
    };
  }

  const limitations = [];
  if (dbOnly.unrecoverable.length > 0) {
    limitations.push(
      ...dbOnly.unrecoverable.map(
        (name) => `${String(name)}_not_recoverable_from_corrupt_database`,
      ),
    );
  }
  if (dbOnly.unresolvedRelationships > 0) {
    limitations.push('unresolved_relationships_reference_missing_items');
  }
  return {
    ok: true,
    code: CORRUPT_RUNTIME_CODES.RECOVERED,
    counts: { ...counts, ...post.counts },
    diagnostics,
    limitations,
    partial: limitations.length > 0,
    backup: { verified: true, files: backup.files.length },
    metrics,
  };
}
