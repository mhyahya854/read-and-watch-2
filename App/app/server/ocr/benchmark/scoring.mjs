/**
 * Transparent OCR scoring utilities — Phase 17, task P17-T002.
 *
 * Every metric here is a deterministic function of (stored prediction, finalised
 * human-reviewed ground truth). Nothing is judged by a model, nothing is judged
 * by "looks right", nothing is judged by semantic similarity, and one OCR
 * engine's output is never used as ground truth for another engine.
 *
 * The three Arabic metric families are deliberately separate:
 *   A. huroof        - letters only, marks excluded from this metric only
 *   B. tashkeel      - marks only, measured as missing / substituted / extra
 *   C. fully-vocalised - the complete string including marks
 */

import { BenchmarkProtocolError, expectedScoringModesFor } from './schema.mjs';
import {
  canonicalComparisonKey,
  comparisonText,
  huroofKey,
  markCount,
  orderMarks,
  spaceInsensitiveKey,
  tashkeelClusters,
  tashkeelKey,
  tokenize,
  urduCharacterAnalysis,
  urduComparisonKey,
} from './unicode.mjs';

/** Refuse quadratic comparisons on absurd inputs instead of hanging. */
export const MAX_COMPARISON_CODE_POINTS = 4000;

/** Cap on stored disagreement locations so a record stays inspectable. */
export const MAX_DISAGREEMENT_LOCATIONS = 200;

function codePoints(text) {
  return Array.from(comparisonText(text));
}

/**
 * Levenshtein alignment over code points with a full backtrace, so a metric can
 * always be explained by the operations that produced it.
 */
export function editDistance(truthText, predictionText) {
  const truth = Array.isArray(truthText) ? truthText : codePoints(truthText);
  const prediction = Array.isArray(predictionText) ? predictionText : codePoints(predictionText);
  if (truth.length > MAX_COMPARISON_CODE_POINTS || prediction.length > MAX_COMPARISON_CODE_POINTS) {
    throw new BenchmarkProtocolError(
      'COMPARISON_TOO_LARGE',
      `refusing to compare ${truth.length} x ${prediction.length} code points; split the sample into smaller units`,
    );
  }

  const rows = truth.length + 1;
  const columns = prediction.length + 1;
  const blankRow = () => Array.from({ length: columns }, () => 0);
  const distance = Array.from({ length: rows }, blankRow);
  for (let row = 0; row < rows; row += 1) distance[row][0] = row;
  for (let column = 0; column < columns; column += 1) distance[0][column] = column;
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitution = distance[row - 1][column - 1] + (truth[row - 1] === prediction[column - 1] ? 0 : 1);
      distance[row][column] = Math.min(
        substitution,
        distance[row - 1][column] + 1,
        distance[row][column - 1] + 1,
      );
    }
  }

  const ops = [];
  let row = truth.length;
  let column = prediction.length;
  while (row > 0 || column > 0) {
    if (
      row > 0 &&
      column > 0 &&
      truth[row - 1] === prediction[column - 1] &&
      distance[row][column] === distance[row - 1][column - 1]
    ) {
      ops.push({ op: 'match', truthIndex: row - 1, predictionIndex: column - 1 });
      row -= 1;
      column -= 1;
      continue;
    }
    if (
      row > 0 &&
      column > 0 &&
      distance[row][column] === distance[row - 1][column - 1] + 1
    ) {
      ops.push({
        op: 'substitute',
        truthIndex: row - 1,
        predictionIndex: column - 1,
        truth: truth[row - 1],
        prediction: prediction[column - 1],
      });
      row -= 1;
      column -= 1;
      continue;
    }
    if (row > 0 && distance[row][column] === distance[row - 1][column] + 1) {
      ops.push({ op: 'delete', truthIndex: row - 1, truth: truth[row - 1] });
      row -= 1;
      continue;
    }
    ops.push({ op: 'insert', predictionIndex: column - 1, prediction: prediction[column - 1] });
    column -= 1;
  }
  ops.reverse();
  return { distance: distance[truth.length][prediction.length], ops, truthLength: truth.length, predictionLength: prediction.length };
}

function rate(errorCount, referenceLength) {
  return errorCount / Math.max(1, referenceLength);
}

/** General character error rate: edits divided by reference code points. */
export function characterErrorRate(truth, prediction) {
  const { distance, truthLength } = editDistance(truth, prediction);
  return rate(distance, truthLength);
}

/** Word error rate over whitespace tokens. */
export function wordErrorRate(truth, prediction) {
  const truthTokens = tokenize(truth);
  const predictionTokens = tokenize(prediction);
  const { distance } = editDistance(truthTokens, predictionTokens);
  return rate(distance, truthTokens.length);
}

/** Strict, normalisation-free equality of the exact stored strings. */
export function exactTextMatch(truth, prediction) {
  return typeof truth === 'string' && typeof prediction === 'string' && truth === prediction;
}

export function scoreText(truth, prediction) {
  const truthCodePoints = codePoints(truth);
  const predictionCodePoints = codePoints(prediction);
  const { distance, ops } = editDistance(truthCodePoints, predictionCodePoints);
  return {
    cer: rate(distance, truthCodePoints.length),
    wer: wordErrorRate(truth, prediction),
    exactMatch: exactTextMatch(truth, prediction),
    editDistance: distance,
    truthLength: truthCodePoints.length,
    predictionLength: predictionCodePoints.length,
    operations: ops.filter((entry) => entry.op !== 'match').length,
  };
}

function opCounts(ops) {
  const counts = { match: 0, substitute: 0, insert: 0, delete: 0 };
  for (const entry of ops) counts[entry.op] += 1;
  return counts;
}

/**
 * Arabic metric family B: tashkeel.
 *
 * Marks are compared as the canonical ordered mark sequence per letter cluster,
 * so a missing harakah is a deletion, a wrong harakah is a substitution, and an
 * extra harakah is an insertion. `attachmentMismatches` separately reports marks
 * that moved between letters.
 */
export function scoreArabicTashkeel(truth, prediction) {
  const truthClusters = tashkeelClusters(truth);
  const predictionClusters = tashkeelClusters(prediction);
  const truthMarks = truthClusters.flatMap((cluster) => orderMarks(cluster.marks));
  const predictionMarks = predictionClusters.flatMap((cluster) => orderMarks(cluster.marks));
  const { distance, ops } = editDistance(truthMarks, predictionMarks);
  const counts = opCounts(ops);

  let attachmentMismatches = 0;
  const clusterCount = Math.max(truthClusters.length, predictionClusters.length);
  for (let index = 0; index < clusterCount; index += 1) {
    const truthMarksHere = orderMarks(truthClusters[index]?.marks ?? []).join('');
    const predictionMarksHere = orderMarks(predictionClusters[index]?.marks ?? []).join('');
    if (truthMarksHere !== predictionMarksHere) attachmentMismatches += 1;
  }

  return {
    mode: 'arabic-tashkeel',
    truthMarkCount: truthMarks.length,
    predictionMarkCount: predictionMarks.length,
    missingMarks: counts.delete,
    substitutedMarks: counts.substitute,
    extraMarks: counts.insert,
    errorCount: distance,
    cer: rate(distance, truthMarks.length),
    exactMatch: truthMarks.join('') === predictionMarks.join(''),
    tashkeelKey: tashkeelKey(truth),
    attachment: {
      truthClusterCount: truthClusters.length,
      predictionClusterCount: predictionClusters.length,
      attachmentMismatches,
    },
  };
}

/**
 * Arabic metrics, all three families, reported together and never collapsed.
 */
export function scoreArabic(truth, prediction) {
  const huroofScores = scoreText(huroofKey(truth), huroofKey(prediction));
  const tashkeel = scoreArabicTashkeel(truth, prediction);
  const fullyVocalized = {
    mode: 'arabic-fully-vocalized',
    ...scoreText(canonicalComparisonKey(truth), canonicalComparisonKey(prediction)),
    truthMarkCount: markCount(truth),
    predictionMarkCount: markCount(prediction),
  };
  return {
    mode: 'arabic',
    huroof: { mode: 'arabic-huroof', ...huroofScores },
    tashkeel,
    fullyVocalized,
  };
}

/**
 * Urdu metrics for ONE engine. Never a combined score across engines.
 */
export function scoreUrdu(truth, prediction) {
  const text = scoreText(urduComparisonKey(truth), urduComparisonKey(prediction));
  const tashkeel = scoreArabicTashkeel(truth, prediction);
  return {
    mode: 'urdu-per-engine',
    cer: text.cer,
    wer: text.wer,
    exactMatch: text.exactMatch,
    editDistance: text.editDistance,
    truthLength: text.truthLength,
    predictionLength: text.predictionLength,
    spaceInsensitiveExactMatch: spaceInsensitiveKey(truth) === spaceInsensitiveKey(prediction),
    diacritics: {
      truthMarkCount: tashkeel.truthMarkCount,
      predictionMarkCount: tashkeel.predictionMarkCount,
      missingMarks: tashkeel.missingMarks,
      substitutedMarks: tashkeel.substitutedMarks,
      extraMarks: tashkeel.extraMarks,
      cer: tashkeel.cer,
    },
    urduSpecificCharacters: urduCharacterAnalysis(truth, prediction),
  };
}

/**
 * Line / block preservation measures. `predictedLines` is the future segmenter's
 * ordered output; missed and extra lines are measured directly. Split and merged
 * lines are carried as explicit evidence slots rather than inferred here, so the
 * metric never pretends to detect them.
 */
export function linePreservationReport({ truthLines = [], predictedLines = [] }) {
  const truth = truthLines.map((line) => line?.exactText ?? '');
  const predicted = predictedLines.map((line) => line?.text ?? '');
  const exactMatches = truth.filter((text, index) => text === predicted[index]).length;
  const orderingErrors = truth.filter((text, index) => {
    const position = predicted.indexOf(text);
    return position !== -1 && position !== index;
  }).length;
  return {
    truthLineCount: truth.length,
    predictedLineCount: predicted.length,
    missedLines: Math.max(0, truth.length - predicted.length),
    extraLines: Math.max(0, predicted.length - truth.length),
    exactLineMatches: exactMatches,
    lineExactMatchRate: truth.length === 0 ? null : exactMatches / truth.length,
    orderingErrors,
    splitLines: [],
    mergedLines: [],
  };
}

/**
 * Ordered line ground truth for a sample: the LINE record for a line sample, or
 * every declared line of every region for a page/region sample.
 */
export function truthLinesForItem(item) {
  if (item?.unitType === 'LINE' && item.line) return [item.line];
  const lines = (item?.regions ?? []).flatMap((region) => region?.lines ?? []);
  return [...lines].sort((left, right) => left.index - right.index);
}

export function assertFinalGroundTruth(item) {
  const status = item?.groundTruth?.status;
  if (status !== 'FINAL') {
    throw new BenchmarkProtocolError(
      'GROUND_TRUTH_NOT_FINAL',
      `formal scoring requires FINAL ground truth; sample ${String(item?.benchmarkItemId)} is ${String(status)}`,
      { benchmarkItemId: item?.benchmarkItemId ?? null, groundTruthStatus: status ?? null },
    );
  }
  return true;
}

/**
 * Scores one prediction for one sample against FINAL ground truth.
 *
 * @param {{item: object, provider: string, prediction: string, predictedLines?: object[]}} input
 */
export function scoreSample({ item, provider, prediction, predictedLines }) {
  assertFinalGroundTruth(item);
  const truth = item.groundTruth.exactText;
  const metrics = item.language === 'ar'
    ? scoreArabic(truth, prediction)
    : item.language === 'ur'
      ? scoreUrdu(truth, prediction)
      : { mode: 'text', ...scoreText(truth, prediction) };

  return {
    benchmarkItemId: item.benchmarkItemId,
    unitType: item.unitType,
    provider,
    language: item.language,
    script: item.script,
    scoringModes: expectedScoringModesFor(item.language),
    groundTruthRevision: item.groundTruth.revision,
    groundTruthHash: item.groundTruth.hash,
    groundTruthStatus: item.groundTruth.status,
    truthMarkCount: markCount(truth),
    metrics,
    layoutMetrics: predictedLines
      ? linePreservationReport({ truthLines: truthLinesForItem(item), predictedLines })
      : null,
  };
}

/**
 * Pairwise character-level disagreement evidence for any set of engine outputs.
 * Shared by benchmark comparison (which also scores against ground truth) and by
 * runtime orchestration (which has no truth and must not pretend otherwise).
 */
function pairwiseDisagreementEvidence(outputs) {
  const evidence = [];
  for (let left = 0; left < outputs.length; left += 1) {
    for (let right = left + 1; right < outputs.length; right += 1) {
      const firstText = typeof outputs[left]?.text === 'string' ? outputs[left].text : '';
      const secondText = typeof outputs[right]?.text === 'string' ? outputs[right].text : '';
      const { ops, distance, truthLength, predictionLength } = editDistance(firstText, secondText);
      const counts = opCounts(ops);
      evidence.push({
        providers: [outputs[left]?.provider ?? null, outputs[right]?.provider ?? null],
        identical: firstText === secondText,
        agreementCount: counts.match,
        disagreementCount: counts.substitute + counts.insert + counts.delete,
        substitutionCount: counts.substitute,
        insertionCount: counts.insert,
        deletionCount: counts.delete,
        distance,
        aLength: truthLength,
        bLength: predictionLength,
        locationsTruncated: ops.length > MAX_DISAGREEMENT_LOCATIONS * 2,
        locations: ops
          .filter((entry) => entry.op !== 'match')
          .slice(0, MAX_DISAGREEMENT_LOCATIONS)
          .map((entry) => ({
            op: entry.op,
            aIndex: entry.truthIndex ?? null,
            bIndex: entry.predictionIndex ?? null,
            aCodePoint: entry.truth ?? null,
            bCodePoint: entry.prediction ?? null,
          })),
      });
    }
  }
  return evidence;
}

/**
 * Per-provider Urdu engine comparison evidence.
 *
 * Both raw outputs are preserved. Ground truth remains the benchmark authority:
 * agreement between engines is recorded as evidence and is NEVER treated as
 * correctness, and no engine is ever declared the winner.
 */
export function compareProviders({ item, providerResults }) {
  assertFinalGroundTruth(item);
  const truth = item.groundTruth.exactText;
  if (!Array.isArray(providerResults) || providerResults.length < 2) {
    throw new BenchmarkProtocolError(
      'COMPARISON_REQUIRES_TWO_PROVIDERS',
      'engine comparison requires at least two independent provider results',
    );
  }

  const scores = providerResults.map((result) => ({
    provider: result.provider,
    text: result.text,
    score: scoreSample({ item, provider: result.provider, prediction: result.text }),
  }));

  const pairwiseDisagreement = pairwiseDisagreementEvidence(providerResults);

  return {
    benchmarkItemId: item.benchmarkItemId,
    unitType: item.unitType,
    groundTruth: truth,
    groundTruthHash: item.groundTruth.hash,
    correctnessAuthority: 'ground-truth',
    providerScores: scores,
    enginesAgreeWithEachOther: pairwiseDisagreement.every((entry) => entry.identical),
    pairwiseDisagreement,
    materialDisagreement: pairwiseDisagreement.some((entry) => entry.disagreementCount > 0),
  };
}

/** Aggregate per-provider scores: means, exact-match rate, worst offenders. */
export function summarizeProviderScores(scores, { worst = 5 } = {}) {
  const provider = scores[0]?.provider ?? null;
  const primary = (score) =>
    score.metrics.mode === 'arabic'
      ? score.metrics.fullyVocalized.cer
      : score.metrics.cer ?? score.metrics.fullyVocalized?.cer ?? null;
  const values = scores.map(primary);
  return {
    provider,
    samples: scores.length,
    meanCer: values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length,
    exactMatchRate:
      scores.length === 0 ? null : scores.filter((score) => isExact(score)).length / scores.length,
    worstSamples: [...scores]
      .sort((left, right) => primary(right) - primary(left))
      .slice(0, worst)
      .map((score) => ({ benchmarkItemId: score.benchmarkItemId, cer: primary(score) })),
  };
}

function isExact(score) {
  if (score.metrics.mode === 'arabic') return score.metrics.fullyVocalized.exactMatch;
  return Boolean(score.metrics.exactMatch);
}

/**
 * Category breakdown by declared script feature (for example `nastaliq`,
 * `ligature-heavy-nastaliq`, `fully-vocalized`). Aggregation only.
 */
export function summarizeByScriptFeature(items, scores) {
  const scoreById = new Map(scores.map((score) => [score.benchmarkItemId, score]));
  const summary = new Map();
  for (const item of items) {
    const score = scoreById.get(item.benchmarkItemId);
    if (!score) continue;
    for (const feature of item.scriptFeatures ?? []) {
      const entry = summary.get(feature) ?? { feature, samples: 0, exactMatches: 0, cerSum: 0 };
      entry.samples += 1;
      entry.exactMatches += isExact(score) ? 1 : 0;
      entry.cerSum += score.metrics.cer ?? score.metrics.fullyVocalized?.cer ?? 0;
      summary.set(feature, entry);
    }
  }
  return [...summary.values()].map((entry) => ({
    feature: entry.feature,
    samples: entry.samples,
    exactMatchRate: entry.samples === 0 ? null : entry.exactMatches / entry.samples,
    meanCer: entry.samples === 0 ? null : entry.cerSum / entry.samples,
  }));
}

/**
 * Runtime engine-disagreement evidence, WITHOUT ground truth.
 *
 * Benchmark scoring (`compareProviders`) needs human truth because only truth
 * can say which engine was right. At runtime there is no truth, and this project
 * refuses to let agreement stand in for correctness. So this function records
 * exactly what it can defend: where two mandatory engines differ, by how much,
 * and at which character offsets. It never picks a winner, never averages, and
 * never writes a `bestText`.
 */
export function compareEngineOutputs({ outputs = [] } = {}) {
  if (!Array.isArray(outputs) || outputs.length < 2) {
    throw new BenchmarkProtocolError(
      'COMPARISON_REQUIRES_TWO_PROVIDERS',
      'engine comparison requires at least two independent provider outputs',
    );
  }
  const pairwise = pairwiseDisagreementEvidence(outputs);
  return {
    correctnessAuthority: 'none',
    note: 'engine agreement is not truth and no winner is selected; ground truth remains the benchmark authority',
    enginesAgreeWithEachOther: pairwise.every((entry) => entry.identical),
    materialDisagreement: pairwise.some((entry) => entry.disagreementCount > 0),
    pairwiseDisagreement: pairwise,
  };
}
