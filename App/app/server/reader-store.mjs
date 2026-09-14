import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { createLibraryStore } from './library-store.mjs';

const ITEM_ID_PATTERN = /^(read|watch)-[0-9a-f]{32}$/;
const SUPPORTED_SUFFIXES = new Map([
  ['.epub', 'EPUB'],
  ['.pdf', 'PDF'],
  ['.mobi', 'MOBI'],
  ['.azw', 'AZW'],
  ['.azw3', 'AZW3'],
  ['.fb2', 'FB2'],
  ['.fbz', 'FBZ'],
  ['.cbz', 'CBZ'],
  ['.txt', 'TXT'],
  ['.md', 'MD'],
  ['.markdown', 'MARKDOWN'],
]);
const SPECIAL_SUFFIXES = new Map([
  ['.fb2.zip', 'FBZ'],
  ['.fb.zip', 'FBZ'],
]);

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function assertItemId(itemId) {
  if (typeof itemId !== 'string' || !ITEM_ID_PATTERN.test(itemId)) {
    fail('Invalid item ID');
  }
}

function assertItemIdOrSample(itemId) {
  if (
    typeof itemId !== 'string' ||
    (!ITEM_ID_PATTERN.test(itemId) && !itemId.startsWith('sample-'))
  ) {
    fail('Invalid item ID');
  }
}

function writeAtomic(target, content) {
  mkdirSync(dirname(target), { recursive: true });
  const tmp = join(
    dirname(target),
    `.${basename(target)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  );
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, target);
}

function assertSafeRelativePath(value, label) {
  if (
    typeof value !== 'string' ||
    !value ||
    isAbsolute(value) ||
    /^[a-zA-Z]:/.test(value) ||
    value.includes('\\')
  ) {
    fail(`Unsafe catalog ${label} path`);
  }
  const segments = value.split('/');
  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    fail(`Unsafe catalog ${label} path`);
  }
}

function isInside(root, candidate) {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === '' || (!fromRoot.startsWith('..') && !isAbsolute(fromRoot))
  );
}

function detectFormat(relativePath) {
  const lower = relativePath.toLowerCase();
  for (const [suffix, format] of SPECIAL_SUFFIXES) {
    if (lower.endsWith(suffix)) return { format, supported: true };
  }
  const extension = extname(lower);
  const format = SUPPORTED_SUFFIXES.get(extension);
  if (format) return { format, supported: true };
  return {
    format: extension ? extension.slice(1).toUpperCase() : 'UNKNOWN',
    supported: false,
  };
}

function candidateId(itemId, mediaPath) {
  return createHash('sha256')
    .update(`${itemId}\0${mediaPath}`)
    .digest('hex')
    .slice(0, 24);
}

function fileReady(path) {
  try {
    return path ? statSync(path).isFile() : false;
  } catch {
    return false;
  }
}

export function createReaderStore({
  libraryRoot,
  libraryDatabasePath,
  readerExecutable: _readerExecutable,
  userDataRoot,
  launchReader: _launchReader = () => {},
  searchStore = null,
}) {
  const userRoot = userDataRoot
    ? resolve(userDataRoot)
    : resolve(libraryRoot, '../user-data');
  const libraryStore = createLibraryStore({
    databasePath: libraryDatabasePath,
    readOnly: true,
  });
  const catalog = libraryStore.getCatalog();
  libraryStore.close();
  const itemsById = new Map(catalog.items.map((item) => [item.id, item]));
  const canonicalLibraryRoot = realpathSync(libraryRoot);

  function resolveItem(itemId) {
    assertItemId(itemId);
    const item = itemsById.get(itemId);
    if (!item) fail('Unknown item ID', 404);
    if (item.collection !== 'read' || !itemId.startsWith('read-')) {
      fail('Read items only', 403);
    }
    assertSafeRelativePath(item.itemPath, 'item');
    const itemDirectory = resolve(libraryRoot, dirname(item.itemPath));
    if (!isInside(libraryRoot, itemDirectory)) fail('Unsafe catalog item path');

    const candidates = [];
    const missing = [];
    const unsupported = [];
    for (const media of item.media ?? []) {
      assertSafeRelativePath(media.path, 'media');
      const source = resolve(libraryRoot, media.path);
      if (!isInside(libraryRoot, source) || !isInside(itemDirectory, source)) {
        fail('Unsafe catalog media path');
      }
      const { format, supported } = detectFormat(media.path);
      const display = { name: basename(media.path), format };
      if (!fileReady(source)) {
        if (supported) missing.push(display);
        continue;
      }
      const canonicalSource = realpathSync(source);
      if (
        !isInside(canonicalLibraryRoot, canonicalSource) ||
        !isInside(realpathSync(itemDirectory), canonicalSource)
      ) {
        fail('Unsafe catalog media path');
      }
      if (!supported) {
        unsupported.push(display);
        continue;
      }
      candidates.push({
        ...display,
        id: candidateId(itemId, media.path),
        sizeBytes: statSync(canonicalSource).size,
        source: canonicalSource,
      });
    }
    return { candidates, missing, unsupported };
  }

  function getStatus(itemId) {
    const { candidates, missing, unsupported } = resolveItem(itemId);
    let state = 'no-readable-file';
    if (candidates.length === 1) state = 'available';
    else if (candidates.length > 1) state = 'multiple';
    else if (missing.length) state = 'missing';
    else if (unsupported.length) state = 'unsupported';
    return {
      state,
      readerReady: true,
      candidates: candidates.map(
        ({ source: _source, ...candidate }) => candidate,
      ),
      missing,
      unsupported,
    };
  }

  async function open(itemId, selectedCandidateId) {
    const { candidates } = resolveItem(itemId);
    if (!candidates.length) fail('No supported local book', 409);
    if (candidates.length > 1 && !selectedCandidateId) {
      fail('Choose a book candidate', 409);
    }
    const candidate = selectedCandidateId
      ? candidates.find(({ id }) => id === selectedCandidateId)
      : candidates[0];
    if (!candidate) fail('Unknown book candidate', 400);
    const url = `/reader/${encodeURIComponent(itemId)}${
      selectedCandidateId ? `?candidate=${encodeURIComponent(selectedCandidateId)}` : ''
    }`;
    return {
      ok: true,
      name: candidate.name,
      format: candidate.format,
      url,
    };
  }

  function getFile(itemId, selectedCandidateId) {
    const { candidates } = resolveItem(itemId);
    if (!candidates.length) fail('No supported local book', 404);
    if (candidates.length > 1 && !selectedCandidateId) {
      fail('Choose a book candidate', 400);
    }
    const candidate = selectedCandidateId
      ? candidates.find(({ id }) => id === selectedCandidateId)
      : candidates[0];
    if (!candidate) fail('Unknown book candidate', 404);
    if (!fileReady(candidate.source)) fail('Book file not found', 404);
    return {
      source: candidate.source,
      name: candidate.name,
      format: candidate.format,
      sizeBytes: candidate.sizeBytes,
      candidateId: candidate.id,
    };
  }

  function getReadingState(itemId) {
    assertItemIdOrSample(itemId);
    const target = join(userRoot, 'items', itemId, 'reading-state.json');
    if (!existsSync(target)) return null;
    try {
      return JSON.parse(readFileSync(target, 'utf8'));
    } catch {
      return null;
    }
  }

  function saveReadingState(itemId, state) {
    assertItemIdOrSample(itemId);
    if (!state || typeof state !== 'object') {
      fail('Invalid reading state payload');
    }
    const target = join(userRoot, 'items', itemId, 'reading-state.json');
    const record = {
      ...state,
      updatedAt: new Date().toISOString(),
    };
    writeAtomic(target, JSON.stringify(record, null, 2));
    return { ok: true, state: record };
  }

  function getBookmarks(itemId) {
    assertItemIdOrSample(itemId);
    const target = join(userRoot, 'items', itemId, 'bookmarks.json');
    if (!existsSync(target)) return [];
    try {
      const parsed = JSON.parse(readFileSync(target, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function addBookmark(itemId, bookmark) {
    assertItemIdOrSample(itemId);
    if (!bookmark || typeof bookmark !== 'object') {
      fail('Invalid bookmark payload');
    }
    const target = join(userRoot, 'items', itemId, 'bookmarks.json');
    const list = getBookmarks(itemId);
    const id = bookmark.id || `bm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newBookmark = {
      id,
      itemId,
      location: bookmark.location,
      sourceHash: bookmark.sourceHash,
      createdAt: bookmark.createdAt || new Date().toISOString(),
      ...(bookmark.label ? { label: String(bookmark.label).trim() } : {}),
      ...(bookmark.snippet ? { snippet: String(bookmark.snippet).trim() } : {}),
      ...(typeof bookmark.pageNumber === 'number' ? { pageNumber: bookmark.pageNumber } : {}),
      ...(typeof bookmark.progression === 'number' ? { progression: bookmark.progression } : {}),
    };
    const updated = [newBookmark, ...list.filter((b) => b.id !== id)];
    writeAtomic(target, JSON.stringify(updated, null, 2));
    if (searchStore) {
      try { searchStore.indexBookmark(itemId, newBookmark); } catch {}
    }
    return newBookmark;
  }

  function deleteBookmark(itemId, bookmarkId) {
    assertItemIdOrSample(itemId);
    if (!bookmarkId || typeof bookmarkId !== 'string') {
      fail('Invalid bookmark ID');
    }
    const target = join(userRoot, 'items', itemId, 'bookmarks.json');
    const list = getBookmarks(itemId);
    const updated = list.filter((b) => b.id !== bookmarkId);
    writeAtomic(target, JSON.stringify(updated, null, 2));
    if (searchStore) {
      try { searchStore.removeBookmark(itemId, bookmarkId); } catch {}
    }
    return { ok: true, count: updated.length };
  }

  function getSettings() {
    const target = join(userRoot, 'reader-settings.json');
    const defaults = {
      schemaVersion: 1,
      theme: 'light',
      fontSize: 16,
      fontFamily: 'serif',
      lineHeight: 1.6,
      contentWidth: 'normal',
      layoutMode: 'paginated',
      showHeaderFooter: true,
    };
    if (!existsSync(target)) return defaults;
    try {
      return { ...defaults, ...JSON.parse(readFileSync(target, 'utf8')) };
    } catch {
      return defaults;
    }
  }

  function saveSettings(settings) {
    if (!settings || typeof settings !== 'object') {
      fail('Invalid settings payload');
    }
    const target = join(userRoot, 'reader-settings.json');
    const current = getSettings();
    const updated = {
      ...current,
      ...settings,
      schemaVersion: 1,
    };
    writeAtomic(target, JSON.stringify(updated, null, 2));
    return updated;
  }

  return {
    getStatus,
    open,
    getFile,
    resolveItem,
    getReadingState,
    saveReadingState,
    getBookmarks,
    addBookmark,
    deleteBookmark,
    getSettings,
    saveSettings,
  };
}


