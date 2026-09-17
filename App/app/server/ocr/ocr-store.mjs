/**
 * Derived OCR result store — Phase 17.
 *
 * OCR output is DERIVED DATA. It is never written next to, into, or over a
 * source document. It lives under <dataRoot>/ocr/cache and every record is bound
 * to the identity of the thing it was derived from:
 *
 *   source file hash + page index + rendering parameters + OCR engine +
 *   engine revision + model revision + language + relevant settings
 *
 * If the source hash changes, the record is stale by construction and the caller
 * must re-run OCR rather than serve text that belongs to a different file.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { OcrError, OCR_STATE } from './ocr-contract.mjs';
import { assertSafeSegment } from './engine-store.mjs';

export const OCR_RESULT_SCHEMA_VERSION = 1;

const SOURCE_HASH_PATTERN = /^[0-9a-f]{64}$/;

function assertSourceHash(sourceHash) {
  if (typeof sourceHash !== 'string' || !SOURCE_HASH_PATTERN.test(sourceHash)) {
    throw new OcrError(OCR_STATE.INVALID_INPUT, 'OCR results must be bound to a 64-character source hash');
  }
  return sourceHash;
}

function writeJsonAtomic(target, value) {
  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  // rename over an existing file is atomic on Windows and POSIX.
  renameSync(tmp, target);
}

export function createOcrStore({ ocrRoot }) {
  if (typeof ocrRoot !== 'string' || ocrRoot.length === 0) {
    throw new OcrError(OCR_STATE.INVALID_INPUT, 'OCR store requires an external ocrRoot');
  }
  const cacheRoot = join(ocrRoot, 'cache');

  function sourceDir(providerId, sourceHash) {
    assertSafeSegment(providerId, 'provider id');
    return join(cacheRoot, providerId, assertSourceHash(sourceHash));
  }

  function resultKey({ pageIndex, language, settingsKey = 'default', renderKey = 'default' }) {
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      throw new OcrError(OCR_STATE.INVALID_INPUT, 'pageIndex must be a non-negative integer');
    }
    assertSafeSegment(language, 'language');
    assertSafeSegment(settingsKey, 'settings key');
    assertSafeSegment(renderKey, 'render key');
    return `${pageIndex}-${language}-${settingsKey}-${renderKey}.json`;
  }

  function save(result) {
    if (!result?.ok) {
      throw new OcrError(OCR_STATE.INVALID_INPUT, 'Refusing to persist a non-successful OCR result');
    }
    assertSourceHash(result.sourceHash);
    const key = resultKey(result);
    const target = join(sourceDir(result.provider, result.sourceHash), key);
    const record = {
      schemaVersion: OCR_RESULT_SCHEMA_VERSION,
      ...result,
      persistedAt: new Date().toISOString(),
    };
    writeJsonAtomic(target, record);
    return { path: target, record };
  }

  function load({ provider, sourceHash, pageIndex, language, settingsKey = 'default', renderKey = 'default' }) {
    const key = resultKey({ pageIndex, language, settingsKey, renderKey });
    const target = join(sourceDir(provider, sourceHash), key);
    if (!existsSync(target)) return null;
    try {
      const record = JSON.parse(readFileSync(target, 'utf8'));
      if (record.sourceHash !== sourceHash) {
        // Corrupt or hand-edited record bound to a different source.
        return null;
      }
      return record;
    } catch {
      return null;
    }
  }

  function listForSource(provider, sourceHash) {
    const dir = sourceDir(provider, sourceHash);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        try {
          return JSON.parse(readFileSync(join(dir, name), 'utf8'));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  /**
   * Staleness is computed, never guessed: a cached record is valid only while
   * the current source hash and engine/model identity still match.
   */
  function isStale(record, { sourceHash, providerVersion, modelRevision, settingsKey = 'default' }) {
    if (!record) return true;
    if (record.sourceHash !== sourceHash) return true;
    if (providerVersion && record.providerVersion !== providerVersion) return true;
    if (modelRevision && record.modelRevision !== modelRevision) return true;
    if (record.settingsKey !== settingsKey) return true;
    return false;
  }

  /** Removes derived OCR for a source. Never touches the source itself. */
  function purgeSource(provider, sourceHash) {
    const dir = sourceDir(provider, sourceHash);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }

  return { cacheRoot, save, load, listForSource, isStale, purgeSource, resultKey };
}
