/**
 * Portable title Markdown: schema contract, tolerant parser, field-level
 * diagnostics and a surgical identity writer.
 *
 * One parser serves both collections; Read/Watch differences are thin field
 * profiles rather than parallel implementations.
 *
 * Guarantees:
 *  - unknown YAML keys and unknown body sections survive a round trip
 *  - a bad optional field never invalidates the rest of the title
 *  - the writer only ever inserts identity keys, never rewrites other content
 *  - a missing personal value stays missing; it is never defaulted to false/0
 *  - no absolute asset paths, traversal or symlink escape is accepted
 */
import { isAbsolute, join, posix, relative, resolve } from 'node:path';

import { assertContained } from './portable-library.mjs';

export const PORTABLE_SCHEMA_VERSION = 1;
export const SUPPORTED_SCHEMA_VERSIONS = Object.freeze([1]);

export const COLLECTIONS = Object.freeze(['Read', 'Watch']);

export const READ_STATUSES = Object.freeze([
  // Canonical app vocabulary plus the legacy values already present in the
  // real portable library. Existing user data must never be "invalid" merely
  // because an earlier importer used a synonym.
  'to_read', 'unread', 'reading', 'completed', 'paused', 'dropped',
  'reference', 'rereading', 'study',
]);
export const WATCH_STATUSES = Object.freeze([
  'to_watch', 'planned', 'watching', 'completed', 'paused', 'dropped',
  'rewatching', 'watched',
]);

/** Keys the portable contract treats as identity-bearing and app-managed. */
export const IDENTITY_KEYS = Object.freeze(['schema_version', 'id', 'collection']);

export const FIELD_ERROR_CODES = Object.freeze({
  TITLE_MARKDOWN_MISSING: 'TITLE_MARKDOWN_MISSING',
  REQUIRED_FIELD_MISSING: 'REQUIRED_FIELD_MISSING',
  INVALID_FIELD_TYPE: 'INVALID_FIELD_TYPE',
  INVALID_RATING_RANGE: 'INVALID_RATING_RANGE',
  INVALID_DATE: 'INVALID_DATE',
  INVALID_LIST: 'INVALID_LIST',
  INVALID_ENUM: 'INVALID_ENUM',
  DUPLICATE_YAML_KEY: 'DUPLICATE_YAML_KEY',
  INVALID_YAML: 'INVALID_YAML',
  NO_FRONTMATTER: 'NO_FRONTMATTER',
  UNSUPPORTED_SCHEMA_VERSION: 'UNSUPPORTED_SCHEMA_VERSION',
  INVALID_STABLE_ID: 'INVALID_STABLE_ID',
  BROKEN_RELATIVE_PATH: 'BROKEN_RELATIVE_PATH',
  ABSOLUTE_ASSET_PATH: 'ABSOLUTE_ASSET_PATH',
  PATH_ESCAPE: 'PATH_ESCAPE',
  UNSUPPORTED_PORTABLE_FIELD: 'UNSUPPORTED_PORTABLE_FIELD',
  INVALID_PROGRESS: 'INVALID_PROGRESS',
});

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'];
const READABLE_EXTENSIONS = ['.pdf', '.epub', '.doc', '.docx', '.chm', '.txt', '.md'];

export function isReadableExtension(extension) {
  return READABLE_EXTENSIONS.includes(String(extension).toLowerCase());
}

export function isImageExtension(extension) {
  return IMAGE_EXTENSIONS.includes(String(extension).toLowerCase());
}

/* ------------------------------------------------------------------ */
/* Tolerant YAML frontmatter subset                                    */
/* ------------------------------------------------------------------ */

function stripQuotes(value) {
  const text = value.trim();
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return text.slice(1, -1);
    }
  }
  return text;
}

function scalarValue(raw) {
  const text = raw.trim();
  if (text === '') return '';
  if (text === 'null' || text === '~') return null;
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10);
  if (/^-?\d*\.\d+$/.test(text)) return Number.parseFloat(text);
  if (text.startsWith('[') && text.endsWith(']')) {
    const inner = text.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((part) => scalarValue(part));
  }
  return stripQuotes(text);
}

function splitKey(line) {
  const match = /^([^:#]+):(.*)$/.exec(line);
  if (!match) return null;
  return { key: match[1].trim(), rest: match[2] };
}

/**
 * Parse the tolerant YAML subset used by portable title Markdown.
 * Returns a plain object plus per-key line numbers and duplicate-key reports.
 */
export function parseYamlSubset(yamlText, { baseLine = 0 } = {}) {
  const lines = yamlText.split(/\r?\n/);
  const duplicates = [];
  const keyLines = new Map();
  let index = 0;
  let fatal = null;

  function indentOf(line) {
    const match = /^ */.exec(line);
    return match ? match[0].length : 0;
  }

  function parseBlock(minIndent) {
    const map = {};
    const list = [];
    let mode = null;
    while (index < lines.length) {
      const line = lines[index];
      if (line.trim() === '' || line.trimStart().startsWith('#')) {
        index += 1;
        continue;
      }
      const indent = indentOf(line);
      if (indent < minIndent) break;
      const trimmed = line.trim();

      if (trimmed.startsWith('- ') || trimmed === '-') {
        if (mode === 'map') break;
        mode = 'list';
        const itemText = trimmed === '-' ? '' : trimmed.slice(2);
        index += 1;
        const entry = splitKey(itemText);
        if (entry && entry.rest.trim() !== '' && !entry.rest.trim().startsWith('#')) {
          const item = {};
          item[entry.key] = scalarValue(entry.rest);
          keyLines.set(`${entry.key}@${index - 1 + baseLine}`, index - 1 + baseLine);
          const nested = parseBlock(indent + 1);
          Object.assign(item, nested.value);
          list.push(item);
        } else if (entry) {
          const item = {};
          const nested = parseBlock(indent + 1);
          item[entry.key] = nested.value;
          list.push(item);
        } else {
          list.push(scalarValue(itemText));
        }
        continue;
      }

      const entry = splitKey(line);
      if (!entry) {
        fatal = `line ${index + 1 + baseLine}: cannot parse "${trimmed}"`;
        index += 1;
        continue;
      }
      if (mode === 'list') break;
      mode = 'map';
      if (Object.hasOwn(map, entry.key)) {
        duplicates.push({
          key: entry.key,
          line: index + 1 + baseLine,
          firstLine: keyLines.get(entry.key) ?? null,
        });
      }
      keyLines.set(entry.key, index + 1 + baseLine);
      index += 1;
      if (entry.rest.trim() === '' || entry.rest.trim().startsWith('#')) {
        const nested = parseBlock(indent + 1);
        map[entry.key] = nested.value;
      } else {
        map[entry.key] = scalarValue(entry.rest);
      }
    }
    if (mode === 'list') return { value: list };
    return { value: map };
  }

  const result = parseBlock(0).value;
  return {
    value: result,
    keyLines,
    duplicates,
    fatal,
  };
}

/** Split a title Markdown file into frontmatter and body without altering either. */
export function splitFrontmatter(text) {
  const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (!normalized.startsWith('---')) {
    return { ok: false, code: FIELD_ERROR_CODES.NO_FRONTMATTER };
  }
  const firstBreak = normalized.indexOf('\n');
  if (firstBreak === -1) {
    return { ok: false, code: FIELD_ERROR_CODES.NO_FRONTMATTER };
  }
  const rest = normalized.slice(firstBreak + 1);
  // Consume the closing delimiter's own line terminator so the body is exactly
  // the bytes that followed the frontmatter block.
  const closing = /^---[ \t]*\r?\n/m.exec(rest);
  if (!closing) {
    return { ok: false, code: FIELD_ERROR_CODES.NO_FRONTMATTER };
  }
  const yamlText = rest.slice(0, closing.index).replace(/\r?\n$/, '');
  const body = rest.slice(closing.index + closing[0].length);
  return {
    ok: true,
    yamlText,
    body,
    yamlStartLine: 2,
    bodyStartLine: 2 + yamlText.split(/\r?\n/).length + 1,
    eol: normalized.includes('\r\n') ? '\r\n' : '\n',
    hadBom: text.charCodeAt(0) === 0xfeff,
  };
}

/* ------------------------------------------------------------------ */
/* Field profiles and validation                                       */
/* ------------------------------------------------------------------ */

function diagnostic(code, { relativePath, key, field, line, expected, actual, severity, recoverability, message }) {
  return {
    code,
    relativePath,
    key: key ?? null,
    field: field ?? key ?? null,
    line: line ?? null,
    expected: expected ?? null,
    actual: actual ?? null,
    severity: severity ?? 'error',
    recoverability: recoverability ?? 'repairable',
    message,
  };
}

function asString(value) {
  return typeof value === 'string' ? value : null;
}

function validateRating(value) {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'number' || Number.isNaN(value)) return false;
  return value >= 0 && value <= 5;
}

function looksLikeDate(value) {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;
  return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(value.trim());
}

function validateTags(value) {
  if (value === null || value === undefined) return true;
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/**
 * Validate one parsed title. Errors never discard the rest of the record: the
 * caller receives the parsed data alongside every diagnostic.
 */
export function validateTitleRecord(data, {
  relativePath,
  collection = null,
  loadAsset = null,
  keyLines = new Map(),
} = {}) {
  const diagnostics = [];
  const line = (key) => keyLines.get(key) ?? null;

  const schemaVersion = data.schema_version;
  if (schemaVersion !== undefined && schemaVersion !== null) {
    if (typeof schemaVersion !== 'number') {
      diagnostics.push(diagnostic(FIELD_ERROR_CODES.INVALID_FIELD_TYPE, {
        relativePath, key: 'schema_version',
        line: line('schema_version'), expected: 'integer', actual: schemaVersion,
        message: 'schema_version must be an integer.',
      }));
    } else if (!SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion)) {
      diagnostics.push(diagnostic(FIELD_ERROR_CODES.UNSUPPORTED_SCHEMA_VERSION, {
        relativePath, key: 'schema_version',
        line: line('schema_version'),
        expected: SUPPORTED_SCHEMA_VERSIONS.join(' or '), actual: schemaVersion,
        severity: 'warning', recoverability: 'read_only',
        message: 'This title was written by a newer schema version; it is loaded read-only.',
      }));
    }
  }

  const title = asString(data.title);
  if (!title || title.trim() === '') {
    diagnostics.push(diagnostic(FIELD_ERROR_CODES.REQUIRED_FIELD_MISSING, {
      relativePath, key: 'title', line: line('title'),
      expected: 'non-empty string', actual: data.title ?? null,
      recoverability: 'guided_repair',
      message: 'A title is required. It is the human-readable name of the work.',
    }));
  }

  if (data.id !== undefined && data.id !== null) {
    const id = asString(data.id);
    if (!id || !/^(read|watch)-[a-z0-9]{8,}$/i.test(id)) {
      diagnostics.push(diagnostic(FIELD_ERROR_CODES.INVALID_STABLE_ID, {
        relativePath, key: 'id', line: line('id'),
        expected: 'read-<hex> or watch-<hex>', actual: data.id,
        recoverability: 'guided_repair',
        message: 'The stable id is malformed. Identity fields must not be removed.',
      }));
    } else if (collection && !id.toLowerCase().startsWith(`${collection.toLowerCase()}-`)) {
      diagnostics.push(diagnostic(FIELD_ERROR_CODES.INVALID_STABLE_ID, {
        relativePath, key: 'id', line: line('id'),
        expected: `${collection.toLowerCase()}-<hex>`, actual: id,
        recoverability: 'guided_repair',
        message: `The stable id prefix does not match the ${String(collection)} collection.`,
      }));
    }
  }

  if (data.collection !== undefined && data.collection !== null &&
      !COLLECTIONS.includes(data.collection)) {
    diagnostics.push(diagnostic(FIELD_ERROR_CODES.INVALID_ENUM, {
      relativePath, key: 'collection', line: line('collection'),
      expected: COLLECTIONS.join(' or '), actual: data.collection,
      recoverability: 'guided_repair',
      message: 'collection must be Read or Watch.',
    }));
  }

  if (collection === 'Read' && data.status !== undefined && data.status !== null &&
      !READ_STATUSES.includes(data.status)) {
    diagnostics.push(diagnostic(FIELD_ERROR_CODES.INVALID_ENUM, {
      relativePath, key: 'status', line: line('status'),
      expected: READ_STATUSES.join(', '), actual: data.status,
      severity: 'warning',
      message: 'status is not one of the supported Read statuses.',
    }));
  }
  if (collection === 'Watch' && data.status !== undefined && data.status !== null &&
      !WATCH_STATUSES.includes(data.status)) {
    diagnostics.push(diagnostic(FIELD_ERROR_CODES.INVALID_ENUM, {
      relativePath, key: 'status', line: line('status'),
      expected: WATCH_STATUSES.join(', '), actual: data.status,
      severity: 'warning',
      message: 'status is not one of the supported Watch statuses.',
    }));
  }

  if (!validateRating(data.personal_rating)) {
    diagnostics.push(diagnostic(FIELD_ERROR_CODES.INVALID_RATING_RANGE, {
      relativePath, key: 'personal_rating', line: line('personal_rating'),
      expected: 'number from 0 to 5', actual: data.personal_rating,
      message: 'Personal rating must be a number from 0 to 5.',
    }));
  }

  for (const key of ['date_added', 'date_started', 'date_completed', 'added_on']) {
    if (!looksLikeDate(data[key])) {
      diagnostics.push(diagnostic(FIELD_ERROR_CODES.INVALID_DATE, {
        relativePath, key, line: line(key),
        expected: 'YYYY or YYYY-MM or YYYY-MM-DD', actual: data[key],
        severity: 'warning',
        message: `${key} is not a recognizable date.`,
      }));
    }
  }

  for (const key of ['tags', 'authors', 'creators', 'subjects', 'languages', 'countries', 'main_cast']) {
    if (!validateTags(data[key])) {
      diagnostics.push(diagnostic(FIELD_ERROR_CODES.INVALID_LIST, {
        relativePath, key, line: line(key),
        expected: 'list of strings', actual: data[key],
        severity: 'warning',
        message: `${key} should be a list of text values.`,
      }));
    }
  }

  if (data.favorite !== undefined && data.favorite !== null &&
      typeof data.favorite !== 'boolean') {
    diagnostics.push(diagnostic(FIELD_ERROR_CODES.INVALID_FIELD_TYPE, {
      relativePath, key: 'favorite', line: line('favorite'),
      expected: 'true or false', actual: data.favorite,
      severity: 'warning',
      message: 'favorite must be true or false.',
    }));
  }

  // Relative asset references must stay inside the library root. Only
  // path-bearing values are candidates: `files`/`media` entries carry name,
  // format, size and sha256 alongside the path, and treating those sibling
  // values as paths produced false "missing asset" warnings on the real
  // library.
  const candidates = [];
  const collectStrings = (value) => {
    if (typeof value === 'string') candidates.push(value);
    else if (Array.isArray(value)) value.forEach(collectStrings);
    else if (value && typeof value === 'object') {
      for (const key of ['path', 'file', 'src', 'relative_path']) {
        collectStrings(value[key]);
      }
    }
  };
  for (const key of [
    'cover', 'poster', 'notion_entry_image', 'source_asset_full_resolution',
    'entry_image', 'recommendation_evidence', 'shared_evidence', 'social_clip',
  ]) {
    collectStrings(data[key]);
  }
  for (const key of ['files', 'media']) {
    const value = data[key];
    if (Array.isArray(value)) {
      collectStrings(value);
    } else if (value && typeof value === 'object') {
      collectStrings(value);
    }
  }
  if (Array.isArray(data.recommendations)) {
    for (const recommendation of data.recommendations) {
      if (recommendation && typeof recommendation === 'object') {
        collectStrings(recommendation.evidence);
      }
    }
  }

  // A reference is judged from the title's own folder, so a shared-evidence or
  // parent-category path that stays inside the library is legitimate.
  const titleFolder = relativePath
    ? relativePath.split(/[\\/]+/).slice(0, -1).join('/')
    : '';

  for (const candidate of candidates) {
    if (isAbsolute(candidate)) {
      diagnostics.push(diagnostic(FIELD_ERROR_CODES.ABSOLUTE_ASSET_PATH, {
        relativePath, key: 'assets',
        expected: 'relative path', actual: candidate,
        message: 'Asset references must be relative to the library root.',
      }));
      continue;
    }
    const resolved = posix.normalize(posix.join(titleFolder, candidate.replace(/\\/g, '/')));
    if (resolved === '..' || resolved.startsWith('../')) {
      diagnostics.push(diagnostic(FIELD_ERROR_CODES.PATH_ESCAPE, {
        relativePath, key: 'assets',
        expected: 'path inside the library root', actual: candidate,
        message: 'Asset references must not traverse outside the library.',
      }));
      continue;
    }
    if (typeof loadAsset === 'function' && !loadAsset(candidate)) {
      diagnostics.push(diagnostic(FIELD_ERROR_CODES.BROKEN_RELATIVE_PATH, {
        relativePath, key: 'assets',
        expected: 'existing file', actual: candidate,
        severity: 'warning',
        message: 'The referenced file was not found next to this title.',
      }));
    }
  }

  return diagnostics;
}

/**
 * Parse and validate one portable title. Always returns the parsed fields and
 * body so a single bad optional field cannot make the title unusable.
 */
export function parseTitleMarkdown(text, {
  relativePath = null,
  collection = null,
  loadAsset = null,
} = {}) {
  const split = splitFrontmatter(text);
  if (!split.ok) {
    return {
      ok: false,
      data: {},
      unknownKeys: {},
      body: text,
      diagnostics: [diagnostic(split.code, {
        relativePath,
        expected: '--- YAML frontmatter ---',
        actual: null,
        recoverability: 'repairable',
        message: 'This file has no readable YAML frontmatter block.',
      })],
    };
  }

  const parsed = parseYamlSubset(split.yamlText, {
    baseLine: split.yamlStartLine - 1,
  });
  const data = parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)
    ? parsed.value
    : {};
  const diagnostics = [];

  if (parsed.fatal) {
    diagnostics.push(diagnostic(FIELD_ERROR_CODES.INVALID_YAML, {
      relativePath,
      expected: 'key: value',
      actual: parsed.fatal,
      recoverability: 'repairable',
      message: `The frontmatter could not be parsed as YAML: ${String(parsed.fatal)}`,
    }));
  }
  for (const duplicate of parsed.duplicates) {
    diagnostics.push(diagnostic(FIELD_ERROR_CODES.DUPLICATE_YAML_KEY, {
      relativePath,
      key: duplicate.key,
      line: duplicate.line,
      expected: 'one occurrence',
      actual: `also defined on line ${duplicate.firstLine}`,
      recoverability: 'repairable',
      message: `The key "${duplicate.key}" appears more than once in this file.`,
    }));
  }

  diagnostics.push(...validateTitleRecord(data, {
    relativePath,
    collection,
    loadAsset,
    keyLines: parsed.keyLines,
  }));

  const known = new Set([
    // identity
    'schema_version', 'id', 'collection',
    // shared
    'category', 'title', 'original_title', 'year', 'type', 'status', 'favorite',
    'personal_rating', 'date_added', 'date_started', 'date_completed', 'tags',
    'recommendations', 'last_metadata_update',
    // Read profile
    'authors', 'editors', 'publisher', 'edition', 'isbn', 'languages', 'subjects',
    'page_count', 'progress_percent', 'current_page', 'current_chapter', 'series',
    'volume', 'files', 'cover',
    // Watch profile
    'countries', 'runtime', 'age_rating', 'director', 'creators', 'writers',
    'main_cast', 'rewatch_count', 'progress', 'media', 'poster', 'external_ids',
    // asset roles recorded by the red-team corrections
    'notion_entry_image', 'source_asset_full_resolution', 'entry_image',
    'recommendation_evidence', 'shared_evidence', 'social_clip', 'review_status',
    'evidence_note',
  ]);
  const unknownKeys = {};
  for (const [key, value] of Object.entries(data)) {
    if (!known.has(key)) unknownKeys[key] = value;
  }

  return {
    ok: !diagnostics.some((item) => item.severity === 'error'),
    data,
    keyLines: parsed.keyLines,
    unknownKeys,
    body: split.body,
    eol: split.eol,
    diagnostics,
  };
}

/**
 * Insert identity keys that are absent. Every other byte of the file, including
 * unknown keys, spacing, ordering and the body, is preserved.
 */
export function buildIdentityPatch(text, { schemaVersion, id, collection }) {
  const split = splitFrontmatter(text);
  if (!split.ok) {
    return { ok: false, reason: split.code, text };
  }
  const parsed = parseYamlSubset(split.yamlText, { baseLine: split.yamlStartLine - 1 });
  const existing = parsed.value && typeof parsed.value === 'object' ? parsed.value : {};

  const additions = [];
  if (existing.schema_version === undefined) {
    additions.push(`schema_version: ${schemaVersion}`);
  }
  if (existing.id === undefined) {
    additions.push(`id: "${id}"`);
  }
  if (existing.collection === undefined) {
    additions.push(`collection: "${collection}"`);
  }
  if (additions.length === 0) {
    return { ok: true, changed: false, text, added: [] };
  }

  const eol = split.eol;
  const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const headerEnd = normalized.indexOf(eol === '\r\n' ? '\r\n' : '\n');
  if (headerEnd === -1) {
    return { ok: false, reason: FIELD_ERROR_CODES.INVALID_YAML, text };
  }
  const insertAt = headerEnd + eol.length;
  const patched = normalized.slice(0, insertAt)
    + additions.join(eol) + eol
    + normalized.slice(insertAt);
  return { ok: true, changed: true, text: patched, added: additions };
}

/** Read every identity field a title currently declares. */
export function readIdentity(text) {
  const split = splitFrontmatter(text);
  if (!split.ok) return { ok: false, code: split.code };
  const parsed = parseYamlSubset(split.yamlText, { baseLine: split.yamlStartLine - 1 });
  const data = parsed.value && typeof parsed.value === 'object' ? parsed.value : {};
  return {
    ok: true,
    schemaVersion: data.schema_version ?? null,
    id: typeof data.id === 'string' ? data.id : null,
    collection: typeof data.collection === 'string' ? data.collection : null,
    title: typeof data.title === 'string' ? data.title : null,
  };
}

/**
 * Resolve a title asset reference to an absolute path, rejecting escapes.
 * Returns a diagnostic-shaped error instead of throwing.
 */
export function resolveTitleAsset(root, titleFolderRelativePath, reference) {
  if (isAbsolute(reference)) {
    return { ok: false, code: FIELD_ERROR_CODES.ABSOLUTE_ASSET_PATH, reference };
  }
  const absolute = resolve(join(root, titleFolderRelativePath), reference);
  if (!relative(root, absolute) || relative(root, absolute).startsWith('..')) {
    return { ok: false, code: FIELD_ERROR_CODES.PATH_ESCAPE, reference };
  }
  const escaped = assertContained(resolve(root), absolute, {
    relativePath: titleFolderRelativePath,
  });
  if (escaped) return { ok: false, code: escaped.code, reference };
  return { ok: true, absolutePath: absolute };
}

/* ------------------------------------------------------------------ */
/* Surgical writer for app-managed portable fields                     */
/* ------------------------------------------------------------------ */

/**
 * API patch keys that map to one or more frontmatter keys. `summary` is body
 * prose, not frontmatter, and is handled separately.
 */
export const PORTABLE_PATCH_KEYS = Object.freeze([
  'title', 'type', 'status', 'favorite', 'rating', 'personal_rating',
  'tags', 'date_added', 'date_started', 'date_completed', 'rewatch_count',
  'progress_percent', 'current_page', 'current_chapter', 'progress',
  'people', 'authors', 'creators', 'series', 'volume', 'summary',
]);

const PLAIN_DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

function writeDiagnostic(code, field, actual, expected, message) {
  return diagnostic(code, {
    relativePath: null,
    key: field,
    field,
    expected,
    actual,
    severity: 'error',
    recoverability: 'repairable',
    message,
  });
}

function normalizeStatus(value, collection) {
  const allowed = collection === 'Watch' ? WATCH_STATUSES : READ_STATUSES;
  return typeof value === 'string' && allowed.includes(value) ? value : null;
}

function normalizePeopleKey(collection) {
  return collection === 'Watch' ? 'creators' : 'authors';
}

/**
 * Validate and normalize an app patch. A `null` value means "remove this
 * optional field"; it never becomes false or zero.
 */
export function validatePortableFields(fields, { collection = 'Read' } = {}) {
  const diagnostics = [];
  const normalized = {};
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return {
      ok: false,
      normalized,
      diagnostics: [writeDiagnostic(
        FIELD_ERROR_CODES.INVALID_FIELD_TYPE,
        'patch',
        fields,
        'object',
        'The portable field patch must be an object.',
      )],
    };
  }

  const set = (key, value) => {
    normalized[key] = value;
  };
  const reject = (field, actual, expected, message, code = FIELD_ERROR_CODES.INVALID_FIELD_TYPE) => {
    diagnostics.push(writeDiagnostic(code, field, actual, expected, message));
  };

  for (const [key, raw] of Object.entries(fields)) {
    if (!PORTABLE_PATCH_KEYS.includes(key)) {
      reject(
        key,
        raw,
        'supported portable field',
        `"${key}" is not writable in portable title Markdown.`,
        FIELD_ERROR_CODES.UNSUPPORTED_PORTABLE_FIELD,
      );
      continue;
    }
    const value = raw === null ? null : raw;
    switch (key) {
      case 'title':
        if (value !== null && (typeof value !== 'string' || !value.trim())) {
          reject(key, value, 'non-empty string', 'Title must be a non-empty string.');
        } else {
          set('title', value === null ? null : value.trim());
        }
        break;
      case 'type':
        if (value !== null && typeof value !== 'string') {
          reject(key, value, 'string', 'type must be text.');
        } else {
          set('type', value === null ? null : value.trim());
        }
        break;
      case 'status': {
        const status = value === null ? null : normalizeStatus(value, collection);
        if (value !== null && status === null) {
          reject(
            key,
            value,
            (collection === 'Watch' ? WATCH_STATUSES : READ_STATUSES).join(', '),
            'status is not one of the supported statuses.',
            FIELD_ERROR_CODES.INVALID_ENUM,
          );
        } else {
          set('status', status);
        }
        break;
      }
      case 'favorite':
        if (value !== null && typeof value !== 'boolean') {
          reject(key, value, 'true or false', 'favorite must be true or false.');
        } else {
          set('favorite', value);
        }
        break;
      case 'rating':
      case 'personal_rating':
        if (
          value !== null &&
          (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 5)
        ) {
          reject(
            key,
            value,
            'number from 0 to 5',
            'Personal rating must be a number from 0 to 5.',
            FIELD_ERROR_CODES.INVALID_RATING_RANGE,
          );
        } else {
          set('personal_rating', value);
        }
        break;
      case 'tags':
        if (
          value !== null &&
          (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string'))
        ) {
          reject(key, value, 'list of strings', 'tags must be a list of text values.', FIELD_ERROR_CODES.INVALID_LIST);
        } else {
          set('tags', value === null ? null : value.map((entry) => entry.trim()).filter(Boolean));
        }
        break;
      case 'date_added':
      case 'date_started':
      case 'date_completed':
        if (value !== null && (typeof value !== 'string' || !PLAIN_DATE.test(value.trim()))) {
          reject(
            key,
            value,
            'YYYY or YYYY-MM or YYYY-MM-DD',
            `${key} must be a recognizable date.`,
            FIELD_ERROR_CODES.INVALID_DATE,
          );
        } else {
          set(key, value === null ? null : value.trim());
        }
        break;
      case 'rewatch_count':
        if (value !== null && (!Number.isInteger(value) || value < 0)) {
          reject(key, value, 'non-negative integer', 'rewatch_count must be a non-negative integer.');
        } else {
          set('rewatch_count', value);
        }
        break;
      case 'progress_percent':
        if (
          value !== null &&
          (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 100)
        ) {
          reject(key, value, 'number from 0 to 100', 'progress_percent must be from 0 to 100.', FIELD_ERROR_CODES.INVALID_PROGRESS);
        } else {
          set('progress_percent', value);
        }
        break;
      case 'current_page':
        if (value !== null && (!Number.isInteger(value) || value < 0)) {
          reject(key, value, 'non-negative integer', 'current_page must be a non-negative integer.', FIELD_ERROR_CODES.INVALID_PROGRESS);
        } else {
          set('current_page', value);
        }
        break;
      case 'current_chapter':
        if (
          value !== null &&
          !(typeof value === 'string' || Number.isInteger(value))
        ) {
          reject(key, value, 'text or integer', 'current_chapter must be text or an integer.', FIELD_ERROR_CODES.INVALID_PROGRESS);
        } else {
          set('current_chapter', value === null ? null : String(value));
        }
        break;
      case 'progress':
        if (
          value !== null &&
          (typeof value !== 'object' || Array.isArray(value))
        ) {
          reject(key, value, 'object', 'progress must be a structured object.', FIELD_ERROR_CODES.INVALID_PROGRESS);
        } else {
          set('progress', value);
        }
        break;
      case 'people':
        if (
          value !== null &&
          (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string'))
        ) {
          reject(key, value, 'list of strings', 'people must be a list of text values.', FIELD_ERROR_CODES.INVALID_LIST);
        } else {
          set(
            normalizePeopleKey(collection),
            value === null ? null : value.map((entry) => entry.trim()).filter(Boolean),
          );
        }
        break;
      case 'authors':
      case 'creators':
        if (
          value !== null &&
          (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string'))
        ) {
          reject(key, value, 'list of strings', `${key} must be a list of text values.`, FIELD_ERROR_CODES.INVALID_LIST);
        } else {
          set(key, value === null ? null : value.map((entry) => entry.trim()).filter(Boolean));
        }
        break;
      case 'series':
        if (
          value !== null &&
          (typeof value !== 'object' ||
            typeof value.name !== 'string' ||
            (typeof value.position !== 'string' && typeof value.position !== 'number'))
        ) {
          reject(key, value, '{ name, position }', 'series must contain a name and position.');
        } else {
          const name = value === null ? '' : value.name.trim();
          set('series', name || null);
          set('volume', name ? String(value.position ?? '') : null);
        }
        break;
      case 'volume':
        if (
          value !== null &&
          !(typeof value === 'string' || typeof value === 'number')
        ) {
          reject(key, value, 'text or number', 'volume must be text or a number.');
        } else {
          set('volume', value === null ? null : String(value));
        }
        break;
      case 'summary':
        if (value !== null && typeof value !== 'string') {
          reject(key, value, 'text', 'summary must be text.');
        } else {
          set('summary', value);
        }
        break;
      default:
        break;
    }
  }

  return {
    ok: diagnostics.length === 0,
    normalized,
    diagnostics,
  };
}

function quoteYamlString(value) {
  return JSON.stringify(value);
}

function serializeYamlScalar(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'string') return quoteYamlString(value);
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    return '{}';
  }
  return quoteYamlString(String(value));
}

function serializeYamlBlock(key, value, eol, indent = '') {
  if (Array.isArray(value)) {
    if (value.length === 0) return `${key}: []`;
    return [
      `${key}:`,
      ...value.map((entry) => `${indent}  - ${serializeYamlScalar(entry)}`),
    ].join(eol);
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return `${key}: {}`;
    return [
      `${key}:`,
      ...entries.map(([childKey, childValue]) => {
        if (Array.isArray(childValue)) {
          return `${indent}  ${childKey}:${eol}${childValue
            .map((entry) => `${indent}    - ${serializeYamlScalar(entry)}`)
            .join(eol)}`;
        }
        if (childValue && typeof childValue === 'object') {
          return `${indent}  ${childKey}: ${serializeYamlScalar(childValue)}`;
        }
        return `${indent}  ${childKey}: ${serializeYamlScalar(childValue)}`;
      }),
    ].join(eol);
  }
  return `${key}: ${serializeYamlScalar(value)}`;
}

function findTopLevelBlock(lines, key) {
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([^:#]+):(.*)$/.exec(lines[index]);
    if (!match || match[1].trim() !== key) continue;
    let end = index + 1;
    while (end < lines.length) {
      const line = lines[end];
      if (/^\s+\S/.test(line)) {
        end += 1;
        continue;
      }
      if (
        line.trim() === '' &&
        end + 1 < lines.length &&
        /^\s+\S/.test(lines[end + 1])
      ) {
        end += 1;
        continue;
      }
      break;
    }
    return { start: index, end };
  }
  return null;
}

/**
 * Replace only the named frontmatter keys and, when requested, one prose body
 * section. Unknown keys, comments, ordering and the rest of the body survive.
 */
export function buildPortableMarkdownPatch(text, {
  fields = {},
  body = {},
} = {}, { collection = 'Read' } = {}) {
  const checked = validatePortableFields(fields, { collection });
  if (!checked.ok) {
    return {
      ok: false,
      reason: 'INVALID_FIELDS',
      text,
      changedKeys: [],
      diagnostics: checked.diagnostics,
    };
  }
  if (Object.hasOwn(checked.normalized, 'summary')) {
    body = { ...body, summary: checked.normalized.summary };
  }
  const split = splitFrontmatter(text);
  if (!split.ok) {
    return {
      ok: false,
      reason: split.code,
      text,
      changedKeys: [],
      diagnostics: [writeDiagnostic(
        split.code,
        null,
        null,
        '--- YAML frontmatter ---',
        'This file has no readable YAML frontmatter block.',
      )],
    };
  }

  const eol = split.eol;
  const lines = split.yamlText === '' ? [] : split.yamlText.split(/\r?\n/);
  const changedKeys = [];
  for (const [key, value] of Object.entries(checked.normalized)) {
    if (key === 'summary') continue; // body prose
    const block = value === null ? null : serializeYamlBlock(key, value, eol).split(eol);
    const existing = findTopLevelBlock(lines, key);
    if (existing) {
      if (block === null) {
        lines.splice(existing.start, existing.end - existing.start);
      } else {
        lines.splice(existing.start, existing.end - existing.start, ...block);
      }
    } else if (block !== null) {
      lines.push(...block);
    }
    changedKeys.push(key);
  }

  let bodyText = split.body;
  if (Object.hasOwn(body, 'summary')) {
    const summary = body.summary;
    if (typeof summary !== 'string') {
      return {
        ok: false,
        reason: 'INVALID_FIELDS',
        text,
        changedKeys: [],
        diagnostics: [writeDiagnostic(
          FIELD_ERROR_CODES.INVALID_FIELD_TYPE,
          'summary',
          summary,
          'text',
          'summary must be text.',
        )],
      };
    }
    bodyText = replaceBodySection(
      bodyText,
      collection === 'Watch' ? 'My Description' : 'Overview',
      summary,
      eol,
    );
    changedKeys.push('summary');
  }

  const yamlText = lines.join(eol);
  const prefix = split.hadBom ? '\ufeff' : '';
  const patched = `${prefix}---${eol}${yamlText}${eol}---${eol}${bodyText}`;
  return {
    ok: true,
    text: patched,
    changedKeys,
    diagnostics: [],
  };
}

/** Read one `## Heading` prose section without interpreting its content. */
export function readBodySection(body, heading) {
  const match = new RegExp(`^##[ \\t]+${escapeRegExp(heading)}[ \\t]*$`, 'm').exec(body);
  if (!match) return '';
  const contentStart = match.index + match[0].length;
  const rest = body.slice(contentStart);
  const next = /^#{1,2}[ \t]+/m.exec(rest);
  const contentEnd = next ? contentStart + next.index : body.length;
  return body.slice(contentStart, contentEnd).trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace one `## Heading` prose section, creating it only when content is real. */
export function replaceBodySection(body, heading, content, eol = '\n') {
  const clean = typeof content === 'string' ? content.trim() : '';
  const match = new RegExp(`^##[ \\t]+${escapeRegExp(heading)}[ \\t]*$`, 'm').exec(body);
  if (!match) {
    if (!clean) return body;
    const suffix = body.endsWith(eol) ? '' : eol;
    return `${body}${suffix}${eol}## ${heading}${eol}${eol}${clean}${eol}`;
  }
  const contentStart = match.index + match[0].length;
  const rest = body.slice(contentStart);
  const next = /^#{1,2}[ \t]+/m.exec(rest);
  const contentEnd = next ? contentStart + next.index : body.length;
  const replacement = clean ? `${eol}${eol}${clean}${eol}${eol}` : `${eol}${eol}`;
  return body.slice(0, contentStart) + replacement + body.slice(contentEnd);
}
