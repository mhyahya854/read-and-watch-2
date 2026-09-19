import { createReadStream, existsSync } from 'node:fs';
import { basename, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReaderStore } from './reader-store.mjs';
import { createAnnotationStore } from './annotation-store.mjs';
import { createCanvasStore } from './canvas-store.mjs';
import { buildStudySummary } from './study-summary.mjs';

const MAX_BODY_BYTES = 16 * 1024 * 1024; // 16 MB — supports canvas payloads, exports, and image assets
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
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw Object.assign(new Error('Request body exceeds limit'), {
        status: 413,
      });
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

export function readerPlugin({
  libraryRoot,
  portableRoot = null,
  libraryDatabasePath,
  readerExecutable = null,
  userDataRoot,
  searchStore = null,
  annotationStore: providedAnnotationStore = null,
  canvasStore: providedCanvasStore = null,
} = {}) {
  const store = createReaderStore({
    libraryRoot,
    portableRoot,
    libraryDatabasePath,
    readerExecutable,
    userDataRoot,
    searchStore,
  });

  const annotationStore =
    providedAnnotationStore ||
    createAnnotationStore({
      databasePath: libraryDatabasePath,
      userDataRoot,
      searchStore,
    });

  const canvasStore =
    providedCanvasStore ||
    createCanvasStore({
      databasePath: libraryDatabasePath,
      userDataRoot,
      searchStore,
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

          // -------------------------------------------------------------------
          // Excalidraw — local static assets (fonts, locales, data)
          // GET /api/reader/excalidraw-assets/*
          // -------------------------------------------------------------------
          if (parts[0] === 'excalidraw-assets') {
            const excalidrawProdRoot = resolve(
              dirname(fileURLToPath(import.meta.url)),
              '../node_modules/@excalidraw/excalidraw/dist/prod',
            );
            const relativeAsset = parts.slice(1).map(decodeURIComponent).join('/');
            if (relativeAsset.includes('..')) {
              return sendJson(response, 400, { error: 'Invalid asset path' });
            }
            const assetPath = resolve(excalidrawProdRoot, relativeAsset);
            if (!existsSync(assetPath)) {
              return sendJson(response, 404, { error: 'Excalidraw asset not found' });
            }
            const ext = extname(assetPath).toLowerCase();
            const MIME_TYPES = {
              '.woff2': 'font/woff2',
              '.woff': 'font/woff',
              '.ttf': 'font/ttf',
              '.js': 'application/javascript; charset=utf-8',
              '.json': 'application/json; charset=utf-8',
              '.css': 'text/css; charset=utf-8',
              '.png': 'image/png',
              '.svg': 'image/svg+xml',
            };
            const mime = MIME_TYPES[ext] || 'application/octet-stream';
            response.statusCode = 200;
            response.setHeader('Content-Type', mime);
            response.setHeader('X-Content-Type-Options', 'nosniff');
            response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            createReadStream(assetPath).pipe(response);
            return;
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

          // -------------------------------------------------------------------
          // Annotations — GET list
          // GET /api/reader/items/:id/annotations
          // -------------------------------------------------------------------
          if (
            parts.length === 3 &&
            parts[0] === 'items' &&
            parts[2] === 'annotations' &&
            request.method === 'GET'
          ) {
            const itemId = decodeURIComponent(parts[1]);
            const includeDeleted = url.searchParams.get('includeDeleted') === 'true';
            return sendJson(response, 200, annotationStore.getAnnotations(itemId, { includeDeleted }));
          }

          // -------------------------------------------------------------------
          // Annotations — GET single
          // GET /api/reader/items/:id/annotations/:annotationId
          // -------------------------------------------------------------------
          if (
            parts.length === 4 &&
            parts[0] === 'items' &&
            parts[2] === 'annotations' &&
            request.method === 'GET'
          ) {
            const itemId = decodeURIComponent(parts[1]);
            const annotationId = decodeURIComponent(parts[3]);
            const ann = annotationStore.getAnnotation(annotationId, { itemId });
            if (!ann) return sendJson(response, 404, { error: 'Annotation not found' });
            return sendJson(response, 200, ann);
          }

          // -------------------------------------------------------------------
          // Annotations — POST create
          // POST /api/reader/items/:id/annotations
          // -------------------------------------------------------------------
          if (
            parts.length === 3 &&
            parts[0] === 'items' &&
            parts[2] === 'annotations' &&
            request.method === 'POST'
          ) {
            const itemId = decodeURIComponent(parts[1]);
            const body = await readJson(request);
            if (body.itemId && body.itemId !== itemId) {
              return sendJson(response, 400, {
                error: 'Annotation itemId does not match the requested item',
              });
            }
            body.itemId = itemId;
            const created = annotationStore.createAnnotation(body);
            return sendJson(response, 201, created);
          }

          // -------------------------------------------------------------------
          // Annotations — batch create
          // POST /api/reader/items/:id/annotations/batch
          // -------------------------------------------------------------------
          if (
            parts.length === 4 &&
            parts[0] === 'items' &&
            parts[2] === 'annotations' &&
            parts[3] === 'batch' &&
            request.method === 'POST'
          ) {
            const body = await readJson(request);
            const itemId = decodeURIComponent(parts[1]);
            return sendJson(
              response,
              201,
              annotationStore.batchCreateAnnotations(body.items ?? body, { itemId }),
            );
          }

          // -------------------------------------------------------------------
          // Annotations — PUT update single
          // PUT /api/reader/items/:id/annotations/:annotationId
          // -------------------------------------------------------------------
          if (
            parts.length === 4 &&
            parts[0] === 'items' &&
            parts[2] === 'annotations' &&
            request.method === 'PUT'
          ) {
            const itemId = decodeURIComponent(parts[1]);
            const annotationId = decodeURIComponent(parts[3]);
            const body = await readJson(request);
            const updated = annotationStore.updateAnnotation(
              annotationId,
              body,
              typeof body.expectedRevision === 'number' ? body.expectedRevision : body.revision,
              { itemId },
            );
            return sendJson(response, 200, updated);
          }

          // -------------------------------------------------------------------
          // Annotations — DELETE (soft)
          // DELETE /api/reader/items/:id/annotations/:annotationId
          // -------------------------------------------------------------------
          if (
            parts.length === 4 &&
            parts[0] === 'items' &&
            parts[2] === 'annotations' &&
            request.method === 'DELETE'
          ) {
            const itemId = decodeURIComponent(parts[1]);
            const annotationId = decodeURIComponent(parts[3]);
            const body = await readJson(request);
            const result = annotationStore.deleteAnnotation(
              annotationId,
              typeof body.expectedRevision === 'number' ? body.expectedRevision : body.revision,
              { itemId },
            );
            return sendJson(response, 200, result);
          }

          // -------------------------------------------------------------------
          // Annotations — PATCH restore (un-delete)
          // PATCH /api/reader/items/:id/annotations/:annotationId/restore
          // -------------------------------------------------------------------
          if (
            parts.length === 5 &&
            parts[0] === 'items' &&
            parts[2] === 'annotations' &&
            parts[4] === 'restore' &&
            request.method === 'PATCH'
          ) {
            const itemId = decodeURIComponent(parts[1]);
            const annotationId = decodeURIComponent(parts[3]);
            const body = await readJson(request);
            const restored = annotationStore.restoreAnnotation(
              annotationId,
              typeof body.expectedRevision === 'number' ? body.expectedRevision : undefined,
              { itemId },
            );
            return sendJson(response, 200, restored);
          }

          // -------------------------------------------------------------------
          // Annotations — source hash mismatch check
          // GET /api/reader/items/:id/annotations/hash-check?sourceHash=<sha256>
          // -------------------------------------------------------------------
          if (
            parts.length === 4 &&
            parts[0] === 'items' &&
            parts[2] === 'annotations' &&
            parts[3] === 'hash-check' &&
            request.method === 'GET'
          ) {
            const itemId = decodeURIComponent(parts[1]);
            const sourceHash = url.searchParams.get('sourceHash') || '';
            return sendJson(response, 200, annotationStore.checkSourceHashMismatches(itemId, sourceHash));
          }

          // -------------------------------------------------------------------
          // Annotations — crash recovery from external file
          // POST /api/reader/items/:id/annotations/recover
          // -------------------------------------------------------------------
          if (
            parts.length === 4 &&
            parts[0] === 'items' &&
            parts[2] === 'annotations' &&
            parts[3] === 'recover' &&
            request.method === 'POST'
          ) {
            const itemId = decodeURIComponent(parts[1]);
            return sendJson(response, 200, annotationStore.recoverFromExternalFile(itemId));
          }

          // ===================================================================
          // CANVASES (Phase 10 — Book-Linked Excalidraw Notes)
          // ===================================================================

          // GET /api/reader/canvases — list canvases
          if (parts.length === 1 && parts[0] === 'canvases' && request.method === 'GET') {
            const itemId = url.searchParams.get('itemId') || undefined;
            const includeDeleted = url.searchParams.get('includeDeleted') === 'true';
            const excludeWatchOwned = url.searchParams.get('scope') === 'global';
            const scopeKind = url.searchParams.get('scopeKind');
            const locationParam = url.searchParams.get('location');
            if (itemId && locationParam) {
              let location = null;
              try {
                location = JSON.parse(locationParam);
              } catch {
                return sendJson(response, 400, { error: 'location must be valid JSON' });
              }
              return sendJson(
                response,
                200,
                canvasStore.listCanvasesForLocation(itemId, location),
              );
            }
            return sendJson(
              response,
              200,
              canvasStore.listCanvases({
                itemId,
                includeDeleted,
                excludeWatchOwned,
                scopeKind: scopeKind === 'book' || scopeKind === 'location' ? scopeKind : null,
              })
            );
          }

          // POST /api/reader/canvases — create canvas
          if (parts.length === 1 && parts[0] === 'canvases' && request.method === 'POST') {
            const body = await readJson(request);
            const created = canvasStore.createCanvas(body);
            return sendJson(response, 201, created);
          }

          // POST /api/reader/canvases/import — import / restore canvas package
          if (parts.length === 2 && parts[0] === 'canvases' && parts[1] === 'import' && request.method === 'POST') {
            const body = await readJson(request);
            const pkg = body.package || body;
            const newId = body.newId === true;
            return sendJson(response, 201, canvasStore.importCanvas(pkg, { newId }));
          }

          // GET /api/reader/items/:id/canvases — list canvases for a specific book
          if (parts.length === 3 && parts[0] === 'items' && parts[2] === 'canvases' && request.method === 'GET') {
            const itemId = decodeURIComponent(parts[1]);
            const includeDeleted = url.searchParams.get('includeDeleted') === 'true';
            return sendJson(response, 200, canvasStore.listCanvases({ itemId, includeDeleted }));
          }

          // POST /api/reader/items/:id/canvases — create canvas attached to a book
          if (parts.length === 3 && parts[0] === 'items' && parts[2] === 'canvases' && request.method === 'POST') {
            const itemId = decodeURIComponent(parts[1]);
            const body = await readJson(request);
            body.itemId = itemId;
            const created = canvasStore.createCanvas(body);
            return sendJson(response, 201, created);
          }

          // GET /api/reader/items/:id/canvas-links — get all links for an item
          if (parts.length === 3 && parts[0] === 'items' && parts[2] === 'canvas-links' && request.method === 'GET') {
            const itemId = decodeURIComponent(parts[1]);
            return sendJson(response, 200, canvasStore.getLinksForItem(itemId));
          }

          // GET /api/reader/items/:id/study-summary — the book's own study state
          if (parts.length === 3 && parts[0] === 'items' && parts[2] === 'study-summary' && request.method === 'GET') {
            const itemId = decodeURIComponent(parts[1]);
            return sendJson(
              response,
              200,
              buildStudySummary({ itemId, annotationStore, canvasStore }),
            );
          }

          // GET /api/reader/annotations/:id/canvas-links — get links for an annotation
          if (parts.length === 3 && parts[0] === 'annotations' && parts[2] === 'canvas-links' && request.method === 'GET') {
            const annotationId = decodeURIComponent(parts[1]);
            return sendJson(response, 200, canvasStore.getLinksForAnnotation(annotationId));
          }

          // GET /api/reader/canvases/:id — get canvas document
          if (parts.length === 2 && parts[0] === 'canvases' && request.method === 'GET') {
            const canvasId = decodeURIComponent(parts[1]);
            canvasStore.assertCanvasOwnership(canvasId, url.searchParams.get('itemId'));
            return sendJson(response, 200, canvasStore.getCanvas(canvasId));
          }

          // PUT /api/reader/canvases/:id — update canvas scene + links
          if (parts.length === 2 && parts[0] === 'canvases' && request.method === 'PUT') {
            const canvasId = decodeURIComponent(parts[1]);
            canvasStore.assertCanvasOwnership(canvasId, url.searchParams.get('itemId'));
            const body = await readJson(request);
            const expectedRev = typeof body.expectedRevision === 'number' ? body.expectedRevision : body.revision;
            const updated = canvasStore.updateCanvas(canvasId, body, expectedRev);
            return sendJson(response, 200, updated);
          }

          // PUT /api/reader/canvases/:id/metadata — rename canvas
          if (parts.length === 3 && parts[0] === 'canvases' && parts[2] === 'metadata' && request.method === 'PUT') {
            const canvasId = decodeURIComponent(parts[1]);
            canvasStore.assertCanvasOwnership(canvasId, url.searchParams.get('itemId'));
            const body = await readJson(request);
            const expectedRev = typeof body.expectedRevision === 'number' ? body.expectedRevision : body.revision;
            const renamed = canvasStore.renameCanvas(canvasId, body.title, expectedRev);
            return sendJson(response, 200, renamed);
          }

          // DELETE /api/reader/canvases/:id — soft delete
          if (parts.length === 2 && parts[0] === 'canvases' && request.method === 'DELETE') {
            const canvasId = decodeURIComponent(parts[1]);
            canvasStore.assertCanvasOwnership(canvasId, url.searchParams.get('itemId'));
            const body = await readJson(request);
            const expectedRev = typeof body.expectedRevision === 'number' ? body.expectedRevision : body.revision;
            const result = canvasStore.deleteCanvas(canvasId, expectedRev);
            return sendJson(response, 200, result);
          }

          // PATCH /api/reader/canvases/:id/restore — restore soft deleted
          if (parts.length === 3 && parts[0] === 'canvases' && parts[2] === 'restore' && request.method === 'PATCH') {
            const canvasId = decodeURIComponent(parts[1]);
            canvasStore.assertCanvasOwnership(canvasId, url.searchParams.get('itemId'));
            const body = await readJson(request);
            const expectedRev = typeof body.expectedRevision === 'number' ? body.expectedRevision : undefined;
            const restored = canvasStore.restoreCanvas(canvasId, expectedRev);
            return sendJson(response, 200, restored);
          }

          // GET /api/reader/canvases/:id/links — get links
          if (parts.length === 3 && parts[0] === 'canvases' && parts[2] === 'links' && request.method === 'GET') {
            const canvasId = decodeURIComponent(parts[1]);
            canvasStore.assertCanvasOwnership(canvasId, url.searchParams.get('itemId'));
            return sendJson(response, 200, canvasStore.getCanvasLinks(canvasId));
          }

          // POST /api/reader/canvases/:id/links — add link
          if (parts.length === 3 && parts[0] === 'canvases' && parts[2] === 'links' && request.method === 'POST') {
            const canvasId = decodeURIComponent(parts[1]);
            canvasStore.assertCanvasOwnership(canvasId, url.searchParams.get('itemId'));
            const body = await readJson(request);
            const createdLink = canvasStore.addCanvasLink(canvasId, body);
            return sendJson(response, 201, createdLink);
          }

          // DELETE /api/reader/canvases/:id/links/:linkId — remove link
          if (parts.length === 4 && parts[0] === 'canvases' && parts[2] === 'links' && request.method === 'DELETE') {
            const canvasId = decodeURIComponent(parts[1]);
            canvasStore.assertCanvasOwnership(canvasId, url.searchParams.get('itemId'));
            const linkId = decodeURIComponent(parts[3]);
            return sendJson(response, 200, canvasStore.removeCanvasLink(linkId));
          }

          // POST /api/reader/canvases/:id/assets — upload image asset
          if (parts.length === 3 && parts[0] === 'canvases' && parts[2] === 'assets' && request.method === 'POST') {
            const canvasId = decodeURIComponent(parts[1]);
            canvasStore.assertCanvasOwnership(canvasId, url.searchParams.get('itemId'));
            const body = await readJson(request);
            const buffer = Buffer.from(body.dataBase64, 'base64');
            const asset = canvasStore.saveCanvasAsset(canvasId, {
              originalName: body.originalName || 'image.png',
              mimeType: body.mimeType || 'image/png',
              buffer,
            });
            return sendJson(response, 201, asset);
          }

          // GET /api/reader/canvases/:id/assets/:assetId — serve asset
          if (parts.length === 4 && parts[0] === 'canvases' && parts[2] === 'assets' && request.method === 'GET') {
            const canvasId = decodeURIComponent(parts[1]);
            canvasStore.assertCanvasOwnership(canvasId, url.searchParams.get('itemId'));
            const assetId = decodeURIComponent(parts[3]);
            const { meta, buffer } = canvasStore.getCanvasAsset(canvasId, assetId);
            response.statusCode = 200;
            response.setHeader('Content-Type', meta.mimeType);
            response.setHeader('Content-Length', meta.sizeBytes);
            response.setHeader('X-Content-Type-Options', 'nosniff');
            response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            response.end(buffer);
            return;
          }

          // GET /api/reader/canvases/:id/export — export canvas
          if (parts.length === 3 && parts[0] === 'canvases' && parts[2] === 'export' && request.method === 'GET') {
            const canvasId = decodeURIComponent(parts[1]);
            canvasStore.assertCanvasOwnership(canvasId, url.searchParams.get('itemId'));
            return sendJson(response, 200, canvasStore.exportCanvas(canvasId));
          }

          // POST /api/reader/canvases/:id/recover — recover canvas from external file
          if (parts.length === 3 && parts[0] === 'canvases' && parts[2] === 'recover' && request.method === 'POST') {
            const canvasId = decodeURIComponent(parts[1]);
            canvasStore.assertCanvasOwnership(canvasId, url.searchParams.get('itemId'));
            return sendJson(response, 200, canvasStore.recoverCanvasFromExternal(canvasId));
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
