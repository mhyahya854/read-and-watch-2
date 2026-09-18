import { createLibraryStore } from './library-store.mjs';
import { rebuildPortableLibrary } from './portable-rebuild.mjs';
import { inspectLibraryStateIntegrity } from './library-state.mjs';

const MAX_BODY_BYTES = 256 * 1024;

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw Object.assign(new Error('Request body too large'), { status: 413 });
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  return body ? JSON.parse(body) : {};
}

export function libraryPlugin({
  libraryDatabasePath,
  searchStore = null,
  portableRoot = null,
  portableBackupRoot = null,
  userDataRoot = null,
  getRecoveryState = null,
  retryRecovery = null,
}) {
  const store = createLibraryStore({
    databasePath: libraryDatabasePath,
    searchStore,
    portableRoot,
    portableBackupRoot,
  });

  function sanitizedRebuild(result) {
    return {
      ok: Boolean(result.ok),
      status: result.status,
      counts: result.counts,
      changed: result.changed ?? 0,
      skippedCount: result.skipped?.length ?? 0,
      diagnostics: (result.diagnostics ?? []).map(({ code, severity }) => ({
        code,
        severity,
      })),
    };
  }

  return {
    name: 'local-library-data',
    configureServer(server) {
      server.middlewares.use('/api/library', async (request, response) => {
        try {
          const url = new URL(request.url ?? '', 'http://localhost');
          let parts = url.pathname.split('/').filter(Boolean);
          if (parts[0] === 'api' && parts[1] === 'library') parts = parts.slice(2);

          if (parts.length === 1 && parts[0] === 'recovery' && request.method === 'GET') {
            return sendJson(response, 200, getRecoveryState?.() ?? {
              status: 'HEALTHY',
              code: 'HEALTHY',
              reasons: [],
              message: 'Startup recovery completed.',
              actions: [],
              counts: null,
              mutationBlocked: false,
              metrics: {},
            });
          }
          if (
            parts.length === 2 &&
            parts[0] === 'recovery' &&
            parts[1] === 'retry' &&
            request.method === 'POST'
          ) {
            if (!retryRecovery) {
              return sendJson(response, 400, { error: 'Recovery retry is unavailable.' });
            }
            return sendJson(response, 200, await retryRecovery());
          }
          if (parts.length === 1 && parts[0] === 'integrity' && request.method === 'GET') {
            const integrity = inspectLibraryStateIntegrity({
              database: store.database,
              userDataRoot,
              itemExists: (itemId) => store.itemExists(itemId),
            });
            return sendJson(response, 200, {
              ...integrity,
              recovery: getRecoveryState?.() ?? null,
            });
          }
          if (parts.length === 1 && parts[0] === 'catalog' && request.method === 'GET') {
            return sendJson(response, 200, store.getUiCatalog());
          }
          if (parts.length === 1 && parts[0] === 'views') {
            if (request.method === 'GET') return sendJson(response, 200, store.listViews());
            if (request.method === 'PUT') {
              const body = await readJson(request);
              if (typeof body.name !== 'string' || !body.name.trim() || !body.definition) {
                return sendJson(response, 400, { error: 'A view name and definition are required' });
              }
              return sendJson(response, 200, store.saveView(body.name.trim(), body.definition));
            }
          }
          if (
            parts.length === 2 &&
            parts[0] === 'items' &&
            request.method === 'PUT'
          ) {
            const body = await readJson(request);
            const item = store.updateItem(
              decodeURIComponent(parts[1]),
              body.patch,
              body.expectedRevision,
            );
            return sendJson(response, 200, { ok: true, item });
          }
          if (
            parts.length === 1 &&
            parts[0] === 'rebuild' &&
            request.method === 'POST'
          ) {
            if (!portableRoot) {
              return sendJson(response, 400, {
                error: 'No portable library root is configured.',
              });
            }
            const result = await rebuildPortableLibrary({
              root: portableRoot,
              database: store.database,
              searchStore,
              apply: true,
            });
            return sendJson(
              response,
              result.ok ? 200 : 409,
              sanitizedRebuild(result),
            );
          }
          return sendJson(response, 404, { error: 'Library route not found' });
        } catch (error) {
          if (error instanceof SyntaxError) {
            return sendJson(response, 400, { error: 'Invalid JSON body' });
          }
          return sendJson(response, error?.status ?? 500, {
            error: error?.message ?? 'Library error',
            ...(error?.conflict ? { conflict: error.conflict } : {}),
          });
        }
      });
    },
  };
}
