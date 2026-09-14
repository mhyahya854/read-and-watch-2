/**
 * Vite Plugin for Derived Search API Endpoints.
 *
 * Phase 11 — Search, Annotation Browser, and Study Workflow.
 *
 * Endpoints:
 *   GET  /api/search         — query derived index (query, type, book, limit, offset)
 *   GET  /api/search/status  — get index health, counts, and schema version
 *   POST /api/search/rebuild — trigger full deterministic rebuild
 *   GET  /api/search/books   — list filterable books with study artifact counts
 */

import { createSearchStore } from './search-store.mjs';

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

export function searchPlugin({ searchStore, databasePath, userDataRoot }) {
  const store =
    searchStore ||
    createSearchStore({
      databasePath,
      userDataRoot,
    });

  return {
    name: 'local-search-api',
    configureServer(server) {
      server.middlewares.use('/api/search', async (request, response) => {
        try {
          const url = new URL(request.url ?? '', 'http://localhost');
          let parts = url.pathname.split('/').filter(Boolean);
          if (parts[0] === 'api' && parts[1] === 'search') {
            parts = parts.slice(2);
          }

          // GET /api/search/status — index status & counts
          if (parts.length === 1 && parts[0] === 'status' && request.method === 'GET') {
            return sendJson(response, 200, store.getStatus());
          }

          // POST /api/search/rebuild — trigger rebuild
          if (parts.length === 1 && parts[0] === 'rebuild' && request.method === 'POST') {
            const result = store.rebuildIndex();
            return sendJson(response, 200, result);
          }

          // GET /api/search/books — filterable books
          if (parts.length === 1 && parts[0] === 'books' && request.method === 'GET') {
            return sendJson(response, 200, store.getFilterableBooks());
          }

          // GET /api/search — main search query
          if (parts.length === 0 && request.method === 'GET') {
            const q = url.searchParams.get('q') || '';
            const type = url.searchParams.get('type') || 'all';
            const book = url.searchParams.get('book') || null;
            const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit'), 10) : 50;
            const offset = url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset'), 10) : 0;

            const results = store.search({
              query: q,
              typeFilter: type,
              bookFilter: book,
              limit,
              offset,
            });

            return sendJson(response, 200, results);
          }

          return sendJson(response, 404, { error: 'Search endpoint not found' });
        } catch (error) {
          return sendJson(response, error?.status ?? 500, {
            error: error?.message ?? 'Search server error',
          });
        }
      });
    },
  };
}
