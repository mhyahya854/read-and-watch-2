/**
 * Benchmark run records — Phase 17, task P17-T002.
 *
 * A benchmark number is worthless without provenance, and an Urdu number is
 * worthless without BOTH engines. These records exist so that:
 *
 *   - every prediction is bound to the manifest, the source, the rendered
 *     sample, the ground-truth revision, the engine revision, the model
 *     revision, the runtime, and the settings that produced it;
 *   - a mandatory provider that failed is recorded as a failure, with the
 *     successful provider's output preserved and never discarded;
 *   - a two-engine Urdu run can never be labelled COMPLETE on one engine;
 *   - no alternate engine can be slotted in, and no single `bestText` field
 *     exists at benchmark-foundation level.
 */

import { OCR_PROVIDERS } from '../ocr-contract.mjs';
import {
  BenchmarkProtocolError,
  EXECUTION_STATES,
  FUTURE_VERIFICATION_STATES,
  findForbiddenSemantics,
  isSha256,
  sha256Hex,
} from './schema.mjs';

export const RUN_STATUSES = Object.freeze([
  'OK',
  'ENGINE_FAILED',
  'ENGINE_NOT_INSTALLED',
  'MODEL_NOT_INSTALLED',
  'RUNTIME_UNAVAILABLE',
  'UNSUPPORTED_HARDWARE',
  'UNSUPPORTED_PLATFORM',
  'CANCELLED',
  'INVALID_INPUT',
]);

export const REVIEW_STATES = Object.freeze([
  'NOT_REQUIRED',
  'REVIEW_REQUIRED',
  'HUMAN_REVIEW_PENDING_PHASE_18',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * One provider's result for one benchmark sample. Raw output is preserved:
 * `predictionText` is whatever the engine returned, unmodified.
 */
export function createProviderRunRecord({
  runId,
  benchmarkManifestHash,
  item,
  provider,
  engineRevision,
  modelRevision,
  runtime,
  hardware,
  settings,
  predictionText = null,
  status = 'OK',
  error = null,
  metrics = null,
  durationMs = null,
}) {
  if (!item || typeof item.benchmarkItemId !== 'string') {
    throw new BenchmarkProtocolError('SAMPLE_REQUIRED', 'a provider run record needs a benchmark sample');
  }
  return {
    runId,
    benchmarkManifestHash,
    sampleId: item.benchmarkItemId,
    unitType: item.unitType,
    language: item.language,
    script: item.script,
    sourceHash: item.sourceHash,
    renderedSampleHash: item.renderedSampleHash,
    groundTruthRevision: item.groundTruth?.revision ?? null,
    groundTruthHash: item.groundTruth?.hash ?? null,
    provider,
    engineRevision,
    modelRevision,
    runtime,
    hardware,
    settings,
    predictionHash: typeof predictionText === 'string' ? sha256Hex(predictionText) : null,
    predictionText,
    metrics,
    durationMs,
    status,
    error,
    createdAt: new Date().toISOString(),
  };
}

export function validateRunRecord(record) {
  const problems = [];
  if (!isPlainObject(record)) return { ok: false, problems: ['run record must be an object'] };

  for (const field of ['runId', 'sampleId', 'provider', 'engineRevision', 'modelRevision']) {
    if (typeof record[field] !== 'string' || record[field].length === 0) {
      problems.push(`${field} is required`);
    }
  }
  if (!isSha256(record.benchmarkManifestHash)) problems.push('benchmarkManifestHash (sha256) is required');
  if (!isSha256(record.sourceHash)) problems.push('sourceHash (sha256) is required');
  if (!isSha256(record.renderedSampleHash)) problems.push('renderedSampleHash (sha256) is required');
  if (!isSha256(record.groundTruthHash)) {
    problems.push('groundTruthHash (sha256) is required; a benchmark number may not come from draft truth');
  }
  if (!RUN_STATUSES.includes(record.status)) {
    problems.push(`status must be one of ${RUN_STATUSES.join(', ')}`);
  }
  if (!isPlainObject(record.runtime)) problems.push('runtime provenance is required');
  if (!isPlainObject(record.hardware)) problems.push('hardware provenance is required');
  if (!isPlainObject(record.settings)) problems.push('engine settings are required');

  if (record.status === 'OK') {
    if (typeof record.predictionText !== 'string' || record.predictionText.length === 0) {
      problems.push('an OK record requires the raw prediction text');
    }
    if (!isSha256(record.predictionHash)) problems.push('an OK record requires predictionHash');
    if (record.error !== null && record.error !== undefined) {
      problems.push('an OK record must not carry an error');
    }
  } else {
    if (!isPlainObject(record.error) || typeof record.error.message !== 'string') {
      problems.push('a failed record must carry a structured error with a message');
    }
    if (record.predictionText) {
      problems.push('a failed record must not carry a fabricated prediction');
    }
  }

  for (const rejected of findForbiddenSemantics(record)) {
    problems.push(`prohibited engine-substitution semantic at ${rejected}`);
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Execution state from the mandatory provider set and the observed results.
 *
 * The decision is driven by REQUIREMENTS, never by what happened to succeed:
 *   all mandatory providers OK, no material disagreement -> COMPLETE
 *   all mandatory providers OK, material disagreement    -> REVIEW_REQUIRED
 *   some OK, some failed/unavailable                     -> PARTIAL_ENGINE_FAILURE
 *   none OK                                              -> BLOCKED
 */
export function evaluateRunState({
  requiredProviders = [],
  providerResults = [],
  materialDisagreement = false,
}) {
  const required = [...new Set(requiredProviders)];
  const unexpectedProviders = providerResults
    .map((result) => result.provider)
    .filter((provider) => !required.includes(provider));

  const completedProviders = required.filter((provider) =>
    providerResults.some((result) => result.provider === provider && result.ok === true),
  );
  const failedProviders = required.filter((provider) =>
    providerResults.some((result) => result.provider === provider && result.ok !== true),
  );
  const missingProviders = required.filter(
    (provider) => !completedProviders.includes(provider) && !failedProviders.includes(provider),
  );

  let executionState;
  if (completedProviders.length === 0) {
    executionState = 'BLOCKED';
  } else if (failedProviders.length > 0 || missingProviders.length > 0) {
    executionState = 'PARTIAL_ENGINE_FAILURE';
  } else if (materialDisagreement) {
    executionState = 'REVIEW_REQUIRED';
  } else {
    executionState = 'COMPLETE';
  }

  return {
    executionState,
    transcriptionState: completedProviders.length > 0 ? 'MACHINE_TRANSCRIBED' : null,
    reviewState: executionState === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'NOT_REQUIRED',
    completedProviders,
    failedProviders,
    missingProviders,
    unexpectedProviders,
    reason:
      unexpectedProviders.length > 0
        ? `a provider outside the mandatory set produced output: ${unexpectedProviders.join(', ')}`
        : executionState === 'PARTIAL_ENGINE_FAILURE'
          ? `mandatory provider(s) failed or were unavailable: ${[...failedProviders, ...missingProviders].join(', ')}`
          : executionState === 'BLOCKED'
            ? 'no mandatory provider produced output'
            : executionState === 'REVIEW_REQUIRED'
              ? 'mandatory providers completed but materially disagree'
              : 'every mandatory provider produced output',
  };
}

/**
 * Group result for a sample with one or more mandatory providers. This is the
 * record a future benchmark run reports; there is deliberately no `bestText`.
 */
export function createGroupRunRecord({
  runId,
  benchmarkManifestHash,
  item,
  providerResults,
  disagreements = [],
  manifest = null,
}) {
  const requiredProviders = [...(item?.requiredProviders ?? [])];
  if (requiredProviders.length === 0) {
    throw new BenchmarkProtocolError('SAMPLE_REQUIRED', 'a group run record needs a sample with requiredProviders');
  }
  const unknown = requiredProviders.filter((provider) => !OCR_PROVIDERS[provider]);
  if (unknown.length > 0) {
    throw new BenchmarkProtocolError('UNKNOWN_PROVIDER', `unknown provider(s): ${unknown.join(', ')}`, {
      providers: unknown,
    });
  }

  const results = providerResults.map((result) => {
    const provider = result.provider;
    if (!requiredProviders.includes(provider)) {
      throw new BenchmarkProtocolError(
        'PROVIDER_NOT_REQUIRED',
        `${provider} is not a mandatory provider for ${item.benchmarkItemId}; substituting engines is prohibited`,
        { provider, requiredProviders },
      );
    }
    const metadata = OCR_PROVIDERS[provider];
    if (
      metadata.documentedInputGranularity === 'line' &&
      item.unitType !== 'LINE' &&
      !result.lineAssociation
    ) {
      throw new BenchmarkProtocolError(
        'LINE_ASSOCIATION_REQUIRED',
        `${provider} is documented for line-level input; a ${item.unitType} result must carry a line association`,
        { provider, unitType: item.unitType },
      );
    }
    return {
      provider,
      providerDisplayName: metadata.displayName,
      unitType: result.unitType ?? (result.lineAssociation ? 'LINE' : item.unitType),
      lineAssociation: result.lineAssociation ?? null,
      ok: result.ok === true,
      predictionText: result.ok === true ? result.predictionText ?? null : null,
      predictionHash:
        result.ok === true && typeof result.predictionText === 'string'
          ? sha256Hex(result.predictionText)
          : null,
      metrics: result.metrics ?? null,
      error: result.ok === true ? null : result.error ?? { code: 'ENGINE_FAILED', message: 'engine failed' },
      status: result.ok === true ? 'OK' : result.status ?? 'ENGINE_FAILED',
    };
  });

  const state = evaluateRunState({
    requiredProviders,
    providerResults: results,
    materialDisagreement: disagreements.some((entry) => entry.disagreementCount > 0),
  });

  const record = {
    runId,
    benchmarkManifestHash,
    manifestId: manifest?.corpusId ?? null,
    sampleId: item.benchmarkItemId,
    unitType: item.unitType,
    language: item.language,
    script: item.script,
    purpose: item.purpose ?? 'formal-acceptance',
    groundTruthRevision: item.groundTruth?.revision ?? null,
    groundTruthHash: item.groundTruth?.hash ?? null,
    sourceHash: item.sourceHash,
    renderedSampleHash: item.renderedSampleHash,
    requiredProviders,
    completedProviders: state.completedProviders,
    failedProviders: state.failedProviders,
    missingProviders: state.missingProviders,
    providerResults: results,
    pairwiseDisagreement: disagreements,
    reviewState: state.reviewState,
    overallExecutionState: state.executionState,
    transcriptionState: state.transcriptionState,
    correctnessAuthority: 'ground-truth',
    reason: state.reason,
    createdAt: new Date().toISOString(),
  };

  const validation = validateGroupRunRecord(record);
  if (!validation.ok) {
    throw new BenchmarkProtocolError('INVALID_GROUP_RUN_RECORD', validation.problems.join('; '), {
      problems: validation.problems,
    });
  }
  return record;
}

export function validateGroupRunRecord(record) {
  const problems = [];
  if (!isPlainObject(record)) return { ok: false, problems: ['group run record must be an object'] };

  if (!Array.isArray(record.requiredProviders) || record.requiredProviders.length === 0) {
    problems.push('requiredProviders must be a non-empty array');
  }
  if (!EXECUTION_STATES.includes(record.overallExecutionState)) {
    problems.push(`overallExecutionState must be one of ${EXECUTION_STATES.join(', ')}`);
  }
  if (!REVIEW_STATES.includes(record.reviewState)) {
    problems.push(`reviewState must be one of ${REVIEW_STATES.join(', ')}`);
  }
  if (record.correctnessAuthority !== 'ground-truth') {
    problems.push('correctnessAuthority must be ground-truth');
  }
  if (!isSha256(record.benchmarkManifestHash)) problems.push('benchmarkManifestHash (sha256) is required');

  const required = new Set(record.requiredProviders ?? []);
  const results = Array.isArray(record.providerResults) ? record.providerResults : [];
  for (const result of results) {
    if (!required.has(result.provider)) {
      problems.push(`${String(result.provider)} is not a mandatory provider for this sample`);
    }
    if (result.ok === true) {
      if (typeof result.predictionText !== 'string' || result.predictionText.length === 0) {
        problems.push(`${String(result.provider)}: a successful provider result must keep its raw output`);
      }
      if (!isSha256(result.predictionHash)) problems.push(`${String(result.provider)}: predictionHash required`);
    } else if (!isPlainObject(result.error) || typeof result.error.message !== 'string') {
      problems.push(`${String(result.provider)}: a failed provider must keep a structured error`);
    }
  }

  const completed = new Set(record.completedProviders ?? []);
  const failed = new Set(record.failedProviders ?? []);
  if (record.overallExecutionState === 'COMPLETE') {
    if (completed.size !== required.size || [...required].some((provider) => !completed.has(provider))) {
      problems.push(
        'COMPLETE is prohibited unless EVERY mandatory provider completed (no single-engine completion)',
      );
    }
  }
  if (record.overallExecutionState === 'PARTIAL_ENGINE_FAILURE') {
    const missing = new Set(record.missingProviders ?? []);
    if (failed.size === 0 && missing.size === 0) {
      problems.push(
        'PARTIAL_ENGINE_FAILURE requires a mandatory provider that either failed or produced no result',
      );
    }
  }
  if (record.transcriptionState !== null && record.transcriptionState !== 'MACHINE_TRANSCRIBED') {
    if (FUTURE_VERIFICATION_STATES.includes(record.transcriptionState)) {
      problems.push(
        `${record.transcriptionState} is reserved for a later phase and must not be claimed by a benchmark run`,
      );
    } else {
      problems.push('transcriptionState must be MACHINE_TRANSCRIBED or null');
    }
  }

  for (const rejected of findForbiddenSemantics(record)) {
    problems.push(`prohibited engine-substitution semantic at ${rejected}`);
  }
  return { ok: problems.length === 0, problems };
}
