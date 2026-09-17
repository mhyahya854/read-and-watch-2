/**
 * Synthetic fixtures only — no real library titles, paths or hashes.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  FIELD_ERROR_CODES,
  PORTABLE_SCHEMA_VERSION,
  READ_STATUSES,
  WATCH_STATUSES,
  buildIdentityPatch,
  parseTitleMarkdown,
  parseYamlSubset,
  readIdentity,
  resolveTitleAsset,
  splitFrontmatter,
} from '../server/portable-metadata.mjs';

const READ_DOC = `---
title: "Synthetic Book"
authors:
  - "Synthetic Author"
year: 2001
status: "to_read"
tags:
  - "synthetic"
recommendations:
  - source: "TikTok"
    recommended_by: "Social Media"
    date: "February 27, 2022 9:13 AM (GMT+3)"
    evidence: "shared-evidence.jpg"
x_custom_flag: "preserved"
last_metadata_update: "2026-09-17"
---

# Synthetic Book

## Overview

Body prose that must survive verbatim.

## Unknown Section

Custom content.
`;

const WATCH_DOC = `---
title: "Synthetic Movie"
type: "movie"
year: 1999
status: "planned"
notion_entry_image: "Entry Image.webp"
---

# Synthetic Movie (1999)
`;

function codes(result) {
  return result.diagnostics.map((item) => item.code).sort();
}

test('a valid Read title parses with no diagnostics', () => {
  const result = parseTitleMarkdown(READ_DOC, {
    relativePath: 'Read/Books/Synthetic Book (2001)/Synthetic Book (2001).md',
    collection: 'Read',
  });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.ok, true);
  assert.equal(result.data.title, 'Synthetic Book');
  assert.equal(result.data.year, 2001);
  assert.deepEqual(result.data.authors, ['Synthetic Author']);
  assert.deepEqual(result.data.tags, ['synthetic']);
  assert.equal(result.data.recommendations[0].source, 'TikTok');
});

test('a valid Watch title parses against the Watch status vocabulary', () => {
  const result = parseTitleMarkdown(WATCH_DOC, {
    relativePath: 'Watch/Movies/Synthetic Movie (1999)/Synthetic Movie (1999).md',
    collection: 'Watch',
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(WATCH_STATUSES.includes(result.data.status));
  assert.ok(READ_STATUSES.includes('reference'));
});

test('missing optional fields are allowed', () => {
  const result = parseTitleMarkdown('---\ntitle: "Only A Title"\n---\n\nbody\n', {
    relativePath: 'Read/Books/Only/Only.md',
    collection: 'Read',
  });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.data.favorite, undefined);
  assert.equal(result.data.personal_rating, undefined);
});

test('a missing personal value never becomes false or zero', () => {
  const result = parseTitleMarkdown(READ_DOC, {
    relativePath: 'Read/Books/Synthetic Book (2001)/Synthetic Book (2001).md',
    collection: 'Read',
  });
  assert.equal(Object.hasOwn(result.data, 'favorite'), false);
  assert.equal(Object.hasOwn(result.data, 'personal_rating'), false);
});

test('unknown YAML keys and unknown sections are preserved', () => {
  const result = parseTitleMarkdown(READ_DOC, {
    relativePath: 'Read/Books/Synthetic Book (2001)/Synthetic Book (2001).md',
    collection: 'Read',
  });
  assert.deepEqual(result.unknownKeys, { x_custom_flag: 'preserved' });
  assert.match(result.body, /Unknown Section/);
  assert.match(result.body, /Body prose that must survive verbatim\./);
});

test('the body survives a round trip byte-for-byte', () => {
  const split = splitFrontmatter(READ_DOC);
  const result = parseTitleMarkdown(READ_DOC, { relativePath: 'x.md' });
  const reassembled = READ_DOC.slice(
    READ_DOC.indexOf(split.body),
  );
  assert.equal(result.body, reassembled);
});

test('duplicate YAML keys are reported with a line number', () => {
  const text = '---\ntitle: "A"\ntitle: "B"\n---\n\nbody\n';
  const result = parseTitleMarkdown(text, { relativePath: 'dup.md', collection: 'Read' });
  const duplicate = result.diagnostics.find(
    (item) => item.code === FIELD_ERROR_CODES.DUPLICATE_YAML_KEY,
  );
  assert.ok(duplicate);
  assert.equal(duplicate.key, 'title');
  assert.equal(duplicate.line, 3);
});

test('a file with no frontmatter is reported, not thrown', () => {
  const result = parseTitleMarkdown('# just prose\n', { relativePath: 'none.md' });
  assert.equal(result.ok, false);
  assert.deepEqual(codes(result), [FIELD_ERROR_CODES.NO_FRONTMATTER]);
});

test('unparseable frontmatter yields INVALID_YAML while keeping other fields', () => {
  const text = '---\ntitle: "A"\nthis line has no colon\nkind: "movie"\n---\n\nbody\n';
  const result = parseTitleMarkdown(text, { relativePath: 'bad.md', collection: 'Watch' });
  assert.ok(codes(result).includes(FIELD_ERROR_CODES.INVALID_YAML));
  assert.equal(result.data.title, 'A');
  assert.equal(result.data.kind, 'movie');
});

test('a missing title is a required-field error', () => {
  const result = parseTitleMarkdown('---\nyear: 1999\n---\n\nbody\n', {
    relativePath: 'notitle.md',
    collection: 'Watch',
  });
  assert.ok(codes(result).includes(FIELD_ERROR_CODES.REQUIRED_FIELD_MISSING));
});

test('an unsupported collection is reported', () => {
  const result = parseTitleMarkdown('---\ntitle: "A"\ncollection: "Listen"\n---\n\nb\n', {
    relativePath: 'c.md',
  });
  assert.ok(codes(result).includes(FIELD_ERROR_CODES.INVALID_ENUM));
});

test('a malformed stable id is reported', () => {
  const result = parseTitleMarkdown('---\ntitle: "A"\nid: "nope"\n---\n\nb\n', {
    relativePath: 'id.md',
    collection: 'Read',
  });
  assert.ok(codes(result).includes(FIELD_ERROR_CODES.INVALID_STABLE_ID));
});

test('a stable id whose prefix contradicts the collection is reported', () => {
  const result = parseTitleMarkdown('---\ntitle: "A"\nid: "watch-0123456789abcdef"\n---\n\nb\n', {
    relativePath: 'id.md',
    collection: 'Read',
  });
  assert.ok(codes(result).includes(FIELD_ERROR_CODES.INVALID_STABLE_ID));
});

test('a future schema version is a warning, not a hard failure', () => {
  const result = parseTitleMarkdown('---\ntitle: "A"\nschema_version: 99\n---\n\nb\n', {
    relativePath: 'future.md',
    collection: 'Read',
  });
  const item = result.diagnostics.find(
    (entry) => entry.code === FIELD_ERROR_CODES.UNSUPPORTED_SCHEMA_VERSION,
  );
  assert.equal(item.severity, 'warning');
  assert.equal(result.data.title, 'A');
});

test('an invalid rating is isolated and does not invalidate other fields', () => {
  const text = '---\ntitle: "A"\npersonal_rating: excellent\nyear: 2001\n---\n\nbody\n';
  const result = parseTitleMarkdown(text, { relativePath: 'r.md', collection: 'Read' });
  const item = result.diagnostics.find(
    (entry) => entry.code === FIELD_ERROR_CODES.INVALID_RATING_RANGE,
  );
  assert.ok(item);
  assert.equal(item.actual, 'excellent');
  assert.equal(item.expected, 'number from 0 to 5');
  assert.equal(result.data.year, 2001);
  assert.match(result.body, /body/);
});

test('an out-of-range numeric rating is rejected', () => {
  const result = parseTitleMarkdown('---\ntitle: "A"\npersonal_rating: 9\n---\n\nb\n', {
    relativePath: 'r.md',
  });
  assert.ok(codes(result).includes(FIELD_ERROR_CODES.INVALID_RATING_RANGE));
});

test('invalid dates and invalid lists are reported', () => {
  const result = parseTitleMarkdown(
    '---\ntitle: "A"\ndate_started: "sometime"\ntags: "not-a-list"\n---\n\nb\n',
    { relativePath: 'd.md', collection: 'Read' },
  );
  assert.ok(codes(result).includes(FIELD_ERROR_CODES.INVALID_DATE));
  assert.ok(codes(result).includes(FIELD_ERROR_CODES.INVALID_LIST));
});

test('absolute asset paths and traversal are rejected', () => {
  const absolute = parseTitleMarkdown('---\ntitle: "A"\ncover: "/etc/passwd"\n---\n\nb\n', {
    relativePath: 'a.md',
  });
  assert.ok(codes(absolute).includes(FIELD_ERROR_CODES.ABSOLUTE_ASSET_PATH));
  const traversal = parseTitleMarkdown(
    '---\ntitle: "A"\ncover: "../../../../escape.jpg"\n---\n\nb\n',
    { relativePath: 'Watch/Anime/Title (2001)/Title (2001).md' },
  );
  assert.ok(codes(traversal).includes(FIELD_ERROR_CODES.PATH_ESCAPE));
});

test('a shared-evidence path inside the library is accepted', () => {
  const result = parseTitleMarkdown(
    '---\ntitle: "A"\nevidence: "../../Source Imports/Shared Recommendation Evidence/Shared.jpg"\n---\n\nb\n',
    { relativePath: 'Watch/Anime/Title (2001)/Title (2001).md', collection: 'Watch' },
  );
  assert.deepEqual(result.diagnostics, []);
});

test('a sibling asset path inside the title folder is accepted', () => {
  const result = parseTitleMarkdown(
    '---\ntitle: "A"\nposter: "Poster.webp"\n---\n\nb\n',
    {
      relativePath: 'Watch/Movies/Title (2001)/Title (2001).md',
      collection: 'Watch',
      loadAsset: () => true,
    },
  );
  assert.deepEqual(result.diagnostics, []);
});

test('a missing referenced asset is a warning, not an error', () => {
  const result = parseTitleMarkdown('---\ntitle: "A"\nposter: "Poster.webp"\n---\n\nb\n', {
    relativePath: 'a.md',
    collection: 'Watch',
    loadAsset: () => false,
  });
  const item = result.diagnostics.find(
    (entry) => entry.code === FIELD_ERROR_CODES.BROKEN_RELATIVE_PATH,
  );
  assert.equal(item.severity, 'warning');
  assert.equal(result.ok, true);
});

test('identity insertion adds only the missing keys', () => {
  const patch = buildIdentityPatch(WATCH_DOC, {
    schemaVersion: PORTABLE_SCHEMA_VERSION,
    id: 'watch-0123456789abcdef',
    collection: 'Watch',
  });
  assert.equal(patch.ok, true);
  assert.equal(patch.changed, true);
  assert.deepEqual(patch.added, [
    `schema_version: ${PORTABLE_SCHEMA_VERSION}`,
    'id: "watch-0123456789abcdef"',
    'collection: "Watch"',
  ]);
  assert.ok(patch.text.startsWith('---\nschema_version: 1\nid: "watch-0123456789abcdef"\ncollection: "Watch"\ntitle: "Synthetic Movie"'));
  // everything else preserved
  for (const line of WATCH_DOC.split('\n')) {
    assert.ok(patch.text.includes(line), `preserved: ${line}`);
  }
});

test('identity insertion is idempotent and never duplicates a key', () => {
  const first = buildIdentityPatch(WATCH_DOC, {
    schemaVersion: PORTABLE_SCHEMA_VERSION,
    id: 'watch-0123456789abcdef',
    collection: 'Watch',
  });
  const second = buildIdentityPatch(first.text, {
    schemaVersion: PORTABLE_SCHEMA_VERSION,
    id: 'watch-0123456789abcdef',
    collection: 'Watch',
  });
  assert.equal(second.changed, false);
  assert.equal(second.text, first.text);
  assert.equal(first.text.split('\n').filter((line) => line.startsWith('id:')).length, 1);
});

test('identity insertion preserves CRLF line endings', () => {
  const crlf = WATCH_DOC.replace(/\n/g, '\r\n');
  const patch = buildIdentityPatch(crlf, {
    schemaVersion: PORTABLE_SCHEMA_VERSION,
    id: 'watch-0123456789abcdef',
    collection: 'Watch',
  });
  assert.ok(patch.text.includes('\r\nschema_version: 1\r\n'));
  assert.equal(patch.text.includes('\n\n'), false);
});

test('identity insertion preserves an existing valid identity untouched', () => {
  const text = '---\nschema_version: 1\nid: "read-abcdef0123456789"\ncollection: "Read"\ntitle: "A"\n---\n\nbody\n';
  const patch = buildIdentityPatch(text, {
    schemaVersion: PORTABLE_SCHEMA_VERSION,
    id: 'read-ffffffffffffffff',
    collection: 'Read',
  });
  assert.equal(patch.changed, false);
  assert.equal(patch.text, text);
});

test('readIdentity reports the current identity state', () => {
  const before = readIdentity(WATCH_DOC);
  assert.equal(before.id, null);
  assert.equal(before.title, 'Synthetic Movie');
  const after = readIdentity(buildIdentityPatch(WATCH_DOC, {
    schemaVersion: PORTABLE_SCHEMA_VERSION,
    id: 'watch-0123456789abcdef',
    collection: 'Watch',
  }).text);
  assert.equal(after.id, 'watch-0123456789abcdef');
  assert.equal(after.collection, 'Watch');
  assert.equal(after.schemaVersion, PORTABLE_SCHEMA_VERSION);
});

test('the writer refuses a file with no frontmatter instead of inventing one', () => {
  const patch = buildIdentityPatch('# no frontmatter\n', {
    schemaVersion: PORTABLE_SCHEMA_VERSION,
    id: 'read-0123456789abcdef',
    collection: 'Read',
  });
  assert.equal(patch.ok, false);
  assert.equal(patch.reason, FIELD_ERROR_CODES.NO_FRONTMATTER);
});

test('Arabic, Urdu, Unicode, apostrophe and ampersand titles round-trip', () => {
  const cases = [
    'كتاب عربي',
    'اردو عنوان',
    'Café Naïve — Ünïcode',
    "Rock & Roll's Best",
  ];
  for (const title of cases) {
    const text = `---\ntitle: "${title}"\n---\n\n# ${title}\n`;
    const result = parseTitleMarkdown(text, { relativePath: 'u.md', collection: 'Read' });
    assert.deepEqual(result.diagnostics, [], title);
    assert.equal(result.data.title, title);
    // the body is everything after the closing delimiter's line terminator,
    // so the blank separator line before the heading is preserved
    assert.equal(result.body, `\n# ${title}\n`);
  }
});

test('the YAML subset reader keeps nested lists of maps intact', () => {
  const parsed = parseYamlSubset(`recommendations:
  - source: "TikTok"
    recommended_by: "A"
  - source: "Instagram"
    recommended_by: "B"
`);
  assert.equal(parsed.value.recommendations.length, 2);
  assert.equal(parsed.value.recommendations[1].recommended_by, 'B');
});

test('asset resolution stays inside the library root', async () => {
  const base = await mkdtemp(join(tmpdir(), 'rw-meta-'));
  try {
    await writeFile(join(base, 'inside.jpg'), 'x');
    const inside = resolveTitleAsset(base, '.', 'inside.jpg');
    assert.equal(inside.ok, true);
    const escape = resolveTitleAsset(base, '.', '../outside.jpg');
    assert.equal(escape.ok, false);
    assert.equal(escape.code, FIELD_ERROR_CODES.PATH_ESCAPE);
    const absolute = resolveTitleAsset(base, '.', '/etc/passwd');
    assert.equal(absolute.ok, false);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
