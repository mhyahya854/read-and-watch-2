/**
 * P17-T002 scoring and Unicode tests.
 *
 * Requirement coverage in this file:
 *   5  CER exact match = 0
 *   6  CER insertion / deletion / substitution
 *   7  WER behaviour
 *   8  Arabic base letters score correctly when only tashkeel is missing
 *   9  missing tashkeel causes a tashkeel error
 *   10 wrong tashkeel causes a tashkeel error
 *   11 extra tashkeel causes a tashkeel error
 *   12 fully-vocalised metric fails when marks disappear
 *   13 shadda + vowel combinations are handled deterministically
 *   14 tanween is preserved and scored
 *   15 Urdu-specific characters are preserved
 *   16 destructive Arabic/Urdu normalisation is prohibited
 *   16b line / block preservation measures (general metric set)
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalComparisonKey,
  characterErrorRate,
  comparisonText,
  exactTextMatch,
  huroofKey,
  linePreservationReport,
  scoreArabic,
  scoreArabicTashkeel,
  scoreText,
  scoreUrdu,
  tashkeelKey,
  truthLinesForItem,
  urduCharacterAnalysis,
  urduComparisonKey,
  wordErrorRate,
} from '../server/ocr/benchmark/index.mjs';

const VOCALISED = '\u0627\u0644\u0652\u062d\u064e\u0645\u0652\u062f\u064f'; // الْحَمْدُ
const UNVOCALISED = '\u0627\u0644\u062d\u0645\u062f'; // الحمد
const WRONG_TASHKEEL = '\u0627\u0644\u0652\u062d\u0650\u0645\u0652\u062f\u0650'; // الْحِمْدِ
const QALAMUN = '\u0642\u064e\u0644\u064e\u0645\u064c'; // قَلَمٌ
const QALAM = '\u0642\u0644\u0645'; // قلم

test('P17-T002 case 5: CER is exactly 0 for an exact match', () => {
  assert.equal(characterErrorRate(VOCALISED, VOCALISED), 0);
  assert.equal(characterErrorRate('The Reading Desk', 'The Reading Desk'), 0);
  const scores = scoreText('The Reading Desk', 'The Reading Desk');
  assert.equal(scores.cer, 0);
  assert.equal(scores.wer, 0);
  assert.equal(scores.exactMatch, true);
  assert.equal(exactTextMatch('a', 'a'), true);
});

test('P17-T002 case 6: CER counts deletions, insertions, and substitutions', () => {
  // Deletion: one character missing out of six.
  assert.equal(characterErrorRate('abcdef', 'abdef'), 1 / 6);
  // Insertion: one extra character without error.
  assert.equal(characterErrorRate('abcdef', 'abcdefg'), 1 / 6);
  // Substitution.
  assert.equal(characterErrorRate('abcdef', 'abcxef'), 1 / 6);
  // Combined: kitten -> sitting is three edits over six reference characters.
  assert.equal(characterErrorRate('kitten', 'sitting'), 0.5);
  assert.equal(characterErrorRate('reader', ''), 1);
});

test('P17-T002 case 7: WER behaves over whitespace tokens', () => {
  assert.equal(wordErrorRate('a b c d', 'a b c d'), 0);
  assert.equal(wordErrorRate('a b c d', 'a b x d d'), 0.5);
  assert.equal(wordErrorRate('two words', 'two words here'), 0.5);
  assert.equal(scoreText('one two', 'one two').wer, 0);
});

test('P17-T002 case 8: Arabic huroof can be correct while tashkeel is missing', () => {
  const metrics = scoreArabic(VOCALISED, UNVOCALISED);
  assert.equal(metrics.huroof.exactMatch, true, 'the letters were recognised');
  assert.equal(metrics.huroof.cer, 0);
  assert.equal(metrics.tashkeel.exactMatch, false, 'marks were dropped');
  assert.equal(metrics.tashkeel.missingMarks, 4);
  assert.equal(metrics.fullyVocalized.exactMatch, false, 'fully vocalised text was not reproduced');
  assert.ok(metrics.fullyVocalized.cer > 0);
});

test('P17-T002 case 9: a missing harakah is a tashkeel error', () => {
  const tashkeel = scoreArabicTashkeel(VOCALISED, UNVOCALISED);
  assert.equal(tashkeel.truthMarkCount, 4);
  assert.equal(tashkeel.predictionMarkCount, 0);
  assert.equal(tashkeel.missingMarks, 4);
  assert.equal(tashkeel.substitutedMarks, 0);
  assert.equal(tashkeel.extraMarks, 0);
  assert.equal(tashkeel.exactMatch, false);
  assert.equal(tashkeel.cer, 1);
});

test('P17-T002 case 10: a wrong harakah is a tashkeel error', () => {
  const tashkeel = scoreArabicTashkeel(VOCALISED, WRONG_TASHKEEL);
  assert.equal(tashkeel.missingMarks, 0);
  assert.equal(tashkeel.extraMarks, 0);
  assert.equal(tashkeel.substitutedMarks, 2, 'fatha -> kasra and damma -> kasra');
  assert.equal(tashkeel.cer, 0.5);
  assert.equal(tashkeel.exactMatch, false);
  assert.equal(scoreArabic(VOCALISED, WRONG_TASHKEEL).fullyVocalized.exactMatch, false);
});

test('P17-T002 case 11: an extra harakah is a tashkeel error', () => {
  const tashkeel = scoreArabicTashkeel(UNVOCALISED, VOCALISED);
  assert.equal(tashkeel.truthMarkCount, 0);
  assert.equal(tashkeel.predictionMarkCount, 4);
  assert.equal(tashkeel.extraMarks, 4);
  assert.equal(tashkeel.missingMarks, 0);
  assert.equal(tashkeel.exactMatch, false);
  // With an empty mark reference every extra mark is a full error unit.
  assert.equal(tashkeel.cer, 4);
});

test('P17-T002 case 12: the fully-vocalised metric fails when marks disappear', () => {
  const metrics = scoreArabic(VOCALISED, UNVOCALISED);
  assert.equal(metrics.fullyVocalized.mode, 'arabic-fully-vocalized');
  assert.equal(metrics.fullyVocalized.exactMatch, false);
  assert.ok(metrics.fullyVocalized.cer > 0);
  assert.equal(metrics.fullyVocalized.wer, 1);
  assert.equal(metrics.fullyVocalized.truthMarkCount, 4);
  assert.equal(metrics.fullyVocalized.predictionMarkCount, 0);
});

test('P17-T002 case 13: shadda + vowel combinations are deterministic', () => {
  const shaddaThenFatha = '\u0644\u0651\u064e';
  const fathaThenShadda = '\u0644\u064e\u0651';
  assert.notEqual(shaddaThenFatha, fathaThenShadda, 'the stored strings really are different');
  assert.equal(tashkeelKey(shaddaThenFatha), tashkeelKey(fathaThenShadda));
  assert.equal(canonicalComparisonKey(shaddaThenFatha), canonicalComparisonKey(fathaThenShadda));
  assert.equal(
    scoreArabic(shaddaThenFatha, fathaThenShadda).fullyVocalized.exactMatch,
    true,
    'canonically equivalent mark order compares equal',
  );
  assert.equal(
    scoreArabic(shaddaThenFatha, '\u0644\u064e').tashkeel.missingMarks,
    1,
    'dropping the shadda is still an error',
  );
});

test('P17-T002 case 14: tanween is preserved and scored', () => {
  assert.equal(scoreArabicTashkeel(QALAMUN, QALAMUN).exactMatch, true);
  const dropped = scoreArabicTashkeel(QALAMUN, QALAM);
  // قَلَمٌ carries fatha, fatha, and dammatan: three marks, one of them tanween.
  assert.equal(dropped.truthMarkCount, 3);
  assert.ok(tashkeelKey(QALAMUN).includes('\u064C'), 'the dammatan must be part of the tashkeel key');
  assert.equal(dropped.missingMarks, 3);
  assert.equal(dropped.exactMatch, false);
  assert.equal(scoreArabic(QALAMUN, QALAM).huroof.exactMatch, true);
  assert.equal(scoreArabic(QALAMUN, QALAM).fullyVocalized.exactMatch, false);
  assert.equal(scoreArabicTashkeel('\u0642\u0644\u0645\u064C', '\u0642\u0644\u0645').missingMarks, 1);
});

test('P17-T002 case 15: Urdu-specific characters are preserved, never folded', () => {
  const urdu = '\u06CC\u06C1 \u0679\u06BE\u06CC\u06A9 \u06C1\u06D2 \u0688\u0691\u06BA';
  assert.equal(urduComparisonKey(urdu), urdu, 'no letter is folded or transliterated');
  for (const character of ['\u0679', '\u0688', '\u0691', '\u06BA', '\u06BE', '\u06C1', '\u06D2', '\u06CC']) {
    assert.ok(urdu.includes(character), `fixture must contain U+${character.codePointAt(0).toString(16).toUpperCase()}`);
  }
  assert.notEqual(urduComparisonKey('\u06CC\u06C1'), urduComparisonKey('\u064A\u0647'), 'Urdu yeh/heh must not fold to Arabic yeh/heh');
  const metrics = scoreUrdu(urdu, urdu);
  assert.equal(metrics.cer, 0);
  assert.equal(metrics.exactMatch, true);
  assert.ok(metrics.urduSpecificCharacters.some((entry) => entry.character === '\u0679' && entry.truthCount === 1));
  assert.ok(metrics.urduSpecificCharacters.every((entry) => typeof entry.isUrduSpecific === 'boolean'));
});

test('P17-T002 case 16: destructive Arabic/Urdu normalisation is prohibited', () => {
  const exact = `${VOCALISED} \u06CC\u06C1\r\n\u0679\u06BE\u06CC\u06A9`;
  const before = JSON.stringify(exact);
  scoreArabic(exact, UNVOCALISED);
  scoreUrdu(exact, exact);
  assert.equal(JSON.stringify(exact), before, 'scoring must never mutate stored text');

  // Derived keys may drop marks or normalise line endings. The stored text may not.
  assert.notEqual(huroofKey(VOCALISED), VOCALISED);
  assert.equal(huroofKey(UNVOCALISED), UNVOCALISED);
  assert.equal(comparisonText(exact).includes('\r'), false);
  assert.equal(exact.includes('\r'), true, 'exact text keeps its own line endings');

  // Line-ending normalisation is a comparison concern only.
  const lf = 'line one\nline two';
  const crlf = 'line one\r\nline two';
  assert.equal(exactTextMatch(lf, crlf), false, 'exact match is byte-exact');
  assert.equal(canonicalComparisonKey(lf), canonicalComparisonKey(crlf));

  // Zero-width controls are removed from the comparison key only.
  const withZeroWidth = 'text\u200Btext';
  assert.equal(comparisonText(withZeroWidth), 'texttext');
  assert.notEqual(withZeroWidth, 'texttext');

  // Urdu digits and letters survive both keys untouched.
  const urdu = '\u06F1\u06F8 \u0633\u062A\u0645\u0628\u0631 \u06A9\u062A\u0627\u0628';
  assert.equal(urduComparisonKey(urdu), urdu);
  assert.equal(huroofKey(urdu), urdu);
});

test('P17-T002 case 16b: line and block preservation measures', () => {
  const truthLines = [
    { lineId: 'l0', index: 0, exactText: 'first line' },
    { lineId: 'l1', index: 1, exactText: 'second line' },
    { lineId: 'l2', index: 2, exactText: 'third line' },
  ];
  const exact = linePreservationReport({
    truthLines,
    predictedLines: [{ text: 'first line' }, { text: 'second line' }, { text: 'third line' }],
  });
  assert.equal(exact.lineExactMatchRate, 1);
  assert.equal(exact.missedLines, 0);
  assert.equal(exact.extraLines, 0);
  assert.equal(exact.orderingErrors, 0);

  const reordered = linePreservationReport({
    truthLines,
    predictedLines: [{ text: 'second line' }, { text: 'first line' }, { text: 'third line' }],
  });
  assert.equal(reordered.orderingErrors, 2);
  assert.equal(reordered.lineExactMatchRate, 1 / 3);

  const short = linePreservationReport({ truthLines, predictedLines: [{ text: 'first line' }] });
  assert.equal(short.missedLines, 2);
  const long = linePreservationReport({
    truthLines,
    predictedLines: [...truthLines.map((line) => ({ text: line.exactText })), { text: 'extra' }],
  });
  assert.equal(long.extraLines, 1);
  // Split/merge detection is deliberately not inferred by this helper.
  assert.deepEqual(short.splitLines, []);
  assert.deepEqual(short.mergedLines, []);

  const item = { unitType: 'PAGE', regions: [{ regionId: 'r0', language: 'ur', regionType: 'multi-line-nastaliq-region', box: { x: 0, y: 0, width: 10, height: 10 }, readingOrder: 0, requiredProviders: ['paddleocr', 'urdu-nastaliq-trocr'], lines: truthLines }] };
  assert.equal(truthLinesForItem(item).length, 3);
});
