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
  'to_read', 'reading', 'completed', 'paused', 'dropped', 'reference', 'rereading',
]);
export const WATCH_STATUSES = Object.freeze([
  'planned', 'watching', 'completed', 'paused', 'dropped', 'rewatching',
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

  // Relative asset references must stay inside the library root.
  const candidates = [];
  const collect = (value) => {
    if (typeof value === 'string') candidates.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') {
      Object.values(value).forEach(collect);
    }
  };
  collect(data.cover);
  collect(data.poster);
  collect(data.files);
  collect(data.media);
  collect(data.notion_entry_image);
  collect(data.source_asset_full_resolution);

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
