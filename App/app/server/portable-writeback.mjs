/**
 * Safe app write-back into portable title Markdown.
 *
 * Flow:
 *   validate -> detect external edits -> stage Markdown -> DB transaction ->
 *   atomic Markdown replace -> commit -> compensation/journal on failure.
 *
 * A failed filesystem write never reports success, and a failed database commit
 * never leaves the two sides silently divergent.
 */
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { toLongPath } from './portable-library.mjs';
import {
  buildPortableMarkdownPatch,
  parseTitleMarkdown,
  readBodySection,
  readIdentity,
  validatePortableFields,
} from './portable-metadata.mjs';
import {
  applyPortableProjection,
  canonicalJson,
  getPortableMarker,
  isPortableItem,
  projectPortableTitle,
} from './portable-rebuild.mjs';
import { assertPortableMutationsAllowed } from './portable-recovery.mjs';

const HISTORY_LIMIT = 10;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sameValue(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function writeAtomic(target, buffer) {
  mkdirSync(dirname(target), { recursive: true });
  const temporary = join(
    dirname(target),
    `.${basename(target)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  );
  writeFileSync(toLongPath(temporary), buffer);
  renameSync(toLongPath(temporary), toLongPath(target));
}

function portableError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

function conflictError(details) {
  return Object.assign(
    new Error(
      `Markdown was edited outside the app for "${details.field}"; reload before saving.`,
    ),
    {
      status: 409,
      code: 'PORTABLE_MARKDOWN_CONFLICT',
      conflict: details,
    },
  );
}

function readJsonProperty(database, itemId, key) {
  const row = database
    .prepare(
      "SELECT value_json FROM item_properties WHERE item_id=? AND namespace='portable' AND property_key=?",
    )
    .get(itemId, key);
  if (!row) return { present: false, value: null };
  try {
    return { present: true, value: JSON.parse(row.value_json) };
  } catch {
    return { present: true, value: null };
  }
}

function basePortableFields(database, itemId, collection) {
  const item = database
    .prepare('SELECT title,item_type,status,rating,summary,source_added FROM items WHERE id=?')
    .get(itemId);
  const tags = database
    .prepare('SELECT t.name FROM item_tags it JOIN tags t ON t.id=it.tag_id WHERE it.item_id=? ORDER BY it.position')
    .all(itemId)
    .map((row) => row.name);
  const peopleRole = collection === 'watch' ? 'creator' : 'author';
  const people = database
    .prepare(
      'SELECT p.display_name FROM item_people ip JOIN people p ON p.id=ip.person_id WHERE ip.item_id=? AND ip.role=? ORDER BY ip.position',
    )
    .all(itemId, peopleRole)
    .map((row) => row.display_name);
  const series = database
    .prepare(
      'SELECT s.name, rs.position FROM read_series rs JOIN series s ON s.id=rs.series_id WHERE rs.item_id=?',
    )
    .get(itemId);
  const favorite = readJsonProperty(database, itemId, 'favorite');
  const dateStarted = readJsonProperty(database, itemId, 'date_started');
  const dateCompleted = readJsonProperty(database, itemId, 'date_completed');
  const rewatch = readJsonProperty(database, itemId, 'rewatch_count');
  const progressPercent = readJsonProperty(database, itemId, 'progress_percent');
  const currentPage = readJsonProperty(database, itemId, 'current_page');
  const currentChapter = readJsonProperty(database, itemId, 'current_chapter');
  const progress = readJsonProperty(database, itemId, 'progress');
  const added = readJsonProperty(database, itemId, 'date_added');

  return {
    title: item?.title ?? '',
    type: item?.item_type ?? '',
    status: item?.status ?? '',
    personal_rating: item?.rating ?? null,
    favorite: favorite.present ? favorite.value : null,
    tags,
    [collection === 'watch' ? 'creators' : 'authors']: people,
    series: series?.name ?? null,
    volume: series ? String(series.position ?? '') : null,
    date_added: added.present ? added.value : (item?.source_added || null),
    date_started: dateStarted.present ? dateStarted.value : null,
    date_completed: dateCompleted.present ? dateCompleted.value : null,
    rewatch_count: rewatch.present ? rewatch.value : null,
    progress_percent: progressPercent.present ? progressPercent.value : null,
    current_page: currentPage.present ? currentPage.value : null,
    current_chapter: currentChapter.present ? currentChapter.value : null,
    progress: progress.present ? progress.value : null,
    summary: item?.summary ?? '',
  };
}

function externalPortableFields(parsed, collection) {
  const data = parsed.data ?? {};
  return {
    title: typeof data.title === 'string' ? data.title : '',
    type: typeof data.type === 'string' ? data.type : '',
    status: typeof data.status === 'string' ? data.status : '',
    personal_rating: typeof data.personal_rating === 'number' ? data.personal_rating : null,
    favorite: Object.hasOwn(data, 'favorite') ? data.favorite : null,
    tags: Array.isArray(data.tags) ? data.tags : [],
    [collection === 'watch' ? 'creators' : 'authors']:
      Array.isArray(collection === 'watch' ? data.creators : data.authors)
        ? (collection === 'watch' ? data.creators : data.authors)
        : [],
    series: typeof data.series === 'string' ? data.series : null,
    volume: data.volume !== undefined && data.volume !== null ? String(data.volume) : null,
    date_added: typeof data.date_added === 'string' ? data.date_added : null,
    date_started: typeof data.date_started === 'string' ? data.date_started : null,
    date_completed: typeof data.date_completed === 'string' ? data.date_completed : null,
    rewatch_count: Number.isInteger(data.rewatch_count) ? data.rewatch_count : null,
    progress_percent: typeof data.progress_percent === 'number' ? data.progress_percent : null,
    current_page: Number.isInteger(data.current_page) ? data.current_page : null,
    current_chapter: typeof data.current_chapter === 'string' ? data.current_chapter : null,
    progress: data.progress && typeof data.progress === 'object' && !Array.isArray(data.progress)
      ? data.progress
      : null,
    summary: readBodySection(
      parsed.body ?? '',
      collection === 'watch' ? 'My Description' : 'Overview',
    ),
  };
}

function requestPortableFields(patch, collection) {
  const filtered = {};
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (key === 'customProperties') {
      if (value && typeof value === 'object' && Object.keys(value).length > 0) {
        throw portableError(
          'UNSUPPORTED_PORTABLE_FIELD',
          'Custom properties are not written into portable title Markdown; edit the Markdown directly for unknown fields.',
          { status: 400 },
        );
      }
      continue;
    }
    filtered[key] = value;
  }
  const checked = validatePortableFields(filtered, { collection: collection === 'watch' ? 'Watch' : 'Read' });
  if (!checked.ok) {
    throw Object.assign(
      new Error(checked.diagnostics[0]?.message ?? 'Invalid portable fields'),
      {
        status: 400,
        code: 'INVALID_PORTABLE_FIELD',
        diagnostics: checked.diagnostics,
      },
    );
  }
  return checked.normalized;
}

function archiveMarkdown({ backupRoot, itemId, markdownPath, buffer, now }) {
  const targetRoot = join(backupRoot, 'markdown-history', itemId);
  mkdirSync(targetRoot, { recursive: true });
  const stamp = now.replace(/[:.]/g, '-');
  const target = join(targetRoot, `${stamp}-${basename(markdownPath)}`);
  writeAtomic(target, buffer);
  const history = readdirSync(targetRoot)
    .filter((name) => name.endsWith('.md'))
    .sort();
  while (history.length > HISTORY_LIMIT) {
    rmSync(join(targetRoot, history.shift()));
  }
  return target;
}

function writeJournal(journalPath, value) {
  writeAtomic(journalPath, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'));
}

function removeJournal(journalPath) {
  try {
    rmSync(journalPath, { force: true });
  } catch {
    // The next rebuild/update detects the file hash and reconciles runtime state.
  }
}

/**
 * Update one portable title. The caller has already checked the runtime
 * revision; this function rechecks it inside the transaction.
 */
export function updatePortableItem({
  database,
  root,
  backupRoot,
  itemId,
  patch,
  expectedRevision,
  now = new Date().toISOString(),
} = {}) {
  if (!isPortableItem(database, itemId)) {
    throw portableError('NOT_PORTABLE_ITEM', 'This item is not backed by portable title Markdown.', { status: 400 });
  }
  const item = database.prepare('SELECT * FROM items WHERE id=?').get(itemId);
  if (!item) throw portableError('UNKNOWN_ITEM', 'Unknown item ID', { status: 404 });
  if (item.revision !== expectedRevision) {
    throw portableError('PORTABLE_REVISION_CONFLICT', 'Metadata conflict', { status: 409 });
  }
  assertPortableMutationsAllowed(root);
  const marker = getPortableMarker(database, itemId);
  if (!marker.markdownRelativePath || !marker.folderRelativePath) {
    throw portableError('PORTABLE_MARKER_MISSING', 'The portable Markdown location is missing from runtime state.', { status: 500 });
  }

  const absoluteMarkdown = resolve(root, marker.markdownRelativePath);
  let originalBuffer;
  try {
    originalBuffer = readFileSync(toLongPath(absoluteMarkdown));
  } catch (error) {
    throw portableError(
      'PORTABLE_MARKDOWN_MISSING',
      `The portable Markdown file could not be read: ${error?.message ?? error}`,
      { status: 409 },
    );
  }
  const originalText = originalBuffer.toString('utf8');
  const originalParsed = parseTitleMarkdown(originalText, {
    relativePath: marker.markdownRelativePath,
    collection: item.collection === 'read' ? 'Read' : 'Watch',
  });
  const requested = requestPortableFields(patch, item.collection);
  const base = basePortableFields(database, itemId, item.collection);
  const external = externalPortableFields(originalParsed, item.collection);
  const externalChanged = marker.markdownSha256 !== sha256(originalBuffer);

  const fields = {};
  for (const [key, value] of Object.entries(requested)) {
    if (sameValue(base[key], value)) continue;
    if (
      externalChanged &&
      !sameValue(external[key], base[key]) &&
      !sameValue(external[key], value)
    ) {
      throw conflictError({
        field: key,
        base: base[key],
        external: external[key],
        requested: value,
        markdownRelativePath: marker.markdownRelativePath,
      });
    }
    fields[key] = value;
  }
  if (Object.keys(fields).length === 0) {
    return { ok: true, unchanged: true, revision: item.revision, changedKeys: [] };
  }

  const patched = buildPortableMarkdownPatch(originalText, { fields }, {
    collection: item.collection === 'read' ? 'Read' : 'Watch',
  });
  if (!patched.ok) {
    throw Object.assign(
      new Error(patched.diagnostics?.[0]?.message ?? 'The Markdown change could not be built.'),
      { status: 400, code: 'INVALID_PORTABLE_FIELD', diagnostics: patched.diagnostics },
    );
  }
  const patchedText = patched.text;
  const patchedIdentity = readIdentity(patchedText);
  if (
    !patchedIdentity.ok ||
    patchedIdentity.id !== itemId ||
    patchedIdentity.collection !== (item.collection === 'read' ? 'Read' : 'Watch')
  ) {
    throw portableError('PORTABLE_IDENTITY_CHANGED', 'The write would alter the stable identity; refusing.', { status: 500 });
  }
  const patchedParsed = parseTitleMarkdown(patchedText, {
    relativePath: marker.markdownRelativePath,
    collection: item.collection === 'read' ? 'Read' : 'Watch',
  });
  if (patchedParsed.diagnostics.some((entry) => entry.severity === 'error')) {
    throw Object.assign(
      new Error(patchedParsed.diagnostics.find((entry) => entry.severity === 'error').message),
      { status: 400, code: 'INVALID_PORTABLE_FIELD', diagnostics: patchedParsed.diagnostics },
    );
  }
  for (const [key, value] of Object.entries(originalParsed.unknownKeys ?? {})) {
    if (!sameValue(patchedParsed.unknownKeys?.[key], value)) {
      throw portableError('PORTABLE_UNKNOWN_KEY_CHANGED', `Unknown YAML key "${key}" would be altered; refusing.`, { status: 500 });
    }
  }

  const title = {
    id: itemId,
    collection: item.collection === 'read' ? 'Read' : 'Watch',
    category: marker.category,
    folderName: basename(marker.folderRelativePath),
    relativeFolderPath: marker.folderRelativePath,
    markdownFileName: basename(marker.markdownRelativePath),
    relativeMarkdownPath: marker.markdownRelativePath,
  };
  const newBuffer = Buffer.from(patchedText, 'utf8');
  const newProjection = projectPortableTitle(root, title, patchedText, newBuffer, patchedParsed);
  const temporary = join(
    dirname(absoluteMarkdown),
    `.${basename(absoluteMarkdown)}.rw-portable-${process.pid}-${Date.now()}`,
  );
  const journalPath = join(root, 'App', 'state', 'portable-writeback-journal.json');

  writeFileSync(toLongPath(temporary), newBuffer);
  const staged = parseTitleMarkdown(readFileSync(toLongPath(temporary), 'utf8'), {
    relativePath: marker.markdownRelativePath,
    collection: title.collection,
  });
  if (staged.diagnostics.some((entry) => entry.severity === 'error')) {
    rmSync(toLongPath(temporary), { force: true });
    throw portableError('PORTABLE_STAGING_FAILED', 'The staged Markdown did not validate; the original was not replaced.', { status: 500 });
  }

  let archivePath = null;
  try {
    archivePath = archiveMarkdown({
      backupRoot,
      itemId,
      markdownPath: marker.markdownRelativePath,
      buffer: originalBuffer,
      now,
    });
    writeJournal(journalPath, {
      code: 'PORTABLE_WRITEBACK_PREPARED',
      itemId,
      markdownRelativePath: marker.markdownRelativePath,
      previousSha256: marker.markdownSha256,
      stagedSha256: sha256(newBuffer),
      archivePath,
      preparedAtUtc: now,
    });
  } catch (error) {
    rmSync(toLongPath(temporary), { force: true });
    throw portableError(
      'PORTABLE_RECOVERY_EVIDENCE_FAILED',
      `Recovery evidence could not be created: ${error?.message ?? error}`,
      { status: 500 },
    );
  }

  let inTransaction = false;
  try {
    database.exec('BEGIN IMMEDIATE');
    inTransaction = true;
    const current = database.prepare('SELECT revision FROM items WHERE id=?').get(itemId);
    if (!current || current.revision !== expectedRevision) {
      throw portableError('PORTABLE_REVISION_CONFLICT', 'Metadata conflict', { status: 409 });
    }
    applyPortableProjection(database, newProjection, { now });
  } catch (error) {
    if (inTransaction) {
      try {
        database.exec('ROLLBACK');
      } catch {
        // The transaction did not start or was already rolled back.
      }
    }
    rmSync(toLongPath(temporary), { force: true });
    removeJournal(journalPath);
    throw error;
  }

  try {
    renameSync(toLongPath(temporary), toLongPath(absoluteMarkdown));
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // Transaction cleanup is best-effort; the original Markdown is intact.
    }
    rmSync(toLongPath(temporary), { force: true });
    removeJournal(journalPath);
    throw portableError(
      'PORTABLE_WRITE_FAILED',
      `The Markdown file could not be replaced: ${error?.message ?? error}`,
      { status: 500 },
    );
  }

  try {
    database.exec('COMMIT');
  } catch (error) {
    let committedDespiteError = false;
    try {
      committedDespiteError =
        readJsonProperty(database, itemId, 'markdown_sha256').value === sha256(newBuffer);
    } catch {
      committedDespiteError = false;
    }
    if (committedDespiteError) {
      removeJournal(journalPath);
      return {
        ok: true,
        unchanged: false,
        revision: currentRevision(database, itemId),
        changedKeys: patched.changedKeys,
        archivePath,
      };
    }
    try {
      database.exec('ROLLBACK');
    } catch {
      // The commit itself failed; no successful transaction remains.
    }
    try {
      writeAtomic(absoluteMarkdown, originalBuffer);
      removeJournal(journalPath);
    } catch (restoreError) {
      writeJournal(journalPath, {
        code: 'PORTABLE_DIVERGENCE',
        itemId,
        markdownRelativePath: marker.markdownRelativePath,
        previousSha256: marker.markdownSha256,
        stagedSha256: sha256(newBuffer),
        archivePath,
        commitError: String(error?.message ?? error),
        restoreError: String(restoreError?.message ?? restoreError),
        detectedAtUtc: new Date().toISOString(),
      });
      throw portableError(
        'PORTABLE_DIVERGENCE',
        'The database commit failed and the Markdown rollback also failed; recovery evidence was retained.',
        { status: 500, journalPath },
      );
    }
    throw portableError(
      'PORTABLE_DB_COMMIT_FAILED',
      `The database commit failed; Markdown was restored. ${error?.message ?? error}`,
      { status: 500 },
    );
  }

  removeJournal(journalPath);
  return {
    ok: true,
    unchanged: false,
    revision: currentRevision(database, itemId),
    changedKeys: patched.changedKeys,
    archivePath,
  };
}

function currentRevision(database, itemId) {
  return database.prepare('SELECT revision FROM items WHERE id=?').get(itemId)?.revision ?? null;
}
