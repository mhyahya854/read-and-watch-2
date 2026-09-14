/**
 * Read & Watch Study Extension Hooks.
 * Phase 11 — Selection Actions, Dictionary & Translation Hooks.
 *
 * Privacy & Offline Boundary:
 *   - By default, NO external or cloud providers are configured.
 *   - The entire core reader and study workflow operates 100% offline.
 *   - Hooks provide typed contracts for optional extensions.
 *   - When no provider is active, the UI displays a calm, informative offline state.
 */

export interface DictionaryLookupRequest {
  readonly word: string;
  readonly language?: string;
  readonly contextSentence?: string;
}

export interface DictionaryDefinition {
  readonly word: string;
  readonly phonetic?: string;
  readonly partOfSpeech?: string;
  readonly definition: string;
  readonly example?: string;
}

export interface DictionaryLookupResult {
  readonly word: string;
  readonly definitions: ReadonlyArray<DictionaryDefinition>;
  readonly source: string;
}

export interface DictionaryProvider {
  readonly id: string;
  readonly name: string;
  lookup(
    request: DictionaryLookupRequest,
    signal?: AbortSignal,
  ): Promise<DictionaryLookupResult | null>;
}

export interface TranslationRequest {
  readonly text: string;
  readonly sourceLanguage?: string;
  readonly targetLanguage: string;
}

export interface TranslationResult {
  readonly originalText: string;
  readonly translatedText: string;
  readonly sourceLanguage?: string;
  readonly targetLanguage: string;
  readonly provider: string;
}

export interface TranslationProvider {
  readonly id: string;
  readonly name: string;
  translate(
    request: TranslationRequest,
    signal?: AbortSignal,
  ): Promise<TranslationResult | null>;
}

// In-memory module-level registry
let activeDictionaryProvider: DictionaryProvider | null = null;
let activeTranslationProvider: TranslationProvider | null = null;

export const studyExtensions = {
  getDictionaryProvider(): DictionaryProvider | null {
    return activeDictionaryProvider;
  },
  setDictionaryProvider(provider: DictionaryProvider | null): void {
    activeDictionaryProvider = provider;
  },
  getTranslationProvider(): TranslationProvider | null {
    return activeTranslationProvider;
  },
  setTranslationProvider(provider: TranslationProvider | null): void {
    activeTranslationProvider = provider;
  },
  isDictionaryConfigured(): boolean {
    return activeDictionaryProvider !== null;
  },
  isTranslationConfigured(): boolean {
    return activeTranslationProvider !== null;
  },
};
