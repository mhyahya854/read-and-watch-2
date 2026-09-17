/**
 * OCR benchmark foundation — public surface (Phase 17, P17-T002).
 *
 * This barrel exists so importers do not reach into benchmark internals. It
 * exposes schema/validation, Unicode comparison rules, scoring, run records, the
 * private corpus store, and the lawful synthetic-corpus renderer.
 */

export {
  BENCHMARK_MANIFEST_VERSION,
  EXECUTION_STATES,
  FUTURE_VERIFICATION_STATES,
  GROUND_TRUTH_STATES,
  LANGUAGES,
  LAYOUT_CLASSES,
  QUALITY_CLASSES,
  SAMPLE_PURPOSES,
  SCORING_MODES,
  SCRIPT_FEATURES,
  SOURCE_TYPES,
  SCRIPTS,
  UNIT_TYPES,
  BenchmarkProtocolError,
  canonicalJson,
  expectedScoringModesFor,
  findForbiddenSemantics,
  isSha256,
  mandatoryProvidersForLanguage,
  manifestHash,
  sha256Hex,
  validateBenchmarkItem,
  validateManifest,
} from './schema.mjs';

export {
  ARABIC_REPRESENTATIVE_CODE_POINTS,
  URDU_REPRESENTATIVE_CODE_POINTS,
  URDU_SPECIFIC_CODE_POINTS,
  canonicalComparisonKey,
  comparisonText,
  huroofKey,
  markCount,
  tashkeelClusters,
  tashkeelKey,
  urduCharacterAnalysis,
  urduComparisonKey,
} from './unicode.mjs';

export {
  MAX_DISAGREEMENT_LOCATIONS,
  assertFinalGroundTruth,
  characterErrorRate,
  compareProviders,
  editDistance,
  exactTextMatch,
  linePreservationReport,
  scoreArabic,
  scoreArabicTashkeel,
  scoreSample,
  scoreText,
  scoreUrdu,
  summarizeByScriptFeature,
  summarizeProviderScores,
  truthLinesForItem,
  wordErrorRate,
} from './scoring.mjs';

export {
  REVIEW_STATES,
  RUN_STATUSES,
  createGroupRunRecord,
  createProviderRunRecord,
  evaluateRunState,
  validateGroupRunRecord,
  validateRunRecord,
} from './run-record.mjs';

export {
  createManifest,
  groundTruthHashForText,
  loadManifestFromFile,
  verifyManifestIntegrity,
} from './manifest.mjs';

export {
  CORPUS_CATEGORIES,
  RUN_CATEGORIES,
  assertPrivateCorpusOutsideRepository,
  benchmarkDirectories,
  createBenchmarkCorpusStore,
  resolveBenchmarkRoot,
} from './corpus-store.mjs';

export {
  REQUIRED_COVERAGE,
  assertFontCoversCodePoints,
  buildFixtureHtml,
  findBrowserPath,
  fixtureGeometry,
  fontCovers,
  readFontCoverage,
  renderPlanFor,
  screenshotFixture,
} from './render.mjs';

export {
  buildSyntheticCorpus,
} from './synthetic-corpus.mjs';
