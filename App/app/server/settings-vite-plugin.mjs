import { createSettingsStore } from './settings-store.mjs';

const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MB is more than enough for settings

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
      const err = new Error('Request body too large');
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

export function settingsPlugin({ userDataRoot }) {
  const store = createSettingsStore({ userDataRoot });

  return {
    name: 'local-settings',
    configureServer(server) {
      server.middlewares.use('/api/settings', async (request, response) => {
        try {
          const url = new URL(request.url ?? '', 'http://localhost');
          const sub = url.pathname.replace(/^\/api\/settings\/?/, '').replace(/^\/+/, '');

          // GET /api/settings
          if ((sub === '' || sub === '/') && request.method === 'GET') {
            return sendJson(response, 200, store.getSettings());
          }

          // PUT /api/settings
          if ((sub === '' || sub === '/') && request.method === 'PUT') {
            const body = await readBody(request);
            const updated = store.saveSettings(body);
            return sendJson(response, 200, updated);
          }

          // POST /api/settings/reset
          if (sub === 'reset' && request.method === 'POST') {
            const defaults = store.resetSettings();
            return sendJson(response, 200, defaults);
          }

          // GET /api/settings/export
          if (sub === 'export' && request.method === 'GET') {
            const exported = store.exportSettings();
            return sendJson(response, 200, exported);
          }

          // POST /api/settings/import
          if (sub === 'import' && request.method === 'POST') {
            const body = await readBody(request);
            const imported = store.importSettings(body);
            return sendJson(response, 200, imported);
          }

          return sendJson(response, 404, { error: 'Settings route not found' });
        } catch (error) {
          const status = error.status || (error instanceof SyntaxError ? 400 : 500);
          return sendJson(response, status, { error: error.message || 'Settings error' });
        }
      });
    },
  };
}
