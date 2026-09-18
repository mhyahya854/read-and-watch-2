/**
 * Portable title Markdown -> runtime SQLite rebuild.
 *
 * The canonical portable library is discovered and parsed by the existing
 * portable-library/portable-metadata modules; this module never adds a second
 * scanner or parser. It projects the durable Markdown records into the existing
 * runtime tables transactionally.
 *
 * Ownership:
 *   - Markdown/filesystem: durable portable title record
 *   - SQLite: optimized runtime/query/conflict state, rebuildable from Markdown
 *   - notes/annotations/canvases: their existing file-first/runtime stores are
 *     never deleted by a rebuild
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  assertContained,
  discoverOrganizedLibrary,
  toLongPath,
} from './portable-library.mjs';
import {
  isImageExtension,
  isReadableExtension,
  parseTitleMarkdown,
  readBodySection,
  readIdentity,
  resolveTitleAsset,
} from './portable-metadata.mjs';
import { applyRuntimeSchema } from './runtime-schema.mjs';

const READABLE_EXTENSIONS = new Set([
  '.pdf', '.epub', '.doc', '.docx', '.chm', '.txt', '.md', '.markdown',
  '.mobi', '.azw', '.azw3', '.fb2', '.fbz', '.cbz',
]);
const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v', '.mpg', '.mpeg',
]);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.flac', '.ogg', '.wav']);
const SUBTITLE_EXTENSIONS = new Set(['.srt', '.vtt', '.ass', '.ssa']);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function stableId(prefix, value) {
  return `${prefix}-${sha256(value).slice(0, 32)}`;
}

function tableExists(database, name) {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(name),
  );
}

function getPortableProperty(database, itemId, key) {
  const row = database
    .prepare(
      "SELECT value_json FROM item_properties WHERE item_id=? AND namespace='portable' AND property_key=?",
    )
    .get(itemId, key);
  if (!row) return null;
  try {
    return JSON.parse(row.value_json);
  } catch {
    return null;
  }
}

export function isPortableItem(database, itemId) {
  return Boolean(getPortableProperty(database, itemId, 'markdown_relative_path'));
}

export function getPortableMarker(database, itemId) {
  return {
    markdownRelativePath: getPortableProperty(database, itemId, 'markdown_relative_path'),
    folderRelativePath: getPortableProperty(database, itemId, 'folder_relative_path'),
    category: getPortableProperty(database, itemId, 'category'),
    markdownSha256: getPortableProperty(database, itemId, 'markdown_sha256'),
    contentHash: getPortableProperty(database, itemId, 'content_hash'),
  };
}

function setMeta(database, key, value) {
  database
    .prepare(
      `INSERT INTO library_meta(key, value_json) VALUES(?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json`,
    )
    .run(key, JSON.stringify(value));
}

function normalizeRootRelative(root, absolute) {
  const fromRoot = relative(root, absolute);
  if (!fromRoot || fromRoot.startsWith('..') || isAbsolute(fromRoot)) return null;
  return fromRoot.split('\\').join('/');
}

function firstString(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstString(entry);
      if (found) return found;
    }
  }
  return null;
}

function assetCandidate(entry) {
  if (typeof entry === 'string') return { reference: entry };
  if (entry && typeof entry === 'object') {
    const reference = entry.path ?? entry.file ?? entry.src ?? entry.relative_path;
    return typeof reference === 'string' ? { ...entry, reference } : null;
  }
  return null;
}

function resolveAsset(root, title, reference) {
  const resolved = resolveTitleAsset(root, title.relativeFolderPath, reference);
  if (!resolved.ok) {
    return {
      ok: false,
      code: resolved.code,
      reference,
      message: `Asset reference "${reference}" is not safely contained in the library.`,
    };
  }
  const rootRelative = normalizeRootRelative(root, resolved.absolutePath);
  if (!rootRelative) {
    return {
      ok: false,
      code: 'PATH_ESCAPE',
      reference,
      message: `Asset reference "${reference}" escapes the library root.`,
    };
  }
  return { ok: true, absolutePath: resolved.absolutePath, relativePath: rootRelative };
}

function assetRolesFor({ collection, extension, readable, image, cover, preview, evidence }) {
  const roles = new Set();
  if (cover) roles.add('cover');
  if (preview) roles.add('preview');
  if (evidence) roles.add('image');
  if (readable) {
    roles.add('reading_format');
    roles.add('catalog_media');
  } else if (collection === 'read') {
    roles.add('catalog_media');
  } else if (VIDEO_EXTENSIONS.has(extension) || AUDIO_EXTENSIONS.has(extension)) {
    roles.add('catalog_media');
  } else if (image) {
    roles.add('image');
  } else if (SUBTITLE_EXTENSIONS.has(extension)) {
    roles.add('attachment');
  } else {
    roles.add('attachment');
  }
  if (image) roles.add('image');
  return [...roles];
}

function buildAssetProjection(root, title, reference, options = {}) {
  const resolved = resolveAsset(root, title, reference);
  if (!resolved.ok) return { diagnostic: resolved };
  const extension = extname(resolved.relativePath).toLowerCase();
  const image = isImageExtension(extension);
  const readable = isReadableExtension(extension) && READABLE_EXTENSIONS.has(extension);
  const roles = assetRolesFor({
    collection: title.collection.toLowerCase(),
    extension,
    readable,
    image,
    cover: Boolean(options.cover),
    preview: Boolean(options.preview),
    evidence: Boolean(options.evidence),
  });
  const declaredSize = Number.isInteger(options.byteSize) && options.byteSize >= 0
    ? options.byteSize
    : null;
  const stat = existsSync(toLongPath(resolved.absolutePath))
    ? statSync(toLongPath(resolved.absolutePath))
    : null;
  const declaredHash = typeof options.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(options.sha256)
    ? options.sha256.toLowerCase()
    : null;
  const format = typeof options.format === 'string' && options.format.trim()
    ? options.format.trim().toUpperCase()
    : extension.replace('.', '').toUpperCase();
  return {
    asset: {
      id: stableId('asset', `${title.id ?? title.relativeMarkdownPath}\0${resolved.relativePath}`),
      relativePath: resolved.relativePath,
      absolutePath: resolved.absolutePath,
      displayName: typeof options.displayName === 'string' && options.displayName.trim()
        ? options.displayName.trim()
        : basename(resolved.relativePath),
      extension,
      format,
      mediaType: null,
      byteSize: stat?.isFile() ? stat.size : declaredSize,
      sha256: declaredHash,
      sourceSha256: declaredHash,
      roles,
      isPrimary: false,
    },
    diagnostics: declaredSize !== null && stat?.isFile() && stat.size !== declaredSize
      ? [{
          code: 'DECLARED_SIZE_MISMATCH',
          severity: 'warning',
          relativePath: title.relativeMarkdownPath,
          message: `Declared size ${declaredSize} differs from the file's actual size ${stat.size}.`,
        }]
      : [],
  };
}

function enumerateWatchFolderAssets(root, title) {
  const folderAbsolute = resolve(root, title.relativeFolderPath);
  const candidates = [];
  const folders = [
    { absolute: folderAbsolute, prefix: '' },
    { absolute: join(folderAbsolute, 'Media'), prefix: 'Media/' },
  ];
  for (const folder of folders) {
    if (!existsSync(toLongPath(folder.absolute))) continue;
    let entries;
    try {
      entries = readdirSync(toLongPath(folder.absolute), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) continue;
      if (!folder.prefix && entry.name.toLowerCase().endsWith('.md')) continue;
      const absolute = join(folder.absolute, entry.name);
      const escaped = assertContained(resolve(root), absolute, {
        relativePath: title.relativeMarkdownPath,
      });
      if (escaped) continue;
      candidates.push({
        reference: `${folder.prefix}${entry.name}`,
        displayName: entry.name,
      });
    }
  }
  return candidates;
}

/**
 * Build the runtime projection for one parsed title. Pure: no database writes.
 */
export function projectPortableTitle(root, title, text, buffer, parsed = null) {
  const record = parsed ?? parseTitleMarkdown(text, {
    relativePath: title.relativeMarkdownPath,
    collection: title.collection,
  });
  const data = record.data ?? {};
  const collection = title.collection.toLowerCase();
  const diagnostics = [...record.diagnostics];
  const assets = [];
  const seenPaths = new Set();

  const addAsset = (reference, options = {}) => {
    if (!reference) return null;
    const built = buildAssetProjection(root, title, reference, options);
    diagnostics.push(...built.diagnostics);
    if (!built.asset) {
      if (built.diagnostic) {
        diagnostics.push({
          code: built.diagnostic.code ?? 'BROKEN_RELATIVE_PATH',
          severity: 'warning',
          relativePath: title.relativeMarkdownPath,
          key: 'assets',
          actual: reference,
          message: built.diagnostic.message,
        });
      }
      return null;
    }
    if (seenPaths.has(built.asset.relativePath)) return built.asset;
    seenPaths.add(built.asset.relativePath);
    assets.push(built.asset);
    return built.asset;
  };

  const files = Array.isArray(data.files) ? data.files : [];
  for (const rawEntry of files) {
    const entry = assetCandidate(rawEntry);
    if (!entry) continue;
    addAsset(entry.reference, {
      displayName: entry.name,
      format: entry.format,
      byteSize: entry.size,
      sha256: entry.sha256,
    });
  }
  if (collection === 'watch') {
    for (const entry of enumerateWatchFolderAssets(root, title)) {
      addAsset(entry.reference, { displayName: entry.displayName });
    }
  }

  const coverReference = firstString(data.poster) ?? firstString(data.notion_entry_image) ?? null;
  const previewReference = firstString(data.source_asset_full_resolution) ?? coverReference;
  const coverAsset = addAsset(coverReference, { cover: true });
  const previewAsset = previewReference === coverReference
    ? coverAsset
    : addAsset(previewReference, { preview: true });
  if (coverAsset) coverAsset.roles = [...new Set([...coverAsset.roles, 'cover'])];
  if (previewAsset) previewAsset.roles = [...new Set([...previewAsset.roles, 'preview'])];

  if (Array.isArray(data.recommendations)) {
    for (const recommendation of data.recommendations) {
      if (recommendation && typeof recommendation === 'object') {
        addAsset(recommendation.evidence, { evidence: true });
      }
    }
  }

  const primary = assets.find((asset) => asset.roles.includes('reading_format')) ?? null;
  if (primary) primary.isPrimary = true;

  const summary = readBodySection(
    record.body ?? '',
    collection === 'watch' ? 'My Description' : 'Overview',
  );
  const projection = {
    id: data.id,
    collection,
    category: title.category,
    folderRelativePath: title.relativeFolderPath,
    markdownRelativePath: title.relativeMarkdownPath,
    markdownSha256: sha256(buffer),
    title: typeof data.title === 'string' ? data.title : '',
    type: typeof data.type === 'string' ? data.type : '',
    status: typeof data.status === 'string' ? data.status : '',
    rating: typeof data.personal_rating === 'number' ? data.personal_rating : null,
    favorite: Object.hasOwn(data, 'favorite') ? data.favorite : null,
    summary,
    added: typeof data.date_added === 'string' ? data.date_added : '',
    authors: Array.isArray(data.authors) ? data.authors.filter((entry) => typeof entry === 'string') : [],
    creators: Array.isArray(data.creators) ? data.creators.filter((entry) => typeof entry === 'string') : [],
    tags: Array.isArray(data.tags) ? data.tags.filter((entry) => typeof entry === 'string') : [],
    series: typeof data.series === 'string' && data.series.trim()
      ? {
          name: data.series.trim(),
          position: typeof data.volume === 'string' || typeof data.volume === 'number'
            ? String(data.volume)
            : '',
        }
      : null,
    personal: {
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
    },
    pageCount: Number.isInteger(data.page_count) && data.page_count >= 0 ? data.page_count : null,
    assets,
    cover: coverAsset?.relativePath ?? null,
    preview: previewAsset?.relativePath ?? null,
    diagnostics,
  };
  projection.contentHash = sha256(canonicalJson({ ...projection, contentHash: null }));
  return projection;
}

function readTitleSync(root, title) {
  const absolute = resolve(root, title.relativeMarkdownPath);
  const escaped = assertContained(resolve(root), absolute, {
    relativePath: title.relativeMarkdownPath,
  });
  if (escaped) return { ok: false, diagnostic: escaped };
  try {
    const buffer = readFileSync(toLongPath(absolute));
    return {
      ok: true,
      buffer,
      text: buffer.toString('utf8'),
      absolutePath: absolute,
    };
  } catch (error) {
    return {
      ok: false,
      diagnostic: {
        code: error?.code === 'ENOENT' ? 'TITLE_MARKDOWN_MISSING' : 'IO_ERROR',
        severity: 'error',
        relativePath: title.relativeMarkdownPath,
        message: `${error?.code ?? 'ERROR'}: ${error?.message ?? String(error)}`,
      },
    };
  }
}

function identityErrors(identity, title) {
  const diagnostics = [];
  if (!identity.ok) {
    diagnostics.push({
      code: identity.code ?? 'NO_FRONTMATTER',
      severity: 'error',
      relativePath: title.relativeMarkdownPath,
      message: 'The title has no readable identity frontmatter.',
    });
    return diagnostics;
  }
  if (identity.schemaVersion !== 1) {
    diagnostics.push({
      code: 'REQUIRED_FIELD_MISSING',
      severity: 'error',
      relativePath: title.relativeMarkdownPath,
      key: 'schema_version',
      actual: identity.schemaVersion,
      message: 'schema_version 1 is required for a writable portable title.',
    });
  }
  if (typeof identity.id !== 'string' || !/^(read|watch)-[0-9a-f]{8,64}$/i.test(identity.id)) {
    diagnostics.push({
      code: 'INVALID_STABLE_ID',
      severity: 'error',
      relativePath: title.relativeMarkdownPath,
      key: 'id',
      actual: identity.id,
      message: 'A stable id is required and must be read-/watch- plus hexadecimal characters.',
    });
  } else if (!identity.id.toLowerCase().startsWith(`${title.collection.toLowerCase()}-`)) {
    diagnostics.push({
      code: 'INVALID_STABLE_ID',
      severity: 'error',
      relativePath: title.relativeMarkdownPath,
      key: 'id',
      actual: identity.id,
      message: 'The stable id prefix does not match the collection folder.',
    });
  }
  if (identity.collection !== title.collection) {
    diagnostics.push({
      code: 'INVALID_ENUM',
      severity: 'error',
      relativePath: title.relativeMarkdownPath,
      key: 'collection',
      actual: identity.collection,
      message: `collection must match the physical ${title.collection} folder.`,
    });
  }
  return diagnostics;
}

/**
 * Discover and parse the portable library without touching the database.
 * Returns `{ ok, fatal, projections, skipped, diagnostics, counts }`.
 */
export async function planPortableRebuild(root) {
  const discovery = await discoverOrganizedLibrary(root);
  const diagnostics = [...discovery.diagnostics];
  const rootDiagnostics = discovery.diagnostics.filter((entry) =>
    ['ROOT_NOT_FOUND', 'ROOT_NOT_DIRECTORY', 'ROOT_INSIDE_REPOSITORY'].includes(entry.code),
  );
  if (rootDiagnostics.length > 0) {
    return {
      ok: false,
      fatal: true,
      root: discovery.root,
      projections: [],
      skipped: [],
      diagnostics,
      counts: { read: 0, watch: 0, total: 0 },
    };
  }

  const projections = [];
  const skipped = [];
  const seenIds = new Map();
  const duplicateIds = [];

  for (const title of discovery.titles) {
    const loaded = readTitleSync(root, title);
    if (!loaded.ok) {
      skipped.push({
        relativePath: title.relativeMarkdownPath,
        diagnostics: [loaded.diagnostic],
      });
      diagnostics.push(loaded.diagnostic);
      continue;
    }
    const identity = readIdentity(loaded.text);
    const identityProblems = identityErrors(identity, title);
    if (identityProblems.length > 0) {
      skipped.push({ relativePath: title.relativeMarkdownPath, diagnostics: identityProblems });
      diagnostics.push(...identityProblems);
      continue;
    }
    const parsed = parseTitleMarkdown(loaded.text, {
      relativePath: title.relativeMarkdownPath,
      collection: title.collection,
    });
    const errors = parsed.diagnostics.filter((entry) => entry.severity === 'error');
    if (errors.length > 0) {
      skipped.push({ relativePath: title.relativeMarkdownPath, diagnostics: parsed.diagnostics });
      diagnostics.push(...parsed.diagnostics);
      continue;
    }
    const projection = projectPortableTitle(root, title, loaded.text, loaded.buffer, parsed);
    diagnostics.push(...projection.diagnostics);
    const earlier = seenIds.get(projection.id);
    if (earlier) {
      duplicateIds.push({ id: projection.id, first: earlier, second: title.relativeMarkdownPath });
    } else {
      seenIds.set(projection.id, title.relativeMarkdownPath);
    }
    projections.push(projection);
  }

  if (duplicateIds.length > 0) {
    return {
      ok: false,
      fatal: true,
      root: discovery.root,
      projections: [],
      skipped,
      diagnostics,
      duplicateIds,
      counts: discovery.counts,
    };
  }

  return {
    ok: true,
    fatal: false,
    root: discovery.root,
      projections,
      skipped,
      diagnostics,
      discoveryDiagnostics: discovery.diagnostics.length,
      partial: skipped.length > 0 || discovery.diagnostics.length > 0,
    counts: {
      read: projections.filter((entry) => entry.collection === 'read').length,
      watch: projections.filter((entry) => entry.collection === 'watch').length,
      total: projections.length,
    },
  };
}

function removeAssetIfUnreferenced(database, assetId) {
  if (tableExists(database, 'annotations')) {
    const referenced = database
      .prepare('SELECT count(*) AS n FROM annotations WHERE asset_id=?')
      .get(assetId);
    if (referenced?.n > 0) return false;
  }
  database.prepare('DELETE FROM item_assets WHERE id=?').run(assetId);
  return true;
}

function applyAssets(database, projection, diagnostics) {
  const desiredIds = new Set(projection.assets.map((asset) => asset.id));
  const existing = database
    .prepare('SELECT id, relative_path FROM item_assets WHERE item_id=?')
    .all(projection.id);
  for (const asset of existing) {
    if (!desiredIds.has(asset.id)) {
      if (!removeAssetIfUnreferenced(database, asset.id)) {
        diagnostics.push({
          code: 'STALE_ASSET_RETAINED',
          severity: 'warning',
          relativePath: projection.markdownRelativePath,
          message: 'An asset no longer present in Markdown is still referenced by user annotations and was retained.',
        });
      }
    }
  }

  database.prepare('UPDATE item_assets SET is_primary=0 WHERE item_id=?').run(projection.id);

  for (const [position, asset] of projection.assets.entries()) {
    const samePath = database
      .prepare('SELECT id FROM item_assets WHERE item_id=? AND relative_path=?')
      .get(projection.id, asset.relativePath);
    if (samePath && samePath.id !== asset.id) removeAssetIfUnreferenced(database, samePath.id);
    database
      .prepare(
        `INSERT INTO item_assets(
           id,item_id,provenance_id,relative_path,display_name,media_type,format,
           extension,byte_size,sha256,source_sha256,source_order,is_primary
         ) VALUES(?,?,NULL,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           relative_path=excluded.relative_path,
           display_name=excluded.display_name,
           media_type=excluded.media_type,
           format=excluded.format,
           extension=excluded.extension,
           byte_size=excluded.byte_size,
           sha256=excluded.sha256,
           source_sha256=excluded.source_sha256,
           source_order=excluded.source_order,
           is_primary=excluded.is_primary`,
      )
      .run(
        asset.id,
        projection.id,
        asset.relativePath,
        asset.displayName,
        asset.mediaType,
        asset.format,
        asset.extension,
        asset.byteSize,
        asset.sha256,
        asset.sourceSha256,
        position,
        asset.isPrimary ? 1 : 0,
      );
    database.prepare('DELETE FROM asset_roles WHERE asset_id=?').run(asset.id);
    for (const role of asset.roles) {
      database.prepare('INSERT INTO asset_roles VALUES(?,?)').run(asset.id, role);
    }
  }
}

function applyTags(database, projection) {
  database.prepare('DELETE FROM item_tags WHERE item_id=?').run(projection.id);
  projection.tags.forEach((tag, position) => {
    const tagId = stableId('tag', tag.toLocaleLowerCase());
    database.prepare('INSERT OR IGNORE INTO tags VALUES(?,?)').run(tagId, tag);
    database.prepare('INSERT INTO item_tags VALUES(?,?,?)').run(projection.id, tagId, position);
  });
}

function applyPeople(database, projection) {
  const role = projection.collection === 'read' ? 'author' : 'creator';
  const names = projection.collection === 'read' ? projection.authors : projection.creators;
  database.prepare('DELETE FROM item_people WHERE item_id=? AND role=?').run(projection.id, role);
  names.forEach((name, position) => {
    const personId = stableId('person', name.toLocaleLowerCase());
    database.prepare('INSERT OR IGNORE INTO people VALUES(?,?,?)').run(personId, name, name);
    database.prepare('INSERT INTO item_people VALUES(?,?,?,?)').run(projection.id, personId, role, position);
  });
}

function applySeries(database, projection) {
  if (projection.collection !== 'read') return;
  database.prepare('DELETE FROM read_series WHERE item_id=?').run(projection.id);
  if (!projection.series?.name) return;
  const seriesId = stableId('series', projection.series.name.toLocaleLowerCase());
  database.prepare('INSERT OR IGNORE INTO series VALUES(?,?,?)').run(
    seriesId,
    projection.series.name,
    projection.series.name,
  );
  database.prepare('INSERT INTO read_series VALUES(?,?,?)').run(
    projection.id,
    seriesId,
    projection.series.position ?? '',
  );
}

/**
 * Apply one projection inside the caller's transaction. Returns whether the
 * projection was written and the resulting revision.
 */
export function applyPortableProjection(database, projection, {
  now = new Date().toISOString(),
  nextSourceOrder = 0,
} = {}) {
  const existing = database.prepare('SELECT * FROM items WHERE id=?').get(projection.id);
  const existingHash = getPortableProperty(database, projection.id, 'content_hash');
  if (existing && existingHash === projection.contentHash) {
    return { changed: false, revision: existing.revision, sourceOrder: existing.source_order };
  }
  const pathOwner = database.prepare('SELECT id FROM items WHERE item_path=?').get(
    projection.folderRelativePath,
  );
  if (pathOwner && pathOwner.id !== projection.id) {
    const error = new Error(
      `Portable path "${projection.folderRelativePath}" already belongs to item ${pathOwner.id}.`,
    );
    error.code = 'PORTABLE_ITEM_PATH_CONFLICT';
    throw error;
  }
  if (existing && existing.collection !== projection.collection) {
    const error = new Error(
      `Stable id ${projection.id} already exists as ${existing.collection}, not ${projection.collection}.`,
    );
    error.code = 'PORTABLE_COLLECTION_CONFLICT';
    throw error;
  }

  const revision = existing ? existing.revision + 1 : 1;
  const sourceOrder = existing?.source_order ?? nextSourceOrder;
  const provenanceKind = existing?.provenance_kind ?? 'manual';
  if (existing) {
    database
      .prepare(
        `UPDATE items SET collection=?,source_order=?,item_path=?,title=?,item_type=?,
           status=?,rating=?,summary=?,source_added=?,provenance_kind=?,
           revision=?,updated_at_utc=? WHERE id=?`,
      )
      .run(
        projection.collection,
        sourceOrder,
        projection.folderRelativePath,
        projection.title,
        projection.type,
        projection.status,
        projection.rating,
        projection.summary,
        projection.added,
        provenanceKind,
        revision,
        now,
        projection.id,
      );
  } else {
    database
      .prepare(
        `INSERT INTO items(
           id,collection,source_order,item_path,title,item_type,status,rating,
           summary,source_added,provenance_kind,revision,created_at_utc,updated_at_utc
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        projection.id,
        projection.collection,
        sourceOrder,
        projection.folderRelativePath,
        projection.title,
        projection.type,
        projection.status,
        projection.rating,
        projection.summary,
        projection.added,
        provenanceKind,
        revision,
        now,
        now,
      );
  }

  if (projection.collection === 'read') {
    database
      .prepare(
        `INSERT INTO read_items(item_id,page_count) VALUES(?,?)
         ON CONFLICT(item_id) DO UPDATE SET page_count=excluded.page_count`,
      )
      .run(projection.id, projection.pageCount);
  } else {
    database
      .prepare(
        `INSERT INTO watch_items(item_id,watch_progress_json) VALUES(?,?)
         ON CONFLICT(item_id) DO UPDATE SET watch_progress_json=excluded.watch_progress_json`,
      )
      .run(
        projection.id,
        projection.personal.progress ? JSON.stringify(projection.personal.progress) : null,
      );
  }

  database
    .prepare("DELETE FROM item_properties WHERE item_id=? AND namespace='portable'")
    .run(projection.id);
  const portableProperties = {
    category: projection.category,
    folder_relative_path: projection.folderRelativePath,
    markdown_relative_path: projection.markdownRelativePath,
    markdown_sha256: projection.markdownSha256,
    content_hash: projection.contentHash,
    favorite: projection.favorite,
    date_added: projection.personal.date_added,
    date_started: projection.personal.date_started,
    date_completed: projection.personal.date_completed,
    rewatch_count: projection.personal.rewatch_count,
    progress_percent: projection.personal.progress_percent,
    current_page: projection.personal.current_page,
    current_chapter: projection.personal.current_chapter,
    progress: projection.personal.progress,
  };
  let propertyOrder = 0;
  for (const [key, value] of Object.entries(portableProperties)) {
    if (value === null || value === undefined) continue;
    database
      .prepare(
        `INSERT INTO item_properties(item_id,namespace,property_key,value_type,value_json,source_order)
         VALUES(?, 'portable', ?, ?, ?, ?)`,
      )
      .run(
        projection.id,
        key,
        typeof value === 'string' ? 'string'
          : typeof value === 'number' ? 'number'
            : typeof value === 'boolean' ? 'boolean'
              : 'json',
        JSON.stringify(value),
        propertyOrder,
      );
    propertyOrder += 1;
  }

  for (const [key, value] of Object.entries({
    cover: projection.cover,
    preview: projection.preview,
  })) {
    database
      .prepare("DELETE FROM item_properties WHERE item_id=? AND namespace='catalog_internal' AND property_key=?")
      .run(projection.id, key);
    database
      .prepare(
        `INSERT INTO item_properties(item_id,namespace,property_key,value_type,value_json,source_order)
         VALUES(?, 'catalog_internal', ?, ?, ?, ?)`,
      )
      .run(
        projection.id,
        key,
        value === null ? 'null' : 'string',
        JSON.stringify(value),
        key === 'cover' ? 0 : 1,
      );
  }

  applyTags(database, projection);
  applyPeople(database, projection);
  applySeries(database, projection);

  const assetDiagnostics = [];
  applyAssets(database, projection, assetDiagnostics);

  return {
    changed: true,
    revision,
    sourceOrder,
    assetDiagnostics,
  };
}

/**
 * Rebuild the runtime library from the portable filesystem.
 * The database transaction is all-or-nothing; user-owned tables are never
 * bulk-deleted, and items missing from the portable set are retained.
 */
export async function rebuildPortableLibrary({
  root,
  database,
  databasePath = null,
  searchStore = null,
  apply = true,
  now = new Date().toISOString(),
} = {}) {
  const plan = await planPortableRebuild(root);
  if (!plan.ok) {
    return {
      ok: false,
      status: 'failed',
      root: plan.root,
      counts: plan.counts,
      diagnostics: plan.diagnostics,
      duplicateIds: plan.duplicateIds ?? [],
      skipped: plan.skipped ?? [],
      applied: false,
    };
  }
  if (!apply) {
    return {
      ok: true,
      status: 'dry_run',
      root: plan.root,
      counts: plan.counts,
      diagnostics: plan.diagnostics,
      skipped: plan.skipped,
      applied: false,
    };
  }

  let databaseHandle = database ?? null;
  const ownedDatabase = !databaseHandle && Boolean(databasePath);
  if (!databaseHandle && databasePath) {
    mkdirSync(dirname(databasePath), { recursive: true });
    databaseHandle = new DatabaseSync(databasePath);
  }
  if (!databaseHandle) throw new Error('rebuildPortableLibrary requires a database or databasePath');

  let schema;
  try {
    schema = applyRuntimeSchema(databaseHandle);
    const maxOrder = databaseHandle
      .prepare('SELECT COALESCE(MAX(source_order), -1) AS value FROM items')
      .get()?.value ?? -1;
    let nextSourceOrder = Number(maxOrder) + 1;
    const assetDiagnostics = [];
    let changed = 0;
    databaseHandle.exec('BEGIN IMMEDIATE');
    try {
      if (plan.partial) {
        const pathOwner = databaseHandle
          .prepare('SELECT count(*) AS n FROM items')
          .get();
        if (plan.counts.total === 0 && pathOwner.n > 0) {
          throw Object.assign(
            new Error('The portable library contains no usable titles; existing runtime items were left untouched.'),
            { code: 'PORTABLE_LIBRARY_EMPTY' },
          );
        }
      }
      for (const projection of plan.projections) {
        const result = applyPortableProjection(databaseHandle, projection, {
          now,
          nextSourceOrder,
        });
        if (result.changed) {
          changed += 1;
          nextSourceOrder = Math.max(nextSourceOrder, result.sourceOrder + 1);
        }
        assetDiagnostics.push(...(result.assetDiagnostics ?? []));
      }
      setMeta(databaseHandle, 'catalog_schema_version', 1);
      setMeta(databaseHandle, 'generated_from_import_utc', now);
      setMeta(databaseHandle, 'portable_rebuild_at_utc', now);
      setMeta(databaseHandle, 'portable_rebuild_status', plan.partial ? 'partial' : 'passed');
      setMeta(databaseHandle, 'portable_rebuild_counts', plan.counts);
      setMeta(databaseHandle, 'portable_rebuild_diagnostics', {
        discovery: plan.discoveryDiagnostics,
        skipped: plan.skipped.length,
        total: plan.diagnostics.length,
        assets: assetDiagnostics.length,
      });
      databaseHandle.exec('COMMIT');
    } catch (error) {
      databaseHandle.exec('ROLLBACK');
      throw error;
    }

    let search = null;
    if (searchStore) {
      try {
        search = searchStore.rebuildIndex();
      } catch (error) {
        search = { ok: false, error: error?.message ?? String(error) };
      }
    }
    return {
      ok: true,
      status: plan.partial ? 'partial' : 'passed',
      root: plan.root,
      schemaVersion: schema.schemaVersion,
      counts: plan.counts,
      changed,
      skipped: plan.skipped,
      diagnostics: [...plan.diagnostics, ...assetDiagnostics],
      applied: true,
      search,
    };
  } finally {
    if (ownedDatabase) databaseHandle.close();
  }
}
