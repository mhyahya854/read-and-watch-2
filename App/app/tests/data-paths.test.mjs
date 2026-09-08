import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

import { resolveDataPaths } from '../server/data-paths.mjs';

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
  assert.equal(
    paths.readerExecutable,
    resolve(dataRoot, 'App/runtime/readest/bin/readest.exe'),
  );
});

test('default data root is the repository sibling', () => {
  const paths = resolveDataPaths({ appRoot, environment: {} });
  assert.equal(
    paths.dataRoot,
    resolve('C:/workspace/Read and Watch - Local Data'),
  );
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
