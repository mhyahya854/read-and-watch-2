import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  PORTABLE_LIBRARY_FOLDER,
  resolveDataPaths,
} from '../server/data-paths.mjs';

const appRoot = resolve('C:/workspace/Read and Watch/App/app');

test('external data paths derive from one configured root', () => {
  const dataRoot = resolve('D:/private/read-watch-data');
  const paths = resolveDataPaths({
    appRoot,
    environment: { READ_WATCH_DATA_ROOT: dataRoot },
  });
  assert.equal(paths.dataRoot, dataRoot);
  assert.equal(
    paths.catalogPath,
    resolve(dataRoot, 'App/library/catalog.json'),
  );
  assert.equal(
    paths.libraryDatabasePath,
    resolve(dataRoot, 'App/state/read-watch.sqlite3'),
  );
  assert.equal(paths.userDataRoot, resolve(dataRoot, 'App/user-data'));
  assert.equal(paths.readerExecutable, null);
});

test('default data root is the repository sibling', () => {
  const paths = resolveDataPaths({ appRoot, environment: {} });
  assert.equal(
    paths.dataRoot,
    resolve(`C:/workspace/${PORTABLE_LIBRARY_FOLDER}`),
  );
});

test('portable library folders hang off the selected root', () => {
  const dataRoot = resolve('D:/portable/library');
  const paths = resolveDataPaths({
    appRoot,
    environment: { READ_WATCH_DATA_ROOT: dataRoot },
  });
  assert.equal(paths.readRoot, resolve(dataRoot, 'Read'));
  assert.equal(paths.watchRoot, resolve(dataRoot, 'Watch'));
  assert.equal(paths.rawRoot, resolve(dataRoot, 'Raw'));
  assert.equal(paths.runtimeAppRoot, resolve(dataRoot, 'App'));
  assert.equal(paths.stateRoot, resolve(dataRoot, 'App/state'));
  assert.equal(paths.searchRoot, resolve(dataRoot, 'App/search'));
  assert.equal(paths.userDataRoot, resolve(dataRoot, 'App/user-data'));
  assert.equal(
    paths.sharedReadEvidenceRoot,
    resolve(dataRoot, 'Read/Source Imports/Shared Recommendation Evidence'),
  );
  assert.equal(
    paths.sharedWatchEvidenceRoot,
    resolve(dataRoot, 'Watch/Source Imports/Shared Recommendation Evidence'),
  );
});

test('canonical library folders never live beneath App', () => {
  const dataRoot = resolve('D:/portable/library');
  const paths = resolveDataPaths({
    appRoot,
    environment: { READ_WATCH_DATA_ROOT: dataRoot },
  });
  // Legacy managed library stays available, but the portable folders are the
  // canonical location and must not be nested inside it.
  assert.equal(paths.libraryRoot, resolve(dataRoot, 'App/library'));
  assert.ok(!paths.readRoot.startsWith(paths.libraryRoot));
  assert.ok(!paths.watchRoot.startsWith(paths.libraryRoot));
  assert.ok(!paths.rawRoot.startsWith(paths.libraryRoot));
});

test('configured data root cannot be inside the repository', () => {
  assert.throws(
    () =>
      resolveDataPaths({
        appRoot,
        environment: {
          READ_WATCH_DATA_ROOT: resolve(
            'C:/workspace/Read and Watch/private-data',
          ),
        },
      }),
    /must be outside the Git repository/,
  );
});
