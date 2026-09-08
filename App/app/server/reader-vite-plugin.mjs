import { createReaderStore } from './reader-store.mjs';

const MAX_BODY_BYTES = 16 * 1024;

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

export function readerPlugin({
  libraryRoot,
  libraryDatabasePath,
  readerExecutable,
}) {
  const store = createReaderStore({
    libraryRoot,
    libraryDatabasePath,
    readerExecutable,
  });

  return {
    name: 'local-readest-reader',
    configureServer(server) {
      server.middlewares.use('/api/reader', async (request, response) => {
        try {
          const url = new URL(request.url ?? '', 'http://localhost');
          let parts = url.pathname.split('/').filter(Boolean);
          if (parts[0] === 'api' && parts[1] === 'reader')
            parts = parts.slice(2);

          if (
            parts.length === 2 &&
            parts[0] === 'items' &&
            request.method === 'GET'
          ) {
            return sendJson(
              response,
              200,
              store.getStatus(decodeURIComponent(parts[1])),
            );
          }
          if (
            parts.length === 3 &&
            parts[0] === 'items' &&
            parts[2] === 'open' &&
            request.method === 'POST'
          ) {
            const body = await readJson(request);
            if (
              body.candidateId !== undefined &&
              typeof body.candidateId !== 'string'
            ) {
              return sendJson(response, 400, {
                error: 'candidateId must be a string',
              });
            }
            return sendJson(
              response,
              200,
              await store.open(decodeURIComponent(parts[1]), body.candidateId),
            );
          }
          return sendJson(response, 404, { error: 'Reader route not found' });
        } catch (error) {
          if (error instanceof SyntaxError) {
            return sendJson(response, 400, { error: 'Invalid JSON body' });
          }
          return sendJson(response, error?.status ?? 500, {
            error: error?.message ?? 'Reader error',
          });
        }
      });
    },
  };
}
