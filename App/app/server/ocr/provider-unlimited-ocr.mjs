/**
 * Baidu Unlimited-OCR provider — Phase 17, English routing target.
 *
 * Provider-specific knowledge is limited to metadata binding. No application
 * module outside this file may reference Unlimited-OCR internals.
 */

import { OCR_PROVIDERS } from './ocr-contract.mjs';
import { createManagedOcrProvider } from './managed-provider.mjs';

export const UNLIMITED_OCR_ID = 'unlimited-ocr';

export function createUnlimitedOcrProvider(options) {
  return createManagedOcrProvider({
    ...options,
    metadata: OCR_PROVIDERS[UNLIMITED_OCR_ID],
  });
}
