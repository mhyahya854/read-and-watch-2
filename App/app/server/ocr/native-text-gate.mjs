/**
 * Usable-native-text decision gate — Phase 17, task P17-T001.
 *
 * OCR must never run merely because OCR exists. PDF.js native text wins
 * whenever the embedded text layer is usable for reading and search. OCR is
 * only considered when a page carries no usable text (a scanned/image page, or
 * a broken/empty text layer).
 *
 * The gate is deliberately conservative and explainable: it reports which
 * threshold decided the outcome so the decision is auditable rather than
 * magic.
 */

export const NATIVE_TEXT_DECISION = Object.freeze({
  NATIVE_TEXT: 'NATIVE_TEXT',
  OCR_REQUIRED: 'OCR_REQUIRED',
});

export const NATIVE_TEXT_REASON = Object.freeze({
  NO_TEXT_LAYER: 'NO_TEXT_LAYER',
  USABLE_TEXT_LAYER: 'USABLE_TEXT_LAYER',
  TEXT_LAYER_TOO_SPARSE: 'TEXT_LAYER_TOO_SPARSE',
  TEXT_LAYER_NOT_MEANINGFUL: 'TEXT_LAYER_NOT_MEANINGFUL',
});

/** Frozen gate thresholds. Changing these is a governance-visible decision. */
export const NATIVE_TEXT_THRESHOLDS = Object.freeze({
  /** Fewer than this many accepted characters on a page => OCR candidate. */
  minMeaningfulCharacters: 16,
  /** Fewer than this many non-whitespace tokens => not usable as text. */
  minMeaningfulTokens: 3,
  /**
   * Ratio of alphanumeric/letter characters to all characters. A text layer
   * made only of stray glyph noise sits far below this.
   */
  minLetterRatio: 0.4,
});

const LETTER_PATTERN = /[\p{L}\p{N}]/gu;

export function summariseTextLayer(text) {
  const source = typeof text === 'string' ? text : '';
  const normalized = source.replace(/\s+/g, ' ').trim();
  const tokens = normalized.length === 0 ? [] : normalized.split(' ');
  const letters = normalized.match(LETTER_PATTERN);
  const letterCount = letters ? letters.length : 0;
  return {
    characterCount: normalized.length,
    tokenCount: tokens.length,
    letterCount,
    letterRatio: normalized.length === 0 ? 0 : letterCount / normalized.length,
  };
}

/**
 * Decides whether a page's embedded text layer is usable.
 *
 * @param {object} input
 * @param {boolean} input.hasTextLayer  PdfAdapter's own `hasText` signal.
 * @param {string} [input.text]         Extracted native text for the page, when available.
 * @returns {{decision: string, reason: string, metrics: object|null}}
 */
export function evaluateNativeTextGate({ hasTextLayer, text }) {
  if (!hasTextLayer) {
    return {
      decision: NATIVE_TEXT_DECISION.OCR_REQUIRED,
      reason: NATIVE_TEXT_REASON.NO_TEXT_LAYER,
      metrics: null,
    };
  }

  // When the caller cannot supply the page text we only know that a text layer
  // exists. Treat that as usable rather than silently consuming OCR budget.
  if (typeof text !== 'string') {
    return {
      decision: NATIVE_TEXT_DECISION.NATIVE_TEXT,
      reason: NATIVE_TEXT_REASON.USABLE_TEXT_LAYER,
      metrics: null,
    };
  }

  const metrics = summariseTextLayer(text);

  if (metrics.characterCount < NATIVE_TEXT_THRESHOLDS.minMeaningfulCharacters) {
    return {
      decision: NATIVE_TEXT_DECISION.OCR_REQUIRED,
      reason: NATIVE_TEXT_REASON.TEXT_LAYER_TOO_SPARSE,
      metrics,
    };
  }

  if (metrics.tokenCount < NATIVE_TEXT_THRESHOLDS.minMeaningfulTokens) {
    return {
      decision: NATIVE_TEXT_DECISION.OCR_REQUIRED,
      reason: NATIVE_TEXT_REASON.TEXT_LAYER_TOO_SPARSE,
      metrics,
    };
  }

  if (metrics.letterRatio < NATIVE_TEXT_THRESHOLDS.minLetterRatio) {
    return {
      decision: NATIVE_TEXT_DECISION.OCR_REQUIRED,
      reason: NATIVE_TEXT_REASON.TEXT_LAYER_NOT_MEANINGFUL,
      metrics,
    };
  }

  return {
    decision: NATIVE_TEXT_DECISION.NATIVE_TEXT,
    reason: NATIVE_TEXT_REASON.USABLE_TEXT_LAYER,
    metrics,
  };
}
