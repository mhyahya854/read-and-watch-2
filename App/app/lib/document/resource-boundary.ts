/**
 * Resource boundary for reflowable document engines.
 * Enforces local-first isolation, path containment, zip-slip defense,
 * decompression bounds, and strict CSP policies on publication content.
 */

import { DocumentError } from './errors.ts';

/**
 * Maximum permitted zip archive entries to prevent zip-bomb / memory exhaustion.
 */
export const DEFAULT_MAX_ARCHIVE_ENTRIES = 20_000;

/**
 * Maximum total decompressed size permitted from an archive (500 MB).
 */
export const DEFAULT_MAX_DECOMPRESSED_BYTES = 500 * 1024 * 1024;

/**
 * Content Security Policy string for sandboxed document rendering iframes.
 * Prohibits external network requests and completely disables script execution inside book content.
 */
export const STRICT_READER_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src blob: data:",
  "font-src blob: data:",
  "media-src blob: data:",
  "script-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "connect-src 'none'",
  "form-action 'none'",
].join('; ');

/**
 * Sanitizes and validates an archive internal entry path.
 * Defends against Zip-Slip, path traversal, drive-letter escapes, and null byte injections.
 */
export function validateArchiveEntryPath(entryPath: string): string {
  if (typeof entryPath !== 'string' || !entryPath.trim()) {
    throw DocumentError.parseFailed('Archive entry path cannot be empty');
  }

  // Reject null bytes
  if (entryPath.includes('\0')) {
    throw DocumentError.parseFailed('Archive entry path contains forbidden null byte');
  }

  // Normalize backslashes to forward slashes
  const normalized = entryPath.replace(/\\/g, '/');

  // Reject absolute paths and drive-letter prefixes
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    throw DocumentError.parseFailed(`Absolute path in archive entry rejected: ${normalized}`);
  }

  // Reject path traversal segments ('..' or empty segments that resolve to root escape)
  const segments = normalized.split('/');
  for (const segment of segments) {
    if (segment === '..') {
      throw DocumentError.parseFailed(`Directory traversal in archive entry rejected: ${normalized}`);
    }
  }

  return normalized;
}

export interface ResourceUriCheckResult {
  readonly isSafe: boolean;
  readonly isExternal: boolean;
  readonly normalizedPath?: string;
  readonly reason?: string;
}

/**
 * Validates a resource URI referenced inside publication content.
 * Distinguishes safe internal publication references from dangerous schemes (javascript:)
 * and marks external URLs for explicit external opening.
 */
export function validateResourceUri(
  uri: string,
  _basePath = ''
): ResourceUriCheckResult {
  if (!uri || typeof uri !== 'string') {
    return { isSafe: false, isExternal: false, reason: 'Empty URI' };
  }

  const trimmed = uri.trim();
  const lower = trimmed.toLowerCase();

  // Reject dangerous active content schemes
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:')
  ) {
    return {
      isSafe: false,
      isExternal: false,
      reason: 'Prohibited URI scheme',
    };
  }

  // External network resources
  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:')
  ) {
    return {
      isSafe: true,
      isExternal: true,
      normalizedPath: trimmed,
    };
  }

  // Data URLs for images are safe
  if (lower.startsWith('data:image/')) {
    return {
      isSafe: true,
      isExternal: false,
      normalizedPath: trimmed,
    };
  }

  // Reject generic data: URLs (e.g. data:text/html or data:application/javascript)
  if (lower.startsWith('data:')) {
    return {
      isSafe: false,
      isExternal: false,
      reason: 'Non-image data URI rejected for safety',
    };
  }

  // Internal relative path - ensure no traversal escape
  try {
    const cleanPath = trimmed.split('#')[0].split('?')[0];
    if (cleanPath) {
      const segments = cleanPath.split('/');
      let depth = 0;
      for (const seg of segments) {
        if (seg === '..') {
          depth--;
          if (depth < 0) {
            return {
              isSafe: false,
              isExternal: false,
              reason: 'Path traversal beyond publication root',
            };
          }
        } else if (seg && seg !== '.') {
          depth++;
        }
      }
    }
    return {
      isSafe: true,
      isExternal: false,
      normalizedPath: trimmed,
    };
  } catch {
    return {
      isSafe: false,
      isExternal: false,
      reason: 'Malformed URI',
    };
  }
}
