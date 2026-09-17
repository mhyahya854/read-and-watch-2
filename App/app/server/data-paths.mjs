import { isAbsolute, relative, resolve } from 'node:path';

// The portable library convention. A selected library root is expected to
// contain the three user-facing folders below; `App/` holds runtime-only data.
export const PORTABLE_LIBRARY_FOLDER = 'Read and Watch - Local Data Only';
export const LEGACY_LIBRARY_FOLDER = 'Read and Watch - Local Data';
export const READ_FOLDER = 'Read';
export const WATCH_FOLDER = 'Watch';
export const RAW_FOLDER = 'Raw';
export const RUNTIME_APP_FOLDER = 'App';

function isInside(root, candidate) {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === '' || (!fromRoot.startsWith('..') && !isAbsolute(fromRoot))
  );
}

export function resolveDataPaths({ appRoot, environment = process.env }) {
  const repositoryRoot = resolve(appRoot, '..', '..');
  const configured = environment.READ_WATCH_DATA_ROOT?.trim();
  const dataRoot = resolve(
    configured || resolve(repositoryRoot, '..', PORTABLE_LIBRARY_FOLDER),
  );
  if (isInside(repositoryRoot, dataRoot)) {
    throw new Error('READ_WATCH_DATA_ROOT must be outside the Git repository');
  }
  const dataAppRoot = resolve(dataRoot, RUNTIME_APP_FOLDER);
  return {
    dataRoot,
    dataAppRoot,
    // Portable user-facing library folders (the durable, portable library).
    readRoot: resolve(dataRoot, READ_FOLDER),
    watchRoot: resolve(dataRoot, WATCH_FOLDER),
    rawRoot: resolve(dataRoot, RAW_FOLDER),
    sharedReadEvidenceRoot: resolve(
      dataRoot,
      READ_FOLDER,
      'Source Imports',
      'Shared Recommendation Evidence',
    ),
    sharedWatchEvidenceRoot: resolve(
      dataRoot,
      WATCH_FOLDER,
      'Source Imports',
      'Shared Recommendation Evidence',
    ),
    // Runtime-only application data. Canonical library content is never
    // duplicated here.
    runtimeAppRoot: dataAppRoot,
    stateRoot: resolve(dataAppRoot, 'state'),
    searchRoot: resolve(dataAppRoot, 'search'),
    backupRoot: resolve(dataAppRoot, 'backups'),
    exportsRoot: resolve(dataAppRoot, 'exports'),
    ocrRoot: resolve(dataAppRoot, 'ocr'),
    // Legacy managed-library location, retained for backward compatibility.
    libraryRoot: resolve(dataAppRoot, 'library'),
    catalogPath: resolve(dataAppRoot, 'library', 'catalog.json'),
    libraryDatabasePath: resolve(dataAppRoot, 'state', 'read-watch.sqlite3'),
    userDataRoot: resolve(dataAppRoot, 'user-data'),
    readerExecutable: null,
  };
}
