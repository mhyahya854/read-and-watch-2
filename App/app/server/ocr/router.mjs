/**
 * OCR router — Phase 17.
 *
 * Owns the two decisions the rest of the application must not make for itself:
 *   1. Is OCR needed for this page at all (native text wins)?
 *   2. Which authorised provider serves this language?
 *
 * The router never substitutes an engine. If the authorised provider is not
 * runnable here it returns a structured state; it does not silently fall back to
 * Tesseract or anything else.
 */

import { authorisedProviderForLanguage, OcrError, OCR_STATE } from './ocr-contract.mjs';
import { NATIVE_TEXT_DECISION, evaluateNativeTextGate } from './native-text-gate.mjs';

export function createOcrRouter({ providers, store, gate = evaluateNativeTextGate }) {
  if (!providers || typeof providers !== 'object') {
    throw new OcrError(OCR_STATE.INVALID_INPUT, 'OCR router requires a provider registry');
  }

  function providerFor(language) {
    const { providerId } = authorisedProviderForLanguage(language);
    const provider = providers[providerId];
    if (!provider) {
      throw new OcrError(
        OCR_STATE.ENGINE_NOT_INSTALLED,
        `Authorised provider "${providerId}" is not registered in this build.`,
        { providerId, language },
      );
    }
    return provider;
  }

  /** Pure routing decision, useful on its own for UI and tests. */
  function planForPage({ language, hasTextLayer, text }) {
    const decision = gate({ hasTextLayer, text });
    if (decision.decision === NATIVE_TEXT_DECISION.NATIVE_TEXT) {
      return { action: 'NATIVE_TEXT', language, ...decision };
    }
    const provider = providerFor(language);
    return {
      action: 'OCR',
      language,
      providerId: provider.id,
      providerDisplayName: provider.displayName,
      ...decision,
    };
  }

  /**
   * Full page pipeline. Returns either native text (no OCR performed) or a
   * canonical, provenance-bound OCR result.
   */
  async function recognizePage({
    sourceHash,
    pageIndex,
    language,
    hasTextLayer,
    text,
    imagePath,
    settingsKey = 'default',
    renderKey = 'default',
    signal,
    force = false,
  }) {
    const plan = planForPage({ language, hasTextLayer, text });

    if (plan.action === NATIVE_TEXT_DECISION.NATIVE_TEXT) {
      return {
        ok: true,
        action: 'NATIVE_TEXT',
        reason: plan.reason,
        language,
        pageIndex,
        sourceHash: sourceHash ?? null,
        displayText: typeof text === 'string' ? text : null,
        ocrInvoked: false,
      };
    }

    const provider = providerFor(language);
    const availability = provider.isAvailable();
    if (!availability.ok) {
      return {
        ok: false,
        action: 'OCR',
        code: availability.code ?? OCR_STATE.ENGINE_NOT_INSTALLED,
        message: availability.message ?? 'Selected OCR engine is not available on this machine.',
        providerId: provider.id,
        language,
        pageIndex,
        reason: plan.reason,
      };
    }

    if (!force && store && sourceHash) {
      const cached = store.load({
        provider: provider.id,
        sourceHash,
        pageIndex,
        language,
        settingsKey,
        renderKey,
      });
      if (
        cached &&
        !store.isStale(cached, {
          sourceHash,
          providerVersion: provider.version,
          modelRevision: provider.modelRevision,
          settingsKey,
        })
      ) {
        return { ...cached, action: 'OCR', cached: true, ocrInvoked: true };
      }
    }

    const result = await provider.recognizePage({
      imagePath,
      pageIndex,
      language,
      sourceHash,
      settingsKey,
      signal,
    });

    const canonical = { ...result, action: 'OCR', cached: false, ocrInvoked: true };
    if (store && sourceHash) {
      store.save(canonical);
    }
    return canonical;
  }

  return { planForPage, providerFor, recognizePage };
}
