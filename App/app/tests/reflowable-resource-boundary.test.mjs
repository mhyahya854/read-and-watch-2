import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateArchiveEntryPath,
  validateResourceUri,
  STRICT_READER_CSP,
  DEFAULT_MAX_ARCHIVE_ENTRIES,
  DEFAULT_MAX_DECOMPRESSED_BYTES,
  DocumentError,
} from '../lib/document/index.ts';

test('validateArchiveEntryPath allows safe relative paths inside archives', () => {
  const safePaths = [
    'mimetype',
    'META-INF/container.xml',
    'OEBPS/content.opf',
    'OEBPS/toc.ncx',
    'OEBPS/Text/chapter-01.xhtml',
    'OEBPS/Styles/stylesheet.css',
    'OEBPS/Images/cover.jpeg',
    'comic/001.png',
  ];

  for (const p of safePaths) {
    const normalized = validateArchiveEntryPath(p);
    assert.equal(typeof normalized, 'string');
    assert.equal(normalized.length > 0, true);
  }
});

test('validateArchiveEntryPath rejects directory traversal / zip-slip attacks', () => {
  const zipSlipAttacks = [
    '../secret.txt',
    '../../etc/passwd',
    'OEBPS/../../../system.ini',
    'Text/../../secret',
    '..',
    'a/b/../../../c',
  ];

  for (const attack of zipSlipAttacks) {
    assert.throws(
      () => validateArchiveEntryPath(attack),
      (err) => DocumentError.isDocumentError(err) && err.code === 'PARSE_FAILED',
      `Expected zip-slip attack "${attack}" to be rejected`
    );
  }
});

test('validateArchiveEntryPath rejects absolute paths and drive-letter escapes', () => {
  const absolutePaths = [
    '/etc/shadow',
    '/root/.ssh/id_rsa',
    'C:/Windows/System32/drivers/etc/hosts',
    'D:\\Data\\private.key',
    '\\server\\share\\file.txt',
  ];

  for (const abs of absolutePaths) {
    assert.throws(
      () => validateArchiveEntryPath(abs),
      (err) => DocumentError.isDocumentError(err) && err.code === 'PARSE_FAILED',
      `Expected absolute path "${abs}" to be rejected`
    );
  }
});

test('validateArchiveEntryPath rejects null bytes and empty inputs', () => {
  assert.throws(
    () => validateArchiveEntryPath('OEBPS/chapter\0.html'),
    (err) => DocumentError.isDocumentError(err) && err.code === 'PARSE_FAILED'
  );
  assert.throws(
    () => validateArchiveEntryPath(''),
    (err) => DocumentError.isDocumentError(err) && err.code === 'PARSE_FAILED'
  );
  assert.throws(
    () => validateArchiveEntryPath('   '),
    (err) => DocumentError.isDocumentError(err) && err.code === 'PARSE_FAILED'
  );
});

test('validateResourceUri distinguishes safe, external, and prohibited URIs', () => {
  // Prohibited active scripting schemes
  const prohibited = [
    'javascript:alert(1)',
    'JAVASCRIPT:evil()',
    'vbscript:msgbox',
    'file:///C:/passwords.txt',
    'data:text/html,<script>alert(1)</script>',
    'data:application/javascript;base64,YWxlcnQoMSk=',
  ];

  for (const uri of prohibited) {
    const res = validateResourceUri(uri);
    assert.equal(res.isSafe, false, `Expected prohibited URI "${uri}" to not be safe`);
  }

  // External network links
  const external = [
    'https://example.com/source',
    'http://gutenberg.org/ebooks/1234',
    'mailto:support@readandwatch.app',
  ];

  for (const uri of external) {
    const res = validateResourceUri(uri);
    assert.equal(res.isSafe, true);
    assert.equal(res.isExternal, true);
  }

  // Safe internal publication assets
  const safeInternal = [
    'chapter1.xhtml',
    'sub/../images/fig-01.png',
    'styles/book.css',
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  ];

  for (const uri of safeInternal) {
    const res = validateResourceUri(uri);
    assert.equal(res.isSafe, true);
    assert.equal(res.isExternal, false);
  }

  // Path traversal beyond publication root
  const escapingRelative = [
    '../../beyond-root.png',
    'a/../../../escape.xhtml',
  ];

  for (const uri of escapingRelative) {
    const res = validateResourceUri(uri);
    assert.equal(res.isSafe, false);
  }
});

test('STRICT_READER_CSP enforces no scripts, no network connections, and safe media', () => {
  assert.ok(STRICT_READER_CSP.includes("script-src 'none'"));
  assert.ok(STRICT_READER_CSP.includes("default-src 'none'"));
  assert.ok(STRICT_READER_CSP.includes("frame-src 'none'"));
  assert.ok(STRICT_READER_CSP.includes("connect-src 'none'"));
  assert.ok(STRICT_READER_CSP.includes("img-src blob: data:"));
  assert.ok(STRICT_READER_CSP.includes("font-src blob: data:"));
});

test('Decompression and archive safety constants are defined with safe bounds', () => {
  assert.equal(DEFAULT_MAX_ARCHIVE_ENTRIES, 20000);
  assert.equal(DEFAULT_MAX_DECOMPRESSED_BYTES, 500 * 1024 * 1024);
});
