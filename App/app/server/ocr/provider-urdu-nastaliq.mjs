/**
 * Urdu Nastaliq specialist provider — Phase 17.
 *
 * Mandatory second Urdu engine: `qandeelasim13/urdu-ocr-trocr-si26`
 * (`urdu-nastaliq-trocr` here; the upstream project and model name are never
 * renamed). It is a thin adapter over the shared managed-provider lifecycle —
 * provider-specific knowledge is metadata plus the provisioning hooks, exactly
 * like the other engines. Nothing about TrOCR leaks past this boundary.
 *
 * Capability honesty: the engine is LINE-only (see `ocr-contract.mjs`), so
 * `recognizePage`/`recognizeRegion` are refused with `UNSUPPORTED_UNIT` and the
 * Urdu pipeline feeds it line crops.
 */

import { OCR_PROVIDERS } from './ocr-contract.mjs';
import { createManagedOcrProvider } from './managed-provider.mjs';
import { createSpecialistProvisioningHooks } from './specialist-provisioning.mjs';

export const URDU_NASTALIQ_ID = 'urdu-nastaliq-trocr';

export function createUrduNastaliqProvider(options = {}) {
  const metadata = OCR_PROVIDERS[URDU_NASTALIQ_ID];
  const provisioning = createSpecialistProvisioningHooks({
    dataRoot: options.dataRoot,
    driverPath: options.driverPath,
    fetchImpl: options.fetchImpl,
    interpreter: options.interpreter,
    onProgress: options.onProgress,
  });
  return createManagedOcrProvider({
    ...options,
    metadata,
    // Test/simulation hooks win, so a staged-update test never downloads 1.3 GB.
    hooks: { ...provisioning, ...options.hooks },
  });
}
