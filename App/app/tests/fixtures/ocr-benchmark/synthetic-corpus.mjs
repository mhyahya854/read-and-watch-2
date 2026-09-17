/**
 * Lawful synthetic starter corpus for the OCR benchmark — Phase 17, P17-T002.
 *
 * WHY THIS FILE EXISTS
 *
 * The synthetic corpus proves that the benchmark plumbing works end to end:
 * schema, rendering, ground truth, hashing, scoring, directionality, Unicode
 * handling, multi-engine result handling, and line/region identity. It is NOT
 * representative of real books and is NOT sufficient for final accuracy
 * acceptance. No book, scan, page image, or private transcription is committed
 * anywhere in this file: every sentence below was authored for this benchmark.
 *
 * WHY THE TEXT IS THE SINGLE SOURCE OF TRUTH
 *
 * Each definition declares its lines once (`lines[].text`). The builder derives
 * the region/page ground truth, the renderer draws exactly those lines, and the
 * manifest ground-truth hash is computed from the same bytes. There is no second
 * copy of the text to drift out of sync.
 */

/**
 * Font provenance. The renderer refuses a font that is not declared here, and
 * refuses a declared font that does not cover the code points of the fixture it
 * is asked to draw. Every font is a legally redistributable OFL-1.1 font hosted
 * by the Google Fonts project; Read & Watch downloads it into the private data
 * root and never commits the binary.
 */
export const FONT_PROVENANCE = Object.freeze({
  ur: Object.freeze({
    family: 'Noto Nastaliq Urdu',
    file: 'NotoNastaliqUrdu-Regular.ttf',
    license: 'OFL-1.1',
    upstreamUrl: 'https://github.com/google/fonts/tree/main/ofl/notonastaliqurdu',
    downloadUrl:
      'https://raw.githubusercontent.com/google/fonts/main/ofl/notonastaliqurdu/NotoNastaliqUrdu%5Bwght%5D.ttf',
    script: 'arabic-nastaliq',
    // Observed from the downloaded OFL font on 2026-09-17; the renderer verifies
    // this hash and refuses to render if the upstream file changed.
    sha256: '98a4787f34eb6fde57fb9a1121a8f216301196ab0da98ea110cad581be8abbcd',
    byteLength: 690304,
    cmapFormats: [4],
    notes:
      'Nastaliq-capable Urdu font. Required for Urdu fixtures so the benchmark never rasterises Urdu text with a font that lacks Urdu glyphs.',
  }),
  ar: Object.freeze({
    family: 'Noto Naskh Arabic',
    file: 'NotoNaskhArabic-Regular.ttf',
    license: 'OFL-1.1',
    upstreamUrl: 'https://github.com/google/fonts/tree/main/ofl/notonaskharabic',
    downloadUrl:
      'https://raw.githubusercontent.com/google/fonts/main/ofl/notonaskharabic/NotoNaskhArabic%5Bwght%5D.ttf',
    script: 'arabic-naskh',
    sha256: '67b5a525a661b607971fbd3f96a81b89d3a768e74534fca84f18ac97e6fab72f',
    byteLength: 307592,
    cmapFormats: [4, 12],
    notes:
      'Naskh-style Arabic font with full harakat coverage. Deliberately NOT used for Urdu line samples.',
  }),
  en: Object.freeze({
    family: 'Noto Sans',
    file: 'NotoSans-Regular.ttf',
    license: 'OFL-1.1',
    upstreamUrl: 'https://github.com/google/fonts/tree/main/ofl/notosans',
    downloadUrl:
      'https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf',
    script: 'latin',
    sha256: 'bfb7bb691513f12e734dc346c03a03f784912432d7e3fa8e56efcf906fe86b3d',
    byteLength: 2049096,
    cmapFormats: [4, 12],
    notes: 'Latin font for English samples.',
  }),
});

const EN_HEADING = 'Chapter 1: The Reading Desk';
const EN_BODY = 'A quiet room, 12 shelves, and 3 windows. Reading is a habit; notes make it durable.';

const AR_LINE_1 = 'الْكِتَٰبُ الْمُفِيدُ عَلَى الطَّاوِلَةِ.';
const AR_LINE_2 = 'قَلَمٌ وَدَفْتَرٌ وَمِمْحَاةٌ.';
const AR_LINE_3 = 'كِتَابًا جَدِيدًا فِي الْمَكْتَبَةِ ١٤٢٥.';

const UR_LINE_1 = 'یہ ایک آزمائشی سطر ہے، جس میں ٹ، ڈ، ڑ، ں، ھ اور ے شامل ہیں۔';
const UR_LINE_2 = 'اردو نستعلیق رسم الخط میں لکھی گئی ۱۸ ستمبر ۲۰۲۶ کی عبارت ہے۔';
const UR_LINE_3 = 'کتاب اور قلم علم کے دو اہم ذرائع ہیں۔';
const UR_LINE_4 = 'ڈھلوان سطر کی پیمائش کے لیے نمونہ۔';
const UR_LINE_5 = 'یہ صرف بنیادی ڈھانچے کی جانچ کے لیے ہے۔';
const UR_MIXED_LINE = 'یہ کتاب پڑھنے کے قابل ہے۔';

const BOX = (x, y, width, height) => ({ x, y, width, height });

export const SYNTHETIC_CORPUS_ID = 'synthetic-starter-v1';

export const SYNTHETIC_CORPUS_DESCRIPTION =
  'Lawful synthetic starter corpus. Authored for benchmark plumbing only: it is not representative of real books and must not be used as final accuracy acceptance evidence.';

/**
 * Flat sample definitions. Pages are listed before their regions and lines; the
 * builder and the manifest validator both resolve and verify the relationships.
 */
export const SYNTHETIC_SAMPLES = Object.freeze([
  {
    benchmarkItemId: 'syn-en-page-0001',
    unitType: 'PAGE',
    language: 'en',
    script: 'latin',
    sourceType: 'born-digital-rendered',
    layoutClass: ['heading-paragraph'],
    qualityClass: 'clean',
    scriptFeatures: ['headings', 'normal-prose', 'numbers', 'punctuation'],
    purpose: 'formal-acceptance',
    requiredProviders: ['unlimited-ocr'],
    parentPageId: null,
    parentRegionId: null,
    regions: [
      {
        regionId: 'syn-en-region-0001',
        language: 'en',
        regionType: 'heading-paragraph',
        box: BOX(40, 40, 820, 120),
        readingOrder: 0,
        lines: [
          { lineId: 'syn-en-line-0001', index: 0, language: 'en', box: BOX(40, 40, 820, 44), text: EN_HEADING },
          { lineId: 'syn-en-line-0002', index: 1, language: 'en', box: BOX(40, 96, 820, 64), text: EN_BODY },
        ],
      },
    ],
  },
  {
    benchmarkItemId: 'syn-en-line-0001',
    unitType: 'LINE',
    language: 'en',
    script: 'latin',
    sourceType: 'born-digital-rendered',
    layoutClass: ['isolated-line'],
    qualityClass: 'clean',
    scriptFeatures: ['headings', 'punctuation'],
    purpose: 'formal-acceptance',
    requiredProviders: ['unlimited-ocr'],
    parentPageId: 'syn-en-page-0001',
    parentRegionId: 'syn-en-region-0001',
    line: { lineId: 'syn-en-line-0001', index: 0, box: BOX(40, 40, 820, 44) },
    lines: [{ lineId: 'syn-en-line-0001', index: 0, language: 'en', box: BOX(40, 40, 820, 44), text: EN_HEADING }],
  },
  {
    benchmarkItemId: 'syn-en-line-0002',
    unitType: 'LINE',
    language: 'en',
    script: 'latin',
    sourceType: 'born-digital-rendered',
    layoutClass: ['isolated-line'],
    qualityClass: 'clean',
    scriptFeatures: ['normal-prose', 'punctuation'],
    purpose: 'formal-acceptance',
    requiredProviders: ['unlimited-ocr'],
    parentPageId: 'syn-en-page-0001',
    parentRegionId: 'syn-en-region-0001',
    line: { lineId: 'syn-en-line-0002', index: 1, box: BOX(40, 96, 820, 64) },
    lines: [{ lineId: 'syn-en-line-0002', index: 1, language: 'en', box: BOX(40, 96, 820, 64), text: EN_BODY }],
  },

  {
    benchmarkItemId: 'syn-ar-page-0001',
    unitType: 'PAGE',
    language: 'ar',
    script: 'arabic',
    sourceType: 'born-digital-rendered',
    layoutClass: ['heading-paragraph'],
    qualityClass: 'clean',
    scriptFeatures: ['fully-vocalized', 'shadda-vowel-combination', 'superscript-alef', 'tanween', 'sukun', 'arabic-punctuation', 'arabic-indic-numerals'],
    purpose: 'formal-acceptance',
    requiredProviders: ['paddleocr'],
    parentPageId: null,
    parentRegionId: null,
    regions: [
      {
        regionId: 'syn-ar-region-0001',
        language: 'ar',
        regionType: 'heading-paragraph',
        box: BOX(40, 40, 820, 200),
        readingOrder: 0,
        lines: [
          { lineId: 'syn-ar-line-0001', index: 0, language: 'ar', box: BOX(40, 40, 820, 56), text: AR_LINE_1 },
          { lineId: 'syn-ar-line-0002', index: 1, language: 'ar', box: BOX(40, 108, 820, 56), text: AR_LINE_2 },
          { lineId: 'syn-ar-line-0003', index: 2, language: 'ar', box: BOX(40, 176, 820, 56), text: AR_LINE_3 },
        ],
      },
    ],
  },
  {
    benchmarkItemId: 'syn-ar-region-0001',
    unitType: 'REGION',
    language: 'ar',
    script: 'arabic',
    sourceType: 'born-digital-rendered',
    layoutClass: ['heading-paragraph'],
    qualityClass: 'clean',
    scriptFeatures: ['fully-vocalized', 'shadda-vowel-combination', 'superscript-alef', 'tanween', 'sukun', 'arabic-punctuation'],
    purpose: 'formal-acceptance',
    requiredProviders: ['paddleocr'],
    parentPageId: 'syn-ar-page-0001',
    parentRegionId: null,
    region: { regionId: 'syn-ar-region-0001', box: BOX(40, 40, 820, 200), readingOrder: 0 },
    lines: [
      { lineId: 'syn-ar-line-0001', index: 0, language: 'ar', box: BOX(40, 40, 820, 56), text: AR_LINE_1 },
      { lineId: 'syn-ar-line-0002', index: 1, language: 'ar', box: BOX(40, 108, 820, 56), text: AR_LINE_2 },
      { lineId: 'syn-ar-line-0003', index: 2, language: 'ar', box: BOX(40, 176, 820, 56), text: AR_LINE_3 },
    ],
  },
  {
    benchmarkItemId: 'syn-ar-line-0001',
    unitType: 'LINE',
    language: 'ar',
    script: 'arabic',
    sourceType: 'born-digital-rendered',
    layoutClass: ['isolated-line'],
    qualityClass: 'clean',
    scriptFeatures: ['fully-vocalized', 'shadda-vowel-combination', 'superscript-alef', 'sukun', 'arabic-punctuation'],
    purpose: 'formal-acceptance',
    requiredProviders: ['paddleocr'],
    parentPageId: 'syn-ar-page-0001',
    parentRegionId: 'syn-ar-region-0001',
    line: { lineId: 'syn-ar-line-0001', index: 0, box: BOX(40, 40, 820, 56) },
    lines: [{ lineId: 'syn-ar-line-0001', index: 0, language: 'ar', box: BOX(40, 40, 820, 56), text: AR_LINE_1 }],
  },

  {
    benchmarkItemId: 'syn-ur-page-0001',
    unitType: 'PAGE',
    language: 'ur',
    script: 'arabic-nastaliq',
    sourceType: 'born-digital-rendered',
    layoutClass: ['dense-textbook', 'multi-line-nastaliq-region'],
    qualityClass: 'clean',
    scriptFeatures: ['urdu-specific-letters', 'nastaliq', 'multiple-lines', 'body-text', 'punctuation', 'urdu-digits'],
    purpose: 'formal-acceptance',
    requiredProviders: ['paddleocr', 'urdu-nastaliq-trocr'],
    parentPageId: null,
    parentRegionId: null,
    regions: [
      {
        regionId: 'syn-ur-region-0001',
        language: 'ur',
        regionType: 'multi-line-nastaliq-region',
        box: BOX(40, 40, 820, 240),
        readingOrder: 0,
        singleLine: false,
        lines: [
          { lineId: 'syn-ur-line-0001', index: 0, language: 'ur', box: BOX(40, 40, 820, 72), text: UR_LINE_1 },
          { lineId: 'syn-ur-line-0002', index: 1, language: 'ur', box: BOX(40, 120, 820, 72), text: UR_LINE_2 },
          { lineId: 'syn-ur-line-0003', index: 2, language: 'ur', box: BOX(40, 200, 820, 72), text: UR_LINE_3 },
        ],
      },
      {
        regionId: 'syn-ur-region-0002',
        language: 'ur',
        regionType: 'isolated-line',
        box: BOX(40, 300, 820, 80),
        readingOrder: 1,
        singleLine: true,
        lines: [
          { lineId: 'syn-ur-line-0004', index: 0, language: 'ur', box: BOX(40, 300, 820, 80), text: UR_LINE_4 },
        ],
      },
      {
        regionId: 'syn-ur-region-0003',
        language: 'ur',
        regionType: 'isolated-line',
        box: BOX(40, 400, 820, 80),
        readingOrder: 2,
        singleLine: true,
        lines: [
          { lineId: 'syn-ur-line-0005', index: 0, language: 'ur', box: BOX(40, 400, 820, 80), text: UR_LINE_5 },
        ],
      },
    ],
  },
  {
    benchmarkItemId: 'syn-ur-region-0001',
    unitType: 'REGION',
    language: 'ur',
    script: 'arabic-nastaliq',
    sourceType: 'born-digital-rendered',
    layoutClass: ['multi-line-nastaliq-region'],
    qualityClass: 'clean',
    scriptFeatures: ['urdu-specific-letters', 'nastaliq', 'multiple-lines', 'body-text'],
    purpose: 'formal-acceptance',
    requiredProviders: ['paddleocr', 'urdu-nastaliq-trocr'],
    parentPageId: 'syn-ur-page-0001',
    parentRegionId: null,
    region: { regionId: 'syn-ur-region-0001', box: BOX(40, 40, 820, 240), readingOrder: 0 },
    lines: [
      { lineId: 'syn-ur-line-0001', index: 0, language: 'ur', box: BOX(40, 40, 820, 72), text: UR_LINE_1 },
      { lineId: 'syn-ur-line-0002', index: 1, language: 'ur', box: BOX(40, 120, 820, 72), text: UR_LINE_2 },
      { lineId: 'syn-ur-line-0003', index: 2, language: 'ur', box: BOX(40, 200, 820, 72), text: UR_LINE_3 },
    ],
  },
  ...[
    ['syn-ur-line-0001', 0, 'syn-ur-region-0001', UR_LINE_1, ['urdu-specific-letters', 'nastaliq', 'isolated-line', 'punctuation'], BOX(40, 40, 820, 72)],
    ['syn-ur-line-0002', 1, 'syn-ur-region-0001', UR_LINE_2, ['nastaliq', 'isolated-line', 'urdu-digits', 'connected-words'], BOX(40, 120, 820, 72)],
    ['syn-ur-line-0003', 2, 'syn-ur-region-0001', UR_LINE_3, ['nastaliq', 'isolated-line', 'ligature-heavy-nastaliq'], BOX(40, 200, 820, 72)],
    ['syn-ur-line-0004', 0, 'syn-ur-region-0002', UR_LINE_4, ['nastaliq', 'isolated-line', 'diagonal-baseline'], BOX(40, 300, 820, 80)],
  ].map(([lineId, index, parentRegionId, text, scriptFeatures, box]) => ({
    benchmarkItemId: lineId,
    unitType: 'LINE',
    language: 'ur',
    script: 'arabic-nastaliq',
    sourceType: 'born-digital-rendered',
    layoutClass: ['isolated-line'],
    qualityClass: 'clean',
    scriptFeatures,
    purpose: 'formal-acceptance',
    requiredProviders: ['paddleocr', 'urdu-nastaliq-trocr'],
    parentPageId: 'syn-ur-page-0001',
    parentRegionId,
    line: { lineId, index, box },
    lines: [{ lineId, index, language: 'ur', box, text }],
  })),
  {
    benchmarkItemId: 'syn-ur-line-0005',
    unitType: 'LINE',
    language: 'ur',
    script: 'arabic-nastaliq',
    sourceType: 'born-digital-rendered',
    layoutClass: ['isolated-line'],
    qualityClass: 'clean',
    scriptFeatures: ['nastaliq', 'isolated-line', 'urdu-specific-letters'],
    // Explicitly infrastructure-only: this sample exists to prove the plumbing
    // exception, and must never be used as Urdu acceptance evidence.
    purpose: 'infrastructure',
    requiredProviders: ['paddleocr'],
    parentPageId: 'syn-ur-page-0001',
    parentRegionId: 'syn-ur-region-0003',
    line: { lineId: 'syn-ur-line-0005', index: 0, box: BOX(40, 400, 820, 80) },
    lines: [{ lineId: 'syn-ur-line-0005', index: 0, language: 'ur', box: BOX(40, 400, 820, 80), text: UR_LINE_5 }],
  },

  {
    benchmarkItemId: 'syn-mixed-page-0001',
    unitType: 'PAGE',
    language: 'mixed',
    script: 'mixed',
    sourceType: 'mixed-text-image',
    layoutClass: ['mixed-direction'],
    qualityClass: 'clean',
    scriptFeatures: ['nastaliq', 'normal-prose', 'mixed-urdu-english'],
    purpose: 'formal-acceptance',
    requiredProviders: ['unlimited-ocr', 'paddleocr', 'urdu-nastaliq-trocr'],
    parentPageId: null,
    parentRegionId: null,
    regions: [
      {
        regionId: 'syn-mixed-region-0001',
        language: 'ur',
        regionType: 'multi-line-nastaliq-region',
        box: BOX(40, 40, 820, 120),
        readingOrder: 0,
        singleLine: true,
        requiredProviders: ['paddleocr', 'urdu-nastaliq-trocr'],
        lines: [
          { lineId: 'syn-mixed-line-0001', index: 0, language: 'ur', box: BOX(40, 40, 820, 96), text: UR_MIXED_LINE },
        ],
      },
      {
        regionId: 'syn-mixed-region-0002',
        language: 'en',
        regionType: 'caption',
        box: BOX(40, 200, 820, 80),
        readingOrder: 1,
        singleLine: true,
        requiredProviders: ['unlimited-ocr'],
        lines: [
          { lineId: 'syn-mixed-line-0002', index: 0, language: 'en', box: BOX(40, 200, 820, 64), text: EN_HEADING },
        ],
      },
    ],
  },
]);
