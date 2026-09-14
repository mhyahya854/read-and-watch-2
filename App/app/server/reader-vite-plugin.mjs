import { createReadStream, existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReaderStore } from './reader-store.mjs';

const MAX_BODY_BYTES = 16 * 1024;
const FORMAT_MIME_TYPES = {
  EPUB: 'application/epub+zip',
  MOBI: 'application/x-mobipocket-ebook',
  AZW: 'application/x-mobipocket-ebook',
  AZW3: 'application/x-mobipocket-ebook',
  FB2: 'application/x-fictionbook+xml',
  FBZ: 'application/x-zip-compressed-fb2',
  CBZ: 'application/vnd.comicbook+zip',
  PDF: 'application/pdf',
  TXT: 'text/plain; charset=utf-8',
  MD: 'text/markdown; charset=utf-8',
  MARKDOWN: 'text/markdown; charset=utf-8',
};

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
  readerExecutable = null,
  userDataRoot,
} = {}) {
  const store = createReaderStore({
    libraryRoot,
    libraryDatabasePath,
    readerExecutable,
    userDataRoot,
  });

  return {
    name: 'local-unified-reader',
    configureServer(server) {
      server.middlewares.use('/api/reader', async (request, response) => {
        try {
          const url = new URL(request.url ?? '', 'http://localhost');
          let parts = url.pathname.split('/').filter(Boolean);
          if (parts[0] === 'api' && parts[1] === 'reader')
            parts = parts.slice(2);

          if (parts[0] === 'pdfjs') {
            const pdfjsDistRoot = resolve(
              dirname(fileURLToPath(import.meta.url)),
              '../node_modules/pdfjs-dist',
            );
            if (parts.length === 2 && parts[1] === 'worker.mjs' && request.method === 'GET') {
              const workerPath = resolve(pdfjsDistRoot, 'build/pdf.worker.mjs');
              if (!existsSync(workerPath)) return sendJson(response, 404, { error: 'Worker not found' });
              response.statusCode = 200;
              response.setHeader('Content-Type', 'application/javascript; charset=utf-8');
              response.setHeader('X-Content-Type-Options', 'nosniff');
              response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
              createReadStream(workerPath).pipe(response);
              return;
            }
            if (parts.length === 3 && parts[1] === 'cmaps' && request.method === 'GET') {
              const filename = basename(decodeURIComponent(parts[2]));
              const cmapPath = resolve(pdfjsDistRoot, 'cmaps', filename);
              if (!existsSync(cmapPath)) return sendJson(response, 404, { error: 'CMap not found' });
              response.statusCode = 200;
              response.setHeader('Content-Type', 'application/octet-stream');
              response.setHeader('X-Content-Type-Options', 'nosniff');
              response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
              createReadStream(cmapPath).pipe(response);
              return;
            }
            if (parts.length === 3 && parts[1] === 'standard_fonts' && request.method === 'GET') {
              const filename = basename(decodeURIComponent(parts[2]));
              const fontPath = resolve(pdfjsDistRoot, 'standard_fonts', filename);
              if (!existsSync(fontPath)) return sendJson(response, 404, { error: 'Standard font not found' });
              response.statusCode = 200;
              response.setHeader('Content-Type', 'application/octet-stream');
              response.setHeader('X-Content-Type-Options', 'nosniff');
              response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
              createReadStream(fontPath).pipe(response);
              return;
            }
            return sendJson(response, 404, { error: 'PDF.js asset not found' });
          }

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
            parts[2] === 'file' &&
            request.method === 'GET'
          ) {
            const candidateId = url.searchParams.get('candidateId') || undefined;
            const fileInfo = store.getFile(decodeURIComponent(parts[1]), candidateId);
            const mime = FORMAT_MIME_TYPES[fileInfo.format] || 'application/octet-stream';
            response.statusCode = 200;
            response.setHeader('Content-Type', mime);
            response.setHeader('Content-Length', fileInfo.sizeBytes);
            response.setHeader('X-Content-Type-Options', 'nosniff');
            response.setHeader('Cache-Control', 'private, no-cache');
            createReadStream(fileInfo.source).pipe(response);
            return;
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

          // Reading State
          if (
            parts.length === 3 &&
            parts[0] === 'items' &&
            parts[2] === 'state' &&
            request.method === 'GET'
          ) {
            return sendJson(
              response,
              200,
              store.getReadingState(decodeURIComponent(parts[1])),
            );
          }
          if (
            parts.length === 3 &&
            parts[0] === 'items' &&
            parts[2] === 'position' &&
            request.method === 'PUT'
          ) {
            const body = await readJson(request);
            return sendJson(
              response,
              200,
              store.saveReadingState(decodeURIComponent(parts[1]), body),
            );
          }

          // Bookmarks
          if (
            parts.length === 3 &&
            parts[0] === 'items' &&
            parts[2] === 'bookmarks' &&
            request.method === 'GET'
          ) {
            return sendJson(
              response,
              200,
              store.getBookmarks(decodeURIComponent(parts[1])),
            );
          }
          if (
            parts.length === 3 &&
            parts[0] === 'items' &&
            parts[2] === 'bookmarks' &&
            request.method === 'POST'
          ) {
            const body = await readJson(request);
            return sendJson(
              response,
              201,
              store.addBookmark(decodeURIComponent(parts[1]), body),
            );
          }
          if (
            parts.length === 4 &&
            parts[0] === 'items' &&
            parts[2] === 'bookmarks' &&
            request.method === 'DELETE'
          ) {
            return sendJson(
              response,
              200,
              store.deleteBookmark(
                decodeURIComponent(parts[1]),
                decodeURIComponent(parts[3]),
              ),
            );
          }

          // Reader Settings
          if (parts.length === 1 && parts[0] === 'settings' && request.method === 'GET') {
            return sendJson(response, 200, store.getSettings());
          }
          if (parts.length === 1 && parts[0] === 'settings' && request.method === 'PUT') {
            const body = await readJson(request);
            return sendJson(response, 200, store.saveSettings(body));
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

