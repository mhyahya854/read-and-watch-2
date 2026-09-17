/**
 * Derived OCR search — Phase 17, tasks P17-T005 and the reader search wiring.
 *
 * Native PDF/EPUB text and machine transcription are different evidence and the
 * user must be able to tell them apart, so this module never pretends OCR text
 * is document text:
 *
 *   - results are tagged `NATIVE_TEXT` or `OCR_DERIVED`;
 *   - a page whose native text layer is usable contributes NOTHING here, so the
 *     same words are never indexed twice;
 *   - Urdu provider outputs are indexed independently. Two mandatory engines
 *     that agree are presented once with both providers recorded; two engines
 *     that disagree are NOT resolved into a "truth" — both strings stay in the
 *     result with their provenance;
 *   - a partially completed Urdu page stays visibly partial and never claims a
 *     completed transcription.
 *
 * Invalidation is computed, never assumed: a record is only searchable while its
 * source hash, provider revision, model revision, settings key, line-segmentation
 * revision, reading-order revision, and Urdu pipeline revision all still match.
 */

import { createHash } from 'node:crypto';

import { OCR_STATE, OcrError, requiredProvidersForLanguage } from './ocr-contract.mjs';
import { evaluateNativeTextGate, NATIVE_TEXT_DECISION } from './native-text-gate.mjs';
import { LINE_SEGMENTATION_REVISION } from './line-segmentation.mjs';
import { READING_ORDER_REVISION } from './reading-order.mjs';
import { URDU_PIPELINE_REVISION } from './urdu-pipeline.mjs';
import { stripArabicMarks, toSearchText } from './text-representations.mjs';

export const OCR_SEARCH_REVISION = 1;

export const SEARCH_PROVENANCE = Object.freeze({
  NATIVE_TEXT: 'NATIVE_TEXT',
  OCR_DERIVED: 'OCR_DERIVED',
});

const CONTEXT_CHARACTERS = 40;

const BIDI_CONTROLS = /[\u200B-\u200F\u202A-\u202E]/gu;

function foldPiece(piece) {
  return piece
    .replace(/\u0622|\u0623|\u0625/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u06CC/g, '\u064A')
    .replace(BIDI_CONTROLS, '');
}

/**
 * Character-wise fold that keeps a map back to the ORIGINAL text.
 *
 * Search has to be diacritic-insensitive, but a hit must still be shown to the
 * reader with the vocalisation the engine produced. Mapping folded offsets back
 * to display offsets is what makes that possible: a page whose display text is
 * `الْحَمْدُ` is found by `الحمد` and still displayed as `الْحَمْدُ`.
 */
export function foldWithMap(text) {
  const source = typeof text === 'string' ? text : '';
  let folded = '';
  const map = [];
  let lastWasSpace = false;
  let index = 0;
  for (const character of source) {
    const piece = foldPiece(stripArabicMarks(character.normalize('NFKD').toLowerCase()));
    const displayIndex = index;
    index += character.length;
    if (piece.length === 0) continue;
    if (/^\s+$/.test(piece)) {
      if (lastWasSpace || folded.length === 0) continue;
      lastWasSpace = true;
      folded += ' ';
      map.push(displayIndex);
      continue;
    }
    lastWasSpace = false;
    for (const unit of piece) {
      folded += unit;
      map.push(displayIndex);
    }
  }
  while (folded.endsWith(' ')) {
    folded = folded.slice(0, -1);
    map.pop();
  }
  return { folded, map };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * The identity of a derived search record. Any change here invalidates it.
 */
export function invalidationKey({
  sourceHash,
  settingsKey = 'default',
  providerRevisions = [],
  lineSegmentationRevision = LINE_SEGMENTATION_REVISION,
  readingOrderRevision = READING_ORDER_REVISION,
  urduPipelineRevision = URDU_PIPELINE_REVISION,
}) {
  return createHash('sha256')
    .update(
      canonicalJson({
        searchRevision: OCR_SEARCH_REVISION,
        sourceHash,
        settingsKey,
        providerRevisions: [...providerRevisions].sort((a, b) =>
          String(a.providerId).localeCompare(String(b.providerId)),
        ),
        lineSegmentationRevision,
        readingOrderRevision,
        urduPipelineRevision,
      }),
    )
    .digest('hex');
}

function snippetAround(text, index, length) {
  if (typeof text !== 'string' || text.length === 0) return '';
  const start = Math.max(0, index - CONTEXT_CHARACTERS);
  const end = Math.min(text.length, index + length + CONTEXT_CHARACTERS);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

/**
 * Locates a query in a record.
 *
 * Primary path: fold the display text with an offset map, so the returned
 * snippet is the ORIGINAL text (tashkeel intact). Fallback path: the persisted
 * search key, which is what an index built by another revision would hold.
 */
function findMatch(displayText, searchText, query, language) {
  const trimmedQuery = typeof query === 'string' ? query.trim() : '';
  if (trimmedQuery.length === 0) return null;

  const display = typeof displayText === 'string' ? displayText : '';
  if (display.length > 0) {
    const foldedDisplay = foldWithMap(display);
    const foldedQuery = foldWithMap(trimmedQuery).folded;
    if (foldedQuery.length > 0) {
      const index = foldedDisplay.folded.indexOf(foldedQuery);
      if (index !== -1) {
        const start = foldedDisplay.map[index] ?? 0;
        const lastUnit = foldedDisplay.map[index + foldedQuery.length - 1] ?? start;
        const end = Math.min(display.length, lastUnit + 1);
        return {
          matchIndex: index,
          matchText: display.slice(start, end),
          snippet: snippetAround(display, start, Math.max(1, end - start)),
        };
      }
    }
  }

  const haystack = typeof searchText === 'string' ? searchText : toSearchText(display, language);
  const normalizedQuery = toSearchText(trimmedQuery, language);
  if (normalizedQuery.length === 0) return null;
  const index = haystack.indexOf(normalizedQuery);
  if (index === -1) return null;
  return {
    matchIndex: index,
    matchText: normalizedQuery,
    // Only reachable when display text is empty or does not fold to a match:
    // the snippet then comes from the search key and the provider text is still
    // returned untouched alongside it.
    snippet: display.length > 0 ? snippetAround(display, 0, display.length) : snippetAround(haystack, index, normalizedQuery.length),
  };
}

/**
 * Builds the derived-search service over the existing OCR result store.
 *
 * @param {object} options
 * @param {object} options.store  Derived OCR result store (`ocr-store.mjs`).
 * @param {Record<string, object>} [options.providers] Registered providers (for revision binding).
 */
export function createOcrDerivedSearch({ store, providers = {} } = {}) {
  if (!store) throw new OcrError(OCR_STATE.INVALID_INPUT, 'Derived OCR search requires the OCR result store');

  function providerRevisions(language) {
    return Object.values(providers).map((provider) => ({
      providerId: provider.id,
      providerVersion: provider.version ?? null,
      modelRevision: provider.modelRevision ?? null,
      language,
    }));
  }

  function recordsForSource(sourceHash) {
    const providerIds = Object.keys(providers);
    return providerIds.flatMap((providerId) =>
      store.listForSource(providerId, sourceHash).map((record) => ({ providerId, record })),
    );
  }

  function isRecordCurrent({ providerId, record }) {
    const provider = providers[providerId];
    if (!provider) return false;
    const version = provider.version ?? null;
    const modelRevision = provider.modelRevision ?? null;
    if (version && record.providerVersion && record.providerVersion !== version) return false;
    if (modelRevision && record.modelRevision && record.modelRevision !== modelRevision) return false;
    const hasLineRecords = Array.isArray(record.lines) && record.lines.length > 0;
    // A page-level record from the current schema always carries the revision it
    // was produced under. A record that carries LINE identities must carry them
    // too, because line identity itself is derived from the segmentation
    // revision; otherwise those line hits cannot be trusted and are dropped.
    if (hasLineRecords && record.lineSegmentationRevision == null) return false;
    if (record.lineSegmentationRevision != null && record.lineSegmentationRevision !== LINE_SEGMENTATION_REVISION) {
      return false;
    }
    if (record.readingOrderRevision != null && record.readingOrderRevision !== READING_ORDER_REVISION) {
      return false;
    }
    if (record.urduPipelineRevision != null && record.urduPipelineRevision !== URDU_PIPELINE_REVISION) {
      return false;
    }
    return true;
  }

  function completionFor(pageRecords, language) {
    const required = language === 'ur' ? requiredProvidersForLanguage('ur').map((entry) => entry.providerId) : [];
    if (required.length === 0) return { completionState: 'COMPLETE', requiredProviders: [], completedProviders: [] };
    const state =
      pageRecords[0]?.record?.urduExecutionState ??
      (pageRecords.length === required.length ? 'COMPLETE' : 'PARTIAL_ENGINE_FAILURE');
    return {
      completionState: state,
      requiredProviders: required,
      completedProviders: pageRecords.map((entry) => entry.providerId),
    };
  }

  /**
   * @param {object} input
   * @param {string} input.sourceHash
   * @param {string} input.query
   * @param {string} [input.language]      Restrict to one language.
   * @param {number} [input.limit]
   * @param {Array<{pageIndex:number, hasTextLayer?:boolean, text?:string}>} [input.nativePages]
   *        Page-level native text report. Pages with usable native text are
   *        skipped entirely so OCR never duplicates native search hits.
   */
  function search({ sourceHash, query, language = null, limit = 50, nativePages = [], includeStale = false } = {}) {
    if (typeof sourceHash !== 'string' || !/^[0-9a-f]{64}$/.test(sourceHash)) {
      throw new OcrError(OCR_STATE.INVALID_INPUT, 'A 64-character source hash is required to search derived OCR text');
    }
    const trimmed = typeof query === 'string' ? query.trim() : '';
    if (trimmed.length === 0) {
      return { sourceHash, query: trimmed, results: [], total: 0, skipped: { nativeTextPages: [], staleRecords: [] } };
    }

    const nativePageIndexes = new Set();
    for (const page of nativePages) {
      const decision = evaluateNativeTextGate({ hasTextLayer: page?.hasTextLayer, text: page?.text });
      if (decision.decision === NATIVE_TEXT_DECISION.NATIVE_TEXT) nativePageIndexes.add(page.pageIndex);
    }

    const skipped = { nativeTextPages: [...nativePageIndexes].sort((a, b) => a - b), staleRecords: [] };
    const records = recordsForSource(sourceHash).filter(({ providerId, record }) => {
      if (language && record.language !== language) return false;
      if (nativePageIndexes.has(record.pageIndex)) return false;
      if (!includeStale && !isRecordCurrent({ providerId, record })) {
        skipped.staleRecords.push({ providerId, pageIndex: record.pageIndex });
        return false;
      }
      return true;
    });

    const grouped = new Map();
    for (const { providerId, record } of records) {
      const lineEntries = Array.isArray(record.lines) && record.lines.length > 0 ? record.lines : null;
      if (lineEntries) {
        for (const line of lineEntries) {
          if (typeof line?.text !== 'string' || line.text.length === 0) continue;
          const match = findMatch(
            line.text,
            line.searchText ?? toSearchText(line.text, record.language),
            trimmed,
            record.language,
          );
          if (!match) continue;
          const key = `${record.pageIndex}::${line.lineId}`;
          const entry = grouped.get(key) ?? {
            id: `ocr-${record.pageIndex}-${line.lineId}`,
            provenance: SEARCH_PROVENANCE.OCR_DERIVED,
            sourceHash,
            pageIndex: record.pageIndex,
            regionId: line.regionId ?? null,
            lineId: line.lineId ?? null,
            readingOrderIndex: line.readingOrderIndex ?? null,
            bbox: line.bbox ?? null,
            language: record.language,
            snippet: match.snippet,
            matchText: match.matchText,
            providers: [],
            pageRecords: [],
          };
          entry.snippet = entry.snippet || match.snippet;
          entry.providers.push({
            providerId,
            providerVersion: record.providerVersion ?? null,
            modelRevision: record.modelRevision ?? null,
            confidence: typeof record.confidence === 'number' ? record.confidence : null,
            confidenceSource: record.confidenceSource ?? 'not-supplied',
            text: line.text,
            displayText: line.text,
            searchText: line.searchText ?? toSearchText(line.text, record.language),
            matchText: match.matchText,
            snippet: match.snippet,
          });
          entry.pageRecords.push({ providerId, record });
          grouped.set(key, entry);
          continue;
        }
        continue;
      }

      const normalizedRecordText = record.searchText ?? toSearchText(record.displayText ?? '', record.language);
      const match = findMatch(record.displayText ?? '', normalizedRecordText, trimmed, record.language);
      if (!match) continue;
      const key = `${record.pageIndex}::page`;
      const entry = grouped.get(key) ?? {
        id: `ocr-${record.pageIndex}-page`,
        provenance: SEARCH_PROVENANCE.OCR_DERIVED,
        sourceHash,
        pageIndex: record.pageIndex,
        regionId: null,
        lineId: null,
        readingOrderIndex: null,
        bbox: null,
        language: record.language,
        snippet: match.snippet,
        matchText: match.matchText,
        providers: [],
        pageRecords: [],
      };
      entry.providers.push({
        providerId,
        providerVersion: record.providerVersion ?? null,
        modelRevision: record.modelRevision ?? null,
        confidence: typeof record.confidence === 'number' ? record.confidence : null,
        confidenceSource: record.confidenceSource ?? 'not-supplied',
        text: record.displayText ?? '',
        displayText: record.displayText ?? '',
        searchText: normalizedRecordText,
        matchText: match.matchText,
        snippet: match.snippet,
      });
      entry.pageRecords.push({ providerId, record });
      grouped.set(key, entry);
    }

    const results = [...grouped.values()]
      .map((entry) => {
        const pageRecords = entry.pageRecords;
        const { completionState, requiredProviders, completedProviders } = completionFor(pageRecords, entry.language);
        const { pageRecords: _ignored, ...rest } = entry;
        return {
          ...rest,
          providers: entry.providers,
          providerIds: [...new Set(entry.providers.map((provider) => provider.providerId))],
          machineTranscription: true,
          completionState,
          requiredProviders,
          completedProviders,
          partial: completionState !== 'COMPLETE',
          nativeTextPage: false,
        };
      })
      .sort(
        (a, b) =>
          a.pageIndex - b.pageIndex ||
          (a.readingOrderIndex ?? Number.MAX_SAFE_INTEGER) - (b.readingOrderIndex ?? Number.MAX_SAFE_INTEGER) ||
          String(a.id).localeCompare(String(b.id)),
      )
      .slice(0, limit);

    return {
      sourceHash,
      query: trimmed,
      provenance: SEARCH_PROVENANCE.OCR_DERIVED,
      invalidationKey: invalidationKey({
        sourceHash,
        providerRevisions: providerRevisions(language),
      }),
      lineSegmentationRevision: LINE_SEGMENTATION_REVISION,
      readingOrderRevision: READING_ORDER_REVISION,
      urduPipelineRevision: URDU_PIPELINE_REVISION,
      results,
      total: results.length,
      skipped,
    };
  }

  return { search, invalidationKey };
}
