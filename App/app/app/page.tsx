import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { LibraryBrowser } from '@/components/library-browser';
import type { LibraryCatalog } from '@/lib/catalog';
import { resolveDataPaths } from '@/server/data-paths.mjs';

const appRoot = fileURLToPath(new URL('..', import.meta.url));

function loadCatalog(): LibraryCatalog {
  const { catalogPath } = resolveDataPaths({ appRoot });
  return JSON.parse(readFileSync(catalogPath, 'utf8')) as LibraryCatalog;
}

export default function Home() {
  return <LibraryBrowser catalog={loadCatalog()} />;
}
