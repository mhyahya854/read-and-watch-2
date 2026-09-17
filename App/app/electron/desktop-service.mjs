/**
 * Read & Watch Internal Desktop HTTP Service.
 * Phase 14 — Desktop Native Integration.
 *
 * Runs inside the privileged Electron main process (Node.js runtime).
 * Binds strictly to 127.0.0.1 on an ephemeral port.
 * Dispatches API requests directly to tested, canonical application stores.
 * Serves static client assets and delegates page renders to dist/server/index.js.
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

export const DESKTOP_CSP = [
  "default-src 'self' http://127.0.0.1:*",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: http://127.0.0.1:*",
  "font-src 'self' blob: data:",
  "connect-src 'self' http://127.0.0.1:* blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'self' blob: data:",
  "frame-ancestors 'none'",
].join('; ');

import { resolveDataPaths } from '../server/data-paths.mjs';
import { createLibraryStore } from '../server/library-store.mjs';
import { createUserDataStore } from '../server/user-data-store.mjs';
import { createReaderStore } from '../server/reader-store.mjs';
import { createAnnotationStore } from '../server/annotation-store.mjs';
import { createCanvasStore } from '../server/canvas-store.mjs';
import { createKnowledgeStore } from '../server/knowledge-store.mjs';
import { createSearchStore } from '../server/search-store.mjs';
import { createPortabilityStore } from '../server/portability-store.mjs';
import { createSettingsStore } from '../server/settings-store.mjs';
import { createOcrService } from '../server/ocr/index.mjs';
import { handleOcrRequest } from '../server/ocr/ocr-http.mjs';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.epub': 'application/epub+zip',
  '.pdf': 'application/pdf',
};

const MAX_BODY_BYTES = 16 * 1024 * 1024; // 16 MB

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(body);
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(text);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const err = new Error('Request payload exceeds limit');
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

export function createDesktopService({ appRoot, dataRootOverride = null }) {
  const env = { ...process.env };
  if (dataRootOverride) {
    env.READ_WATCH_DATA_ROOT = dataRootOverride;
  }

  const paths = resolveDataPaths({ appRoot, environment: env });
  const { libraryDatabasePath, libraryRoot, userDataRoot } = paths;

  if (libraryDatabasePath && libraryDatabasePath !== ':memory:') {
    try {
      mkdirSync(dirname(libraryDatabasePath), { recursive: true });
    } catch {}
  }
  if (userDataRoot) {
    try {
      mkdirSync(userDataRoot, { recursive: true });
    } catch {}
  }

  // Initialize canonical stores
  const searchStore = createSearchStore({
    databasePath: libraryDatabasePath,
    userDataRoot,
  });

  const libraryStore = createLibraryStore({
    databasePath: libraryDatabasePath,
    searchStore,
  });

  const userDataStore = createUserDataStore({
    userDataRoot,
    libraryDatabasePath,
    searchStore,
  });

  const readerStore = createReaderStore({
    libraryRoot,
    libraryDatabasePath,
    userDataRoot,
    searchStore,
  });

  const annotationStore = createAnnotationStore({
    databasePath: libraryDatabasePath,
    userDataRoot,
    searchStore,
  });

  const canvasStore = createCanvasStore({
    databasePath: libraryDatabasePath,
    userDataRoot,
    searchStore,
  });

  const knowledgeStore = createKnowledgeStore({
    databasePath: libraryDatabasePath,
    userDataRoot,
    searchStore,
  });

  const portabilityStore = createPortabilityStore({
    databasePath: libraryDatabasePath,
    libraryRoot,
    userDataRoot,
    searchStore,
    libraryStore,
    annotationStore,
    readerStore,
    userDataStore,
    canvasStore,
    knowledgeStore,
  });

  const settingsStore = createSettingsStore({
    userDataRoot,
  });

  // Phase 17: OCR engines, models, runtimes, and derived results live under the
  // external data root. Nothing is copied into the repository.
  const ocrService = createOcrService({ dataRoot: paths.dataRoot });

  const sessionToken = randomBytes(32).toString('hex');
  const clientDistDir = resolve(appRoot, 'dist', 'client');
  const serverDistIndex = resolve(appRoot, 'dist', 'server', 'index.js');

  // Lazy-load SSR/RSC handler if dist exists
  let ssrHandler = null;
  if (existsSync(serverDistIndex)) {
    import(`file://${serverDistIndex.replace(/\\/g, '/')}`)
      .then((mod) => {
        ssrHandler = mod?.default?.fetch || null;
      })
      .catch((err) => {
        console.warn('[desktop-service] SSR bundle not loaded; fallback to static mode:', err.message);
      });
  }

  function safeLibraryFile(requestPath) {
    const decoded = decodeURIComponent(requestPath.split('?')[0] ?? '')
      .replace(/^\/+/, '')
      .replace(/^library-assets\//, '');
    if (decoded.includes('\0')) {
      throw new Error('Null byte in path forbidden');
    }
    if (decoded.includes(':')) {
      throw new Error('Alternate data streams forbidden');
    }
    const baseName = decoded.split(/[/\\]/).pop() || '';
    const bareName = baseName.split('.')[0].toUpperCase();
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(bareName)) {
      throw new Error('Windows reserved device name forbidden');
    }
    const candidate = resolve(libraryRoot, decoded);
    const fromRoot = relative(libraryRoot, candidate);
    if (!fromRoot || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
      throw new Error('Unsafe library asset path');
    }
    if (existsSync(candidate)) {
      const canonicalLibRoot = existsSync(libraryRoot) ? realpathSync(libraryRoot) : libraryRoot;
      const real = realpathSync(candidate);
      const realFromRoot = relative(canonicalLibRoot, real);
      if (!realFromRoot || realFromRoot.startsWith('..') || isAbsolute(realFromRoot)) {
        throw new Error('Unsafe library asset reparse point');
      }
      return real;
    }
    return candidate;
  }

  function handleLibraryAssets(req, res, pathname) {
    try {
      const assetPath = pathname.replace(/^\/library-assets\/?/, '');
      const filePath = safeLibraryFile(assetPath);
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        return sendText(res, 404, 'Asset not found');
      }
      const ext = extname(filePath).toLowerCase();
      res.statusCode = 200;
      res.setHeader('Content-Type', CONTENT_TYPES[ext] ?? 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      createReadStream(filePath).pipe(res);
    } catch {
      sendText(res, 404, 'Not found');
    }
  }

  async function handleApiRequest(req, res, url) {
    const pathname = url.pathname;
    const method = req.method;

    // -------------------------------------------------------------
    // Desktop Native APIs: /api/desktop/*
    // -------------------------------------------------------------
    if (pathname === '/api/desktop/status' && method === 'GET') {
      return sendJson(res, 200, {
        isDesktop: true,
        sessionToken,
        paths,
      });
    }

    if (pathname === '/api/desktop/resolve-open-file' && method === 'POST') {
      const token = req.headers['x-readwatch-session-token'];
      if (!token) {
        return sendJson(res, 401, { error: 'Unauthorized: missing session token' });
      }
      if (token !== sessionToken) {
        return sendJson(res, 403, { error: 'Forbidden: invalid session token' });
      }

      const body = await readJsonBody(req);
      const filePath = body?.path;
      if (!filePath || typeof filePath !== 'string' || !existsSync(filePath)) {
        return sendJson(res, 400, { error: 'Invalid or nonexistent file path' });
      }

      const stats = statSync(filePath);
      if (!stats.isFile()) {
        return sendJson(res, 400, { error: 'Path is not a regular file' });
      }

      // Compute SHA-256 of the incoming file
      const hash = createHash('sha256').update(readFileSync(filePath)).digest('hex');
      const ext = extname(filePath).toLowerCase();
      const name = filePath.split(/[/\\]/).pop() || '';

      // Check catalog for an item containing this exact file hash
      const catalog = libraryStore.getCatalog();
      let matchedItem = null;
      for (const item of catalog.items) {
        if (item.media && Array.isArray(item.media)) {
          for (const media of item.media) {
            if (media.sha256 === hash) {
              matchedItem = item;
              break;
            }
          }
        }
        if (matchedItem) break;
      }

      if (matchedItem) {
        return sendJson(res, 200, {
          found: true,
          itemId: matchedItem.id,
          title: matchedItem.title,
          file: { path: filePath, name, size: stats.size, ext, hash },
        });
      }

      return sendJson(res, 200, {
        found: false,
        file: { path: filePath, name, size: stats.size, ext, hash },
      });
    }

    // -------------------------------------------------------------
    // Library APIs: /api/library/*
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/library')) {
      const parts = pathname.replace(/^\/api\/library\/?/, '').split('/').filter(Boolean);
      if (parts.length === 1 && parts[0] === 'catalog' && method === 'GET') {
        return sendJson(res, 200, libraryStore.getUiCatalog());
      }
      if (parts.length === 1 && parts[0] === 'views') {
        if (method === 'GET') return sendJson(res, 200, libraryStore.listViews());
        if (method === 'PUT') {
          const body = await readJsonBody(req);
          return sendJson(res, 200, libraryStore.saveView(body.name, body.definition));
        }
      }
      if (parts.length === 2 && parts[0] === 'items' && method === 'PUT') {
        const body = await readJsonBody(req);
        const item = libraryStore.updateItem(decodeURIComponent(parts[1]), body.patch, body.expectedRevision);
        return sendJson(res, 200, { ok: true, item });
      }
      return sendJson(res, 404, { error: 'Library route not found' });
    }

    // -------------------------------------------------------------
    // User Data APIs: /api/user-data/*
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/user-data')) {
      const parts = pathname.replace(/^\/api\/user-data\/?/, '').split('/').filter(Boolean);
      if (parts.length === 1 && parts[0] === 'index' && method === 'GET') {
        return sendJson(res, 200, userDataStore.getIndex());
      }
      if (parts.length === 2 && ['thoughts', 'notes'].includes(parts[0])) {
        const [type, itemId] = [parts[0], decodeURIComponent(parts[1])];
        if (method === 'GET') return sendJson(res, 200, userDataStore.load(type, itemId));
        if (method === 'PUT') {
          const body = await readJsonBody(req);
          const result = userDataStore.save(type, itemId, body.content, body.baseRevision ?? null);
          return sendJson(res, result.ok ? 200 : 409, result);
        }
      }
      return sendJson(res, 404, { error: 'User-data route not found' });
    }

    // -------------------------------------------------------------
    // Reader APIs: /api/reader/*
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/reader')) {
      const sub = pathname.replace(/^\/api\/reader\/?/, '');

      // GET /api/reader/items/:id/file (Streaming document bytes)
      const fileMatch = sub.match(/^items\/([^/]+)\/file$/);
      if (fileMatch && method === 'GET') {
        const itemId = decodeURIComponent(fileMatch[1]);
        const item = libraryStore.getItem(itemId);
        if (!item) return sendJson(res, 404, { error: 'Item not found' });
        const media = item.media?.[0];
        if (!media) return sendJson(res, 404, { error: 'Media not found' });
        const filePath = safeLibraryFile(media.path);
        if (!existsSync(filePath)) return sendJson(res, 404, { error: 'File missing' });

        const ext = extname(filePath).toLowerCase();
        res.statusCode = 200;
        res.setHeader('Content-Type', CONTENT_TYPES[ext] ?? 'application/octet-stream');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return createReadStream(filePath).pipe(res);
      }

      // GET /api/reader/items/:id/bookmarks
      const bmarkMatch = sub.match(/^items\/([^/]+)\/bookmarks$/);
      if (bmarkMatch) {
        const itemId = decodeURIComponent(bmarkMatch[1]);
        if (method === 'GET') return sendJson(res, 200, readerStore.getBookmarks(itemId));
        if (method === 'PUT') {
          const body = await readJsonBody(req);
          return sendJson(res, 200, readerStore.saveBookmarks(itemId, body.bookmarks));
        }
      }

      // State / settings
      if (sub === 'settings' && method === 'GET') {
        return sendJson(res, 200, readerStore.getSettings());
      }
      if (sub === 'settings' && method === 'PUT') {
        const body = await readJsonBody(req);
        return sendJson(res, 200, readerStore.saveSettings(body));
      }

      return sendJson(res, 404, { error: 'Reader route not found' });
    }

    // -------------------------------------------------------------
    // Annotation APIs: /api/annotations/*
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/annotations')) {
      const sub = pathname.replace(/^\/api\/annotations\/?/, '');
      const itemMatch = sub.match(/^items\/([^/]+)$/);
      if (itemMatch && method === 'GET') {
        const itemId = decodeURIComponent(itemMatch[1]);
        return sendJson(res, 200, annotationStore.listAnnotations(itemId));
      }
      if (method === 'POST') {
        const body = await readJsonBody(req);
        return sendJson(res, 201, annotationStore.createAnnotation(body));
      }
      const annMatch = sub.match(/^([^/]+)$/);
      if (annMatch) {
        const annId = decodeURIComponent(annMatch[1]);
        if (method === 'GET') return sendJson(res, 200, annotationStore.getAnnotation(annId));
        if (method === 'PUT') {
          const body = await readJsonBody(req);
          return sendJson(res, 200, annotationStore.updateAnnotation(annId, body));
        }
        if (method === 'DELETE') {
          return sendJson(res, 200, annotationStore.deleteAnnotation(annId));
        }
      }
      return sendJson(res, 404, { error: 'Annotation route not found' });
    }

    // -------------------------------------------------------------
    // Canvas APIs: /api/canvases/*
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/canvases')) {
      const sub = pathname.replace(/^\/api\/canvases\/?/, '');
      if (sub === '' || sub === '/') {
        if (method === 'GET') return sendJson(res, 200, canvasStore.listCanvases());
        if (method === 'POST') {
          const body = await readJsonBody(req);
          return sendJson(res, 201, canvasStore.createCanvas(body));
        }
      }
      const canvasMatch = sub.match(/^([^/]+)$/);
      if (canvasMatch) {
        const id = decodeURIComponent(canvasMatch[1]);
        if (method === 'GET') return sendJson(res, 200, canvasStore.getCanvas(id));
        if (method === 'PUT') {
          const body = await readJsonBody(req);
          return sendJson(res, 200, canvasStore.updateCanvas(id, body));
        }
        if (method === 'DELETE') {
          return sendJson(res, 200, canvasStore.deleteCanvas(id));
        }
      }
      return sendJson(res, 404, { error: 'Canvas route not found' });
    }

    // -------------------------------------------------------------
    // Knowledge APIs: /api/knowledge/*
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/knowledge')) {
      const sub = pathname.replace(/^\/api\/knowledge\/?/, '');
      if (sub === 'summary' && method === 'GET') {
        const graphs = knowledgeStore.listGraphs();
        const diagrams = knowledgeStore.listDiagrams();
        const standalone = canvasStore.listCanvases({ standaloneOnly: true });
        return sendJson(res, 200, { graphs, diagrams, conceptCanvasesCount: standalone.length });
      }
      if (sub === 'resolve-link' && method === 'POST') {
        const body = await readJsonBody(req);
        return sendJson(res, 200, knowledgeStore.resolveDeepLink(body));
      }
      if (sub === 'graphs' && method === 'GET') {
        return sendJson(res, 200, knowledgeStore.listGraphs());
      }
      if (sub === 'graphs' && method === 'POST') {
        const body = await readJsonBody(req);
        return sendJson(res, 201, knowledgeStore.createGraph(body));
      }
      const gMatch = sub.match(/^graphs\/([^/]+)$/);
      if (gMatch) {
        const id = decodeURIComponent(gMatch[1]);
        if (method === 'GET') return sendJson(res, 200, knowledgeStore.getGraph(id));
        if (method === 'PUT') {
          const body = await readJsonBody(req);
          return sendJson(res, 200, knowledgeStore.saveGraphDocument(id, body));
        }
        if (method === 'DELETE') return sendJson(res, 200, knowledgeStore.deleteGraph(id));
      }
      if (sub === 'diagrams' && method === 'GET') {
        return sendJson(res, 200, knowledgeStore.listDiagrams());
      }
      if (sub === 'diagrams' && method === 'POST') {
        const body = await readJsonBody(req);
        return sendJson(res, 201, knowledgeStore.createDiagram(body));
      }
      const dMatch = sub.match(/^diagrams\/([^/]+)$/);
      if (dMatch) {
        const id = decodeURIComponent(dMatch[1]);
        if (method === 'GET') return sendJson(res, 200, knowledgeStore.getDiagram(id));
        if (method === 'PUT') {
          const body = await readJsonBody(req);
          return sendJson(res, 200, knowledgeStore.updateDiagram(id, body));
        }
        if (method === 'DELETE') return sendJson(res, 200, knowledgeStore.deleteDiagram(id));
      }
      return sendJson(res, 404, { error: 'Knowledge route not found' });
    }

    // -------------------------------------------------------------
    // Search APIs: /api/search/*
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/search')) {
      const sub = pathname.replace(/^\/api\/search\/?/, '');
      if (sub === 'status' && method === 'GET') return sendJson(res, 200, searchStore.getStatus());
      if (sub === 'rebuild' && method === 'POST') return sendJson(res, 200, searchStore.rebuildIndex());
      if (sub === 'books' && method === 'GET') return sendJson(res, 200, searchStore.getFilterableBooks());
      if (sub === '' && method === 'GET') {
        const q = url.searchParams.get('q') || '';
        const type = url.searchParams.get('type') || 'all';
        const book = url.searchParams.get('book') || null;
        const limit = Number(url.searchParams.get('limit') || 50);
        const offset = Number(url.searchParams.get('offset') || 0);
        return sendJson(res, 200, searchStore.search({ query: q, typeFilter: type, bookFilter: book, limit, offset }));
      }
      return sendJson(res, 404, { error: 'Search route not found' });
    }

    // -------------------------------------------------------------
    // Portability APIs: /api/portability/*
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/portability')) {
      const sub = pathname.replace(/^\/api\/portability\/?/, '');
      if (sub === 'backup' && method === 'GET') {
        const backup = portabilityStore.createBackupBundle();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', 'attachment; filename="read-watch-backup.rwbackup"');
        return res.end(backup);
      }
      if (sub === 'restore/preflight' && method === 'POST') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const buf = Buffer.concat(chunks);
        return sendJson(res, 200, portabilityStore.preflightRestore(buf));
      }
      return sendJson(res, 404, { error: 'Portability route not found' });
    }

    // -------------------------------------------------------------
    // Settings APIs: /api/settings/*
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/settings')) {
      const sub = pathname.replace(/^\/api\/settings\/?/, '');
      if ((sub === '' || sub === '/') && method === 'GET') {
        return sendJson(res, 200, settingsStore.getSettings());
      }
      if ((sub === '' || sub === '/') && method === 'PUT') {
        const body = await readJsonBody(req);
        return sendJson(res, 200, settingsStore.saveSettings(body));
      }
      if (sub === 'reset' && method === 'POST') {
        return sendJson(res, 200, settingsStore.resetSettings());
      }
      if (sub === 'export' && method === 'GET') {
        return sendJson(res, 200, settingsStore.exportSettings());
      }
      if (sub === 'import' && method === 'POST') {
        const body = await readJsonBody(req);
        return sendJson(res, 200, settingsStore.importSettings(body));
      }
      return sendJson(res, 404, { error: 'Settings route not found' });
    }

    // -------------------------------------------------------------
    // OCR APIs: /api/ocr/*  (Phase 17)
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/ocr')) {
      const rest = pathname.replace(/^\/api\/ocr\/?/, '');
      const body = method === 'POST' ? await readJsonBody(req) : {};
      const result = await handleOcrRequest({
        service: ocrService,
        method,
        rest,
        body,
        query: Object.fromEntries(url.searchParams),
        signal: req.signal,
      });
      return sendJson(res, result.status, result.payload);
    }

    return sendJson(res, 404, { error: 'Unknown API endpoint' });
  }

  function handleStaticFile(req, res, pathname) {
    if (!existsSync(clientDistDir)) {
      return false;
    }
    const cleanPath = pathname.replace(/^\/+/, '');
    const candidate = resolve(clientDistDir, cleanPath);
    const rel = relative(clientDistDir, candidate);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
      return false;
    }
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      const ext = extname(candidate).toLowerCase();
      res.statusCode = 200;
      res.setHeader('Content-Type', CONTENT_TYPES[ext] ?? 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      createReadStream(candidate).pipe(res);
      return true;
    }
    return false;
  }

  function isAllowedHost(hostHeader) {
    if (!hostHeader) return true;
    const host = hostHeader.replace(/:\d+$/, '').toLowerCase();
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1';
  }

  function isAllowedOrigin(originHeader) {
    if (!originHeader) return true;
    try {
      const u = new URL(originHeader);
      const host = u.hostname.toLowerCase();
      return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
    } catch {
      return false;
    }
  }

  const server = createServer(async (req, res) => {
    try {
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', DESKTOP_CSP);

      if (!isAllowedHost(req.headers.host)) {
        return sendJson(res, 403, { error: 'Forbidden: untrusted host' });
      }
      if (!isAllowedOrigin(req.headers.origin)) {
        return sendJson(res, 403, { error: 'Forbidden: untrusted origin' });
      }

      const url = new URL(req.url ?? '/', `http://127.0.0.1`);
      const pathname = url.pathname;

      // 1. Library Media Assets
      if (pathname.startsWith('/library-assets/')) {
        return handleLibraryAssets(req, res, pathname);
      }

      // 2. Canonical API Routes
      if (pathname.startsWith('/api/')) {
        return await handleApiRequest(req, res, url);
      }

      // 3. Static Client Files (HTML/CSS/JS/Images)
      if (handleStaticFile(req, res, pathname)) {
        return;
      }

      // 4. SSR/RSC Handler (for pages: /, /reader/:id, /knowledge, /settings, etc.)
      if (ssrHandler) {
        const webReq = new Request(url.href, {
          method: req.method,
          headers: req.headers,
        });
        const webRes = await ssrHandler(webReq, {
          ASSETS: {
            fetch: async (assetReq) => {
              const u = new URL(assetReq.url);
              const p = resolve(clientDistDir, u.pathname.replace(/^\/+/, ''));
              if (existsSync(p) && statSync(p).isFile()) {
                const ext = extname(p).toLowerCase();
                return new Response(readFileSync(p), {
                  status: 200,
                  headers: {
                    'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
                  },
                });
              }
              return new Response('Not found', { status: 404 });
            },
          },
        });

        res.statusCode = webRes.status;
        webRes.headers.forEach((val, key) => {
          res.setHeader(key, val);
        });
        const bodyBuf = Buffer.from(await webRes.arrayBuffer());
        return res.end(bodyBuf);
      }

      // Fallback: If no SSR handler (e.g. dev mode without build), return 404
      sendText(res, 404, 'Not Found');
    } catch (err) {
      console.error('[desktop-service] Unhandled error:', err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'Internal Server Error' });
      }
    }
  });

  return {
    server,
    paths,
    sessionToken,
    stores: {
      libraryStore,
      userDataStore,
      readerStore,
      annotationStore,
      canvasStore,
      knowledgeStore,
      searchStore,
      portabilityStore,
      ocrService,
    },
    start(port = 0, host = '127.0.0.1') {
      return new Promise((resolveStart, rejectStart) => {
        server.listen(port, host, () => {
          const addr = server.address();
          const activePort = typeof addr === 'object' && addr ? addr.port : port;
          const origin = `http://127.0.0.1:${activePort}`;
          resolveStart({
            server,
            port: activePort,
            origin,
            sessionToken,
            close: () => new Promise((resolveClose) => server.close(resolveClose)),
          });
        });
        server.on('error', rejectStart);
      });
    },
  };
}
