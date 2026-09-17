/**
 * Deterministic Unicode comparison behaviour for the OCR benchmark.
 *
 * The rule this module exists to protect: exact ground-truth text is NEVER
 * rewritten. Everything here produces a DERIVED comparison key that is used for
 * scoring only. Arabic harakat are never silently dropped from stored text, Urdu
 * letters are never transliterated or folded into Arabic variants, and no
 * comparison key is ever written back over `exactText`.
 *
 * Mark handling is deliberately explicit rather than delegated to `NFKC`, which
 * would fold presentation forms and destroy the evidence the benchmark exists to
 * measure.
 */

import {
  ARABIC_COMBINING_MARKS,
  countArabicMarks,
  stripArabicMarks,
} from '../text-representations.mjs';

/**
 * Urdu-specific letters the benchmark treats as first-class evidence. These are
 * exactly the characters a destructive Arabic fold would destroy.
 */
export const URDU_SPECIFIC_CODE_POINTS = Object.freeze([
  '\u0679', // tteh
  '\u0688', // ddal
  '\u0691', // rreh
  '\u06BA', // noon ghunna
  '\u06BE', // doachashmee heh
  '\u06C1', // heh goal
  '\u06C2', // heh goal with hamza above
  '\u06C3', // teh marbuta goal
  '\u06D2', // yeh barree
  '\u06D3', // yeh barree with hamza above
  '\u06CC', // farsi yeh (Urdu yeh)
  '\u064A', // arabic yeh, for the contrast the analysis reports
  '\u0647', // arabic heh, for the contrast the analysis reports
]);

/** Urdu-specific letters plus the marks the Urdu fixtures must exercise. */
export const URDU_REPRESENTATIVE_CODE_POINTS = Object.freeze([
  ...URDU_SPECIFIC_CODE_POINTS,
  '\u064E', // fatha
  '\u0650', // kasra
  '\u0651', // shadda
]);

/** Representative Arabic marks the Arabic fixtures must exercise. */
export const ARABIC_REPRESENTATIVE_CODE_POINTS = Object.freeze([
  '\u064E',
  '\u064F',
  '\u0650',
  '\u0651',
  '\u0652',
  '\u064B',
  '\u064C',
  '\u064D',
]);

/**
 * Canonical combining classes for the marks Read & Watch handles. Values follow
 * the Unicode character database; unknown marks default to 230 (above), which is
 * the class of every Arabic mark outside the vowel-sign block.
 */
const COMBINING_CLASS = Object.freeze({
  '\u064B': 27,
  '\u064C': 28,
  '\u064D': 29,
  '\u064E': 30,
  '\u064F': 31,
  '\u0650': 32,
  '\u0651': 33,
  '\u0652': 34,
  '\u0653': 230,
  '\u0654': 230,
  '\u0655': 220,
  '\u0656': 220,
  '\u0657': 230,
  '\u0658': 230,
  '\u0659': 230,
  '\u065A': 230,
  '\u065B': 230,
  '\u065C': 220,
  '\u065D': 230,
  '\u065E': 230,
  '\u065F': 220,
  '\u0670': 35,
  '\u06EA': 220,
  '\u06ED': 220,
});

const MARK_SET = new Set(ARABIC_COMBINING_MARKS);
const URDU_SPECIFIC_SET = new Set(URDU_SPECIFIC_CODE_POINTS);
const ZERO_WIDTH_PATTERN = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const WHITESPACE_PATTERN = /\s+/g;

function normalizeLineEndings(text) {
  return typeof text === 'string' ? text.replace(/\r\n?/g, '\n') : '';
}

/** Comparison-only cleanup: zero-width controls and CRLF. Never stored. */
export function comparisonText(text) {
  return normalizeLineEndings(text).replace(ZERO_WIDTH_PATTERN, '');
}

export function combiningClass(character) {
  return COMBINING_CLASS[character] ?? 230;
}

/** Deterministic order for marks inside one cluster. */
export function orderMarks(marks) {
  return [...marks].sort((left, right) => {
    const difference = combiningClass(left) - combiningClass(right);
    if (difference !== 0) return difference;
    return left.codePointAt(0) - right.codePointAt(0);
  });
}

/**
 * Marks grouped by the base character they follow. This is the evidence a
 * tashkeel metric reports: which marks exist and where they are attached.
 */
export function tashkeelClusters(text) {
  const value = comparisonText(text);
  const clusters = [];
  let pending = [];
  let index = 0;
  for (const character of value) {
    if (MARK_SET.has(character)) {
      pending.push(character);
      continue;
    }
    if (pending.length > 0) {
      clusters.push({ index: index - pending.length, marks: [...pending] });
      pending = [];
    }
    index += 1;
  }
  if (pending.length > 0) clusters.push({ index: index - pending.length, marks: [...pending] });
  return clusters;
}

export function markCount(text) {
  return countArabicMarks(comparisonText(text));
}

/**
 * Huroof / base-letter key: marks and tatweel removed, whitespace collapsed.
 * Used ONLY by the Arabic base-letter metric.
 */
export function huroofKey(text) {
  return stripArabicMarks(comparisonText(text)).replace(WHITESPACE_PATTERN, ' ').trim();
}

/**
 * Tashkeel key: the ordered mark sequence per cluster, in canonical combining
 * order, separated by U+0000 so a mark that moves between letters is an error.
 */
export function tashkeelKey(text) {
  return tashkeelClusters(text)
    .map((cluster) => orderMarks(cluster.marks).join(''))
    .join('\u0000');
}

/**
 * Fully vocalised / general comparison key: line endings and zero-width
 * controls normalised, NFC applied so canonically equivalent mark orders compare
 * equal, and nothing else changed. Letters, marks, punctuation, and digits all
 * remain part of the comparison.
 */
export function canonicalComparisonKey(text) {
  return comparisonText(text).normalize('NFC');
}

/**
 * Urdu comparison key: NFC plus zero-width removal only. No transliteration, no
 * letter folding, no diacritic removal, no harakat dropping.
 */
export function urduComparisonKey(text) {
  return comparisonText(text).normalize('NFC');
}

/** Whitespace-insensitive comparison key (used only as a secondary measure). */
export function spaceInsensitiveKey(text) {
  return comparisonText(text).replace(/\s+/g, '');
}

/** Whitespace-delimited tokens for word-level metrics. Never a rewrite. */
export function tokenize(text) {
  const value = comparisonText(text).trim();
  return value.length === 0 ? [] : value.split(/\s+/);
}

/** Urdu-specific character error analysis: per-character counts, no folding. */
export function urduCharacterAnalysis(truth, prediction) {
  const count = (text, character) =>
    Array.from(comparisonText(text)).filter((entry) => entry === character).length;
  return URDU_SPECIFIC_CODE_POINTS.map((character) => ({
    codePoint: `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
    character,
    isUrduSpecific: URDU_SPECIFIC_SET.has(character),
    truthCount: count(truth, character),
    predictionCount: count(prediction, character),
  })).filter((entry) => entry.truthCount > 0 || entry.predictionCount > 0);
}
