/**
 * Development-server parity for the OCR API — Phase 17.
 * Mirrors electron/desktop-service.mjs by delegating to the same handler.
 */

import { createOcrService } from './ocr/index.mjs';
import { handleOcrRequest } from './ocr/ocr-http.mjs';

const MAX_BODY_BYTES = 64 * 1024 * 1024; // generous: base64 page images

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('Request body too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

export function ocrPlugin({ dataRoot }) {
  const service = createOcrService({ dataRoot });

  return {
    name: 'local-ocr',
    configureServer(server) {
      server.middlewares.use('/api/ocr', async (request, response) => {
        try {
          const url = new URL(request.url ?? '', 'http://localhost');
          const rest = url.pathname.replace(/^\/?/, '').replace(/^\/+/, '');
          const body = request.method === 'POST' ? await readBody(request) : {};
          const result = await handleOcrRequest({
            service,
            method: request.method ?? 'GET',
            rest,
            body,
            query: Object.fromEntries(url.searchParams),
          });
          sendJson(response, result.status, result.payload);
        } catch (error) {
          sendJson(response, error.status ?? 500, { error: error.message || 'OCR error' });
        }
      });
    },
  };
}
