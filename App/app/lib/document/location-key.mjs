/**
 * Canonical reader-location key.
 *
 * Plain JavaScript (with a .d.mts declaration) so the Vite/Electron server and
 * the React client compare locations with the SAME semantics. Comparing
 * JSON.stringify output was brittle: key order or harmless metadata differences
 * would make two semantically equal locations look different, which made
 * page/location Knowledge Canvases invisible to the reader.
 *
 * Semantics mirror `areDocumentLocationsEqual` in lib/document/location.ts.
 */

function pageKey(location) {
  const page = location.payload?.pageNumber;
  return typeof page === 'number' ? `page:${page}` : null;
}

function semanticKey(location) {
  const payload = location.payload || {};
  if (typeof payload.cfi === 'string' && payload.cfi) {
    return `cfi:${payload.cfi}`;
  }
  if (typeof payload.sectionId === 'string' && payload.sectionId) {
    if (typeof payload.progression === 'number') {
      return `section:${payload.sectionId}:${payload.progression.toFixed(3)}`;
    }
    return `section:${payload.sectionId}`;
  }
  if (typeof payload.spineIndex === 'number') {
    if (typeof payload.progression === 'number') {
      return `spine:${payload.spineIndex}:${payload.progression.toFixed(3)}`;
    }
    return `spine:${payload.spineIndex}`;
  }
  if (typeof payload.progression === 'number') {
    return `progression:${payload.progression.toFixed(3)}`;
  }
  return null;
}

function progressionKey(location) {
  const fraction = location.payload?.fraction;
  return typeof fraction === 'number' ? `fraction:${fraction.toFixed(3)}` : null;
}

/**
 * Stable string key for a canonical DocumentLocation, or null when the value is
 * not a usable location.
 */
export function canonicalLocationKey(location) {
  if (!location || typeof location !== 'object') return null;
  const kind = location.kind;
  const source = typeof location.sourceHash === 'string' ? location.sourceHash : '';
  let inner = null;
  if (kind === 'page') inner = pageKey(location);
  else if (kind === 'semantic') inner = semanticKey(location);
  else if (kind === 'progression') inner = progressionKey(location);
  if (!inner) return null;
  return `${source}|${kind}|${inner}`;
}

/** True when two locations are the same source position. */
export function locationsEqual(a, b) {
  const keyA = canonicalLocationKey(a);
  if (!keyA) return a === b;
  return keyA === canonicalLocationKey(b);
}

/**
 * Canonical location shape check: a usable location carries a schema version, a
 * known kind, a source hash and a payload with real position information.
 */
export function isValidLocation(location) {
  if (!location || typeof location !== 'object') return false;
  if (typeof location.sourceHash !== 'string' || !location.sourceHash.trim()) return false;
  if (location.kind !== 'page' && location.kind !== 'semantic' && location.kind !== 'progression') {
    return false;
  }
  return canonicalLocationKey(location) !== null;
}

/** Human label for a location: honest about page vs reflowable position. */
export function describeLocation(location) {
  if (!location || typeof location !== 'object') return 'Location';
  if (location.kind === 'page') {
    const page = location.payload?.pageNumber;
    return typeof page === 'number' ? `Page ${page}` : 'Page';
  }
  if (location.kind === 'semantic') {
    const payload = location.payload || {};
    if (typeof payload.title === 'string' && payload.title.trim()) {
      return payload.title.trim().slice(0, 80);
    }
    if (typeof payload.sectionId === 'string' && payload.sectionId) {
      return `Section ${payload.sectionId}`;
    }
    if (typeof payload.spineIndex === 'number') {
      return `Section ${payload.spineIndex + 1}`;
    }
    if (typeof payload.progression === 'number') {
      return `Location ${Math.round(payload.progression * 100)}%`;
    }
    return 'Location';
  }
  if (location.kind === 'progression') {
    const fraction = location.payload?.fraction;
    return typeof fraction === 'number'
      ? `Location ${Math.round(fraction * 100)}%`
      : 'Location';
  }
  return 'Location';
}
