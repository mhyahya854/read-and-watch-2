/**
 * Read & Watch Search Query Normalization & Safe Tokenizer (ESM).
 *
 * Phase 11 — Search, Annotation Browser, and Study Workflow.
 */

export const MAX_QUERY_LENGTH = 200;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export const MATCH_OPEN_TAG = '[[MATCH]]';
export const MATCH_CLOSE_TAG = '[[/MATCH]]';

// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Normalizes user search input: trims, strips control characters,
 * collapses redundant whitespace, and clamps to MAX_QUERY_LENGTH.
 */
export function normalizeQuery(raw) {
  if (typeof raw !== 'string') return '';
  // Strip control characters except newline/tab
  const cleaned = raw.replace(CONTROL_CHARS_RE, '');
  const collapsed = cleaned.replace(/\s+/g, ' ').trim();
  return collapsed.slice(0, MAX_QUERY_LENGTH);
}

/**
 * Escapes a single token for SQLite FTS5 MATCH expression.
 * In FTS5, enclosing a string in double quotes treats it as a phrase/literal.
 * Internal double quotes are escaped by doubling them ("").
 */
export function escapeFtsToken(token) {
  const sanitized = token.replace(/"/g, '""');
  return `"${sanitized}"`;
}

/**
 * Converts normalized user input into a safe SQLite FTS5 query string.
 * Splits on whitespace, strips punctuation-only junk, and quotes each term.
 * If the user types wildcards or FTS operators, they are safely escaped as literals.
 * Appends prefix matching (*) only to the last word if it's alphanumeric, for autocomplete feel.
 */
export function buildFtsQuery(raw) {
  const normalized = normalizeQuery(raw);
  if (!normalized) return '';

  // Split into tokens on whitespace
  const rawTokens = normalized.split(' ').filter(Boolean);
  const safeTokens = [];

  for (let i = 0; i < rawTokens.length; i++) {
    const term = rawTokens[i];
    // Remove characters that might break FTS syntax outside quotes
    const cleaned = term.replace(/[(){}[\]:^~*?"']/g, '').trim();
    if (!cleaned) continue;

    const isLast = i === rawTokens.length - 1;
    // For the last token, if it has at least 2 alphanumeric chars, support prefix matching
    if (isLast && cleaned.length >= 2 && /^[\p{L}\p{N}]+$/u.test(cleaned)) {
      safeTokens.push(`"${cleaned.replace(/"/g, '""')}"*`);
    } else {
      safeTokens.push(`"${cleaned.replace(/"/g, '""')}"`);
    }
  }

  return safeTokens.join(' ');
}

/**
 * Parses snippet text containing controlled marker tokens into safe structured tokens.
 */
export function parseSnippetTokens(
  snippetText,
  openTag = MATCH_OPEN_TAG,
  closeTag = MATCH_CLOSE_TAG,
) {
  if (!snippetText) return [];

  const tokens = [];
  let remaining = snippetText;

  while (remaining.length > 0) {
    const openIdx = remaining.indexOf(openTag);
    if (openIdx === -1) {
      tokens.push({ text: remaining, match: false });
      break;
    }

    if (openIdx > 0) {
      tokens.push({ text: remaining.slice(0, openIdx), match: false });
    }

    const afterOpen = remaining.slice(openIdx + openTag.length);
    const closeIdx = afterOpen.indexOf(closeTag);
    if (closeIdx === -1) {
      tokens.push({ text: afterOpen, match: true });
      break;
    }

    const matchedText = afterOpen.slice(0, closeIdx);
    if (matchedText.length > 0) {
      tokens.push({ text: matchedText, match: true });
    }
    remaining = afterOpen.slice(closeIdx + closeTag.length);
  }

  return tokens;
}
