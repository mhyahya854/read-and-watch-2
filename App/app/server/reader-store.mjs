import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
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

function defaultLaunchReader(executable, source) {
  const child = spawn(executable, [source], {
    cwd: dirname(executable),
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
}

function fileReady(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function createReaderStore({
  libraryRoot,
  libraryDatabasePath,
  readerExecutable,
  launchReader = defaultLaunchReader,
}) {
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
      readerReady: fileReady(readerExecutable),
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
    if (!fileReady(readerExecutable))
      fail('Readest runtime is not installed', 503);
    await launchReader(realpathSync(readerExecutable), candidate.source);
    return { ok: true, name: candidate.name, format: candidate.format };
  }

  return { getStatus, open };
}
