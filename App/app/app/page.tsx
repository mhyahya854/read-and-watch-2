import { fileURLToPath } from 'node:url';

import { LibraryBrowser } from '@/components/library-browser';
import type { LibraryCatalog } from '@/lib/catalog';
import { resolveDataPaths } from '@/server/data-paths.mjs';
import { createLibraryStore } from '@/server/library-store.mjs';

const appRoot = fileURLToPath(new URL('..', import.meta.url));

function loadCatalog(): LibraryCatalog {
  const { libraryDatabasePath } = resolveDataPaths({ appRoot });
  const store = createLibraryStore({
    databasePath: libraryDatabasePath,
    readOnly: true,
  });
  try {
    return store.getCatalog() as LibraryCatalog;
  } finally {
    store.close();
  }
}

export default function Home() {
  return <LibraryBrowser catalog={loadCatalog()} />;
}
