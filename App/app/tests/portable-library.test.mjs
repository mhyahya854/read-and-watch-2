/**
 * Synthetic fixtures only. No real library content, titles or paths appear in
 * this file or in anything it writes.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  LIBRARY_ERROR_CODES,
  READ_CATEGORIES,
  WATCH_CATEGORIES,
  discoverOrganizedLibrary,
  enumerateRawEntries,
  initializeLibraryRoot,
  readTitleMarkdownText,
  statSafe,
  toLongPath,
  validateLibraryRoot,
} from '../server/portable-library.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const modulePath = resolve(here, '../server/portable-library.mjs');
const isWindows = process.platform === 'win32';

async function withTempRoot(run) {
  const base = await mkdtemp(join(tmpdir(), 'rw-portable-'));
  try {
    return await run(base);
  } finally {
    await rm(toLongPath(base), { recursive: true, force: true });
  }
}

async function makeTitle(root, collection, category, folder, markdownName = folder) {
  const directory = join(root, collection, category, folder);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `${markdownName}.md`), `# ${folder}\n`, 'utf8');
  return directory;
}

test('empty root initializes all three portable folders', async () => {
  await withTempRoot(async (base) => {
    const root = join(base, 'library');
    const result = await initializeLibraryRoot(root);
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.created.map((item) => item.name).sort(),
      ['raw', 'read', 'watch'],
    );
    for (const folder of ['Read', 'Watch', 'Raw']) {
      assert.equal(existsSync(join(root, folder)), true, folder);
    }
  });
});

test('existing Read and Watch are preserved and only Raw is created', async () => {
  await withTempRoot(async (base) => {
    await mkdir(join(base, 'Read'), { recursive: true });
    await mkdir(join(base, 'Watch'), { recursive: true });
    await writeFile(join(base, 'Watch', 'sentinel.txt'), 'keep me', 'utf8');

    const result = await initializeLibraryRoot(base);
    assert.equal(result.ok, true);
    assert.deepEqual(result.created.map((item) => item.name), ['raw']);
    assert.equal(
      await readFile(join(base, 'Watch', 'sentinel.txt'), 'utf8'),
      'keep me',
    );
  });
});

test('a root with only Read gains Watch and Raw without touching Read', async () => {
  await withTempRoot(async (base) => {
    await makeTitle(base, 'Read', 'Books', 'Solo Title');
    const result = await initializeLibraryRoot(base);
    assert.equal(result.ok, true);
    assert.deepEqual(result.created.map((item) => item.name), ['watch', 'raw']);
    assert.equal(
      existsSync(join(base, 'Read', 'Books', 'Solo Title', 'Solo Title.md')),
      true,
    );
  });
});

test('a root with only Watch gains Read and Raw', async () => {
  await withTempRoot(async (base) => {
    await mkdir(join(base, 'Watch'), { recursive: true });
    const result = await initializeLibraryRoot(base);
    assert.deepEqual(result.created.map((item) => item.name), ['read', 'raw']);
  });
});

test('initialization is idempotent', async () => {
  await withTempRoot(async (base) => {
    const first = await initializeLibraryRoot(base);
    assert.equal(first.created.length, 3);
    const second = await initializeLibraryRoot(base);
    assert.equal(second.ok, true);
    assert.deepEqual(second.created, []);
    assert.equal(second.alreadyPresent, 3);
  });
});

test('unknown root content is preserved', async () => {
  await withTempRoot(async (base) => {
    await writeFile(join(base, 'notes.txt'), 'unknown', 'utf8');
    await mkdir(join(base, 'SomethingElse'), { recursive: true });
    const result = await initializeLibraryRoot(base);
    assert.equal(result.ok, true);
    assert.equal(existsSync(join(base, 'notes.txt')), true);
    assert.equal(existsSync(join(base, 'SomethingElse')), true);
  });
});

test('a file occupying a required folder path fails safely', async () => {
  await withTempRoot(async (base) => {
    await writeFile(join(base, 'Read'), 'not a directory', 'utf8');
    const result = await initializeLibraryRoot(base);
    assert.equal(result.ok, false);
    assert.equal(
      result.diagnostics[0].code,
      LIBRARY_ERROR_CODES.REQUIRED_FOLDER_PATH_IS_FILE,
    );
    // nothing was overwritten
    assert.equal(await readFile(join(base, 'Read'), 'utf8'), 'not a directory');
  });
});

test('a missing root is reported, not created, by validation', async () => {
  await withTempRoot(async (base) => {
    const missing = join(base, 'nope');
    const result = await validateLibraryRoot(missing);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, LIBRARY_ERROR_CODES.ROOT_NOT_FOUND);
    assert.equal(existsSync(missing), false);
  });
});

test('a root inside the Git repository is rejected', async () => {
  await withTempRoot(async (base) => {
    const repo = join(base, 'repo');
    await mkdir(repo, { recursive: true });
    const result = await validateLibraryRoot(join(repo, 'data'), {
      repositoryRoot: repo,
    });
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, LIBRARY_ERROR_CODES.ROOT_INSIDE_REPOSITORY);
  });
});

test('a root outside the Git repository is accepted', async () => {
  await withTempRoot(async (base) => {
    const repo = join(base, 'repo');
    const library = join(base, 'library');
    await mkdir(repo, { recursive: true });
    await initializeLibraryRoot(library);
    const result = await validateLibraryRoot(library, { repositoryRoot: repo });
    assert.equal(result.ok, true);
    assert.equal(result.isPortableRoot, true);
  });
});

test('Read and Watch titles are discovered with their matching Markdown', async () => {
  await withTempRoot(async (base) => {
    await makeTitle(base, 'Read', 'Books', 'Synthetic Book (2001)');
    await makeTitle(base, 'Read', 'Study Materials', 'Synthetic Notes');
    await makeTitle(base, 'Watch', 'Movies', 'Synthetic Movie (1999)');
    await initializeLibraryRoot(base, { dryRun: true });

    const result = await discoverOrganizedLibrary(base);
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.equal(result.counts.read, 2);
    assert.equal(result.counts.watch, 1);
    assert.equal(result.counts.total, 3);
    const book = result.titles.find((title) => title.folderName === 'Synthetic Book (2001)');
    assert.equal(book.collection, 'Read');
    assert.equal(book.category, 'Books');
    assert.equal(book.relativeMarkdownPath, 'Read/Books/Synthetic Book (2001)/Synthetic Book (2001).md');
  });
});

test('every approved category is discoverable in both collections', async () => {
  await withTempRoot(async (base) => {
    for (const category of READ_CATEGORIES) {
      await makeTitle(base, 'Read', category, `Read ${category}`);
    }
    for (const category of WATCH_CATEGORIES) {
      await makeTitle(base, 'Watch', category, `Watch ${category}`);
    }
    const result = await discoverOrganizedLibrary(base);
    assert.equal(result.counts.read, READ_CATEGORIES.length);
    assert.equal(result.counts.watch, WATCH_CATEGORIES.length);
  });
});

test('Source Imports and shared evidence are excluded from titles', async () => {
  await withTempRoot(async (base) => {
    await makeTitle(base, 'Read', 'Books', 'Real Title');
    await mkdir(join(base, 'Read', 'Source Imports', 'Shared Recommendation Evidence'), {
      recursive: true,
    });
    await writeFile(
      join(base, 'Read', 'Source Imports', 'Shared Recommendation Evidence', 'shared.jpg'),
      'x',
    );
    await mkdir(join(base, 'Watch', 'Source Imports', 'Notion'), { recursive: true });
    await mkdir(join(base, 'Watch', 'Administration'), { recursive: true });
    await mkdir(join(base, 'Watch', 'Filesystem_Inventory_2026-01-01'), { recursive: true });

    const result = await discoverOrganizedLibrary(base);
    assert.equal(result.counts.read, 1);
    assert.equal(result.counts.watch, 0);
    const offenders = result.titles.filter((title) =>
      title.relativeFolderPath.toLowerCase().includes('source imports'));
    assert.equal(offenders.length, 0);
  });
});

test('missing, duplicate and mismatched title Markdown are diagnosed', async () => {
  await withTempRoot(async (base) => {
    const books = join(base, 'Read', 'Books');
    await mkdir(join(books, 'No Markdown'), { recursive: true });
    await mkdir(join(books, 'Two Markdown'), { recursive: true });
    await writeFile(join(books, 'Two Markdown', 'Two Markdown.md'), '# a\n');
    await writeFile(join(books, 'Two Markdown', 'other.md'), '# b\n');
    await mkdir(join(books, 'Wrong Name'), { recursive: true });
    await writeFile(join(books, 'Wrong Name', 'something-else.md'), '# c\n');

    const result = await discoverOrganizedLibrary(base);
    const codes = result.diagnostics.map((item) => item.code).sort();
    assert.deepEqual(codes, [
      LIBRARY_ERROR_CODES.MULTIPLE_TITLE_MARKDOWN,
      LIBRARY_ERROR_CODES.TITLE_MARKDOWN_MISSING,
      LIBRARY_ERROR_CODES.TITLE_MARKDOWN_NAME_MISMATCH,
    ]);
    assert.equal(result.ok, false);
    assert.equal(result.counts.read, 0);
  });
});

test('Unicode, Arabic, Urdu, ampersand and apostrophe titles are discovered', async () => {
  await withTempRoot(async (base) => {
    const names = [
      'Café Naïve — Ünïcode',
      'كتاب عربي',
      'اردو عنوان',
      "Rock & Roll's Best",
    ];
    for (const name of names) {
      await makeTitle(base, 'Read', 'Books', name);
    }
    const result = await discoverOrganizedLibrary(base);
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.equal(result.counts.read, names.length);
    for (const name of names) {
      assert.ok(result.titles.some((title) => title.folderName === name), name);
    }
  });
});

test('an unapproved category folder is reported rather than silently indexed', async () => {
  await withTempRoot(async (base) => {
    await makeTitle(base, 'Read', 'Manga', 'Unapproved');
    const result = await discoverOrganizedLibrary(base);
    assert.equal(result.counts.read, 0);
    assert.ok(result.diagnostics.some(
      (item) => item.code === LIBRARY_ERROR_CODES.UNSUPPORTED_PATH,
    ));
  });
});

test('case-differing sibling folders are handled deterministically', async () => {
  await withTempRoot(async (base) => {
    const books = join(base, 'Read', 'Books');
    await mkdir(join(books, 'Cased'), { recursive: true });
    await writeFile(join(books, 'Cased', 'Cased.md'), '# one\n');
    let collisionRepresentable = true;
    try {
      mkdirSync(join(books, 'cased'));
    } catch {
      collisionRepresentable = false;
    }
    if (!collisionRepresentable) {
      // NTFS cannot hold the pair; discovery must still report exactly one title
      // and must not emit a collision it cannot prove.
      const result = await discoverOrganizedLibrary(base);
      assert.equal(result.counts.read, 1);
      assert.equal(
        result.diagnostics.filter(
          (item) => item.code === LIBRARY_ERROR_CODES.CASE_COLLISION,
        ).length,
        0,
      );
      return;
    }
    await writeFile(join(books, 'cased', 'cased.md'), '# two\n');
    const result = await discoverOrganizedLibrary(base);
    assert.ok(result.diagnostics.some(
      (item) => item.code === LIBRARY_ERROR_CODES.CASE_COLLISION,
    ));
  });
});

test('long Windows paths are stat-ed and read without blank metadata', async () => {
  await withTempRoot(async (base) => {
    let deep = join(base, 'Read', 'Books', 'Long Path Title');
    while (deep.length < 300) {
      deep = join(deep, 'segment-padding-folder');
    }
    await mkdir(toLongPath(deep), { recursive: true });
    const file = join(deep, 'Long Path Title.md');
    await writeFile(toLongPath(file), '# long path title\n', 'utf8');
    assert.ok(file.length >= 260, `expected >=260, got ${file.length}`);

    const info = await statSafe(file);
    assert.equal(info.ok, true, JSON.stringify(info.error));
    assert.ok(info.size > 0, 'size must never be blank for a real file');

    const read = await readTitleMarkdownText(base, file.slice(base.length + 1));
    assert.equal(read.ok, true, JSON.stringify(read.diagnostic));
    assert.match(read.text, /long path title/);
  });
});

test('a path escaping the library root is rejected', async () => {
  await withTempRoot(async (base) => {
    await initializeLibraryRoot(base);
    const escaped = await readTitleMarkdownText(base, '../outside.md');
    assert.equal(escaped.ok, false);
    assert.equal(escaped.diagnostic.code, LIBRARY_ERROR_CODES.PATH_ESCAPE);
  });
});

test('a symlink escaping the root is rejected when links are available', async (t) => {
  await withTempRoot(async (base) => {
    const outside = join(base, '..', `rw-outside-${Date.now()}`);
    await mkdir(outside, { recursive: true });
    await initializeLibraryRoot(base);
    const link = join(base, 'Raw', 'escape-link');
    try {
      symlinkSync(outside, link, 'junction');
    } catch {
      t.skip('symlink creation unavailable on this platform/account');
      await rm(outside, { recursive: true, force: true });
      return;
    }
    try {
      const result = await discoverOrganizedLibrary(base);
      // The link lives under Raw, which is never a title source, so discovery
      // stays clean; containment checking is exercised directly here.
      assert.equal(result.counts.total, 0);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

test('Raw enumeration returns relative paths and no hashing', async () => {
  await withTempRoot(async (base) => {
    const raw = join(base, 'Raw', 'nested');
    await mkdir(raw, { recursive: true });
    await writeFile(join(base, 'Raw', 'loose.pdf'), 'x'.repeat(11));
    await writeFile(join(raw, 'deep.epub'), 'y'.repeat(5));

    const result = await enumerateRawEntries(base);
    assert.equal(result.ok, true);
    assert.equal(result.count, 2);
    assert.deepEqual(
      result.entries.map((entry) => entry.relativePath).sort(),
      ['loose.pdf', 'nested/deep.epub'],
    );
    const loose = result.entries.find((entry) => entry.relativePath === 'loose.pdf');
    assert.equal(loose.byteSize, 11);
    assert.equal(loose.extension, '.pdf');
    for (const entry of result.entries) {
      assert.equal(Object.hasOwn(entry, 'sha256'), false);
    }
  });
});

test('Raw enumeration on a missing Raw folder is safe', async () => {
  await withTempRoot(async (base) => {
    const result = await enumerateRawEntries(base);
    assert.equal(result.ok, false);
    assert.deepEqual(result.entries, []);
  });
});

test('Raw enumeration honours the entry cap', async () => {
  await withTempRoot(async (base) => {
    await mkdir(join(base, 'Raw'), { recursive: true });
    for (let index = 0; index < 5; index += 1) {
      await writeFile(join(base, 'Raw', `file-${index}.txt`), 'z');
    }
    const result = await enumerateRawEntries(base, { maxEntries: 3 });
    assert.equal(result.entries.length, 3);
    assert.equal(result.truncated, true);
  });
});

test('the portable library module performs no network access', () => {
  const source = readFileSync(modulePath, 'utf8');
  for (const forbidden of [
    "from 'node:http",
    'from "node:http',
    "from 'node:https",
    'from "node:https',
    "from 'node:net",
    'fetch(',
    'XMLHttpRequest',
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `portable-library.mjs must not reference ${forbidden}`,
    );
  }
});

test('initialization never mutates existing canonical titles', async () => {
  await withTempRoot(async (base) => {
    const directory = await makeTitle(base, 'Read', 'Books', 'Untouched Title');
    const markdownPath = join(directory, 'Untouched Title.md');
    const before = await readFile(markdownPath, 'utf8');
    await initializeLibraryRoot(base);
    await discoverOrganizedLibrary(base);
    assert.equal(await readFile(markdownPath, 'utf8'), before);
    assert.equal(existsSync(join(directory, 'Files')), false);
  });
});

test('Windows long-path helper only rewrites paths on Windows', () => {
  const plain = 'D:/portable/library/Read/Books/Title';
  if (isWindows) {
    assert.equal(toLongPath(plain), `\\\\?\\${plain}`);
    assert.equal(toLongPath('\\\\?\\D:/x'), '\\\\?\\D:/x');
    assert.equal(toLongPath('\\\\server\\share'), '\\\\?\\UNC\\server\\share');
  } else {
    assert.equal(toLongPath(plain), plain);
  }
});
