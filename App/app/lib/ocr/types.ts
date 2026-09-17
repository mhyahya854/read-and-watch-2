/**
 * Read & Watch OCR client contract — Phase 17.
 *
 * Mirrors the structured states produced by the server-side OCR provider
 * contract. The renderer never sees engine internals: it sees availability,
 * lifecycle, provenance, and either a canonical text result or a structured
 * failure. There is no "unknown" that renders as success.
 */

export type OcrStateCode =
  | 'ENGINE_NOT_INSTALLED'
  | 'MODEL_NOT_INSTALLED'
  | 'UNSUPPORTED_HARDWARE'
  | 'UNSUPPORTED_PLATFORM'
  | 'RUNTIME_UNAVAILABLE'
  | 'UPDATE_FAILED'
  | 'OCR_FAILED'
  | 'CANCELLED'
  | 'UNAUTHORISED_LANGUAGE'
  | 'INVALID_INPUT';

export type OcrLifecycle =
  | 'not-installed'
  | 'installing'
  | 'available'
  | 'update-available'
  | 'updating'
  | 'verifying'
  | 'failed'
  | 'rollback-available';

export type OcrLanguage = 'en' | 'ar' | 'ur';

export interface OcrRuntimeRequirements {
  python: string;
  accelerator: string;
  acceleratorVendor: string;
  cpuSupported: boolean;
  notes: string;
}

export interface OcrProviderStatus {
  ok: boolean;
  lifecycle: OcrLifecycle;
  code?: OcrStateCode;
  message?: string;
  activeRevision: string | null;
  previousRevision?: string | null;
  activatedAt?: string;
}

export interface OcrUpdateStatus {
  providerId: string;
  activeRevision: string | null;
  previousRevision: string | null;
  activatedAt: string | null;
  provenance: Record<string, unknown> | null;
  lastFailure: { message?: string; phase?: string; revision?: string } | null;
  revisionsOnDisk: string[];
  canRollback: boolean;
}

export interface OcrProviderDescription {
  id: string;
  displayName: string;
  languages: OcrLanguage[];
  officialUpstream: string;
  officialUpstreamUrl: string;
  userFork: string;
  userForkUrl: string;
  codeLicense: string;
  modelSource: string;
  runtimeRequirements: OcrRuntimeRequirements;
  availability: OcrProviderStatus;
  updateStatus: OcrUpdateStatus;
}

export interface OcrLanguageRoute {
  language: OcrLanguage;
  providerId: string;
  providerDisplayName: string;
  model: { detection: string; recognition: string } | null;
  available: boolean;
  /**
   * Every engine that MUST run for this language. Urdu has two: PP-OCRv5 and the
   * dedicated Nastaliq specialist. `NOT_INTEGRATED` means the engine is declared
   * and its provenance is verified but this build has no execution path yet.
   */
  requiredProviders?: OcrRequiredProvider[];
}

export interface OcrRequiredProvider {
  providerId: string;
  displayName: string;
  integrationStatus: 'INTEGRATED' | 'NOT_INTEGRATED';
}

export interface OcrProviderInventory {
  providers: OcrProviderDescription[];
  routing: OcrLanguageRoute[];
}

export interface OcrUpdateCheck {
  providerId: string;
  status: 'not-installed' | 'up-to-date' | 'update-available';
  installedRevision: string | null;
  availableRevision: string;
  provenance: Record<string, unknown> | null;
}

export interface OcrTextBlock {
  text: string;
  confidence: number | null;
  box: { x: number; y: number; width: number; height: number } | null;
}

export interface OcrPageResult {
  ok: true;
  action: 'OCR' | 'NATIVE_TEXT';
  provider?: string;
  providerVersion?: string | null;
  modelRevision?: string | null;
  language: OcrLanguage;
  pageIndex: number;
  sourceHash: string | null;
  rawText?: string;
  displayText: string | null;
  searchText?: string;
  blocks?: OcrTextBlock[];
  confidence?: number | null;
  confidenceSource?: 'engine' | 'not-supplied';
  cached?: boolean;
  ocrInvoked: boolean;
}

export interface OcrFailure {
  ok: false;
  code: OcrStateCode;
  message: string;
  providerId: string | null;
  language?: OcrLanguage;
  pageIndex?: number;
}

/** UI status label. Never invents progress; only mirrors a real lifecycle. */
export function describeLifecycle(status: OcrProviderStatus): string {
  switch (status.lifecycle) {
    case 'not-installed':
      return 'Not installed';
    case 'installing':
      return 'Installing';
    case 'available':
      return 'Active';
    case 'update-available':
      return 'Update available';
    case 'updating':
      return 'Updating';
    case 'verifying':
      return 'Verifying staged revision';
    case 'failed':
      return 'Last operation failed';
    case 'rollback-available':
      return 'Active (rollback available)';
    default:
      return 'Unavailable';
  }
}
