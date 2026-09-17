/**
 * Lawful synthetic fixture rendering — Phase 17, task P17-T002.
 *
 * Two guarantees this module exists to provide:
 *
 *   1. Read & Watch never rasterises Arabic-script benchmark text with a font
 *      that lacks the required glyphs. Font coverage is read out of the font's
 *      own `cmap` table and checked against the fixture's code points BEFORE any
 *      image is produced.
 *   2. Rendering uses a real shaping engine (a Chromium-family headless browser)
 *      so Urdu Nastaliq ligatures, harakat positioning, and RTL order are the
 *      real thing, not an unshaped approximation. Pillow without libraqm, and
 *      any other non-shaping rasteriser, are deliberately NOT used.
 *
 * Rendered bytes are written only to the private external benchmark root.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { BenchmarkProtocolError } from './schema.mjs';
import { ARABIC_REPRESENTATIVE_CODE_POINTS, URDU_REPRESENTATIVE_CODE_POINTS } from './unicode.mjs';

/** Code points a language's font must cover for the fixture to be lawful. */
export const REQUIRED_COVERAGE = Object.freeze({
  ur: Object.freeze([...URDU_REPRESENTATIVE_CODE_POINTS]),
  ar: Object.freeze([...ARABIC_REPRESENTATIVE_CODE_POINTS]),
  en: Object.freeze(Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,;:?!()-')),
});

/** Per-language drawing defaults. Nastaliq needs generous vertical space. */
export const LANGUAGE_TYPOGRAPHY = Object.freeze({
  ur: Object.freeze({ fontSize: 40, lineHeight: 1.9, direction: 'rtl' }),
  ar: Object.freeze({ fontSize: 38, lineHeight: 1.7, direction: 'rtl' }),
  en: Object.freeze({ fontSize: 30, lineHeight: 1.5, direction: 'ltr' }),
});

const LANGUAGE_KEY_BY_SAMPLE_LANGUAGE = Object.freeze({ en: 'en', ar: 'ar', ur: 'ur' });

function readUint16(buffer, offset) {
  return buffer.readUInt16BE(offset);
}

function readUint32(buffer, offset) {
  return buffer.readUInt32BE(offset);
}

/**
 * Reads glyph coverage out of a TrueType/OpenType `cmap` table.
 *
 * BMP subtables are expanded to an exact code-point set (at most 65,536 entries).
 * Format 12 subtables are kept as ranges so a supplementary-plane font cannot
 * blow up memory.
 */
export function readFontCoverage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    throw new BenchmarkProtocolError('FONT_UNREADABLE', 'font buffer is too small to be a font');
  }
  const numTables = readUint16(buffer, 4);
  let cmapOffset = null;
  for (let index = 0; index < numTables; index += 1) {
    const record = 12 + index * 16;
    if (record + 16 > buffer.length) break;
    const tag = buffer.toString('latin1', record, record + 4);
    if (tag === 'cmap') {
      cmapOffset = readUint32(buffer, record + 8);
      break;
    }
  }
  if (cmapOffset === null) {
    throw new BenchmarkProtocolError('FONT_HAS_NO_CMAP', 'font has no cmap table; glyph coverage is unprovable');
  }

  const subtableCount = readUint16(buffer, cmapOffset + 2);
  const subtables = [];
  for (let index = 0; index < subtableCount; index += 1) {
    const record = cmapOffset + 4 + index * 8;
    subtables.push({
      platformId: readUint16(buffer, record),
      encodingId: readUint16(buffer, record + 2),
      offset: cmapOffset + readUint32(buffer, record + 4),
    });
  }
  if (subtables.length === 0) {
    throw new BenchmarkProtocolError('FONT_HAS_NO_CMAP', 'font cmap table declares no subtables');
  }

  const codePoints = new Set();
  const ranges = [];
  const seenFormats = new Set();

  for (const subtable of subtables) {
    const format = readUint16(buffer, subtable.offset);
    seenFormats.add(format);
    if (format === 12) {
      const groupCount = readUint32(buffer, subtable.offset + 12);
      for (let group = 0; group < groupCount; group += 1) {
        const start = readUint32(buffer, subtable.offset + 16 + group * 12);
        const end = readUint32(buffer, subtable.offset + 20 + group * 12);
        const startGlyph = readUint32(buffer, subtable.offset + 24 + group * 12);
        if (startGlyph !== 0 && end >= start) ranges.push([start, end]);
      }
      continue;
    }
    if (format === 4) {
      const segCount = readUint16(buffer, subtable.offset + 6) / 2;
      const endCodes = subtable.offset + 14;
      const startCodes = endCodes + segCount * 2 + 2;
      const idDeltas = startCodes + segCount * 2;
      const idRangeOffsets = idDeltas + segCount * 2;
      for (let segment = 0; segment < segCount; segment += 1) {
        const end = readUint16(buffer, endCodes + segment * 2);
        const start = readUint16(buffer, startCodes + segment * 2);
        const delta = readUint16(buffer, idDeltas + segment * 2);
        const rangeOffset = readUint16(buffer, idRangeOffsets + segment * 2);
        for (let code = start; code <= end && code !== 0xffff; code += 1) {
          let glyph;
          if (rangeOffset === 0) {
            glyph = (code + delta) & 0xffff;
          } else {
            const glyphOffset = idRangeOffsets + segment * 2 + rangeOffset + (code - start) * 2;
            if (glyphOffset + 2 > buffer.length) continue;
            glyph = readUint16(buffer, glyphOffset);
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0) codePoints.add(code);
        }
      }
      continue;
    }
    if (format === 0) {
      for (let code = 0; code < 256; code += 1) {
        if (buffer[subtable.offset + 6 + code] !== 0) codePoints.add(code);
      }
      continue;
    }
    if (format === 6) {
      const first = readUint16(buffer, subtable.offset + 6);
      const count = readUint16(buffer, subtable.offset + 8);
      for (let index = 0; index < count; index += 1) {
        if (readUint16(buffer, subtable.offset + 10 + index * 2) !== 0) codePoints.add(first + index);
      }
    }
  }

  if (codePoints.size === 0 && ranges.length === 0) {
    throw new BenchmarkProtocolError(
      'FONT_HAS_NO_CMAP',
      `no usable cmap subtable (formats seen: ${[...seenFormats].join(', ')})`,
    );
  }
  return { codePoints, ranges, formats: [...seenFormats] };
}

export function fontCovers(coverage, codePoint) {
  if (coverage.codePoints.has(codePoint)) return true;
  return coverage.ranges.some(([start, end]) => codePoint >= start && codePoint <= end);
}

/**
 * Verifies a font covers every code point a fixture needs. Throws instead of
 * producing an image with missing-glyph boxes.
 */
export function assertFontCoversCodePoints({ coverage, codePoints, fontLabel }) {
  const missing = [];
  for (const character of codePoints) {
    const codePoint = typeof character === 'number' ? character : character.codePointAt(0);
    if (!fontCovers(coverage, codePoint)) {
      missing.push(`U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`);
    }
  }
  if (missing.length > 0) {
    throw new BenchmarkProtocolError(
      'FONT_MISSING_GLYPHS',
      `${fontLabel} does not cover: ${missing.join(' ')}`,
      { fontLabel, missing },
    );
  }
  return { ok: true, checked: codePoints.length };
}

/** Lines to draw for one definition: [{text, language, direction}] in order. */
export function renderPlanFor(definition) {
  const lines =
    definition.unitType === 'PAGE'
      ? definition.regions.flatMap((region) => region.lines)
      : definition.lines;
  return lines.map((line) => {
    const language = line.language ?? definition.language;
    const fontKey = LANGUAGE_KEY_BY_SAMPLE_LANGUAGE[language] ?? 'en';
    const typography = LANGUAGE_TYPOGRAPHY[fontKey];
    return {
      text: line.text,
      language,
      fontKey,
      direction: typography.direction,
      fontSize: typography.fontSize,
      lineHeight: typography.lineHeight,
    };
  });
}

export function fixtureGeometry(plan, { padding = 32, width = 900 } = {}) {
  const height = plan.reduce((total, line) => total + Math.round(line.fontSize * line.lineHeight), 0);
  return { width, height: Math.max(120, height + padding * 2) };
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Builds the fixture HTML. Fonts are embedded as data URIs so the page is
 * self-contained, deterministic, and never depends on a system font being
 * installed.
 */
export function buildFixtureHtml({ plan, geometry, fonts }) {
  const faces = fonts
    .map(
      (font, index) =>
        `@font-face { font-family: 'FixtureFont${index}'; src: url(data:font/ttf;base64,${font.base64}) format('truetype'); }`,
    )
    .join('\n');
  const indexByKey = new Map(fonts.map((font, index) => [font.key, index]));
  const body = plan
    .map(
      (line) => {
        const fontIndex = indexByKey.get(line.fontKey) ?? 0;
        return `<div class="line" style="font-family:'FixtureFont${fontIndex}';font-size:${line.fontSize}px;line-height:${line.lineHeight};direction:${line.direction};text-align:${line.direction === 'rtl' ? 'right' : 'left'}">${escapeHtml(line.text)}</div>`;
      },
    )
    .join('\n');
  return `<!doctype html>
<html lang="und"><head><meta charset="utf-8"><style>
${faces}
html, body { margin: 0; padding: 0; background: #ffffff; }
body { width: ${geometry.width}px; height: ${geometry.height}px; display: flex; flex-direction: column; justify-content: center; }
.line { white-space: pre; padding: 0 24px; color: #000000; }
</style></head><body>
${body}
</body></html>`;
}

const DEFAULT_BROWSER_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

/** Finds a shaping-capable browser. Returns null when none is installed. */
export function findBrowserPath({ candidates = DEFAULT_BROWSER_CANDIDATES, environment = process.env } = {}) {
  const configured = environment.READ_WATCH_BENCHMARK_BROWSER;
  if (configured && existsSync(configured)) return configured;
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/**
 * Browser build version, read from the Chromium profile's `Last Version` file so
 * that asking for a version never launches a second browser process.
 */
export function browserVersion(profileDir) {
  const marker = join(profileDir, 'Last Version');
  if (!existsSync(marker)) return 'not-reported';
  const value = readFileSync(marker, 'utf8').trim();
  return value.length > 0 ? value : 'not-reported';
}

/**
 * Flags shared by every fixture render.
 *
 * The benchmark renders LOCAL text only, so networking is disabled outright:
 * DNS is refused for everything except localhost and background networking,
 * component updates, sync, pings, and domain reliability are switched off. A
 * render can therefore not phone home, and the only process ever started is a
 * short-lived headless renderer with its own throwaway profile directory.
 */
export const OFFLINE_RENDER_FLAGS = Object.freeze([
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-default-apps',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-domain-reliability',
  '--disable-client-side-phishing-detection',
  '--disable-sync',
  '--no-pings',
  '--metrics-recording-only',
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost',
]);

/**
 * Rasterises one HTML fixture with a real shaping engine.
 *
 * @param {{htmlPath: string, outPath: string, browserPath: string, geometry: {width: number, height: number}, profileDir: string, timeoutMs?: number}} input
 */
export function screenshotFixture({
  htmlPath,
  outPath,
  browserPath,
  geometry,
  profileDir,
  timeoutMs = 120000,
}) {
  const result = spawnSync(
    browserPath,
    [
      ...OFFLINE_RENDER_FLAGS,
      '--force-device-scale-factor=2',
      `--user-data-dir=${profileDir}`,
      `--window-size=${geometry.width},${geometry.height}`,
      `--screenshot=${outPath}`,
      pathToFileURL(htmlPath).href,
    ],
    { encoding: 'utf8', timeout: timeoutMs },
  );
  if (!existsSync(outPath)) {
    throw new BenchmarkProtocolError(
      'RENDER_FAILED',
      `headless browser produced no screenshot (exit ${result.status}): ${(result.stderr || '').slice(0, 400)}`,
      { status: result.status },
    );
  }
  const bytes = readFileSync(outPath);
  if (bytes.length === 0) {
    throw new BenchmarkProtocolError('RENDER_FAILED', 'headless browser produced an empty image');
  }
  return { bytes, browserVersion: browserVersion(profileDir) };
}
