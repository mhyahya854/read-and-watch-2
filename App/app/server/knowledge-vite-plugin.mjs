/**
 * Vite plugin exposing Knowledge and Diagram HTTP APIs.
 * Phase 13 — Knowledge and Diagram System.
 *
 * Routes:
 *   GET    /api/knowledge/graphs
 *   POST   /api/knowledge/graphs
 *   GET    /api/knowledge/graphs/:id
 *   PUT    /api/knowledge/graphs/:id
 *   DELETE /api/knowledge/graphs/:id
 *   GET    /api/knowledge/diagrams
 *   POST   /api/knowledge/diagrams
 *   GET    /api/knowledge/diagrams/:id
 *   PUT    /api/knowledge/diagrams/:id
 *   DELETE /api/knowledge/diagrams/:id
 *   POST   /api/knowledge/resolve-link
 *   GET    /api/knowledge/summary
 */

import { parse as parseUrl } from 'node:url';
import { createKnowledgeStore } from './knowledge-store.mjs';
import { createCanvasStore } from './canvas-store.mjs';

function sendJson(res, statusCode, data) {
  const json = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
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

/**
 * @param {{
 *   libraryDatabasePath?: string;
 *   userDataRoot?: string;
 *   searchStore?: any;
 *   knowledgeStore?: any;
 * }} [options]
 */
export function knowledgePlugin(options = {}) {
  const {
    libraryDatabasePath,
    userDataRoot,
    searchStore = null,
    knowledgeStore = null,
  } = options;
  const store =
    knowledgeStore ||
    createKnowledgeStore({
      databasePath: libraryDatabasePath,
      userDataRoot,
      searchStore,
    });

  const canvasStore = createCanvasStore({
    databasePath: libraryDatabasePath,
    userDataRoot,
  });

  return {
    name: 'knowledge-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const parsed = parseUrl(req.url, true);
        const path = parsed.pathname;

        if (!path.startsWith('/api/knowledge')) {
          return next();
        }

        try {
          // ---------------------------------------------------------------
          // Summary endpoint: /api/knowledge/summary
          // ---------------------------------------------------------------
          if (path === '/api/knowledge/summary' && req.method === 'GET') {
            const graphs = store.listGraphs();
            const diagrams = store.listDiagrams();
            const standaloneCanvases = canvasStore.listCanvases({ standaloneOnly: true });

            return sendJson(res, 200, {
              graphs,
              diagrams,
              conceptCanvasesCount: standaloneCanvases.length,
            });
          }

          // ---------------------------------------------------------------
          // Deep link resolution: POST /api/knowledge/resolve-link
          // ---------------------------------------------------------------
          if (path === '/api/knowledge/resolve-link' && req.method === 'POST') {
            const body = await readBody(req);
            const resolved = store.resolveDeepLink(body);
            return sendJson(res, 200, resolved);
          }

          // ---------------------------------------------------------------
          // Knowledge Graphs: /api/knowledge/graphs and /api/knowledge/graphs/:id
          // ---------------------------------------------------------------
          if (path === '/api/knowledge/graphs') {
            if (req.method === 'GET') {
              const tag = parsed.query.tag ? String(parsed.query.tag) : null;
              const graphs = store.listGraphs({ tag });
              return sendJson(res, 200, graphs);
            }
            if (req.method === 'POST') {
              const body = await readBody(req);
              const created = store.createGraph(body || {});
              return sendJson(res, 201, created);
            }
          }

          const graphMatch = path.match(/^\/api\/knowledge\/graphs\/([^/]+)$/);
          if (graphMatch) {
            const graphId = decodeURIComponent(graphMatch[1]);
            if (req.method === 'GET') {
              const doc = store.getGraph(graphId);
              return sendJson(res, 200, doc);
            }
            if (req.method === 'PUT') {
              const body = await readBody(req);
              const updated = store.saveGraphDocument(graphId, body || {});
              return sendJson(res, 200, updated);
            }
            if (req.method === 'DELETE') {
              const result = store.deleteGraph(graphId);
              return sendJson(res, 200, result);
            }
          }

          // ---------------------------------------------------------------
          // Mermaid Diagrams: /api/knowledge/diagrams and /api/knowledge/diagrams/:id
          // ---------------------------------------------------------------
          if (path === '/api/knowledge/diagrams') {
            if (req.method === 'GET') {
              const associatedItemId = parsed.query.itemId
                ? String(parsed.query.itemId)
                : null;
              const tag = parsed.query.tag ? String(parsed.query.tag) : null;
              const diagrams = store.listDiagrams({ associatedItemId, tag });
              return sendJson(res, 200, diagrams);
            }
            if (req.method === 'POST') {
              const body = await readBody(req);
              const created = store.createDiagram(body || {});
              return sendJson(res, 201, created);
            }
          }

          const diagramMatch = path.match(/^\/api\/knowledge\/diagrams\/([^/]+)$/);
          if (diagramMatch) {
            const diagramId = decodeURIComponent(diagramMatch[1]);
            if (req.method === 'GET') {
              const doc = store.getDiagram(diagramId);
              return sendJson(res, 200, doc);
            }
            if (req.method === 'PUT') {
              const body = await readBody(req);
              const updated = store.updateDiagram(diagramId, body || {});
              return sendJson(res, 200, updated);
            }
            if (req.method === 'DELETE') {
              const result = store.deleteDiagram(diagramId);
              return sendJson(res, 200, result);
            }
          }

          // Route not matched
          return sendJson(res, 404, { error: 'Knowledge API route not found' });
        } catch (err) {
          const status = err.status || 500;
          return sendJson(res, status, { error: err.message || 'Internal error' });
        }
      });
    },
  };
}
