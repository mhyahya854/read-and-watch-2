import { createUserDataStore } from './user-data-store.mjs';

const MAX_BODY_BYTES = 4 * 1024 * 1024;

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw Object.assign(new Error('Request body too large'), { status: 413 });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function userDataPlugin({ userDataRoot, libraryDatabasePath }) {
  const store = createUserDataStore({ userDataRoot, libraryDatabasePath });

  return {
    name: 'local-user-data',
    configureServer(server) {
      server.middlewares.use(
        '/api/user-data',
        async (request, response, next) => {
          try {
            const url = new URL(request.url ?? '', 'http://localhost');
            let parts = url.pathname.split('/').filter(Boolean);
            if (parts[0] === 'api' && parts[1] === 'user-data') {
              parts = parts.slice(2);
            }
            // /index
            if (
              parts.length === 1 &&
              parts[0] === 'index' &&
              request.method === 'GET'
            ) {
              return sendJson(response, 200, store.getIndex());
            }
            // /:type/:itemId
            if (
              parts.length !== 2 ||
              !['thoughts', 'notes'].includes(parts[0])
            ) {
              return sendJson(response, 400, {
                error: 'Invalid user-data route',
              });
            }
            const [type, itemId] = [parts[0], decodeURIComponent(parts[1])];
            if (request.method === 'GET') {
              return sendJson(response, 200, store.load(type, itemId));
            }
            if (request.method === 'PUT') {
              const body = JSON.parse(await readBody(request));
              if (typeof body.content !== 'string') {
                return sendJson(response, 400, {
                  error: 'content must be a string',
                });
              }
              const result = store.save(
                type,
                itemId,
                body.content,
                body.baseRevision ?? null,
              );
              return sendJson(response, result.ok ? 200 : 409, result);
            }
            return sendJson(response, 405, { error: 'Method not allowed' });
          } catch (error) {
            if (error?.status === 413) {
              return sendJson(response, 413, {
                error: 'Request body too large',
              });
            }
            if (error instanceof SyntaxError) {
              return sendJson(response, 400, { error: 'Invalid JSON body' });
            }
            return sendJson(response, 400, {
              error: error?.message ?? 'User-data error',
            });
          }
        },
      );
    },
  };
}
