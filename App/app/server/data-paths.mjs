import { isAbsolute, relative, resolve } from 'node:path';

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
    configured || resolve(repositoryRoot, '..', 'Read and Watch - Local Data'),
  );
  if (isInside(repositoryRoot, dataRoot)) {
    throw new Error('READ_WATCH_DATA_ROOT must be outside the Git repository');
  }
  const dataAppRoot = resolve(dataRoot, 'App');
  return {
    dataRoot,
    dataAppRoot,
    libraryRoot: resolve(dataAppRoot, 'library'),
    catalogPath: resolve(dataAppRoot, 'library', 'catalog.json'),
    userDataRoot: resolve(dataAppRoot, 'user-data'),
    readerExecutable: resolve(
      dataAppRoot,
      'runtime',
      'readest',
      'bin',
      'readest.exe',
    ),
  };
}
