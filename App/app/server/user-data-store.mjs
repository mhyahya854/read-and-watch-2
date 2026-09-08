import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { createLibraryStore } from './library-store.mjs';

const TYPES = new Set(['thoughts', 'notes']);
const ITEM_ID_RE = /^(read|watch)-[0-9a-f]{32}$/;
const DEFAULT_HISTORY_LIMIT = 5;

function readJsonOrNull(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function createUserDataStore({
  userDataRoot,
  libraryDatabasePath,
  historyLimit = DEFAULT_HISTORY_LIMIT,
}) {
  const libraryStore = createLibraryStore({
    databasePath: libraryDatabasePath,
  });
  const root = resolve(userDataRoot);

  function assertValid(type, itemId) {
    if (!TYPES.has(type)) {
      throw new Error('Invalid user-data type');
    }
    if (typeof itemId !== 'string' || !ITEM_ID_RE.test(itemId)) {
      throw new Error('Invalid item ID');
    }
    if (!libraryStore.itemExists(itemId)) {
      throw new Error('Unknown item ID');
    }
  }

  function itemFile(type, itemId) {
    const file = join(root, 'items', itemId, `${type}.md`);
    const fromRoot = relative(root, file);
    if (!fromRoot || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
      throw new Error('Unsafe user-data path');
    }
    return file;
  }

  function writeAtomic(target, content) {
    mkdirSync(dirname(target), { recursive: true });
    const tmp = join(
      dirname(target),
      `.${target.split(/[\\/]/).pop()}.tmp-${process.pid}-${Date.now()}`,
    );
    writeFileSync(tmp, content, 'utf8');
    renameSync(tmp, target);
  }

  function archive(file, type, itemId) {
    if (!existsSync(file)) return;
    const historyDir = join(root, '.history', itemId);
    mkdirSync(historyDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const historyFile = join(historyDir, `${type}-${stamp}.md`);
    writeFileSync(historyFile, readFileSync(file));
    const versions = readdirSync(historyDir)
      .filter((name) => name.startsWith(`${type}-`) && name.endsWith('.md'))
      .sort();
    while (versions.length > historyLimit) {
      rmSync(join(historyDir, versions.shift()));
    }
  }

  function updateIndex() {
    const itemsRoot = join(root, 'items');
    const items = {};
    if (existsSync(itemsRoot)) {
      for (const entry of readdirSync(itemsRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || !ITEM_ID_RE.test(entry.name)) continue;
        const thoughts = join(itemsRoot, entry.name, 'thoughts.md');
        const notes = join(itemsRoot, entry.name, 'notes.md');
        const hasThoughts = existsSync(thoughts);
        const hasNotes = existsSync(notes);
        if (!hasThoughts && !hasNotes) continue;
        const thoughtsModified = hasThoughts
          ? statSync(thoughts).mtime.toISOString()
          : null;
        const notesModified = hasNotes
          ? statSync(notes).mtime.toISOString()
          : null;
        items[entry.name] = {
          id: entry.name,
          collection: entry.name.startsWith('read-') ? 'read' : 'watch',
          hasThoughts,
          hasNotes,
          thoughtsPath: hasThoughts ? `items/${entry.name}/thoughts.md` : null,
          notesPath: hasNotes ? `items/${entry.name}/notes.md` : null,
          thoughtsLastModifiedUtc: thoughtsModified,
          notesLastModifiedUtc: notesModified,
          updatedAtUtc:
            thoughtsModified && notesModified
              ? thoughtsModified > notesModified
                ? thoughtsModified
                : notesModified
              : (thoughtsModified ?? notesModified),
        };
      }
    }
    writeAtomic(
      join(root, 'index.json'),
      `${JSON.stringify({ schemaVersion: 1, updatedAtUtc: new Date().toISOString(), items }, null, 2)}\n`,
    );
  }

  return {
    load(type, itemId) {
      assertValid(type, itemId);
      return libraryStore.loadNote(type, itemId);
    },

    save(type, itemId, content, baseRevision) {
      assertValid(type, itemId);
      if (typeof content !== 'string') {
        throw new Error('User-data content must be a string');
      }
      const file = itemFile(type, itemId);
      const result = libraryStore.saveNote(type, itemId, content, baseRevision);
      if (!result.ok) return result;

      if (!content.trim()) {
        if (existsSync(file)) {
          archive(file, type, itemId);
          rmSync(file);
        }
        updateIndex();
        return result;
      }

      archive(file, type, itemId);
      writeAtomic(file, content);
      updateIndex();
      return result;
    },

    getIndex() {
      return (
        readJsonOrNull(join(root, 'index.json')) ?? {
          schemaVersion: 1,
          items: {},
        }
      );
    },

    close() {
      libraryStore.close();
    },
  };
}
