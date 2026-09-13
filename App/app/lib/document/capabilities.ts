/**
 * Read & Watch Document Capability Vocabulary.
 * Allows UI and study features to query "What can this document do?"
 * instead of checking "Is this a PDF?" or "Is this an EPUB?".
 */

export type DocumentCapability =
  | 'toc'
  | 'textSearch'
  | 'textSelection'
  | 'textAnchors'
  | 'pageNavigation'
  | 'semanticLocationNavigation'
  | 'pagination'
  | 'continuousLayout'
  | 'zoom'
  | 'fontControls'
  | 'themeControls'
  | 'spreadLayout'
  | 'bookmarks'
  | 'textExtraction';

export type DocumentCapabilities = ReadonlySet<DocumentCapability>;

export function createCapabilities(
  caps: Iterable<DocumentCapability>
): DocumentCapabilities {
  return new Set<DocumentCapability>(caps);
}

export function hasCapability(
  capabilities: DocumentCapabilities,
  capability: DocumentCapability
): boolean {
  return capabilities.has(capability);
}

/** Standard baseline capability set typical of fixed-layout document engines (e.g. PDF.js) */
export const STANDARD_PDF_CAPABILITIES: DocumentCapabilities = createCapabilities([
  'toc',
  'textSearch',
  'textSelection',
  'textAnchors',
  'pageNavigation',
  'pagination',
  'zoom',
  'spreadLayout',
  'bookmarks',
  'textExtraction',
]);

/** Standard baseline capability set typical of reflowable document engines (e.g. Foliate-JS) */
export const STANDARD_REFLOWABLE_CAPABILITIES: DocumentCapabilities = createCapabilities([
  'toc',
  'textSearch',
  'textSelection',
  'textAnchors',
  'semanticLocationNavigation',
  'continuousLayout',
  'fontControls',
  'themeControls',
  'bookmarks',
  'textExtraction',
]);
