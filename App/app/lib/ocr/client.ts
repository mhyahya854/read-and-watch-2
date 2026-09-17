/**
 * OCR client — Phase 17.
 * Thin fetch wrapper over the local /api/ocr endpoints. No engine knowledge.
 */

import type {
  OcrPageResult,
  OcrProviderInventory,
  OcrUpdateCheck,
  OcrFailure,
  OcrLanguage,
} from './types';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok && !('code' in payload)) {
    throw new Error(payload?.error || `OCR request failed (${response.status})`);
  }
  return payload as T;
}

export async function fetchOcrInventory(signal?: AbortSignal): Promise<OcrProviderInventory> {
  return await requestJson<OcrProviderInventory>('/api/ocr/providers', { signal });
}

export async function installOcrEngine(providerId: string): Promise<OcrUpdateCheck> {
  return await requestJson<OcrUpdateCheck>(`/api/ocr/providers/${providerId}/install`, { method: 'POST' });
}

export async function checkOcrUpdate(providerId: string): Promise<OcrUpdateCheck> {
  return await requestJson<OcrUpdateCheck>(`/api/ocr/providers/${providerId}/check-update`, {
    method: 'POST',
  });
}

export async function updateOcrEngine(providerId: string): Promise<OcrUpdateCheck> {
  return await requestJson<OcrUpdateCheck>(`/api/ocr/providers/${providerId}/update`, { method: 'POST' });
}

export async function rollbackOcrEngine(providerId: string): Promise<OcrUpdateCheck> {
  return await requestJson<OcrUpdateCheck>(`/api/ocr/providers/${providerId}/rollback`, { method: 'POST' });
}

export async function updateAllOcrEngines(): Promise<{ results: Array<OcrUpdateCheck | OcrFailure> }> {
  return await requestJson<{ results: Array<OcrUpdateCheck | OcrFailure> }>('/api/ocr/update-all', {
    method: 'POST',
  });
}

export async function recognizeOcrPage(input: {
  sourceHash: string;
  pageIndex: number;
  language: OcrLanguage;
  imageBase64?: string;
  hasTextLayer?: boolean;
  nativeText?: string;
  signal?: AbortSignal;
}): Promise<OcrPageResult | OcrFailure> {
  const { signal, ...body } = input;
  return await requestJson<OcrPageResult | OcrFailure>('/api/ocr/recognize', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });
}
