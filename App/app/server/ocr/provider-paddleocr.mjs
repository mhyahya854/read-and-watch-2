/**
 * PaddleOCR PP-OCRv5 Arabic-script provider — Phase 17, Arabic + Urdu target.
 *
 * Both languages resolve to the same official PP-OCRv5 Arabic-script recognition
 * head (verified upstream: every language in ARABIC_LANGS maps to
 * `arabic_PP-OCRv5_mobile_rec`). That single head also carries the Urdu-specific
 * letters (heh goal U+06C1, yeh barree U+06D2) and the Arabic tashkeel marks in
 * its published dictionary, which is why Urdu needs no separate model here.
 */

import { OCR_PROVIDERS } from './ocr-contract.mjs';
import { createManagedOcrProvider } from './managed-provider.mjs';

export const PADDLE_OCR_ID = 'paddleocr';

export function createPaddleOcrProvider(options) {
  return createManagedOcrProvider({
    ...options,
    metadata: OCR_PROVIDERS[PADDLE_OCR_ID],
  });
}
