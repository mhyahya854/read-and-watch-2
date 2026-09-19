/**
 * Media classification for the title detail panel.
 *
 * Extracted from the component so the classification used by the real UI is the
 * thing under test, instead of a copy of the extension lists living in a test.
 */

export type MediaKind = 'image' | 'pdf' | 'publication' | 'video' | 'document' | 'other';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg']);
const PUBLICATION_EXTENSIONS = new Set(['.epub', '.mobi', '.azw', '.azw3', '.fb2', '.cbz']);
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mkv', '.mov', '.avi', '.m4v']);

export function normalizeExtension(extension: string | null | undefined): string {
  const value = (extension ?? '').trim().toLowerCase();
  if (!value) return '';
  return value.startsWith('.') ? value : `.${value}`;
}

export function classifyMediaExtension(extension: string | null | undefined): MediaKind {
  const ext = normalizeExtension(extension);
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (ext === '.pdf') return 'pdf';
  if (PUBLICATION_EXTENSIONS.has(ext)) return 'publication';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (TEXT_EXTENSIONS.has(ext)) return 'document';
  return 'other';
}

/** True when the file can be rendered directly as an image preview. */
export function canPreviewAsImage(extension: string | null | undefined): boolean {
  return classifyMediaExtension(extension) === 'image';
}

/** True when the file can be opened in the integrated reader. */
export function canOpenInReader(extension: string | null | undefined): boolean {
  const kind = classifyMediaExtension(extension);
  return kind === 'pdf' || kind === 'publication';
}

export function describeMediaExtension(extension: string | null | undefined): string {
  const ext = normalizeExtension(extension);
  const upper = ext.replace('.', '').toUpperCase();
  switch (classifyMediaExtension(ext)) {
    case 'pdf':
      return 'PDF Document';
    case 'publication':
      return 'Publication Document';
    case 'image':
      return `${upper} Image`;
    default:
      return `${upper} File`;
  }
}

export function mediaKindExplanation(extension: string | null | undefined): string {
  const kind = classifyMediaExtension(extension);
  if (kind === 'pdf') {
    return 'PDF documents are read using the integrated Reader or external viewer.';
  }
  if (kind === 'image') {
    return 'This image could not be rendered in place.';
  }
  return 'Direct visual preview is not supported for this file format.';
}

