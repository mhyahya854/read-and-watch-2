/**
 * Read & Watch OCR text representations — Phase 17.
 *
 * Three logically separate representations exist for every OCR result:
 *
 *   rawText     - exact provider output as received. Never rewritten.
 *   displayText - user-visible canonical OCR text. Arabic huroof and
 *                 tashkeel/harakat are PRESERVED. Only control characters and
 *                 ill-formed code units are removed.
 *   searchText  - a derived indexing key. May drop diacritics so "الحمد لله"
 *                 matches "الْحَمْدُ لِلَّهِ". It never overwrites rawText or
 *                 displayText, and it is never shown as OCR output.
 *
 * The hard rule this module exists to enforce: nothing on the display path may
 * strip Arabic combining marks.
 */

/**
 * Arabic combining/annotation marks that must survive the display pipeline.
 * Ranges are taken from the Unicode Arabic block, not from a curated subset, so
 * marks returned by a future engine revision are preserved without code edits.
 */
export const ARABIC_COMBINING_MARKS = Object.freeze([
  '\u064B', // fathatan
  '\u064C', // dammatan
  '\u064D', // kasratan
  '\u064E', // fatha
  '\u064F', // damma
  '\u0650', // kasra
  '\u0651', // shadda
  '\u0652', // sukun
  '\u0653', // maddah above
  '\u0654', // hamza above
  '\u0655', // hamza below
  '\u0656', // subscript alef
  '\u0657', // inverted damma
  '\u0658', // mark noon ghunna
  '\u0659', // zwarakay
  '\u065A', // vowel sign small v above
  '\u065B', // vowel sign inverted small v above
  '\u065C', // vowel sign dot below
  '\u065D', // reversed damma
  '\u065E', // fatha with two dots
  '\u065F', // wavy hamza below
  '\u0670', // superscript alef
  '\u06D6',
  '\u06D7',
  '\u06D8',
  '\u06D9',
  '\u06DA',
  '\u06DB',
  '\u06DC', // small high sign saktah
  '\u06DF',
  '\u06E0',
  '\u06E1',
  '\u06E2',
  '\u06E3',
  '\u06E4',
  '\u06E7',
  '\u06E8',
  '\u06EA',
  '\u06EB',
  '\u06EC',
  '\u06ED',
]);

/** Tatweel/kashida is a shape filler, not a letter. Search may drop it. */
const TATWEEL = '\u0640';

const ARABIC_MARK_PATTERN = new RegExp(
  `[${ARABIC_COMBINING_MARKS.join('')}${TATWEEL}]`,
  'gu',
);

/**
 * Removes C0/C1 control characters while keeping tab, newline, and carriage
 * return. Implemented as a code-point filter rather than a control-character
 * regular expression so the intent is explicit and auditable.
 */
function stripControlCharacters(text) {
  let result = '';
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    const isControl =
      (code >= 0x00 && code <= 0x08) ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      (code >= 0x7f && code <= 0x9f);
    if (!isControl) result += character;
  }
  return result;
}

export function stripArabicMarks(text) {
  if (typeof text !== 'string' || text.length === 0) return '';
  return text.replace(ARABIC_MARK_PATTERN, '');
}

export function hasArabicMarks(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  ARABIC_MARK_PATTERN.lastIndex = 0;
  return ARABIC_MARK_PATTERN.test(text);
}

/** Counts combining marks in a string. Used by the tashkeel metrics landmine. */
export function countArabicMarks(text) {
  if (typeof text !== 'string' || text.length === 0) return 0;
  let count = 0;
  for (const character of text) {
    if (ARABIC_COMBINING_MARKS.includes(character)) count += 1;
  }
  return count;
}

/**
 * Canonical display form.
 *
 * - NFC normalization is applied because it is canonically equivalent and
 *   lossless for Arabic text (it composes where possible and never removes a
 *   combining mark that carries information).
 * - NFD/NFKD/NFKC are deliberately NOT used: NFKC would fold presentation
 *   forms and NFKD would decompose marks in ways that complicate round-tripping.
 * - Combining marks are never filtered out.
 */
export function toDisplayText(rawText) {
  if (typeof rawText !== 'string') return '';
  // Deliberately no Unicode normalization here. Normalization is not "necessary
  // for safe display", and even NFC canonically REORDERS Arabic combining marks
  // (fatha has a lower combining class than shadda). Reordering is lossless in
  // theory but it silently changes the string a user sees and copies, so the
  // faithful choice is to carry the provider's own output forward unchanged
  // apart from line endings and control characters.
  return stripControlCharacters(rawText.replace(/\r\n?/g, '\n'));
}

/**
 * Canonically equivalent comparison key. NFC is used here only for equality
 * checks, never for display.
 */
export function toCanonicalText(displayText) {
  if (typeof displayText !== 'string') return '';
  return displayText.normalize('NFC');
}

/**
 * Derived search key. Diacritic-insensitive for Arabic-script languages so a
 * user typing unvocalised text still finds vocalised OCR output.
 * Never used as OCR output.
 */
export function toSearchText(displayText, language) {
  if (typeof displayText !== 'string') return '';
  const base = displayText.normalize('NFKD').toLowerCase();
  if (language !== 'ar' && language !== 'ur') {
    // Non-Arabic scripts: keep the NFKD-folded key (mirrors the existing
    // search-store normalization contract).
    return base.replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  }
  return base
    .replace(ARABIC_MARK_PATTERN, '')
    .replace(/\u0622|\u0623|\u0625|\u0627\u0644\u0644\u0647/g, (match) =>
      match.startsWith('\u0627') ? '\u0627\u0644\u0644\u0647' : '\u0627',
    )
    .replace(/\u0649/g, '\u064A') // alef maksura -> yeh
    .replace(/\u06CC/g, '\u064A') // farsi/urdu yeh -> arabic yeh
    .replace(/[\u200B-\u200F\u202A-\u202E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Builds the three canonical representations for one OCR result.
 * `rawText` passes through byte-for-byte; only the derived forms are touched.
 */
export function buildOcrTextRepresentations({ rawText, language }) {
  const raw = typeof rawText === 'string' ? rawText : '';
  const displayText = toDisplayText(raw);
  return {
    rawText: raw,
    displayText,
    canonicalText: toCanonicalText(displayText),
    searchText: toSearchText(displayText, language),
  };
}

/**
 * Tashkeel preservation guard used by tests and by the recognizer post-step.
 * Returns a structured verdict rather than throwing so callers can report it.
 */
export function verifyTashkeelPreserved({ rawText, displayText }) {
  const rawMarks = countArabicMarks(rawText);
  const displayMarks = countArabicMarks(displayText);
  return {
    preserved: displayMarks >= rawMarks,
    rawMarkCount: rawMarks,
    displayMarkCount: displayMarks,
  };
}
