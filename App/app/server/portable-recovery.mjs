/**
 * Portable startup recovery and reconciliation.
 *
 * This coordinator is intentionally a thin policy layer over the existing
 * portable scanner, parser, rebuild and write-back contracts. It never
 * introduces a second scanner, parser, database model or journal format.
 *
 * The healthy path performs no portable-root scan and no rebuild. Deeper work
 * runs only when the runtime database or the write-back journal shows evidence
 * that recovery is needed.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { assertContained, statSafe, toLongPath } from './portable-library.mjs';
import { parseTitleMarkdown, readIdentity } from './portable-metadata.mjs';
import { planPortableRebuild, rebuildPortableLibrary } from './portable-rebuild.mjs';
import { createSearchStore } from './search-store.mjs';
import { RUNTIME_SCHEMA_VERSION, applyRuntimeSchema } from './runtime-schema.mjs';
import {
  CORRUPT_RUNTIME_CODES,
  recoverCorruptRuntime,
} from './corrupt-runtime-recovery.mjs';

export const PORTABLE_RECOVERY_STATUS = Object.freeze({
  HEALTHY: 'HEALTHY',
  RECOVERED: 'RECOVERED',
  RECOVERY_REQUIRED: 'RECOVERY_REQUIRED',
});

export const PORTABLE_RECOVERY_CODES = Object.freeze({
  HEALTHY: 'HEALTHY',
  RUNTIME_DB_MISSING: 'RUNTIME_DB_MISSING',
  RUNTIME_SCHEMA_MISSING: 'RUNTIME_SCHEMA_MISSING',
  RUNTIME_LIBRARY_EMPTY: 'RUNTIME_LIBRARY_EMPTY',
  RUNTIME_DB_UNUSABLE: 'RUNTIME_DB_UNUSABLE',
  RUNTIME_SCHEMA_UNSUPPORTED: 'RUNTIME_SCHEMA_UNSUPPORTED',
  RECOVERED_RUNTIME_REBUILT: 'RECOVERED_RUNTIME_REBUILT',
  RECOVERED_RUNTIME_SCHEMA_MIGRATED: 'RECOVERED_RUNTIME_SCHEMA_MIGRATED',
  RECOVERED_STALE_PREPARED_JOURNAL: 'RECOVERED_STALE_PREPARED_JOURNAL',
  RECOVERED_WRITEBACK_RECONCILED: 'RECOVERED_WRITEBACK_RECONCILED',
  RECOVERED_DIVERGENCE_RECONCILED: 'RECOVERED_DIVERGENCE_RECONCILED',
  PORTABLE_ROOT_UNAVAILABLE: 'PORTABLE_ROOT_UNAVAILABLE',
  PORTABLE_REBUILD_CONFLICT: 'PORTABLE_REBUILD_CONFLICT',
  MALFORMED_RECOVERY_JOURNAL: 'MALFORMED_RECOVERY_JOURNAL',
  DIVERGENCE_REQUIRES_REVIEW: 'DIVERGENCE_REQUIRES_REVIEW',
  RECOVERY_EVIDENCE_ARCHIVE_FAILED: 'RECOVERY_EVIDENCE_ARCHIVE_FAILED',
  CORRUPT_RUNTIME_BACKUP_FAILED: CORRUPT_RUNTIME_CODES.BACKUP_FAILED,
  CORRUPT_RUNTIME_BACKUP_VERIFIED: CORRUPT_RUNTIME_CODES.BACKUP_VERIFIED,
  CORRUPT_RUNTIME_STAGING_FAILED: CORRUPT_RUNTIME_CODES.STAGING_FAILED,
  CORRUPT_RUNTIME_USER_STATE_INCOMPLETE: CORRUPT_RUNTIME_CODES.USER_STATE_INCOMPLETE,
  CORRUPT_RUNTIME_INTEGRITY_FAILED: CORRUPT_RUNTIME_CODES.INTEGRITY_FAILED,
  CORRUPT_RUNTIME_ACTIVATION_FAILED: CORRUPT_RUNTIME_CODES.ACTIVATION_FAILED,
  LEGACY_MANAGED_LIBRARY_PRESENT: CORRUPT_RUNTIME_CODES.LEGACY_LIBRARY_PRESENT,
  RECOVERED_CORRUPT_RUNTIME: CORRUPT_RUNTIME_CODES.RECOVERED,
});

const JOURNAL_FILE = 'portable-writeback-journal.json';
const MARKER_FILE = 'portable-recovery-required.json';
const JOURNAL_CODES = new Set(['PORTABLE_WRITEBACK_PREPARED', 'PORTABLE_DIVERGENCE']);
const HASH_PATTERN = /^[0-9a-f]{64}$/i;
const STABLE_ID_PATTERN = /^(read|watch)-[0-9a-f]{8,64}$/i;
const RECOVERY_JOURNAL_LIMIT = 20;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function journalPath(root) {
  return join(root, 'App', 'state', JOURNAL_FILE);
}

function markerPath(root) {
  return join(root, 'App', 'state', MARKER_FILE);
}

function writeJsonAtomic(target, value) {
  mkdirSync(dirname(target), { recursive: true });
  const temporary = join(
    dirname(target),
    `.${basename(target)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  );
  writeFileSync(toLongPath(temporary), Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'));
  renameSync(toLongPath(temporary), toLongPath(target));
}

function removeFile(path) {
  try {
    rmSync(toLongPath(path), { force: true });
  } catch {
    // Recovery state cleanup is best effort.
  }
}

function isInside(root, candidate) {
  const fromRoot = relative(root, candidate);
  return fromRoot !== '' && !fromRoot.startsWith('..') && !isAbsolute(fromRoot);
}

function collectionForId(itemId) {
  if (/^read-/i.test(itemId)) return 'Read';
  if (/^watch-/i.test(itemId)) return 'Watch';
  return null;
}

function messageFor(code) {
  switch (code) {
    case PORTABLE_RECOVERY_CODES.RUNTIME_DB_MISSING:
    case PORTABLE_RECOVERY_CODES.RUNTIME_SCHEMA_MISSING:
    case PORTABLE_RECOVERY_CODES.RUNTIME_LIBRARY_EMPTY:
      return 'The runtime library was reconstructed from your portable library.';
    case PORTABLE_RECOVERY_CODES.RECOVERED_RUNTIME_REBUILT:
      return 'The runtime library was reconstructed from your portable library.';
    case PORTABLE_RECOVERY_CODES.RECOVERED_RUNTIME_SCHEMA_MIGRATED:
      return 'The runtime library schema was upgraded safely.';
    case PORTABLE_RECOVERY_CODES.RECOVERED_STALE_PREPARED_JOURNAL:
      return 'A stale recovery record was cleared after verification.';
    case PORTABLE_RECOVERY_CODES.RECOVERED_WRITEBACK_RECONCILED:
      return 'Your portable Markdown and runtime library were reconciled.';
    case PORTABLE_RECOVERY_CODES.RECOVERED_DIVERGENCE_RECONCILED:
      return 'Your portable Markdown and runtime library were reconciled.';
    case PORTABLE_RECOVERY_CODES.PORTABLE_ROOT_UNAVAILABLE:
      return 'The portable library folder is not available. Your library files have not been changed.';
    case PORTABLE_RECOVERY_CODES.PORTABLE_REBUILD_CONFLICT:
      return 'The portable library needs review before runtime state can be reconstructed. Your library files have not been changed.';
    case PORTABLE_RECOVERY_CODES.MALFORMED_RECOVERY_JOURNAL:
      return 'A recovery record could not be validated. Your library files have not been changed.';
    case PORTABLE_RECOVERY_CODES.DIVERGENCE_REQUIRES_REVIEW:
      return 'Runtime data and your portable library disagree. Your library files have not been changed.';
    case PORTABLE_RECOVERY_CODES.RECOVERY_EVIDENCE_ARCHIVE_FAILED:
      return 'Recovery evidence could not be archived safely. Your library files have not been changed.';
    case PORTABLE_RECOVERY_CODES.RUNTIME_DB_UNUSABLE:
      return 'The runtime database cannot be opened safely. Your library files have not been changed.';
    case PORTABLE_RECOVERY_CODES.RUNTIME_SCHEMA_UNSUPPORTED:
      return 'The runtime database was written by a newer version. Your library files have not been changed.';
    case PORTABLE_RECOVERY_CODES.CORRUPT_RUNTIME_BACKUP_FAILED:
      return 'The damaged runtime database could not be preserved safely, so recovery was stopped. Your library files have not been changed.';
    case PORTABLE_RECOVERY_CODES.CORRUPT_RUNTIME_STAGING_FAILED:
      return 'The runtime database could not be reconstructed safely. Your library files have not been changed.';
    case PORTABLE_RECOVERY_CODES.CORRUPT_RUNTIME_USER_STATE_INCOMPLETE:
      return 'Some runtime user data could not be reconstructed safely. Your library files have not been changed.';
    case PORTABLE_RECOVERY_CODES.CORRUPT_RUNTIME_INTEGRITY_FAILED:
      return 'The reconstructed runtime database failed validation. Your library files have not been changed.';
    case PORTABLE_RECOVERY_CODES.CORRUPT_RUNTIME_ACTIVATION_FAILED:
      return 'The reconstructed runtime database could not be activated safely. The damaged database backup was preserved.';
    case PORTABLE_RECOVERY_CODES.LEGACY_MANAGED_LIBRARY_PRESENT:
      return 'A legacy managed library is present and needs review before automatic runtime reconstruction. Your library files have not been changed.';
    case PORTABLE_RECOVERY_CODES.RECOVERED_CORRUPT_RUNTIME:
      return 'The runtime database was reconstructed from your portable library and file-first recovery data. The damaged runtime database was preserved safely.';
    default:
      return 'Startup recovery completed.';
  }
}

function state({
  status,
  code,
  reasons = [],
  details = {},
  actions = [],
  counts = null,
  partial = false,
  limitations = [],
  mutationBlocked = false,
  metrics = {},
}) {
  return {
    status,
    code,
    reasons,
    details,
    actions,
    counts,
    partial,
    limitations,
    mutationBlocked,
    message: messageFor(code),
    metrics,
  };
}

function healthyState(metrics) {
  return state({
    status: PORTABLE_RECOVERY_STATUS.HEALTHY,
    code: PORTABLE_RECOVERY_CODES.HEALTHY,
    metrics,
  });
}

function recoveredState(code, metrics, {
  reasons = [],
  counts = null,
  actions = [],
  partial = false,
  limitations = [],
} = {}) {
  return state({
    status: PORTABLE_RECOVERY_STATUS.RECOVERED,
    code,
    reasons,
    counts,
    actions,
    partial,
    limitations,
    metrics,
  });
}

function requiredState(code, metrics, {
  reasons = [code],
  details = {},
  actions = [],
  limitations = [],
} = {}) {
  return state({
    status: PORTABLE_RECOVERY_STATUS.RECOVERY_REQUIRED,
    code,
    reasons,
    details,
    actions,
    partial: false,
    limitations,
    mutationBlocked: true,
    metrics,
  });
}

export function makeRecoveryRequiredState(code, {
  reasons = [code],
  details = {},
  actions = [],
  metrics = {},
} = {}) {
  return requiredState(code, metrics, { reasons, details, actions });
}

export function publicRecoveryState(value) {
  if (!value) return null;
  return {
    status: value.status,
    code: value.code,
    reasons: value.reasons,
    message: value.message,
    actions: value.actions,
    counts: value.counts,
    partial: value.partial,
    limitations: value.limitations,
    mutationBlocked: value.mutationBlocked,
    metrics: value.metrics,
  };
}

function diagnosticCodes(diagnostics = []) {
  const codes = new Set();
  for (const diagnostic of diagnostics) {
    if (diagnostic?.code) codes.add(diagnostic.code);
  }
  return [...codes];
}

function inspectRuntime(databasePath) {
  if (!existsSync(toLongPath(databasePath))) {
    return {
      exists: false,
      usable: true,
      schema: false,
      portableItems: 0,
      userVersion: 0,
    };
  }
  let database = null;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
    const itemsTable = database
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='items'")
      .get();
    if (!itemsTable) {
      return {
        exists: true,
        usable: true,
        schema: false,
        portableItems: 0,
        userVersion: 0,
      };
    }
    const portableItems = database
      .prepare(
        "SELECT count(*) AS n FROM item_properties WHERE namespace='portable' AND property_key='markdown_relative_path'",
      )
      .get()?.n ?? 0;
    const userVersion = Number(
      database.prepare('PRAGMA user_version').get()?.user_version ?? 0,
    );
    return {
      exists: true,
      usable: true,
      schema: true,
      portableItems: Number(portableItems),
      userVersion,
    };
  } catch (error) {
    return {
      exists: true,
      usable: false,
      schema: false,
      portableItems: 0,
      userVersion: 0,
      error: `${error?.code ?? 'ERROR'}: ${error?.message ?? String(error)}`,
    };
  } finally {
    try {
      database?.close();
    } catch {
      // Ignore cleanup failure after a failed inspection.
    }
  }
}

function readDbPortableHash(databasePath, itemId) {
  if (!existsSync(toLongPath(databasePath))) {
    return { available: false, usable: true, itemExists: false, hash: null };
  }
  let database = null;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
    const item = database.prepare('SELECT 1 FROM items WHERE id=?').get(itemId);
    const property = database
      .prepare(
        "SELECT value_json FROM item_properties WHERE item_id=? AND namespace='portable' AND property_key='markdown_sha256'",
      )
      .get(itemId);
    let hash = null;
    if (property) {
      try {
        hash = JSON.parse(property.value_json);
      } catch {
        hash = null;
      }
    }
    return {
      available: true,
      usable: true,
      itemExists: Boolean(item),
      hash: typeof hash === 'string' && HASH_PATTERN.test(hash) ? hash.toLowerCase() : null,
    };
  } catch (error) {
    return {
      available: true,
      usable: false,
      itemExists: false,
      hash: null,
      error: `${error?.code ?? 'ERROR'}: ${error?.message ?? String(error)}`,
    };
  } finally {
    try {
      database?.close();
    } catch {
      // Ignore cleanup failure after a failed inspection.
    }
  }
}

function invalidJournal(reason, details = {}) {
  return {
    present: true,
    valid: false,
    reason,
    details,
  };
}

function readRecoveryJournal(root) {
  const path = journalPath(root);
  if (!existsSync(toLongPath(path))) return { present: false };
  let raw;
  try {
    raw = readFileSync(toLongPath(path), 'utf8');
  } catch (error) {
    return invalidJournal('JOURNAL_UNREADABLE', { message: String(error?.message ?? error) });
  }
  let journal;
  try {
    journal = JSON.parse(raw);
  } catch (error) {
    return invalidJournal('JOURNAL_NOT_JSON', { message: String(error?.message ?? error) });
  }
  if (!journal || typeof journal !== 'object' || Array.isArray(journal)) {
    return invalidJournal('JOURNAL_NOT_OBJECT');
  }
  if (!JOURNAL_CODES.has(journal.code)) {
    return invalidJournal('JOURNAL_UNKNOWN_CODE', { code: journal.code ?? null });
  }
  if (typeof journal.itemId !== 'string' || !STABLE_ID_PATTERN.test(journal.itemId)) {
    return invalidJournal('JOURNAL_INVALID_ITEM_ID', { itemId: journal.itemId ?? null });
  }
  const collection = collectionForId(journal.itemId);
  if (!collection) {
    return invalidJournal('JOURNAL_INVALID_ITEM_ID', { itemId: journal.itemId });
  }
  if (
    typeof journal.markdownRelativePath !== 'string' ||
    !journal.markdownRelativePath.trim()
  ) {
    return invalidJournal('JOURNAL_INVALID_MARKDOWN_PATH');
  }
  const absoluteMarkdown = resolve(root, journal.markdownRelativePath);
  if (
    !isInside(root, absoluteMarkdown) ||
    assertContained(resolve(root), absoluteMarkdown, {
      relativePath: journal.markdownRelativePath,
    })
  ) {
    return invalidJournal('JOURNAL_PATH_ESCAPE', {
      markdownRelativePath: journal.markdownRelativePath,
    });
  }
  const normalizedRelative = relative(root, absoluteMarkdown).split('\\').join('/');
  if (!normalizedRelative.startsWith(`${collection}/`)) {
    return invalidJournal('JOURNAL_COLLECTION_MISMATCH', {
      markdownRelativePath: normalizedRelative,
      collection,
    });
  }
  if (!existsSync(toLongPath(absoluteMarkdown))) {
    return invalidJournal('JOURNAL_MARKDOWN_MISSING', {
      markdownRelativePath: normalizedRelative,
    });
  }
  for (const key of ['previousSha256', 'stagedSha256']) {
    if (typeof journal[key] !== 'string' || !HASH_PATTERN.test(journal[key])) {
      return invalidJournal('JOURNAL_INVALID_HASH', { key, value: journal[key] ?? null });
    }
  }
  if (journal.archivePath !== undefined && journal.archivePath !== null) {
    if (typeof journal.archivePath !== 'string' || !journal.archivePath.trim()) {
      return invalidJournal('JOURNAL_INVALID_ARCHIVE_PATH');
    }
    const archiveRoot = join(root, 'App', 'backups', 'markdown-history');
    const archive = resolve(root, journal.archivePath);
    if (!isInside(archiveRoot, archive)) {
      return invalidJournal('JOURNAL_ARCHIVE_PATH_ESCAPE', {
        archivePath: journal.archivePath,
      });
    }
  }

  let buffer;
  try {
    buffer = readFileSync(toLongPath(absoluteMarkdown));
  } catch (error) {
    return invalidJournal('JOURNAL_MARKDOWN_UNREADABLE', {
      markdownRelativePath: normalizedRelative,
      message: String(error?.message ?? error),
    });
  }
  const text = buffer.toString('utf8');
  const identity = readIdentity(text);
  if (
    !identity.ok ||
    identity.id !== journal.itemId ||
    identity.collection !== collection
  ) {
    return invalidJournal('JOURNAL_IDENTITY_MISMATCH', {
      markdownRelativePath: normalizedRelative,
      expectedId: journal.itemId,
      actualId: identity.id ?? null,
      expectedCollection: collection,
      actualCollection: identity.collection ?? null,
    });
  }
  const parsed = parseTitleMarkdown(text, {
    relativePath: normalizedRelative,
    collection,
  });
  if (parsed.diagnostics.some((entry) => entry.severity === 'error')) {
    return invalidJournal('JOURNAL_MARKDOWN_INVALID', {
      markdownRelativePath: normalizedRelative,
      codes: diagnosticCodes(parsed.diagnostics),
    });
  }
  return {
    present: true,
    valid: true,
    journal,
    collection,
    absoluteMarkdown,
    markdownRelativePath: normalizedRelative,
    buffer,
    currentSha256: sha256(buffer),
  };
}

function archiveRecoveryJournal(root, journal, now) {
  const source = journalPath(root);
  const archiveRoot = join(root, 'App', 'backups', 'recovery-journals');
  mkdirSync(archiveRoot, { recursive: true });
  const stamp = now.replace(/[:.]/g, '-');
  const target = join(archiveRoot, `${stamp}-${journal.code.toLowerCase()}.json`);
  try {
    renameSync(toLongPath(source), toLongPath(target));
  } catch {
    try {
      const buffer = readFileSync(toLongPath(source));
      writeFileSync(toLongPath(target), buffer);
      removeFile(source);
    } catch (error) {
      throw Object.assign(
        new Error(`Recovery journal could not be archived: ${error?.message ?? error}`),
        { code: PORTABLE_RECOVERY_CODES.RECOVERY_EVIDENCE_ARCHIVE_FAILED },
      );
    }
  }
  const files = readdirSync(archiveRoot)
    .filter((name) => name.endsWith('.json'))
    .sort();
  while (files.length > RECOVERY_JOURNAL_LIMIT) {
    removeFile(join(archiveRoot, files.shift()));
  }
  return target;
}

function writeRecoveryMarker(root, value) {
  try {
    writeJsonAtomic(markerPath(root), value);
  } catch {
    // If the marker cannot be written, the active journal or next startup
    // inspection still prevents unsafe mutation.
  }
}

function clearRecoveryMarker(root) {
  removeFile(markerPath(root));
}

export function assertPortableMutationsAllowed(root) {
  const activeJournal = journalPath(root);
  const marker = markerPath(root);
  if (existsSync(toLongPath(activeJournal)) || existsSync(toLongPath(marker))) {
    throw Object.assign(
      new Error('Portable recovery is required before metadata can be saved.'),
      {
        status: 503,
        code: 'PORTABLE_RECOVERY_REQUIRED',
        recovery: true,
      },
    );
  }
}

async function rebuildRuntimeFromPortable(root, {
  databasePath,
  userDataRoot,
  reasonCodes,
  metrics,
  now,
}) {
  metrics.portableRootScanned = true;
  const plan = await planPortableRebuild(root);
  if (!plan.ok || plan.partial) {
    return {
      state: requiredState(PORTABLE_RECOVERY_CODES.PORTABLE_REBUILD_CONFLICT, metrics, {
        reasons: [
          PORTABLE_RECOVERY_CODES.PORTABLE_REBUILD_CONFLICT,
          ...(plan.duplicateIds?.length ? ['DUPLICATE_STABLE_ID'] : []),
        ],
        details: {
          skipped: plan.skipped?.length ?? 0,
          diagnostics: diagnosticCodes(plan.diagnostics),
          duplicateIds: plan.duplicateIds?.length ?? 0,
        },
      }),
      plan,
    };
  }

  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  let searchStore = null;
  try {
    const result = await rebuildPortableLibrary({
      root,
      database,
      searchStore: null,
      apply: true,
      now,
    });
    if (!result.ok || result.status === 'partial') {
      return {
        state: requiredState(PORTABLE_RECOVERY_CODES.PORTABLE_REBUILD_CONFLICT, metrics, {
          details: {
            status: result.status,
            skipped: result.skipped?.length ?? 0,
            diagnostics: diagnosticCodes(result.diagnostics),
          },
        }),
        result,
      };
    }
    searchStore = createSearchStore({
      databasePath,
      userDataRoot,
      libraryDatabase: database,
    });
    const search = searchStore.rebuildIndex();
    metrics.searchRebuilt = true;
    metrics.rebuildApplied = true;
    return {
      state: recoveredState(PORTABLE_RECOVERY_CODES.RECOVERED_RUNTIME_REBUILT, metrics, {
        reasons: reasonCodes,
        counts: result.counts,
        actions: ['portable_rebuild', 'search_rebuild'],
      }),
      result,
      search,
    };
  } finally {
    try {
      searchStore?.close();
    } catch {
      // SearchStore close is a no-op when it shares the caller's connection.
    }
    database.close();
  }
}

async function reconcileJournal(journalState, {
  root,
  databasePath,
  userDataRoot,
  metrics,
  now,
}) {
  const { journal } = journalState;
  const dbState = readDbPortableHash(databasePath, journal.itemId);
  if (!dbState.usable) {
    return requiredState(PORTABLE_RECOVERY_CODES.RUNTIME_DB_UNUSABLE, metrics, {
      reasons: [PORTABLE_RECOVERY_CODES.RUNTIME_DB_UNUSABLE],
      details: { message: dbState.error ?? null },
    });
  }
  const previous = journal.previousSha256.toLowerCase();
  const staged = journal.stagedSha256.toLowerCase();
  const current = journalState.currentSha256;
  const dbHash = dbState.hash;
  const dbMissing = !dbState.available || !dbState.itemExists || dbHash === null;

  function archiveFailure(error) {
    return requiredState(PORTABLE_RECOVERY_CODES.RECOVERY_EVIDENCE_ARCHIVE_FAILED, metrics, {
      details: { message: String(error?.message ?? error) },
    });
  }

  function staleJournalRecovered() {
    return recoveredState(
      PORTABLE_RECOVERY_CODES.RECOVERED_STALE_PREPARED_JOURNAL,
      metrics,
      { reasons: ['STALE_PREPARED_JOURNAL'], actions: ['journal_archived'] },
    );
  }

  async function reconcileFromFilesystem(code, reason) {
    const rebuilt = await rebuildRuntimeFromPortable(root, {
      databasePath,
      userDataRoot,
      reasonCodes: [reason],
      metrics,
      now,
    });
    if (rebuilt.state.status === PORTABLE_RECOVERY_STATUS.RECOVERY_REQUIRED) {
      return rebuilt.state;
    }
    metrics.dbInspected = true;
    const after = readDbPortableHash(databasePath, journal.itemId);
    if (after.hash !== current) {
      return requiredState(PORTABLE_RECOVERY_CODES.DIVERGENCE_REQUIRES_REVIEW, metrics, {
        details: { expectedHash: current, actualHash: after.hash },
      });
    }
    try {
      archiveRecoveryJournal(root, journal, now);
    } catch (error) {
      return archiveFailure(error);
    }
    return recoveredState(code, metrics, {
      reasons: [reason],
      counts: rebuilt.result?.counts ?? null,
      actions: ['portable_rebuild', 'search_rebuild', 'journal_archived'],
    });
  }

  if (journal.code === 'PORTABLE_WRITEBACK_PREPARED') {
    if (
      (current === previous && dbHash === previous) ||
      (current === staged && dbHash === staged)
    ) {
      try {
        archiveRecoveryJournal(root, journal, now);
      } catch (error) {
        return archiveFailure(error);
      }
      return staleJournalRecovered();
    }
    if (current === staged && (dbMissing || dbHash === previous)) {
      return reconcileFromFilesystem(
        PORTABLE_RECOVERY_CODES.RECOVERED_WRITEBACK_RECONCILED,
        'WRITEBACK_RECONCILED',
      );
    }
    if (current === previous && dbHash === staged) {
      return reconcileFromFilesystem(
        PORTABLE_RECOVERY_CODES.RECOVERED_WRITEBACK_RECONCILED,
        'WRITEBACK_RECONCILED',
      );
    }
    return requiredState(PORTABLE_RECOVERY_CODES.DIVERGENCE_REQUIRES_REVIEW, metrics, {
      reasons: [PORTABLE_RECOVERY_CODES.DIVERGENCE_REQUIRES_REVIEW],
      details: { current, previous, staged, dbHash },
    });
  }

  // PORTABLE_DIVERGENCE: the filesystem is durable, but the archive must never
  // overwrite the current Markdown. Only a fully valid current filesystem state
  // may be reconciled automatically.
  return reconcileFromFilesystem(
    PORTABLE_RECOVERY_CODES.RECOVERED_DIVERGENCE_RECONCILED,
    'DIVERGENCE_RECONCILED',
  );
}

/**
 * Inspect and, when provably safe, recover the runtime library.
 */
export async function runPortableStartupRecovery({
  root,
  databasePath,
  userDataRoot = null,
  now = new Date().toISOString(),
} = {}) {
  const startedAt = Date.now();
  const metrics = {
    dbInspected: false,
    portableRootScanned: false,
    rebuildApplied: false,
    searchRebuilt: false,
    durationMs: 0,
  };
  const absoluteRoot = resolve(root);
  const rootInfo = await statSafe(absoluteRoot);
  if (!rootInfo.ok || !rootInfo.isDirectory) {
    const result = requiredState(PORTABLE_RECOVERY_CODES.PORTABLE_ROOT_UNAVAILABLE, metrics, {
      reasons: [PORTABLE_RECOVERY_CODES.PORTABLE_ROOT_UNAVAILABLE],
    });
    metrics.durationMs = Date.now() - startedAt;
    result.metrics = metrics;
    return result;
  }

  const journal = readRecoveryJournal(absoluteRoot);
  if (journal.present && !journal.valid) {
    const result = requiredState(PORTABLE_RECOVERY_CODES.MALFORMED_RECOVERY_JOURNAL, metrics, {
      reasons: [PORTABLE_RECOVERY_CODES.MALFORMED_RECOVERY_JOURNAL],
      details: {
        reason: journal.reason,
        ...journal.details,
      },
    });
    writeRecoveryMarker(absoluteRoot, {
      code: result.code,
      reasons: result.reasons,
      details: result.details,
      detectedAtUtc: now,
    });
    metrics.durationMs = Date.now() - startedAt;
    result.metrics = metrics;
    return result;
  }

  if (journal.present && journal.valid) {
    const result = await reconcileJournal(journal, {
      root: absoluteRoot,
      databasePath,
      userDataRoot: userDataRoot ?? join(absoluteRoot, 'App', 'user-data'),
      metrics,
      now,
    });
    metrics.durationMs = Date.now() - startedAt;
    result.metrics = metrics;
    if (result.status === PORTABLE_RECOVERY_STATUS.RECOVERY_REQUIRED) {
      writeRecoveryMarker(absoluteRoot, {
        code: result.code,
        reasons: result.reasons,
        details: result.details,
        detectedAtUtc: now,
      });
    } else {
      clearRecoveryMarker(absoluteRoot);
    }
    return result;
  }

  const runtime = inspectRuntime(databasePath);
  metrics.dbInspected = true;
  if (!runtime.usable) {
    const disaster = await recoverCorruptRuntime({
      root: absoluteRoot,
      databasePath,
      userDataRoot: userDataRoot ?? join(absoluteRoot, 'App', 'user-data'),
      now,
    });
    metrics.corruptRuntime = disaster.metrics;
    if (disaster.ok) {
      metrics.portableRootScanned = true;
      metrics.rebuildApplied = disaster.metrics.stagingBuilt;
      metrics.searchRebuilt = disaster.metrics.searchRebuilt;
      const result = recoveredState(
        PORTABLE_RECOVERY_CODES.RECOVERED_CORRUPT_RUNTIME,
        metrics,
        {
          reasons: [PORTABLE_RECOVERY_CODES.CORRUPT_RUNTIME_BACKUP_VERIFIED],
          counts: disaster.counts ?? null,
          actions: [
            'corrupt_runtime_backup',
            'portable_rebuild',
            'user_state_recovery',
            'search_rebuild',
            'atomic_activation',
          ],
          partial: disaster.partial,
          limitations: disaster.limitations ?? [],
        },
      );
      clearRecoveryMarker(absoluteRoot);
      metrics.durationMs = Date.now() - startedAt;
      result.metrics = metrics;
      return result;
    }
    const result = requiredState(disaster.code, metrics, {
      reasons: [disaster.code],
      details: {
        message: disaster.diagnostics?.[0]?.message ?? null,
        diagnostics: (disaster.diagnostics ?? []).map(({ code, message }) => ({ code, message })),
      },
      limitations: disaster.limitations ?? [],
    });
    writeRecoveryMarker(absoluteRoot, {
      code: result.code,
      reasons: result.reasons,
      details: result.details,
      detectedAtUtc: now,
    });
    metrics.durationMs = Date.now() - startedAt;
    result.metrics = metrics;
    return result;
  }

  if (runtime.exists && runtime.schema && runtime.userVersion > RUNTIME_SCHEMA_VERSION) {
    const result = requiredState(PORTABLE_RECOVERY_CODES.RUNTIME_SCHEMA_UNSUPPORTED, metrics, {
      details: { userVersion: runtime.userVersion, supportedVersion: RUNTIME_SCHEMA_VERSION },
    });
    writeRecoveryMarker(absoluteRoot, {
      code: result.code,
      reasons: result.reasons,
      details: result.details,
      detectedAtUtc: now,
    });
    metrics.durationMs = Date.now() - startedAt;
    result.metrics = metrics;
    return result;
  }

  if (runtime.exists && runtime.schema && runtime.userVersion < RUNTIME_SCHEMA_VERSION) {
    const database = new DatabaseSync(databasePath);
    try {
      applyRuntimeSchema(database);
    } finally {
      database.close();
    }
    const result = recoveredState(
      PORTABLE_RECOVERY_CODES.RECOVERED_RUNTIME_SCHEMA_MIGRATED,
      metrics,
      { actions: ['schema_migration'] },
    );
    clearRecoveryMarker(absoluteRoot);
    metrics.durationMs = Date.now() - startedAt;
    result.metrics = metrics;
    return result;
  }

  if (!runtime.exists || !runtime.schema || runtime.portableItems === 0) {
    const reason = !runtime.exists
      ? PORTABLE_RECOVERY_CODES.RUNTIME_DB_MISSING
      : !runtime.schema
        ? PORTABLE_RECOVERY_CODES.RUNTIME_SCHEMA_MISSING
        : PORTABLE_RECOVERY_CODES.RUNTIME_LIBRARY_EMPTY;
    metrics.portableRootScanned = true;
    const rebuilt = await rebuildRuntimeFromPortable(absoluteRoot, {
      databasePath,
      userDataRoot: userDataRoot ?? join(absoluteRoot, 'App', 'user-data'),
      reasonCodes: [reason],
      metrics,
      now,
    });
    metrics.durationMs = Date.now() - startedAt;
    rebuilt.state.metrics = metrics;
    if (rebuilt.state.status === PORTABLE_RECOVERY_STATUS.RECOVERY_REQUIRED) {
      writeRecoveryMarker(absoluteRoot, {
        code: rebuilt.state.code,
        reasons: rebuilt.state.reasons,
        details: rebuilt.state.details,
        detectedAtUtc: now,
      });
    } else {
      clearRecoveryMarker(absoluteRoot);
    }
    return rebuilt.state;
  }

  const result = healthyState(metrics);
  clearRecoveryMarker(absoluteRoot);
  metrics.durationMs = Date.now() - startedAt;
  result.metrics = metrics;
  return result;
}
