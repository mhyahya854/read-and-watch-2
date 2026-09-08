import { createReadStream, readFileSync, statSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig, type Plugin } from 'vite';

import hostingConfig from './.openai/hosting.json' with { type: 'json' };
import { resolveDataPaths } from './server/data-paths.mjs';
import { createLibraryStore } from './server/library-store.mjs';
import { readerPlugin } from './server/reader-vite-plugin.mjs';
import { userDataPlugin } from './server/user-data-vite-plugin.mjs';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';
const appRoot = fileURLToPath(new URL('.', import.meta.url));
const {
  dataAppRoot,
  libraryRoot,
  libraryDatabasePath,
  userDataRoot,
  readerExecutable,
} = resolveDataPaths({ appRoot });

const contentTypes: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function safeLibraryFile(requestPath: string) {
  const decoded = decodeURIComponent(requestPath.split('?')[0] ?? '')
    .replace(/^\/+/, '')
    .replace(/^library-assets\//, '');
  const candidate = resolve(libraryRoot, decoded);
  const fromRoot = relative(libraryRoot, candidate);
  if (!fromRoot || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw new Error('Unsafe library asset path');
  }
  return candidate;
}

function libraryAssets(): Plugin {
  return {
    name: 'local-library-assets',
    configureServer(server) {
      server.middlewares.use('/library-assets', (request, response, next) => {
        try {
          const file = safeLibraryFile(request.url ?? '');
          if (!statSync(file).isFile()) return next();
          response.setHeader(
            'Content-Type',
            contentTypes[extname(file).toLowerCase()] ??
              'application/octet-stream',
          );
          response.setHeader('Cache-Control', 'private, max-age=3600');
          createReadStream(file).pipe(response);
        } catch {
          response.statusCode = 404;
          response.end('Not found');
        }
      });
    },
    generateBundle() {
      if (this.environment.name !== 'client') return;

      const store = createLibraryStore({
        databasePath: libraryDatabasePath,
        readOnly: true,
      });
      const catalog = store.getCatalog() as {
        items: Array<{ media: Array<{ path: string }> }>;
      };
      store.close();
      const paths = new Set(
        catalog.items.flatMap((item) => item.media.map((media) => media.path)),
      );
      for (const path of paths) {
        if (!contentTypes[extname(path).toLowerCase()]) continue;
        this.emitFile({
          type: 'asset',
          fileName: `library-assets/${path}`,
          source: readFileSync(safeLibraryFile(path)),
        });
      }
    },
  };
}

const localBindingConfig = {
  main: 'vinext/server/fetch-handler',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: {
      fs: { allow: [appRoot, resolve(appRoot, '..'), dataAppRoot] },
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      libraryAssets(),
      userDataPlugin({ userDataRoot, libraryDatabasePath }),
      readerPlugin({ libraryRoot, libraryDatabasePath, readerExecutable }),
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});
