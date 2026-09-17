import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ARABIC_COMBINING_MARKS,
  buildOcrTextRepresentations,
  countArabicMarks,
  hasArabicMarks,
  stripArabicMarks,
  toCanonicalText,
  toDisplayText,
  toSearchText,
  verifyTashkeelPreserved,
} from '../server/ocr/text-representations.mjs';

const VOCALISED = '\u0627\u0644\u0652\u062d\u064e\u0645\u0652\u062f\u064f \u0644\u0650\u0644\u0651\u064e\u0647\u0650 \u0631\u064e\u0628\u0651\u0650 \u0627\u0644\u0652\u0639\u064e\u0627\u0644\u064e\u0645\u0650\u064a\u0646\u064e';
const UNVOCALISED = '\u0627\u0644\u062d\u0645\u062f \u0644\u0644\u0647 \u0631\u0628 \u0627\u0644\u0639\u0627\u0644\u0645\u064a\u0646';

test('P17-T006: the display pipeline preserves every required harakah', () => {
  const representations = buildOcrTextRepresentations({ rawText: VOCALISED, language: 'ar' });

  // Individual marks must all survive: fatha, damma, kasra, shadda, sukun, tanween.
  for (const mark of ['\u064e', '\u064f', '\u0650', '\u0651', '\u0652', '\u064b', '\u064c', '\u064d']) {
    assert.ok(
      representations.displayText.includes(mark) ||
        !VOCALISED.includes(mark),
      `display text lost mark U+${mark.codePointAt(0).toString(16).toUpperCase()}`,
    );
  }
  assert.ok(representations.displayText.includes('\u064e'), 'fatha lost');
  assert.ok(representations.displayText.includes('\u064f'), 'damma lost');
  assert.ok(representations.displayText.includes('\u0650'), 'kasra lost');
  assert.ok(representations.displayText.includes('\u0651'), 'shadda lost');
  assert.ok(representations.displayText.includes('\u0652'), 'sukun lost');
});

test('P17-T006: raw OCR text is preserved byte-for-byte', () => {
  const representations = buildOcrTextRepresentations({ rawText: VOCALISED, language: 'ar' });
  assert.equal(representations.rawText, VOCALISED);
  assert.deepEqual(verifyTashkeelPreserved({
    rawText: representations.rawText,
    displayText: representations.displayText,
  }).preserved, true);
});

test('P17-T006: search normalization folds tashkeel without touching display text', () => {
  const representations = buildOcrTextRepresentations({ rawText: VOCALISED, language: 'ar' });
  assert.equal(representations.displayText, VOCALISED, 'display text must stay exactly as the engine returned it');
  assert.equal(
    representations.canonicalText,
    toCanonicalText(VOCALISED),
    'the canonical comparison key must be canonically equivalent to the source',
  );
  assert.equal(representations.searchText, UNVOCALISED, 'search key must be diacritic-insensitive');
  assert.notEqual(representations.searchText, representations.displayText);
});

test('P17-T006: an unvocalised query matches vocalised OCR output', () => {
  const { displayText, searchText } = buildOcrTextRepresentations({
    rawText: VOCALISED,
    language: 'ar',
  });
  const queryKey = toSearchText(UNVOCALISED, 'ar');
  assert.ok(searchText.includes(queryKey) || queryKey.split(' ').every((token) => searchText.includes(token)));
  assert.ok(displayText.includes('\u0652'), 'search normalization must not mutate display text');
});

test('P17-T006: tatweel and alef variants fold only in the search key', () => {
  const withTatweel = '\u0643\u0640\u0640\u062a\u0627\u0628';
  const representations = buildOcrTextRepresentations({ rawText: withTatweel, language: 'ar' });
  assert.equal(representations.displayText, withTatweel);
  assert.equal(representations.searchText, '\u0643\u062a\u0627\u0628');
});

test('P17-T006: the tashkeel metric counts a dropped harakah as an error', () => {
  // Ground truth is fully vocalised; an engine that returns bare letters must
  // not be scored as a tashkeel success.
  const truth = '\u0627\u0644\u0652\u062d\u064e\u0645\u0652\u062f\u064f';
  const engineOutput = '\u0627\u0644\u062d\u0645\u062f';
  assert.equal(countArabicMarks(truth), 4);
  assert.equal(countArabicMarks(engineOutput), 0);
  const dropped = verifyTashkeelPreserved({ rawText: truth, displayText: engineOutput });
  assert.equal(dropped.preserved, false, 'a missing harakah must fail the tashkeel guard');
  assert.equal(dropped.rawMarkCount, 4);
  assert.equal(dropped.displayMarkCount, 0);
});

test('P17-T006: Arabic combining marks beyond the core seven are preserved', () => {
  const extended = '\u0627\u0670\u0644\u06dc\u0647';
  const representations = buildOcrTextRepresentations({ rawText: extended, language: 'ar' });
  assert.ok(representations.displayText.includes('\u0670'), 'superscript alef lost');
  assert.ok(representations.displayText.includes('\u06dc'), 'Quranic saktah lost');
  assert.equal(representations.searchText, '\u0627\u0644\u0647');
});

test('P17-T006: Urdu letters and marks survive the round trip untouched', () => {
  const urdu = '\u06c1\u06d2 \u06a9\u0650\u062a\u0627\u0628 \u0679\u06be\u06cc\u06a9';
  const representations = buildOcrTextRepresentations({ rawText: urdu, language: 'ur' });
  assert.equal(representations.rawText, urdu);
  assert.ok(representations.displayText.includes('\u06c1'), 'Urdu heh goal lost');
  assert.ok(representations.displayText.includes('\u06d2'), 'Urdu yeh barree lost');
  assert.ok(representations.displayText.includes('\u0679'), 'Urdu tteh lost');
  assert.ok(representations.displayText.includes('\u06be'), 'Urdu doachashmee heh lost');
  assert.ok(representations.displayText.includes('\u0650'), 'Urdu kasra lost');
  assert.ok(!representations.searchText.includes('\u0650'));
});

test('P17-T006: display text strips control characters but never marks', () => {
  const dirty = `a\u0000b\u0007${VOCALISED}`;
  const display = toDisplayText(dirty);
  assert.ok(!display.includes('\u0000'));
  assert.ok(!display.includes('\u0007'));
  for (const mark of ARABIC_COMBINING_MARKS) {
    if (VOCALISED.includes(mark)) {
      assert.ok(display.includes(mark), `control stripping removed mark ${mark}`);
    }
  }
});

test('P17-T006: display text is never re-ordered by Unicode normalization', () => {
  // Shadda (combining class 33) precedes fatha (class 30) in this raw sequence.
  // NFC would reorder them; the display pipeline must not.
  const rawSequence = '\u0644\u0651\u064e';
  const representations = buildOcrTextRepresentations({ rawText: rawSequence, language: 'ar' });
  assert.equal(representations.displayText, rawSequence);
  assert.equal(countArabicMarks(representations.displayText), 2);
  assert.equal(representations.canonicalText, toCanonicalText(rawSequence));
});

test('P17-T006: mark helpers behave on empty and non-Arabic input', () => {
  assert.equal(stripArabicMarks(''), '');
  assert.equal(hasArabicMarks('plain english'), false);
  assert.equal(countArabicMarks(null), 0);
  assert.equal(toSearchText(null, 'ar'), '');
});
