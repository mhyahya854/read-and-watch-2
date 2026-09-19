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
import {
  convertLegacyGraphToKnowledgeCanvas,
  findImportedCanvas,
} from './canvas-knowledge.mjs';

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
 *   canvasStore?: any;
 * }} [options]
 */
export function knowledgePlugin(options = {}) {
  const {
    libraryDatabasePath,
    userDataRoot,
    searchStore = null,
    knowledgeStore = null,
    canvasStore: providedCanvasStore = null,
  } = options;
  const store =
    knowledgeStore ||
    createKnowledgeStore({
      databasePath: libraryDatabasePath,
      userDataRoot,
      searchStore,
    });

  const canvasStore =
    providedCanvasStore ||
    createCanvasStore({
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
            // Global legacy surfaces: title-owned Watch artifacts live in their
            // own Watch title workspace and must not masquerade as universal
            // knowledge. Legacy/unassigned AND Read-associated records stay.
            const graphs = store.listGraphs({ excludeWatchOwned: true });
            const diagrams = store.listDiagrams({ excludeWatchOwned: true });
            const standaloneCanvases = canvasStore.listCanvases({
              excludeWatchOwned: true,
            });

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
              const associatedItemId = parsed.query.itemId
                ? String(parsed.query.itemId)
                : null;
              const standaloneOnly = parsed.query.standalone === 'true';
              const tag = parsed.query.tag ? String(parsed.query.tag) : null;
              const graphs = store.listGraphs({
                associatedItemId,
                standaloneOnly,
                tag,
              });
              return sendJson(res, 200, graphs);
            }
            if (req.method === 'POST') {
              const body = await readBody(req);
              const payload = body || {};
              if (payload.itemId && !payload.associatedItemId) {
                payload.associatedItemId = payload.itemId;
              }
              const created = store.createGraph(payload);
              return sendJson(res, 201, created);
            }
          }

          const graphMatch = path.match(/^\/api\/knowledge\/graphs\/([^/]+)$/);
          if (graphMatch) {
            const graphId = decodeURIComponent(graphMatch[1]);
            const itemId = parsed.query.itemId ? String(parsed.query.itemId) : null;
            if (req.method === 'GET') {
              const doc = store.getGraph(graphId, { itemId });
              return sendJson(res, 200, doc);
            }
            if (req.method === 'PUT') {
              const body = await readBody(req);
              const updated = store.saveGraphDocument(graphId, body || {}, {
                itemId,
              });
              return sendJson(res, 200, updated);
            }
            if (req.method === 'DELETE') {
              const result = store.deleteGraph(graphId, { itemId });
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
              const standaloneOnly = parsed.query.standalone === 'true';
              const tag = parsed.query.tag ? String(parsed.query.tag) : null;
              const diagrams = store.listDiagrams({
                associatedItemId,
                standaloneOnly,
                tag,
              });
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
            const itemId = parsed.query.itemId ? String(parsed.query.itemId) : null;
            if (req.method === 'GET') {
              const doc = store.getDiagram(diagramId, { itemId });
              return sendJson(res, 200, doc);
            }
            if (req.method === 'PUT') {
              const body = await readBody(req);
              const updated = store.updateDiagram(diagramId, body || {}, { itemId });
              return sendJson(res, 200, updated);
            }
            if (req.method === 'DELETE') {
              const result = store.deleteDiagram(diagramId, { itemId });
              return sendJson(res, 200, result);
            }
          }

          // ---------------------------------------------------------------
          // Legacy item-owned knowledge graphs (Read study workspace)
          // GET  /api/knowledge/legacy-graphs?itemId=<item>
          // POST /api/knowledge/legacy-graphs/:graphId/import  { itemId }
          //
          // The original graph is never modified or deleted; import creates a
          // separate Knowledge Canvas that records the graph id as provenance.
          // ---------------------------------------------------------------
          if (path === '/api/knowledge/legacy-graphs' && req.method === 'GET') {
            const itemId = parsed.query.itemId ? String(parsed.query.itemId) : null;
            if (!itemId) {
              return sendJson(res, 400, { error: 'itemId is required' });
            }
            const graphs = store.listGraphs({ associatedItemId: itemId });
            const results = graphs.map((graph) => {
              const imported = findImportedCanvas(canvasStore, itemId, graph.id);
              return {
                id: graph.id,
                title: graph.title,
                nodeCount: graph.nodeCount,
                edgeCount: graph.edgeCount,
                updatedAt: graph.updatedAt,
                importedCanvasId: imported ? imported.id : null,
              };
            });
            return sendJson(res, 200, results);
          }

          const legacyImportMatch = path.match(
            /^\/api\/knowledge\/legacy-graphs\/([^/]+)\/import$/,
          );
          if (legacyImportMatch && req.method === 'POST') {
            const graphId = decodeURIComponent(legacyImportMatch[1]);
            const body = (await readBody(req)) || {};
            const itemId = body.itemId ? String(body.itemId) : null;
            if (!itemId) {
              return sendJson(res, 400, { error: 'itemId is required' });
            }
            // Ownership: the graph must belong to exactly this item.
            const graph = store.getGraph(graphId, { itemId });
            const existing = findImportedCanvas(canvasStore, itemId, graphId);
            if (existing) {
              return sendJson(res, 409, {
                error: 'This legacy graph has already been imported',
                canvasId: existing.id,
              });
            }
            const converted = convertLegacyGraphToKnowledgeCanvas(graph, { itemId });
            const created = canvasStore.createCanvas({
              itemId,
              title: converted.title,
              scope: converted.scope,
              knowledge: converted.knowledge,
            });
            return sendJson(res, 201, {
              canvasId: created.canvasId,
              legacyGraphId: graphId,
              blockCount: converted.knowledge.blocks.length,
              relationshipCount: converted.knowledge.relationships.length,
            });
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
