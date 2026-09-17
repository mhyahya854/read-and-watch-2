/**
 * Read & Watch OCR Provider Contract — Phase 17 (OCR Foundation).
 *
 * This module is the single place where Read & Watch declares what an OCR
 * provider is, which structured states it may report, and which upstream
 * engine/model revisions are authorised.
 *
 * Architectural rule: no reader component, database layer, annotation layer,
 * or search layer may import Baidu- or Paddle-specific APIs. Everything talks
 * to this contract; provider-specific code stays behind a provider object.
 */

/** Structured, non-fakeable capability and failure states. */
export const OCR_STATE = Object.freeze({
  ENGINE_NOT_INSTALLED: 'ENGINE_NOT_INSTALLED',
  MODEL_NOT_INSTALLED: 'MODEL_NOT_INSTALLED',
  UNSUPPORTED_HARDWARE: 'UNSUPPORTED_HARDWARE',
  UNSUPPORTED_PLATFORM: 'UNSUPPORTED_PLATFORM',
  RUNTIME_UNAVAILABLE: 'RUNTIME_UNAVAILABLE',
  UPDATE_FAILED: 'UPDATE_FAILED',
  OCR_FAILED: 'OCR_FAILED',
  CANCELLED: 'CANCELLED',
  UNAUTHORISED_LANGUAGE: 'UNAUTHORISED_LANGUAGE',
  INVALID_INPUT: 'INVALID_INPUT',
});

/** Lifecycle states surfaced to the Settings UI. Never a fabricated value. */
export const OCR_LIFECYCLE = Object.freeze({
  NOT_INSTALLED: 'not-installed',
  INSTALLING: 'installing',
  AVAILABLE: 'available',
  UPDATE_AVAILABLE: 'update-available',
  UPDATING: 'updating',
  VERIFYING: 'verifying',
  FAILED: 'failed',
  ROLLBACK_AVAILABLE: 'rollback-available',
});

/** Languages this project is authorised to route. No silent substitution. */
export const OCR_LANGUAGES = Object.freeze(['en', 'ar', 'ur']);

/**
 * Authorised provider provenance. Every field here is verified against live
 * upstream state and recorded in docs/project/reports/PHASE_17_REPORT.md.
 */
export const OCR_PROVIDERS = Object.freeze({
  'unlimited-ocr': Object.freeze({
    id: 'unlimited-ocr',
    displayName: 'Unlimited-OCR (Baidu)',
    languages: Object.freeze(['en']),
    officialUpstream: 'baidu/Unlimited-OCR',
    officialUpstreamUrl: 'https://github.com/baidu/Unlimited-OCR',
    userFork: 'mhyahya854/Unlimited-OCR',
    userForkUrl: 'https://github.com/mhyahya854/Unlimited-OCR',
    codeLicense: 'MIT',
    modelId: 'baidu/Unlimited-OCR',
    modelSource: 'https://huggingface.co/baidu/Unlimited-OCR',
    // Upstream README (checked 2026-09-17) documents Transformers inference
    // tested on NVIDIA GPUs + CUDA 12.9, python 3.12.3. We do not claim more.
    runtimeRequirements: Object.freeze({
      python: '>=3.12',
      accelerator: 'cuda',
      acceleratorVendor: 'nvidia',
      cpuSupported: false,
      notes:
        'Upstream documents Transformers inference on NVIDIA GPUs/CUDA only. CPU execution is not claimed.',
    }),
    // Credited against the upstream project, not against Read & Watch.
    attribution:
      'Unlimited-OCR Works (Baidu Inc.), MIT licensed code; model weights distributed separately via Hugging Face.',
  }),

  paddleocr: Object.freeze({
    id: 'paddleocr',
    displayName: 'PP-OCRv5 Arabic script (PaddleOCR)',
    languages: Object.freeze(['ar', 'ur']),
    officialUpstream: 'PaddlePaddle/PaddleOCR',
    officialUpstreamUrl: 'https://github.com/PaddlePaddle/PaddleOCR',
    userFork: 'mhyahya854/PaddleOCR',
    userForkUrl: 'https://github.com/mhyahya854/PaddleOCR',
    codeLicense: 'Apache-2.0',
    modelSource: 'https://github.com/PaddlePaddle/PaddleOCR',
    // Verified from upstream paddleocr/_pipelines/ocr.py + the PP-OCRv5 model
    // tables: every Arabic-script language (ar, ur, fa, ug, ps, ku, sd, bal)
    // resolves to the same recognition head. Not guessed.
    models: Object.freeze({
      ar: Object.freeze({
        apiLang: 'ar',
        ocrVersion: 'PP-OCRv5',
        detection: 'PP-OCRv5_server_det',
        recognition: 'arabic_PP-OCRv5_mobile_rec',
        dictionary: 'ppocr/utils/dict/ppocrv5_arabic_dict.txt',
      }),
      ur: Object.freeze({
        apiLang: 'ur',
        ocrVersion: 'PP-OCRv5',
        detection: 'PP-OCRv5_server_det',
        recognition: 'arabic_PP-OCRv5_mobile_rec',
        dictionary: 'ppocr/utils/dict/ppocrv5_arabic_dict.txt',
      }),
    }),
    runtimeRequirements: Object.freeze({
      python: '>=3.9',
      accelerator: 'any',
      acceleratorVendor: 'any',
      cpuSupported: true,
      notes:
        'PP-OCRv5 mobile recognition models run on CPU or GPU; no CUDA requirement is claimed.',
    }),
    attribution:
      'PaddleOCR / PP-OCRv5 (PaddlePaddle), Apache-2.0 licensed code; model weights distributed separately by PaddlePaddle.',
  }),
});

/** Language -> authorised provider id. Explicit; never inferred. */
export const OCR_LANGUAGE_ROUTING = Object.freeze({
  en: 'unlimited-ocr',
  ar: 'paddleocr',
  ur: 'paddleocr',
});

export class OcrError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'OcrError';
    this.code = code;
    this.details = details;
    this.status = 409;
  }

  toPayload() {
    return {
      ok: false,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export function providerMetadata(providerId) {
  const metadata = OCR_PROVIDERS[providerId];
  if (!metadata) {
    throw new OcrError(OCR_STATE.INVALID_INPUT, `Unknown OCR provider: ${String(providerId)}`);
  }
  return metadata;
}

export function authorisedProviderForLanguage(language) {
  const providerId = OCR_LANGUAGE_ROUTING[language];
  if (!providerId) {
    throw new OcrError(
      OCR_STATE.UNAUTHORISED_LANGUAGE,
      `No authorised OCR provider for language "${String(language)}".`,
      { language: language ?? null, authorisedLanguages: [...OCR_LANGUAGES] },
    );
  }
  return { providerId, metadata: providerMetadata(providerId) };
}

/** Data members a provider object must carry. */
const REQUIRED_PROVIDER_DATA = [
  ['id', 'string'],
  ['displayName', 'string'],
  ['languages', 'array'],
];

/** Capability surface. A staged handle must satisfy this. */
const REQUIRED_PROVIDER_MEMBERS = [
  'isAvailable',
  'getCapabilities',
  'healthCheck',
  'recognizePage',
  'recognizeRegion',
  'cancel',
];

/** Update surface. Only the full provider (not a staged handle) must expose it. */
const REQUIRED_UPDATE_MEMBERS = [
  'install',
  'checkForUpdates',
  'stageUpdate',
  'activateUpdate',
  'rollback',
];

/**
 * Validates that a provider object actually satisfies the contract.
 * Used by the update manager's staged contract validation, so a staged update
 * that silently drops a contract member can never be activated.
 */
export function assertProviderContract(provider, { requireUpdateSurface = true } = {}) {
  const problems = [];
  if (!provider || typeof provider !== 'object') {
    return { ok: false, problems: ['provider is not an object'] };
  }
  for (const [member, kind] of REQUIRED_PROVIDER_DATA) {
    const value = provider[member];
    if (kind === 'string' && typeof value !== 'string') problems.push(`${member} must be a string`);
    if (kind === 'array' && !Array.isArray(value)) problems.push(`${member} must be an array`);
  }
  const functionMembers = requireUpdateSurface
    ? [...REQUIRED_PROVIDER_MEMBERS, ...REQUIRED_UPDATE_MEMBERS]
    : REQUIRED_PROVIDER_MEMBERS;
  for (const member of functionMembers) {
    if (typeof provider[member] !== 'function') {
      problems.push(`missing or non-callable member: ${member}`);
    }
  }
  if (!Array.isArray(provider.languages) || provider.languages.length === 0) {
    problems.push('languages must be a non-empty array');
  } else {
    for (const language of provider.languages) {
      if (!OCR_LANGUAGES.includes(language)) {
        problems.push(`unauthorised language declared by provider: ${language}`);
      }
    }
  }
  return { ok: problems.length === 0, problems };
}
