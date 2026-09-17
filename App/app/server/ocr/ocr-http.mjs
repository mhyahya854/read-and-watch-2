/**
 * Shared OCR HTTP surface — Phase 17.
 *
 * One implementation used by both the packaged desktop service and the local
 * development server, so the two cannot drift. Returns { status, payload }
 * rather than touching http objects, which keeps it trivially testable.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { OCR_STATE } from './ocr-contract.mjs';

export async function handleOcrRequest({ service, method, rest, body = {}, query = {}, signal }) {
  const segments = rest.split('/').filter(Boolean);

  if (segments.length === 1 && segments[0] === 'providers' && method === 'GET') {
    return {
      status: 200,
      payload: { providers: service.listProviders(), routing: service.describeRouting() },
    };
  }

  if (segments[0] === 'providers' && segments[1]) {
    const provider = service.providers[segments[1]];
    if (!provider) {
      return {
        status: 404,
        payload: { ok: false, code: OCR_STATE.INVALID_INPUT, message: `Unknown OCR provider: ${segments[1]}` },
      };
    }
    const action = segments[2];
    if (method !== 'POST') {
      return { status: 405, payload: { error: 'Method not allowed' } };
    }
    try {
      if (action === 'install') return { status: 200, payload: await provider.install({ signal }) };
      if (action === 'check-update') return { status: 200, payload: await provider.checkForUpdates({ signal }) };
      if (action === 'update') return { status: 200, payload: await provider.updateNow({ signal }) };
      if (action === 'rollback') return { status: 200, payload: provider.rollback() };
      if (action === 'health') return { status: 200, payload: await provider.healthCheck({ signal }) };
    } catch (error) {
      return {
        status: error.status ?? 409,
        payload: {
          ok: false,
          code: error.code ?? OCR_STATE.UPDATE_FAILED,
          message: error.message,
          providerId: provider.id,
          details: error.details ?? {},
        },
      };
    }
    return { status: 404, payload: { error: 'OCR provider route not found' } };
  }

  if (segments.length === 1 && segments[0] === 'update-all' && method === 'POST') {
    const results = [];
    for (const provider of Object.values(service.providers)) {
      try {
        results.push(await provider.updateNow({ signal }));
      } catch (error) {
        // One engine failing must not abort the others; each failure is reported.
        results.push({
          ok: false,
          providerId: provider.id,
          code: error.code ?? OCR_STATE.UPDATE_FAILED,
          message: error.message,
        });
      }
    }
    return { status: 200, payload: { results } };
  }

  if (segments.length === 1 && segments[0] === 'text' && method === 'GET') {
    const sourceHash = String(query.sourceHash ?? body.sourceHash ?? '').trim();
    if (!/^[0-9a-f]{64}$/.test(sourceHash)) {
      return {
        status: 400,
        payload: { ok: false, code: OCR_STATE.INVALID_INPUT, message: 'A 64-character source hash is required.' },
      };
    }
    return {
      status: 200,
      payload: service.getDerivedText({
        sourceHash,
        language: query.language ?? body.language,
      }),
    };
  }

  if (segments.length === 1 && segments[0] === 'recognize' && method === 'POST') {
    const { sourceHash, pageIndex, language, imageBase64, hasTextLayer, nativeText } = body ?? {};
    if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
      return {
        status: 400,
        payload: {
          ok: false,
          code: OCR_STATE.INVALID_INPUT,
          message: 'A rendered page image is required for OCR.',
        },
      };
    }
    const tempDir = join(service.ocrRoot, 'temp');
    mkdirSync(tempDir, { recursive: true });
    const imagePath = join(tempDir, `page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`);
    writeFileSync(imagePath, Buffer.from(imageBase64, 'base64'));
    try {
      const result = await service.router.recognizePage({
        sourceHash,
        pageIndex,
        language,
        hasTextLayer,
        text: nativeText,
        imagePath,
        signal,
      });
      return { status: result.ok ? 200 : 409, payload: result };
    } catch (error) {
      return {
        status: error.status ?? 409,
        payload: {
          ok: false,
          code: error.code ?? OCR_STATE.OCR_FAILED,
          message: error.message,
          providerId: error.details?.providerId ?? null,
          language,
          pageIndex,
        },
      };
    } finally {
      // Temporary page images never outlive the request.
      try {
        rmSync(imagePath, { force: true });
      } catch {
        // best effort
      }
    }
  }

  return { status: 404, payload: { error: 'OCR route not found' } };
}
