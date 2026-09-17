/**
 * OCR service composition root — Phase 17.
 *
 * Wires the external engine store, the two authorised providers, the router, and
 * the derived-result store. Nothing here knows how a PDF is rendered; nothing
 * here writes to a source document.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  OCR_LANGUAGE_ROUTING,
  OCR_PROVIDERS,
  OCR_LANGUAGES,
  requiredProvidersForLanguage,
} from './ocr-contract.mjs';
import { createEngineStore } from './engine-store.mjs';
import { createOcrStore } from './ocr-store.mjs';
import { createOcrRouter } from './router.mjs';
import { createUnlimitedOcrProvider } from './provider-unlimited-ocr.mjs';
import { createPaddleOcrProvider } from './provider-paddleocr.mjs';

const moduleDir = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OCR_DRIVER_PATH = join(moduleDir, 'driver', 'engine_driver.py');

export function createOcrService({ dataRoot, driverPath = DEFAULT_OCR_DRIVER_PATH, providerOptions = {} } = {}) {
  if (typeof dataRoot !== 'string' || dataRoot.length === 0) {
    throw new Error('OCR service requires the external data root');
  }
  const ocrRoot = resolve(dataRoot, 'ocr');
  mkdirSync(ocrRoot, { recursive: true });

  const engineStore = createEngineStore({ ocrRoot });
  engineStore.ensureLayout();
  const store = createOcrStore({ ocrRoot });

  const shared = {
    engineStore,
    dataRoot: resolve(dataRoot),
    driverPath,
    bridgeFactory: providerOptions.bridgeFactory,
    interpreter: providerOptions.interpreter,
  };
  const providers = {
    'unlimited-ocr': createUnlimitedOcrProvider({ ...shared, ...providerOptions['unlimited-ocr'] }),
    paddleocr: createPaddleOcrProvider({ ...shared, ...providerOptions.paddleocr }),
  };

  const router = createOcrRouter({ providers, store });

  function listProviders() {
    return Object.values(providers).map((provider) => {
      const availability = provider.isAvailable();
      const metadata = OCR_PROVIDERS[provider.id];
      return {
        id: provider.id,
        displayName: provider.displayName,
        languages: [...provider.languages],
        officialUpstream: metadata.officialUpstream,
        officialUpstreamUrl: metadata.officialUpstreamUrl,
        userFork: metadata.userFork,
        userForkUrl: metadata.userForkUrl,
        codeLicense: metadata.codeLicense,
        modelSource: metadata.modelSource,
        runtimeRequirements: metadata.runtimeRequirements,
        availability,
        updateStatus: provider.getUpdateStatus(),
      };
    });
  }

  function describeRouting() {
    return OCR_LANGUAGES.map((language) => {
      const providerId = OCR_LANGUAGE_ROUTING[language];
      const provider = providers[providerId];
      const model = OCR_PROVIDERS[providerId].models?.[language] ?? null;
      const requiredProviders = requiredProvidersForLanguage(language);
      return {
        language,
        providerId,
        providerDisplayName: provider?.displayName ?? providerId,
        model: model ? { detection: model.detection, recognition: model.recognition } : null,
        available: Boolean(provider?.isAvailable().ok),
        // Mandatory engines for this language. A language is only fully
        // recognised when EVERY required engine has produced output; the
        // integration status states honestly which of them this build can run.
        requiredProviders: requiredProviders.map((entry) => ({
          providerId: entry.providerId,
          displayName: entry.displayName,
          integrationStatus: entry.integrationStatus,
        })),
      };
    });
  }

  /**
   * Derived, searchable OCR text for a source document.
   *
   * Returns the diacritic-insensitive search keys for every cached page of that
   * source, per language, alongside the untouched display text. Callers index
   * the search keys; they never index display text in place of it, and nothing
   * here overwrites the source document or its native text.
   */
  function getDerivedText({ sourceHash, language }) {
    const pages = [];
    for (const provider of Object.values(providers)) {
      const records = store.listForSource(provider.id, sourceHash);
      for (const record of records) {
        if (language && record.language !== language) continue;
        pages.push({
          provider: record.provider,
          providerVersion: record.providerVersion ?? null,
          modelRevision: record.modelRevision ?? null,
          language: record.language,
          pageIndex: record.pageIndex,
          displayText: record.displayText ?? '',
          searchText: record.searchText ?? '',
          confidence: typeof record.confidence === 'number' ? record.confidence : null,
          sourceHash: record.sourceHash,
          persistedAt: record.persistedAt ?? null,
        });
      }
    }
    pages.sort((a, b) => a.pageIndex - b.pageIndex);
    return {
      sourceHash,
      pageCount: pages.length,
      searchText: pages.map((page) => page.searchText).join('\n'),
      pages,
    };
  }

  return {
    ocrRoot,
    driverAvailable: existsSync(driverPath),
    providers,
    router,
    store,
    engineStore,
    listProviders,
    describeRouting,
    getDerivedText,
    dispose() {
      // Providers expose no persistent runtime of their own; bridges are created
      // per operation and disposed in a `finally` block, so shutdown is a no-op
      // beyond this acknowledgement.
      return { ok: true };
    },
  };
}
