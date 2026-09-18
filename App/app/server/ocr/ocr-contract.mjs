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
  UNSUPPORTED_UNIT: 'UNSUPPORTED_UNIT',
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

/**
 * Whether Read & Watch has an execution path for a declared engine.
 *
 * `NOT_INTEGRATED` means the engine is declared, its provenance is verified,
 * and benchmark manifests may require it, but this build cannot run it yet. A
 * not-integrated engine is never reported as available, never scored as
 * successful, and never replaced by a different engine.
 */
export const OCR_INTEGRATION_STATUS = Object.freeze({
  INTEGRATED: 'INTEGRATED',
  NOT_INTEGRATED: 'NOT_INTEGRATED',
});

/** Recognition units a benchmark sample may describe. Page is never assumed. */
export const OCR_UNIT_TYPES = Object.freeze(['PAGE', 'REGION', 'LINE']);

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
    integrationStatus: OCR_INTEGRATION_STATUS.INTEGRATED,
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
    integrationStatus: OCR_INTEGRATION_STATUS.INTEGRATED,
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
      /**
       * Proven on this Windows CPU host on 2026-09-18 with the shipped driver:
       * PP-OCRv5_server_det + arabic_PP-OCRv5_mobile_rec loaded and returned
       * exact synthetic text with 0.9969 confidence. PaddlePaddle 3.3.1 is
       * deliberately NOT used because its PIR/oneDNN executor fails on this
       * CPU; PaddleX is pinned so PaddleOCR does not resolve an incompatible
       * newer PaddleX.
       */
      installPackages: Object.freeze([
        'paddlepaddle==3.0.0',
        'paddleocr==3.3.1',
        'paddlex==3.3.13',
        'numpy==1.26.4',
        'scipy==1.13.1',
        'scikit-learn==1.5.2',
        'langchain<0.3',
        'setuptools',
      ]),
      notes:
        'PP-OCRv5 mobile recognition models run on CPU or GPU; no CUDA requirement is claimed. The pinned CPU combination was verified with a real PP-OCRv5 Arabic inference through the shipped driver.',
    }),
    attribution:
      'PaddleOCR / PP-OCRv5 (PaddlePaddle), Apache-2.0 licensed code; model weights distributed separately by PaddlePaddle.',
  }),

  /**
   * Mandatory SECOND Urdu engine. Explicit user authority (2026-09-17): Urdu
   * recognition is a mandatory two-engine pipeline, so this engine is a
   * required evidence source for Urdu and not an optional extra.
   *
   * Verified from the live model card, the live Hugging Face API record, and the
   * associated public project repository on 2026-09-17. Every field below is
   * observed upstream state, never inferred from memory or marketing copy.
   */
  'urdu-nastaliq-trocr': Object.freeze({
    id: 'urdu-nastaliq-trocr',
    displayName: 'Urdu Nastaliq OCR (TrOCR fine-tune)',
    integrationStatus: OCR_INTEGRATION_STATUS.INTEGRATED,
    languages: Object.freeze(['ur']),
    role: 'Mandatory second Urdu recognition engine (independent evidence source)',
    /**
     * LINE only. The model card documents clean, printed, SINGLE-LINE images and
     * explicitly excludes handwriting, multi-line paragraphs, and heavily
     * degraded input. Advertising PAGE or REGION here would be a false
     * capability claim, so page/region calls are refused with
     * `UNSUPPORTED_UNIT` and the Urdu pipeline always supplies line crops.
     */
    supportedUnitTypes: Object.freeze(['LINE']),
    officialUpstream: 'qandeelasim13/urdu-ocr-trocr-si26',
    officialUpstreamUrl: 'https://huggingface.co/qandeelasim13/urdu-ocr-trocr-si26',
    modelId: 'qandeelasim13/urdu-ocr-trocr-si26',
    modelSource: 'https://huggingface.co/qandeelasim13/urdu-ocr-trocr-si26',
    modelRevision: 'a9ef072320b50014f6df7ed9db807810157a410e',
    modelRevisionObservedAt: '2026-09-17',
    modelLastModified: '2026-08-08T18:35:19Z',
    modelLicense: 'apache-2.0 (declared on the model card)',
    modelFile: 'model.safetensors (1,335,747,032 bytes; 333,921,792 F32 parameters)',
    /**
     * Exact public files fetched by the managed update path. Hashes are the ones
     * published by the upstream repository (Hugging Face LFS object ids); they
     * are verified after download, and Read & Watch also records its own sha256
     * of every staged file.
     */
    modelFiles: Object.freeze([
      Object.freeze({ path: 'config.json', size: 4836 }),
      Object.freeze({ path: 'generation_config.json', size: 258 }),
      Object.freeze({ path: 'merges.txt', size: 456318 }),
      Object.freeze({
        path: 'model.safetensors',
        size: 1335747032,
        upstreamSha256: '420c828eff17e7e4dbfdc776d51b29aec6bbca5a9fde343573818a9c65099276',
      }),
      Object.freeze({ path: 'preprocessor_config.json', size: 364 }),
      Object.freeze({ path: 'special_tokens_map.json', size: 957 }),
      Object.freeze({ path: 'tokenizer_config.json', size: 1230 }),
      Object.freeze({ path: 'vocab.json', size: 999355 }),
    ]),
    baseModel: 'microsoft/trocr-base-printed',
    architecture: 'TrOCR / VisionEncoderDecoderModel, encoder and decoder fine-tuned end-to-end',
    processor: 'TrOCRProcessor (preprocessor_config.json + byte-level BPE tokenizer files)',
    task: 'printed Urdu (Nastaliq-style) image-to-text OCR',
    projectRepository:
      'qandeelasim13/URDU-OCR-PROJECT-CODE-SAVIOURS-SI-2026-QANDEEL-ASIM',
    projectRepositoryUrl:
      'https://github.com/qandeelasim13/URDU-OCR-PROJECT-CODE-SAVIOURS-SI-2026-QANDEEL-ASIM',
    projectLicense:
      'NO LICENCE FILE DECLARED: the project repository returned no licence metadata when inspected on 2026-09-17',
    documentedInputGranularity: 'line',
    documentedInference:
      'model.generate(pixel_values, max_length=319, num_beams=4) plus processor.batch_decode(skip_special_tokens=True), per the model card',
    documentedLimitations: Object.freeze([
      'Model card: intended for clean, printed, SINGLE-LINE Urdu images. Not intended for handwriting, multi-line paragraphs, or heavily degraded/noisy images.',
      'Model card evaluation on its own held-out split: CER 0.52, character-level accuracy 47.66%; the project README states roughly half of characters may be misread. Accuracy is not sufficient for unattended use.',
      'Training data includes UTRSet-Real (ICDAR 2023); that dataset is published under CC BY-NC-SA 4.0 (non-commercial, research use) as recorded in the earlier provenance review. The model card does not restate dataset licence terms, so weight and dataset terms still require review before redistribution or commercial use.',
      'Trained on ~1,348 unique source images before augmentation; the project states dataset size is the primary accuracy bottleneck.',
    ]),
    runtimeRequirements: Object.freeze({
      python: '>=3.11 (verified on this host with python 3.12)',
      accelerator: 'any',
      acceleratorVendor: 'any',
      cpuSupported: true,
      // pip-installed into an isolated venv under the external data root.
      // torch has no CUDA requirement: the model card's own demo runs CPU-only.
      installPackages: Object.freeze(['torch', 'transformers>=4.57.1', 'safetensors', 'pillow']),
      notes:
        'Model card documents PyTorch + Hugging Face transformers inference (VisionEncoderDecoderModel + TrOCRProcessor) and runs on CPU; no GPU or cloud service is required or used.',
    }),
    /**
     * Host/authority for revision resolution and model download. Hugging Face,
     * not GitHub: this engine's weights are only published there, and no
     * project-account fork of the weights exists.
     */
    revisionAuthority: Object.freeze({
      kind: 'huggingface-model',
      modelId: 'qandeelasim13/urdu-ocr-trocr-si26',
    }),
    redistributionPolicy:
      'NOT REDISTRIBUTED: Read & Watch never bundles these weights in an installer or in Git. The user-initiated update path downloads the exact pinned public revision into external storage and verifies it before activation.',
    attribution:
      'Urdu OCR Project - Code Saviours SI-26 (Qandeel Asim); TrOCR base model by Microsoft. Apache-2.0 model card; no repository licence file declared.',
  }),
});

/**
 * Runtime recognition binding for single-engine languages, and the geometry
 * (detection) binding for Urdu. Explicit; never inferred.
 *
 * This table is NOT a fallback chain. There is one binding per language, and if
 * that engine is unavailable the router returns a structured failure state
 * instead of substituting another engine. Urdu's authoritative requirement set
 * is `OCR_REQUIRED_PROVIDERS.ur` (two engines, both mandatory); this entry names
 * the engine that also supplies text-line geometry for the Urdu pipeline, and
 * the dual-engine orchestration lives in `urdu-pipeline.mjs`.
 */
export const OCR_LANGUAGE_ROUTING = Object.freeze({
  en: 'unlimited-ocr',
  ar: 'paddleocr',
  ur: 'paddleocr',
});

/**
 * Mandatory provider set per language — a REQUIREMENT SET, not an attempt
 * order. Every engine listed for a language is required evidence: each one runs
 * independently, each raw output is preserved, and results are never merged or
 * substituted. English and Arabic currently have one mandatory engine; Urdu has
 * two (explicit user authority, 2026-09-17).
 */
export const OCR_REQUIRED_PROVIDERS = Object.freeze({
  en: Object.freeze(['unlimited-ocr']),
  ar: Object.freeze(['paddleocr']),
  ur: Object.freeze(['paddleocr', 'urdu-nastaliq-trocr']),
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

/**
 * Every engine that MUST run for a language, with its provenance and integration
 * status. Callers must treat the returned list as a requirement set: all of
 * them, each independently, never first-match-wins.
 */
export function requiredProvidersForLanguage(language) {
  const providerIds = OCR_REQUIRED_PROVIDERS[language];
  if (!providerIds) {
    throw new OcrError(
      OCR_STATE.UNAUTHORISED_LANGUAGE,
      `No mandatory OCR provider set for language "${String(language)}".`,
      { language: language ?? null, authorisedLanguages: [...OCR_LANGUAGES] },
    );
  }
  return providerIds.map((providerId) => {
    const metadata = providerMetadata(providerId);
    return {
      providerId,
      displayName: metadata.displayName,
      integrationStatus: metadata.integrationStatus,
      supportedUnitTypes: metadata.supportedUnitTypes ? [...metadata.supportedUnitTypes] : [...OCR_UNIT_TYPES],
      modelId: metadata.modelId ?? null,
      officialUpstream: metadata.officialUpstream,
    };
  });
}

/**
 * Recognition units a provider actually advertises.
 *
 * Absence of an explicit declaration means the provider was not built around a
 * documented unit restriction. A declared list is enforced: a LINE-only engine
 * may not be asked for a PAGE, and the caller receives `UNSUPPORTED_UNIT` rather
 * than a silently fabricated full-page result.
 */
export function providerSupportsUnit(providerId, unitType) {
  const metadata = providerMetadata(providerId);
  const supported = metadata.supportedUnitTypes;
  if (!supported) return true;
  return supported.includes(unitType);
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
