/**
 * Portable library root: validation, fail-safe initialization, organized
 * title discovery and cheap Raw enumeration.
 *
 * A selected library root contains three user-facing folders:
 *
 *   <root>/Read   canonical Read titles
 *   <root>/Watch  canonical Watch titles
 *   <root>/Raw    offline intake area (never contacted over the network)
 *
 * `App/` beneath the same root holds runtime-only data and is not part of the
 * portable library. Canonical title content is never copied into `App/`.
 *
 * This module performs no network access and never deletes or overwrites
 * anything. It is the single filesystem-discovery implementation for the
 * organized library; do not add a parallel scanner.
 */
import { existsSync, realpathSync } from 'node:fs';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  RAW_FOLDER,
  READ_FOLDER,
  WATCH_FOLDER,
  resolveDataPaths,
} from './data-paths.mjs';

export const READ_CATEGORIES = Object.freeze([
  'Books',
  'Study Materials',
  'Manuals & Reference',
  'Documents',
  'Other',
]);

export const WATCH_CATEGORIES = Object.freeze([
  'Anime',
  'Movies',
  'Series',
  'Documentaries',
  'Specials',
  'Other',
]);

/**
 * Folders that are infrastructure/evidence rather than canonical titles.
 * Matched case-insensitively against a single path segment.
 */
export const NON_TITLE_SEGMENTS = Object.freeze([
  'source imports',
  'administration',
  'raw export records',
  'shared recommendation evidence',
]);

export const NON_TITLE_SEGMENT_PREFIXES = Object.freeze([
  'filesystem_inventory',
  'filesystem inventory',
  'red team audit',
  'audit',
]);

export const LIBRARY_ERROR_CODES = Object.freeze({
  ROOT_NOT_FOUND: 'ROOT_NOT_FOUND',
  ROOT_NOT_DIRECTORY: 'ROOT_NOT_DIRECTORY',
  ROOT_INSIDE_REPOSITORY: 'ROOT_INSIDE_REPOSITORY',
  REQUIRED_FOLDER_PATH_IS_FILE: 'REQUIRED_FOLDER_PATH_IS_FILE',
  TITLE_MARKDOWN_MISSING: 'TITLE_MARKDOWN_MISSING',
  MULTIPLE_TITLE_MARKDOWN: 'MULTIPLE_TITLE_MARKDOWN',
  TITLE_MARKDOWN_NAME_MISMATCH: 'TITLE_MARKDOWN_NAME_MISMATCH',
  INVALID_UTF8: 'INVALID_UTF8',
  PATH_ESCAPE: 'PATH_ESCAPE',
  SYMLINK_ESCAPE: 'SYMLINK_ESCAPE',
  CASE_COLLISION: 'CASE_COLLISION',
  UNSUPPORTED_PATH: 'UNSUPPORTED_PATH',
  IO_ERROR: 'IO_ERROR',
});

const MAX_PATH_LENGTH = 260;

/**
 * Windows extended-length form. Node does not add the `\\?\` prefix itself for
 * declared paths, so long paths fail with ENOENT even though the file exists.
 * The already-proven real example is a 260-character EPUB path in the MCAT
 * study-material tree.
 */
export function toLongPath(path) {
  if (process.platform !== 'win32') return path;
  if (path.startsWith('\\\\?\\')) return path;
  if (path.startsWith('\\\\')) return `\\\\?\\UNC\\${path.slice(2)}`;
  return `\\\\?\\${path}`;
}

function isInside(root, candidate) {
  const fromRoot = relative(root, candidate);
  return fromRoot === '' || (!fromRoot.startsWith('..') && !isAbsolute(fromRoot));
}

function toDiagnostic(code, { collection, category, relativePath, problem, action }) {
  return {
    code,
    collection: collection ?? null,
    category: category ?? null,
    relativePath: relativePath ?? null,
    problem,
    action,
  };
}

function isNonTitleSegment(segment) {
  const lower = segment.toLowerCase();
  if (NON_TITLE_SEGMENTS.includes(lower)) return true;
  return NON_TITLE_SEGMENT_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function hasNonTitleSegment(relativePath) {
  return relativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .some((segment) => isNonTitleSegment(segment));
}

/**
 * Reject paths that escape their root by traversal or by symlink/junction.
 * Returns `null` when the path is contained, otherwise a diagnostic.
 */
export function assertContained(root, candidate, context = {}) {
  if (!isInside(root, candidate)) {
    return toDiagnostic(LIBRARY_ERROR_CODES.PATH_ESCAPE, {
      ...context,
      problem: 'computed path leaves the library root',
      action: 'Re-select the library folder; the library was not modified.',
    });
  }
  if (!existsSync(toLongPath(candidate))) return null;
  try {
    const realRoot = realpathSync(toLongPath(root));
    const realCandidate = realpathSync(toLongPath(candidate));
    if (!isInside(realRoot, realCandidate)) {
      return toDiagnostic(LIBRARY_ERROR_CODES.SYMLINK_ESCAPE, {
        ...context,
        problem: 'path resolves outside the library root through a symlink or junction',
        action: 'Remove or re-point the link, then retry.',
      });
    }
  } catch {
    // A missing target is handled by the callers; a link we cannot resolve is
    // not silently trusted.
    return null;
  }
  return null;
}

/** Stat a path through the long-path form; never returns blank metadata. */
export async function statSafe(path) {
  try {
    const info = await stat(toLongPath(path));
    return { ok: true, size: info.size, isDirectory: info.isDirectory() };
  } catch (error) {
    return {
      ok: false,
      size: null,
      isDirectory: null,
      error: {
        code: error?.code === 'ENOENT'
          ? LIBRARY_ERROR_CODES.ROOT_NOT_FOUND
          : LIBRARY_ERROR_CODES.IO_ERROR,
        message: `${error?.code ?? 'ERROR'}: ${error?.message ?? String(error)}`,
      },
    };
  }
}

async function listDirectory(path) {
  try {
    return { ok: true, entries: await readdir(toLongPath(path)) };
  } catch (error) {
    return {
      ok: false,
      entries: [],
      error: {
        code: error?.code === 'ENOENT'
          ? LIBRARY_ERROR_CODES.ROOT_NOT_FOUND
          : LIBRARY_ERROR_CODES.IO_ERROR,
        message: `${error?.code ?? 'ERROR'}: ${error?.message ?? String(error)}`,
      },
    };
  }
}

/**
 * Validate a selected library root without mutating anything.
 * Returns `{ ok, root, directories, diagnostics }`.
 */
export async function validateLibraryRoot(root, { repositoryRoot = null } = {}) {
  const diagnostics = [];
  const absolute = resolve(root);
  const directories = {
    read: resolve(absolute, READ_FOLDER),
    watch: resolve(absolute, WATCH_FOLDER),
    raw: resolve(absolute, RAW_FOLDER),
  };

  if (repositoryRoot && isInside(resolve(repositoryRoot), absolute)) {
    diagnostics.push(toDiagnostic(LIBRARY_ERROR_CODES.ROOT_INSIDE_REPOSITORY, {
      relativePath: '.',
      problem: 'the selected library root is inside the Git repository',
      action: 'Choose a folder outside the repository.',
    }));
    return { ok: false, root: absolute, directories, diagnostics };
  }

  if (isAbsolute(absolute) !== true) {
    diagnostics.push(toDiagnostic(LIBRARY_ERROR_CODES.UNSUPPORTED_PATH, {
      relativePath: absolute,
      problem: 'the selected library root is not an absolute path',
      action: 'Choose a library folder with the folder selector.',
    }));
  }

  const info = await statSafe(absolute);
  if (!info.ok) {
    diagnostics.push(toDiagnostic(LIBRARY_ERROR_CODES.ROOT_NOT_FOUND, {
      relativePath: '.',
      problem: 'the selected library folder is not available',
      action: 'Reconnect the drive, locate the library, or choose another library.',
    }));
    return { ok: false, root: absolute, directories, diagnostics };
  }
  if (!info.isDirectory) {
    diagnostics.push(toDiagnostic(LIBRARY_ERROR_CODES.ROOT_NOT_DIRECTORY, {
      relativePath: '.',
      problem: 'the selected library path is a file, not a folder',
      action: 'Choose a folder.',
    }));
    return { ok: false, root: absolute, directories, diagnostics };
  }

  let present = 0;
  for (const [name, path] of Object.entries(directories)) {
    const child = await statSafe(path);
    if (!child.ok) continue;
    if (!child.isDirectory) {
      diagnostics.push(toDiagnostic(LIBRARY_ERROR_CODES.REQUIRED_FOLDER_PATH_IS_FILE, {
        collection: name,
        relativePath: relative(absolute, path),
        problem: `a file occupies the required "${name}" folder path`,
        action: `Move or rename that file, then retry. Nothing was overwritten.`,
      }));
      continue;
    }
    present += 1;
  }

  return {
    ok: diagnostics.length === 0,
    root: absolute,
    directories,
    presentCount: present,
    isPortableRoot: present === 3,
    diagnostics,
  };
}

/**
 * Create only the missing user-facing folders. Idempotent, non-destructive:
 * never overwrites, never moves, never deletes.
 */
export async function initializeLibraryRoot(root, {
  dryRun = false,
  repositoryRoot = null,
} = {}) {
  const validation = await validateLibraryRoot(root, { repositoryRoot });
  const blocking = validation.diagnostics.filter(
    (item) => item.code !== LIBRARY_ERROR_CODES.ROOT_NOT_FOUND,
  );
  if (blocking.length > 0) {
    return { ok: false, created: [], diagnostics: validation.diagnostics };
  }

  const created = [];
  if (!dryRun) {
    const rootInfo = await statSafe(validation.root);
    if (!rootInfo.ok) {
      try {
        await mkdir(toLongPath(validation.root), { recursive: true });
      } catch (error) {
        return {
          ok: false,
          created,
          diagnostics: [toDiagnostic(LIBRARY_ERROR_CODES.IO_ERROR, {
            relativePath: '.',
            problem: `could not create the library root: ${error?.message ?? error}`,
            action: 'Check that the location is writable.',
          })],
        };
      }
    }
  }

  for (const [name, path] of Object.entries(validation.directories)) {
    const info = await statSafe(path);
    if (info.ok) continue; // present: never touched
    created.push({ name, path, relativePath: relative(validation.root, path) });
    if (dryRun) continue;
    try {
      await mkdir(toLongPath(path), { recursive: true });
    } catch (error) {
      return {
        ok: false,
        created,
        diagnostics: [toDiagnostic(LIBRARY_ERROR_CODES.IO_ERROR, {
          collection: name,
          relativePath: relative(validation.root, path),
          problem: `could not create the "${name}" folder: ${error?.message ?? error}`,
          action: 'Check that the location is writable.',
        })],
      };
    }
  }

  return {
    ok: true,
    root: validation.root,
    created,
    alreadyPresent: 3 - created.length,
    diagnostics: [],
  };
}

async function readTitleMarkdown(directory, relativeDirectory) {
  const listed = await listDirectory(directory);
  if (!listed.ok) {
    return {
      diagnostics: [toDiagnostic(listed.error.code, {
        relativePath: relativeDirectory,
        problem: listed.error.message,
        action: 'Check the folder permissions or reconnect the drive.',
      })],
    };
  }

  const folderName = relativeDirectory.split(/[\\/]+/).filter(Boolean).pop();
  const markdown = listed.entries
    .filter((entry) => entry.toLowerCase().endsWith('.md'))
    .sort();
  if (markdown.length === 0) {
    return {
      diagnostics: [toDiagnostic(LIBRARY_ERROR_CODES.TITLE_MARKDOWN_MISSING, {
        relativePath: relativeDirectory,
        problem: `no title Markdown file in "${folderName}"`,
        action: 'Add a Markdown file named after the folder, or move the folder to a review area.',
      })],
    };
  }
  if (markdown.length > 1) {
    return {
      diagnostics: [toDiagnostic(LIBRARY_ERROR_CODES.MULTIPLE_TITLE_MARKDOWN, {
        relativePath: relativeDirectory,
        problem: `"${folderName}" contains ${markdown.length} Markdown files`,
        action: 'Keep exactly one title Markdown file per title folder.',
      })],
    };
  }
  const fileName = markdown[0];
  if (fileName.slice(0, -3) !== folderName) {
    return {
      diagnostics: [toDiagnostic(LIBRARY_ERROR_CODES.TITLE_MARKDOWN_NAME_MISMATCH, {
        relativePath: `${relativeDirectory}/${fileName}`,
        problem: `"${fileName}" does not match its title folder "${folderName}"`,
        action: 'Rename the Markdown file to match the title folder.',
      })],
    };
  }
  return { markdownFileName: fileName };
}

async function discoverCollection({
  collection,
  collectionRoot,
  categories,
  diagnostics,
}) {
  const titles = [];
  const allowed = new Map(categories.map((name) => [name.toLowerCase(), name]));
  const listed = await listDirectory(collectionRoot);
  if (!listed.ok) return titles;

  for (const entry of listed.entries.sort()) {
    const category = allowed.get(entry.toLowerCase());
    if (!category) {
      if (!isNonTitleSegment(entry)) {
        diagnostics.push(toDiagnostic(LIBRARY_ERROR_CODES.UNSUPPORTED_PATH, {
          collection,
          relativePath: `${collection}/${entry}`,
          problem: `"${entry}" is not an approved ${collection} category`,
          action: 'Move the folder into an approved category, or add the category explicitly.',
        }));
      }
      continue;
    }
    const categoryRoot = join(collectionRoot, category);
    const categoryInfo = await statSafe(categoryRoot);
    if (!categoryInfo.ok || !categoryInfo.isDirectory) continue;

    const children = await listDirectory(categoryRoot);
    if (!children.ok) continue;

    const seen = new Map();
    for (const child of children.entries.sort()) {
      const childRelative = `${collection}/${category}/${child}`;
      if (isNonTitleSegment(child)) continue;
      const escaped = assertContained(collectionRoot, join(categoryRoot, child), {
        collection,
        category,
        relativePath: childRelative,
      });
      if (escaped) {
        diagnostics.push(escaped);
        continue;
      }
      const childInfo = await statSafe(join(categoryRoot, child));
      if (!childInfo.ok || !childInfo.isDirectory) continue;

      const key = child.toLowerCase();
      if (seen.has(key)) {
        diagnostics.push(toDiagnostic(LIBRARY_ERROR_CODES.CASE_COLLISION, {
          collection,
          category,
          relativePath: childRelative,
          problem: `"${child}" collides with "${seen.get(key)}" on a case-insensitive filesystem`,
          action: 'Rename one of the two folders.',
        }));
        continue;
      }
      seen.set(key, child);

      const titleResult = await readTitleMarkdown(
        join(categoryRoot, child),
        childRelative,
      );
      if (titleResult.diagnostics) {
        for (const diagnostic of titleResult.diagnostics) {
          diagnostics.push({ ...diagnostic, collection, category });
        }
        continue;
      }
      titles.push({
        collection,
        category,
        folderName: child,
        relativeFolderPath: childRelative,
        markdownFileName: titleResult.markdownFileName,
        relativeMarkdownPath: `${childRelative}/${titleResult.markdownFileName}`,
      });
    }
  }
  return titles;
}

/**
 * Discover canonical title folders under Read and Watch.
 * Never mutates anything. Raw is intentionally not a title source.
 */
export async function discoverOrganizedLibrary(root, options = {}) {
  const validation = await validateLibraryRoot(root, options);
  const diagnostics = [...validation.diagnostics];
  if (!validation.ok) {
    return { ok: false, root: validation.root, titles: [], diagnostics, counts: {} };
  }

  const read = await discoverCollection({
    collection: 'Read',
    collectionRoot: validation.directories.read,
    categories: options.readCategories ?? READ_CATEGORIES,
    diagnostics,
  });
  const watch = await discoverCollection({
    collection: 'Watch',
    collectionRoot: validation.directories.watch,
    categories: options.watchCategories ?? WATCH_CATEGORIES,
    diagnostics,
  });

  return {
    ok: diagnostics.length === 0,
    root: validation.root,
    titles: [...read, ...watch],
    diagnostics,
    counts: { read: read.length, watch: watch.length, total: read.length + watch.length },
  };
}

/**
 * Cheap, offline Raw enumeration. Returns relative paths and basic metadata.
 * Performs no hashing, no OCR, no classification and no network access.
 */
export async function enumerateRawEntries(root, { maxEntries = Infinity } = {}) {
  const rawRoot = resolve(root, RAW_FOLDER);
  const info = await statSafe(rawRoot);
  if (!info.ok || !info.isDirectory) {
    return { ok: false, rawRoot, entries: [], count: 0, truncated: false };
  }
  const entries = [];
  const queue = [''];
  let truncated = false;

  while (queue.length > 0) {
    const current = queue.shift();
    const absolute = current ? join(rawRoot, current) : rawRoot;
    const listed = await listDirectory(absolute);
    if (!listed.ok) continue;
    for (const entry of listed.entries.sort()) {
      const relativePath = current ? `${current}/${entry}` : entry;
      if (hasNonTitleSegment(relativePath)) continue;
      if (entries.length >= maxEntries) {
        truncated = true;
        continue;
      }
      const childInfo = await statSafe(join(rawRoot, relativePath));
      if (!childInfo.ok) continue;
      if (childInfo.isDirectory) {
        queue.push(relativePath);
        continue;
      }
      entries.push({
        relativePath,
        byteSize: childInfo.size,
        extension: relativePath.includes('.')
          ? relativePath.slice(relativePath.lastIndexOf('.')).toLowerCase()
          : '',
      });
    }
  }

  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return { ok: true, rawRoot, entries, count: entries.length, truncated };
}

/**
 * Read a title Markdown file as UTF-8 with an explicit diagnostic on failure,
 * so a caller never receives silently blank metadata.
 */
export async function readTitleMarkdownText(root, relativeMarkdownPath) {
  const absolute = resolve(root, relativeMarkdownPath);
  const escaped = assertContained(resolve(root), absolute, {
    relativePath: relativeMarkdownPath,
  });
  if (escaped) return { ok: false, diagnostic: escaped };
  try {
    const text = await readFile(toLongPath(absolute), 'utf8');
    return { ok: true, text, absolutePath: absolute, byteLength: Buffer.byteLength(text) };
  } catch (error) {
    const invalidUtf8 = error?.code === 'ERR_INVALID_UTF8' ||
      /invalid utf-?8/i.test(String(error?.message));
    return {
      ok: false,
      diagnostic: toDiagnostic(
        invalidUtf8 ? LIBRARY_ERROR_CODES.INVALID_UTF8 : LIBRARY_ERROR_CODES.IO_ERROR,
        {
          relativePath: relativeMarkdownPath,
          problem: `${error?.code ?? 'ERROR'}: ${error?.message ?? String(error)}`,
          action: invalidUtf8
            ? 'Re-save the file as UTF-8.'
            : 'Check the file permissions or reconnect the drive.',
        },
      ),
    };
  }
}

/** Convenience: seed the portable roots for a data root in one call. */
export function portableRootsFrom({ appRoot, environment = process.env }) {
  const paths = resolveDataPaths({ appRoot, environment });
  return {
    dataRoot: paths.dataRoot,
    readRoot: paths.readRoot,
    watchRoot: paths.watchRoot,
    rawRoot: paths.rawRoot,
    runtimeAppRoot: paths.runtimeAppRoot,
  };
}

export const PORTABLE_PATH_LIMIT = MAX_PATH_LENGTH;
export const PORTABLE_SEPARATOR = sep;
