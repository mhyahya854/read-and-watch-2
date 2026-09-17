/**
 * Urdu dual-engine orchestration — Phase 17, task P17-T005.
 *
 * Urdu recognition is a mandatory two-engine pipeline by explicit user
 * authority, not an engine-selection question:
 *
 *   PP-OCRv5 Arabic-script recognition       (detection + recognition)
 *   Urdu Nastaliq specialist (TrOCR, LINE)   (per-line recognition)
 *
 * Rules this module exists to enforce:
 *   - There is NO fallback, NO backup, NO "try the next engine", and NO
 *     automatic substitution. A mandatory engine that fails produces a
 *     structured failure and the run is never reported as COMPLETE.
 *   - Both engines' raw outputs are preserved independently, keyed to the same
 *     page/region/line identity. Nothing is destructively merged and no
 *     `bestText` winner is chosen.
 *   - PP-OCRv5's own detection boxes supply line geometry, so no second
 *     heavyweight detector is added.
 *   - Disagreement is recorded as review evidence. Agreement is never treated
 *     as truth; ground truth (Phase 18 benchmark) remains the only correctness
 *     authority.
 *
 * Engine outputs are persisted per provider through the existing derived store,
 * so the existing source-hash/revision/settings invalidation rules apply
 * unchanged to every engine.
 */

import {
  OcrError,
  OCR_STATE,
  requiredProvidersForLanguage,
} from './ocr-contract.mjs';
import { compareEngineOutputs } from './benchmark/scoring.mjs';
import { evaluateNativeTextGate, NATIVE_TEXT_DECISION } from './native-text-gate.mjs';
import { LINE_SEGMENTATION_REVISION, segmentPageLines } from './line-segmentation.mjs';
import { READING_ORDER_REVISION } from './reading-order.mjs';
import { buildOcrTextRepresentations, verifyTashkeelPreserved } from './text-representations.mjs';

/** Bump when orchestration changes: derived Urdu records must be invalidated. */
export const URDU_PIPELINE_REVISION = 1;

export const URDU_EXECUTION_STATE = Object.freeze({
  COMPLETE: 'COMPLETE',
  PARTIAL_ENGINE_FAILURE: 'PARTIAL_ENGINE_FAILURE',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  BLOCKED: 'BLOCKED',
});

/**
 * Transparent disagreement rule. Not a correctness claim: any character-level
 * difference between two mandatory engines for the same line is material and
 * raises `REVIEW_REQUIRED`. No numeric confidence is invented.
 */
export const DISAGREEMENT_POLICY = Object.freeze({
  basis: 'character-edit-distance',
  materialDisagreementCount: 1,
  description:
    'Any character-level difference between the mandatory engines for the same line is recorded as material disagreement and sets REVIEW_REQUIRED. Engine agreement is not truth and no winner is chosen.',
});

function joinTexts(values) {
  return values.filter((value) => typeof value === 'string' && value.length > 0).join('\n');
}

/**
 * Creates the Urdu pipeline.
 *
 * @param {object} options
 * @param {Record<string, object>} options.providers  Registered providers by id.
 * @param {object} [options.store]                    Derived OCR result store.
 * @param {object} [options.container]                Container element or document node for DOM-based rendering.
 * @param {Function} [options.gate]                   Native-text gate (injectable for tests).
 * @param {Function} [options.disagreementEvaluator]  Engine disagreement evidence (injectable for tests).
 */
export function createUrduPipeline({
  providers,
  store = null,
  gate = evaluateNativeTextGate,
  disagreementEvaluator = compareEngineOutputs,
} = {}) {
  if (!providers || typeof providers !== 'object') {
    throw new OcrError(OCR_STATE.INVALID_INPUT, 'The Urdu pipeline requires a provider registry');
  }

  const mandatory = requiredProvidersForLanguage('ur');

  function mandatoryProviderIds() {
    return mandatory.map((entry) => entry.providerId);
  }

  function describeRequirement() {
    return mandatory.map((entry) => ({
      providerId: entry.providerId,
      displayName: entry.displayName,
      integrationStatus: entry.integrationStatus,
      supportedUnitTypes: entry.supportedUnitTypes,
      modelId: entry.modelId,
    }));
  }

  function loadProviderResults({ sourceHash, pageIndex, settingsKey, renderKey }) {
    if (!store || !sourceHash) return null;
    const records = {};
    for (const providerId of mandatoryProviderIds()) {
      const cached = store.load({
        provider: providerId,
        sourceHash,
        pageIndex,
        language: 'ur',
        settingsKey,
        renderKey,
      });
      if (!cached) return null;
      const stale = store.isStale(cached, {
        sourceHash,
        providerVersion: cached.providerVersion ?? null,
        modelRevision: cached.modelRevision ?? null,
        settingsKey,
      });
      if (stale) return null;
      if (cached.urduPipelineRevision !== URDU_PIPELINE_REVISION) return null;
      if (cached.lineSegmentationRevision !== LINE_SEGMENTATION_REVISION) return null;
      if (cached.readingOrderRevision !== READING_ORDER_REVISION) return null;
      records[providerId] = cached;
    }
    return records;
  }

  function combineRecords({ records, pageIndex, sourceHash, settingsKey }) {
    const first = records[mandatoryProviderIds()[0]] ?? null;
    const engineRecords = mandatoryProviderIds().map((providerId) => {
      const record = records[providerId];
      return {
        providerId,
        ok: true,
        unitType: record.unitType ?? null,
        providerVersion: record.providerVersion ?? null,
        modelRevision: record.modelRevision ?? null,
        displayText: record.displayText ?? '',
        searchText: record.searchText ?? '',
        lineCount: Array.isArray(record.lines) ? record.lines.length : 0,
      };
    });
    const executionState = first?.urduExecutionState ?? URDU_EXECUTION_STATE.COMPLETE;
    return {
      ok: true,
      action: 'OCR',
      cached: true,
      ocrInvoked: true,
      pipeline: 'urdu-dual-engine',
      language: 'ur',
      pageIndex,
      sourceHash,
      settingsKey,
      executionState,
      completionState: executionState,
      allMandatoryEnginesCompleted: executionState !== URDU_EXECUTION_STATE.PARTIAL_ENGINE_FAILURE &&
        executionState !== URDU_EXECUTION_STATE.BLOCKED,
      requiredProviders: mandatoryProviderIds(),
      engines: engineRecords,
      lines: first?.urduLines ?? [],
      disagreements: first?.urduDisagreements ?? [],
      reviewEvidence: first?.urduReviewEvidence ?? null,
      lineSegmentationRevision: LINE_SEGMENTATION_REVISION,
      readingOrderRevision: READING_ORDER_REVISION,
      urduPipelineRevision: URDU_PIPELINE_REVISION,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * The Urdu equivalent of `ocrStore.save` for a text record, reused for each
   * mandatory engine so the existing invalidation rules apply per engine.
   */
  function buildProviderRecord({
    providerId,
    unitType,
    rawText,
    blocks,
    lines,
    confidence,
    providerVersion,
    modelRevision,
    pageIndex,
    sourceHash,
    settingsKey,
    executionState,
    disagreements,
    reviewEvidence,
  }) {
    const representations = buildOcrTextRepresentations({ rawText, language: 'ur' });
    const tashkeel = verifyTashkeelPreserved({
      rawText: representations.rawText,
      displayText: representations.displayText,
    });
    return {
      ok: true,
      unitType,
      pipeline: 'urdu-dual-engine',
      provider: providerId,
      providerVersion: providerVersion ?? null,
      modelRevision: modelRevision ?? null,
      language: 'ur',
      pageIndex,
      sourceHash,
      settingsKey,
      ...representations,
      blocks: blocks ?? [],
      lines: lines ?? [],
      confidence: typeof confidence === 'number' ? confidence : null,
      confidenceSource: typeof confidence === 'number' ? 'engine' : 'not-supplied',
      tashkeel,
      urduExecutionState: executionState,
      urduLines: lines ?? [],
      urduDisagreements: disagreements,
      urduReviewEvidence: reviewEvidence,
      urduPipelineRevision: URDU_PIPELINE_REVISION,
      lineSegmentationRevision: LINE_SEGMENTATION_REVISION,
      readingOrderRevision: READING_ORDER_REVISION,
      requiredProviders: mandatoryProviderIds(),
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Full Urdu page pipeline. Native text still wins: a page with a usable text
   * layer never reaches either engine.
   */
  async function recognizePage({
    sourceHash,
    pageIndex,
    language = 'ur',
    hasTextLayer,
    text,
    imagePath,
    regions = [],
    settingsKey = 'default',
    renderKey = 'default',
    signal,
    force = false,
  } = {}) {
    if (language !== 'ur') {
      throw new OcrError(
        OCR_STATE.UNAUTHORISED_LANGUAGE,
        `The Urdu dual-engine pipeline only serves Urdu, not "${String(language)}".`,
        { language: language ?? null },
      );
    }

    const decision = gate({ hasTextLayer, text });
    if (decision.decision === NATIVE_TEXT_DECISION.NATIVE_TEXT) {
      return {
        ok: true,
        action: 'NATIVE_TEXT',
        reason: decision.reason,
        metrics: decision.metrics ?? null,
        language,
        pageIndex,
        sourceHash: sourceHash ?? null,
        displayText: typeof text === 'string' ? text : null,
        ocrInvoked: false,
        requiredProviders: mandatoryProviderIds(),
      };
    }

    if (!force) {
      const cached = loadProviderResults({ sourceHash, pageIndex, settingsKey, renderKey });
      if (cached) return combineRecords({ records: cached, pageIndex, sourceHash, settingsKey });
    }

    const engineStates = new Map();
    /** Structured reason an engine produced nothing. Never a substitute for text. */
    const engineFailure = new Map();
    const resolveEngine = (providerId) => {
      const provider = providers[providerId];
      if (!provider) {
        return {
          ok: false,
          code: OCR_STATE.ENGINE_NOT_INSTALLED,
          message: `Mandatory Urdu engine "${providerId}" is not registered in this build.`,
        };
      }
      const availability = provider.isAvailable();
      if (!availability.ok) {
        return {
          ok: false,
          code: availability.code ?? OCR_STATE.ENGINE_NOT_INSTALLED,
          message: availability.message ?? `Mandatory Urdu engine "${providerId}" is unavailable.`,
        };
      }
      return { ok: true, provider };
    };

    const ids = mandatoryProviderIds();
    const geometryId = ids.includes('paddleocr') ? 'paddleocr' : ids[0];
    const geometryState = resolveEngine(geometryId);
    engineStates.set(geometryId, geometryState);

    let geometryResult = null;
    let geometryError = null;
    if (geometryState.ok) {
      try {
        geometryResult = await geometryState.provider.recognizePage({
          imagePath,
          pageIndex,
          language,
          sourceHash,
          settingsKey,
          signal,
        });
      } catch (error) {
        geometryError = { code: error.code ?? OCR_STATE.OCR_FAILED, message: error.message };
      }
    } else {
      geometryError = { code: geometryState.code, message: geometryState.message };
    }
    if (geometryError) engineFailure.set(geometryId, geometryError);

    const detectionBlocks = Array.isArray(geometryResult?.blocks) ? geometryResult.blocks : [];
    /**
     * Geometry ownership stays in the segmentation module. When the caller
     * supplies declared regions they are authoritative; otherwise the detection
     * engine's own boxes are the geometry, wrapped in one synthetic text region
     * so a line engine can be fed real line crops instead of a whole page.
     */
    let segmentationInput = Array.isArray(regions) ? regions : [];
    if (segmentationInput.length === 0 && detectionBlocks.length > 0) {
      const boxes = detectionBlocks.map((block) => block.box).filter(Boolean);
      if (boxes.length > 0) {
        const left = Math.min(...boxes.map((box) => box.x));
        const top = Math.min(...boxes.map((box) => box.y));
        const right = Math.max(...boxes.map((box) => box.x + box.width));
        const bottom = Math.max(...boxes.map((box) => box.y + box.height));
        segmentationInput = [
          {
            regionId: 'detected-text',
            regionType: 'body',
            language,
            box: { x: left, y: top, width: right - left, height: bottom - top },
          },
        ];
      }
    }
    const segmentation = segmentPageLines({
      pageIndex,
      language,
      regions: segmentationInput,
      detectionBlocks,
    });
    const regionBoxes = new Map(
      (Array.isArray(regions) ? regions : []).map((region, index) => [
        typeof region?.regionId === 'string' ? region.regionId : `region-${index}`,
        region?.box ?? null,
      ]),
    );

    const lines = segmentation.lines.map((line) => ({
      lineId: line.lineId,
      regionId: line.regionId,
      pageIndex: line.pageIndex,
      lineIndex: line.lineIndex,
      readingOrderIndex: line.readingOrderIndex,
      language: line.language,
      bbox: line.bbox,
      segmentationSource: line.segmentationSource,
      detectionText: line.detectionText,
      engines: {},
    }));

    // PP-OCRv5 line text comes from its own boxed page output (no re-running).
    const geometryLines = Array.isArray(geometryResult?.blocks)
      ? geometryResult.blocks
      : [];
    lines.forEach((line, index) => {
      const match =
        geometryLines.find(
          (block) =>
            block?.box &&
            line.bbox &&
            Math.abs(block.box.x - line.bbox.x) <= 2 &&
            Math.abs(block.box.y - line.bbox.y) <= 2,
        ) ?? (geometryLines.length === lines.length ? geometryLines[index] : null);
      const text = typeof match?.text === 'string' ? match.text : null;
      if (geometryResult && typeof text === 'string' && text.length > 0) {
        const representations = buildOcrTextRepresentations({ rawText: text, language: 'ur' });
        line.engines[geometryId] = {
          ok: true,
          text: representations.displayText,
          rawText: representations.rawText,
          searchText: representations.searchText,
          confidence: typeof match?.confidence === 'number' ? match.confidence : null,
          confidenceSource: typeof match?.confidence === 'number' ? 'engine' : 'not-supplied',
          bbox: match?.box ?? line.bbox,
        };
      } else {
        line.engines[geometryId] = {
          ok: false,
          error: geometryError ?? {
            code: OCR_STATE.OCR_FAILED,
            message: `${geometryId} produced no line text for this line.`,
          },
        };
      }
    });

    const specialistId = ids.find((providerId) => providerId !== geometryId);
    if (specialistId) {
      const specialistState = resolveEngine(specialistId);
      engineStates.set(specialistId, specialistState);
      if (!specialistState.ok) {
        engineFailure.set(specialistId, {
          code: specialistState.code,
          message: specialistState.message,
        });
        for (const line of lines) {
          line.engines[specialistId] = { ok: false, error: engineFailure.get(specialistId) };
        }
      } else if (lines.length === 0) {
        // A line-level engine cannot be invoked without line geometry. Saying so
        // is honest; feeding it a whole page would be a false capability claim.
        engineFailure.set(specialistId, {
          code: OCR_STATE.INVALID_INPUT,
          message:
            'No line geometry was available from the detection engine, so the line-level specialist was not invoked.',
        });
      } else {
        for (const line of lines) {
          if (signal?.aborted) break;
          try {
            const result = await specialistState.provider.recognizeLine({
              imagePath,
              pageIndex,
              language,
              sourceHash,
              settingsKey,
              signal,
              line: { lineId: line.lineId, regionId: line.regionId, box: line.bbox },
              region: regionBoxes.get(line.regionId) ?? null,
            });
            line.engines[specialistId] = {
              ok: true,
              text: result.displayText,
              rawText: result.rawText,
              searchText: result.searchText,
              confidence: result.confidence ?? null,
              confidenceSource: result.confidenceSource ?? 'not-supplied',
              providerVersion: result.providerVersion ?? null,
              modelRevision: result.modelRevision ?? null,
              bbox: result.bbox ?? line.bbox,
            };
          } catch (error) {
            line.engines[specialistId] = {
              ok: false,
              error: { code: error.code ?? OCR_STATE.OCR_FAILED, message: error.message },
            };
            if (!engineFailure.has(specialistId)) {
              engineFailure.set(specialistId, line.engines[specialistId].error);
            }
          }
        }
      }
    }

    const completedProviders = [];
    const failedProviders = [];
    for (const providerId of mandatoryProviderIds()) {
      const produced = lines.some((line) => line.engines[providerId]?.ok === true);
      if (produced) completedProviders.push(providerId);
      else failedProviders.push(providerId);
    }

    const disagreements = [];
    for (const line of lines) {
      const outputs = mandatoryProviderIds()
        .map((providerId) => ({ provider: providerId, text: line.engines[providerId]?.ok ? line.engines[providerId].text : null }))
        .filter((entry) => typeof entry.text === 'string');
      if (outputs.length < 2) continue;
      const evidence = disagreementEvaluator({ outputs });
      if (evidence.materialDisagreement) {
        disagreements.push({
          lineId: line.lineId,
          regionId: line.regionId,
          providers: outputs.map((entry) => entry.provider),
          ...evidence,
        });
      }
    }

    const materialDisagreement = disagreements.length >= DISAGREEMENT_POLICY.materialDisagreementCount;
    const cancelled = Boolean(signal?.aborted);
    let executionState;
    if (completedProviders.length === 0) executionState = URDU_EXECUTION_STATE.BLOCKED;
    else if (failedProviders.length > 0) executionState = URDU_EXECUTION_STATE.PARTIAL_ENGINE_FAILURE;
    else if (materialDisagreement) executionState = URDU_EXECUTION_STATE.REVIEW_REQUIRED;
    else executionState = URDU_EXECUTION_STATE.COMPLETE;
    // A cancelled run is never COMPLETE, even if every engine happened to finish
    // before the cancellation landed.
    if (cancelled && executionState === URDU_EXECUTION_STATE.COMPLETE) {
      executionState = URDU_EXECUTION_STATE.PARTIAL_ENGINE_FAILURE;
    }

    const reviewEvidence = {
      policy: DISAGREEMENT_POLICY,
      disagreementLineCount: disagreements.length,
      evaluatedLineCount: lines.length,
      note: 'Engine disagreement is review evidence, not failure, and engine agreement is not truth. Ground truth remains the Phase 18 benchmark authority.',
    };

    const engineRecords = mandatoryProviderIds().map((providerId) => {
      const state = engineStates.get(providerId);
      const ok = completedProviders.includes(providerId);
      const provider = state?.ok ? state.provider : null;
      const failedLine = lines.find((line) => line.engines[providerId]?.ok !== true)?.engines[providerId];
      return {
        providerId,
        unitType: providerId === specialistId ? 'LINE' : 'PAGE',
        ok,
        providerVersion: provider?.version ?? null,
        modelRevision: provider?.modelRevision ?? null,
        error: ok
          ? null
          : engineFailure.get(providerId) ??
            failedLine?.error ?? {
              code: OCR_STATE.OCR_FAILED,
              message: `Mandatory Urdu engine "${providerId}" produced no output.`,
            },
      };
    });

    const geometryLinesOut = lines.map((line) => ({
      lineId: line.lineId,
      regionId: line.regionId,
      readingOrderIndex: line.readingOrderIndex,
      bbox: line.bbox,
      text: line.engines[geometryId]?.ok ? line.engines[geometryId].text : null,
      searchText: line.engines[geometryId]?.ok ? line.engines[geometryId].searchText : null,
    }));
    const specialistLinesOut = specialistId
      ? lines.map((line) => ({
          lineId: line.lineId,
          regionId: line.regionId,
          readingOrderIndex: line.readingOrderIndex,
          bbox: line.bbox,
          text: line.engines[specialistId]?.ok ? line.engines[specialistId].text : null,
          searchText: line.engines[specialistId]?.ok ? line.engines[specialistId].searchText : null,
        }))
      : [];

    const combined = {
      ok: executionState !== URDU_EXECUTION_STATE.BLOCKED,
      action: 'OCR',
      cached: false,
      ocrInvoked: true,
      pipeline: 'urdu-dual-engine',
      language,
      pageIndex,
      sourceHash: sourceHash ?? null,
      settingsKey,
      executionState,
      completionState: executionState,
      allMandatoryEnginesCompleted: executionState === URDU_EXECUTION_STATE.COMPLETE,
      cancelled,
      cancelReason: cancelled ? 'CANCELLED' : null,
      reviewState:
        executionState === URDU_EXECUTION_STATE.REVIEW_REQUIRED ? 'REVIEW_REQUIRED' : 'NOT_REQUIRED',
      requiredProviders: mandatoryProviderIds(),
      completedProviders,
      failedProviders,
      engines: engineRecords,
      lines,
      disagreements,
      reviewEvidence,
      segmentation: {
        warnings: segmentation.warnings,
        orderSource: segmentation.orderSource,
        readingOrderWarnings: segmentation.readingOrderWarnings,
        revision: LINE_SEGMENTATION_REVISION,
        readingOrderRevision: READING_ORDER_REVISION,
      },
      lineSegmentationRevision: LINE_SEGMENTATION_REVISION,
      readingOrderRevision: READING_ORDER_REVISION,
      urduPipelineRevision: URDU_PIPELINE_REVISION,
      createdAt: new Date().toISOString(),
    };

    if (store && sourceHash) {
      const geometryRecord = buildProviderRecord({
        providerId: geometryId,
        unitType: 'PAGE',
        rawText: joinTexts(geometryLinesOut.map((line) => line.text)),
        blocks: geometryLines,
        lines: geometryLinesOut,
        confidence: geometryResult?.confidence ?? null,
        providerVersion: geometryState.provider?.version ?? null,
        modelRevision: geometryState.provider?.modelRevision ?? null,
        pageIndex,
        sourceHash,
        settingsKey,
        executionState,
        disagreements,
        reviewEvidence,
      });
      if (completedProviders.includes(geometryId)) store.save(geometryRecord);

      if (specialistId && completedProviders.includes(specialistId)) {
        const specialistRecord = buildProviderRecord({
          providerId: specialistId,
          unitType: 'LINE',
          rawText: joinTexts(specialistLinesOut.map((line) => line.text)),
          blocks: specialistLinesOut
            .filter((line) => typeof line.text === 'string')
            .map((line) => ({ text: line.text, confidence: null, box: line.bbox })),
          lines: specialistLinesOut,
          confidence: null,
          providerVersion: engineStates.get(specialistId)?.provider?.version ?? null,
          modelRevision: engineStates.get(specialistId)?.provider?.modelRevision ?? null,
          pageIndex,
          sourceHash,
          settingsKey,
          executionState,
          disagreements,
          reviewEvidence,
        });
        store.save(specialistRecord);
      }
    }

    return combined;
  }

  return { recognizePage, mandatoryProviderIds, describeRequirement };
}
