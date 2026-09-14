/**
 * Vite plugin exposing Portability, Export, and Backup HTTP APIs.
 *
 * Phase 12 — Export and Portability.
 *
 * Routes:
 *   GET  /api/portability/annotations?itemId=...&format=json|markdown
 *   GET  /api/portability/notes?itemId=...
 *   GET  /api/portability/canvases?itemId=...
 *   GET  /api/portability/canvases/:id
 *   GET  /api/portability/library-metadata
 *   GET  /api/portability/backup
 *   POST /api/portability/restore/preflight
 *   POST /api/portability/restore/apply
 *   GET  /api/portability/pdf/:itemId/annotated
 */

import { parse as parseUrl } from 'node:url';
import { createLibraryStore } from './library-store.mjs';
import { createAnnotationStore } from './annotation-store.mjs';
import { createReaderStore } from './reader-store.mjs';
import { createUserDataStore } from './user-data-store.mjs';
import { createCanvasStore } from './canvas-store.mjs';
import { createKnowledgeStore } from './knowledge-store.mjs';
import { createPortabilityStore } from './portability-store.mjs';

function sendJson(res, statusCode, data) {
  const json = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

function sendAttachment(res, statusCode, buffer, filename, contentType) {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': buffer.length,
    'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
  });
  res.end(buffer);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const str = Buffer.concat(chunks).toString('utf8');
        resolve(str ? JSON.parse(str) : null);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export function portabilityPlugin({
  libraryDatabasePath,
  libraryRoot,
  userDataRoot,
  searchStore = null,
  portabilityStore = null,
} = {}) {
  const store = portabilityStore || createPortabilityStore({
    databasePath: libraryDatabasePath,
    libraryRoot,
    userDataRoot,
    libraryStore: createLibraryStore({ databasePath: libraryDatabasePath, searchStore }),
    annotationStore: createAnnotationStore({ databasePath: libraryDatabasePath, userDataRoot, searchStore }),
    readerStore: createReaderStore({ libraryRoot, libraryDatabasePath, userDataRoot, searchStore }),
    userDataStore: createUserDataStore({ userDataRoot, libraryDatabasePath, searchStore }),
    canvasStore: createCanvasStore({ databasePath: libraryDatabasePath, userDataRoot, searchStore }),
    knowledgeStore: createKnowledgeStore({ databasePath: libraryDatabasePath, userDataRoot, searchStore }),
    searchStore,
  });

  return {
    name: 'read-watch-portability-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const { pathname, query } = parseUrl(req.url, true);

        if (!pathname || !pathname.startsWith('/api/portability')) {
          return next();
        }

        const subPath = pathname.replace('/api/portability', '').replace(/^\/+/, '');
        const parts = subPath.split('/').filter(Boolean);

        try {
          // GET /api/portability/annotations
          if (parts.length === 1 && parts[0] === 'annotations' && req.method === 'GET') {
            const itemId = query.itemId ? String(query.itemId) : undefined;
            const format = query.format === 'markdown' ? 'markdown' : 'json';
            const includeDeleted = query.includeDeleted === 'true';

            if (format === 'markdown') {
              const md = store.exportAnnotationsMarkdown({ itemId, includeDeleted });
              const filename = itemId ? `annotations-${itemId}.md` : 'annotations-library.md';
              return sendAttachment(res, 200, Buffer.from(md, 'utf8'), filename, 'text/markdown; charset=utf-8');
            } else {
              const data = store.exportAnnotationsJson({ itemId, includeDeleted });
              return sendJson(res, 200, data);
            }
          }

          // GET /api/portability/notes
          if (parts.length === 1 && parts[0] === 'notes' && req.method === 'GET') {
            const itemId = query.itemId ? String(query.itemId) : undefined;
            const data = store.exportNotes({ itemId });
            return sendJson(res, 200, data);
          }

          // GET /api/portability/canvases
          if (parts.length === 1 && parts[0] === 'canvases' && req.method === 'GET') {
            const itemId = query.itemId ? String(query.itemId) : undefined;
            const data = store.exportAllCanvases({ itemId });
            return sendJson(res, 200, data);
          }

          // GET /api/portability/canvases/:id
          if (parts.length === 2 && parts[0] === 'canvases' && req.method === 'GET') {
            const canvasId = decodeURIComponent(parts[1]);
            const data = store.exportCanvasPackage(canvasId);
            return sendJson(res, 200, data);
          }

          // GET /api/portability/knowledge/graphs/:id
          if (parts.length === 3 && parts[0] === 'knowledge' && parts[1] === 'graphs' && req.method === 'GET') {
            const graphId = decodeURIComponent(parts[2]);
            const data = store.exportKnowledgeGraph(graphId);
            return sendJson(res, 200, data);
          }

          // GET /api/portability/knowledge/diagrams/:id
          if (parts.length === 3 && parts[0] === 'knowledge' && parts[1] === 'diagrams' && req.method === 'GET') {
            const diagramId = decodeURIComponent(parts[2]);
            const data = store.exportMermaidDiagram(diagramId);
            return sendJson(res, 200, data);
          }

          // GET /api/portability/library-metadata
          if (parts.length === 1 && parts[0] === 'library-metadata' && req.method === 'GET') {
            const data = store.exportLibraryMetadata();
            return sendJson(res, 200, data);
          }

          // GET /api/portability/backup
          if (parts.length === 1 && parts[0] === 'backup' && req.method === 'GET') {
            const data = store.createBackupBundle();
            const filename = `read-watch-backup-${new Date().toISOString().slice(0, 10)}.rwbackup`;
            const jsonBuf = Buffer.from(JSON.stringify(data, null, 2), 'utf8');
            return sendAttachment(res, 200, jsonBuf, filename, 'application/json; charset=utf-8');
          }

          // POST /api/portability/restore/preflight
          if (parts.length === 2 && parts[0] === 'restore' && parts[1] === 'preflight' && req.method === 'POST') {
            const body = await readBody(req);
            const report = store.preflightRestore(body);
            return sendJson(res, 200, report);
          }

          // POST /api/portability/restore/apply
          if (parts.length === 2 && parts[0] === 'restore' && parts[1] === 'apply' && req.method === 'POST') {
            const body = await readBody(req);
            const backupPackage = body?.backup || body;
            const conflictResolution = body?.conflictResolution || 'skip';
            const result = store.applyRestore(backupPackage, { conflictResolution });
            return sendJson(res, 200, result);
          }

          // GET /api/portability/pdf/:itemId/annotated
          if (parts.length === 3 && parts[0] === 'pdf' && parts[2] === 'annotated' && req.method === 'GET') {
            const itemId = decodeURIComponent(parts[1]);
            const includeComments = query.summary !== 'false';
            const result = await store.exportAnnotatedPdf({
              itemId,
              includeCommentsSummaryPage: includeComments,
            });

            // Read the generated derivative bytes to stream back
            const { readFileSync } = await import('node:fs');
            const pdfBytes = readFileSync(result.targetPath);
            const filename = `${itemId}-annotated.pdf`;
            return sendAttachment(res, 200, pdfBytes, filename, 'application/pdf');
          }

          return sendJson(res, 404, { error: 'Portability route not found' });
        } catch (error) {
          if (error instanceof SyntaxError) {
            return sendJson(res, 400, { error: 'Invalid JSON request payload' });
          }
          const status = error?.status || 500;
          return sendJson(res, status, {
            error: error?.message || 'Portability error',
            code: error?.code,
          });
        }
      });
    },
  };
}
