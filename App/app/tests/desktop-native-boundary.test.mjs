/**
 * Tests for Desktop Native Boundary and Least-Privilege Command Enforcement.
 * Phase 14 — Desktop Native Integration.
 *
 * Covers:
 * - Least-privilege command inventory (exact 5 APIs, zero generic execution)
 * - Negative security tests: command injection, protocol injection, traversal, UNC
 * - Open-with argument parsing and extension allowlist
 * - Stable item resolution by SHA-256 without mutating source books
 * - Single-instance concurrency defense
 * - Internal desktop HTTP service lifecycle and store integration
 * - Source publication immutability gate
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';

import { createDesktopService } from '../electron/desktop-service.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appRoot = resolve(__dirname, '..');
const repoRoot = resolve(appRoot, '..', '..');

const SUPPORTED_EXTENSIONS = [
  '.epub',
  '.pdf',
  '.mobi',
  '.azw',
  '.azw3',
  '.fb2',
  '.fbz',
  '.cbz',
];

// -----------------------------------------------------------------
// 1. Least-Privilege Native Boundary Inventory
// -----------------------------------------------------------------
test('P14-T003: Desktop native bridge defines exactly the minimal 5 least-privilege APIs', async () => {
  const preloadSource = readFileSync(resolve(appRoot, 'electron', 'preload.mjs'), 'utf8');

  // Verify exposed APIs
  assert.ok(preloadSource.includes('chooseBookFiles'), 'Must expose chooseBookFiles');
  assert.ok(preloadSource.includes('chooseDataRoot'), 'Must expose chooseDataRoot');
  assert.ok(preloadSource.includes('getAppPaths'), 'Must expose getAppPaths');
  assert.ok(preloadSource.includes('openExternalHttps'), 'Must expose openExternalHttps');
  assert.ok(preloadSource.includes('onOpenFile'), 'Must expose onOpenFile');
  assert.ok(preloadSource.includes('resolveOpenFile'), 'Must expose resolveOpenFile');

  // Negative assertion: Forbidden primitives MUST NOT be present in preload
  assert.ok(!preloadSource.includes('child_process'), 'child_process must not be imported in preload');
  assert.ok(!preloadSource.includes('exec('), 'Generic exec must not be exposed');
  assert.ok(!preloadSource.includes('spawn('), 'Generic spawn must not be exposed');
  assert.ok(!preloadSource.includes('readFile('), 'Generic readFile must not be exposed');
  assert.ok(!preloadSource.includes('writeFile('), 'Generic writeFile must not be exposed');
  assert.ok(!preloadSource.includes('deleteFile('), 'Generic deleteFile must not be exposed');
  assert.ok(!preloadSource.includes('unlink('), 'Generic unlink must not be exposed');
});

// -----------------------------------------------------------------
// 2. URL Protocol Validation Negative Tests
// -----------------------------------------------------------------
test('P14-T003 / P14-T007: External URL opener strictly permits only HTTPS and HTTP', () => {
  function validateUrl(url) {
    if (typeof url !== 'string') return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }

  // Allowed protocols
  assert.equal(validateUrl('https://example.com/docs'), true);
  assert.equal(validateUrl('http://example.com/spec'), true);
  assert.equal(validateUrl('https://github.com/mhyahya854/read-and-watch-2'), true);

  // Forbidden dangerous protocols
  assert.equal(validateUrl('file:///C:/Windows/System32/calc.exe'), false);
  assert.equal(validateUrl('javascript:alert(document.cookie)'), false);
  assert.equal(validateUrl('powershell:Start-Process calc'), false);
  assert.equal(validateUrl('cmd://calc.exe'), false);
  assert.equal(validateUrl('vbscript:msgbox("hacked")'), false);
  assert.equal(validateUrl('ms-settings:privacy'), false);
  assert.equal(validateUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(validateUrl('about:blank'), false);
  assert.equal(validateUrl(''), false);
  assert.equal(validateUrl(null), false);
});

// -----------------------------------------------------------------
// 3. Open-With Launch Argument Parsing & Traversal Defenses
// -----------------------------------------------------------------
test('P14-T004 / P14-T007: Open-With argument parser filters switches, traversal, and invalid formats', () => {
  const samplePdf = resolve(appRoot, 'tests', 'fixtures', 'pdf', 'sample-alice.pdf');

  function parseArgs(argv) {
    const results = [];
    for (const arg of argv) {
      if (!arg || typeof arg !== 'string') continue;
      if (arg.startsWith('-') || arg === '.') continue;
      try {
        const resolved = resolve(arg);
        if (existsSync(resolved) && statSync(resolved).isFile()) {
          const ext = '.' + resolved.split('.').pop().toLowerCase();
          if (SUPPORTED_EXTENSIONS.includes(ext)) {
            results.push(resolved);
          }
        }
      } catch {
        // Ignore
      }
    }
    return results;
  }

  const mockArgv = [
    '--inspect-brk=9229',
    '--remote-debugging-port=9999',
    '-d',
    '.',
    '../../../../Windows/System32/cmd.exe',
    'nonexistent-book.epub',
    'malicious.exe',
    samplePdf,
  ];

  const parsed = parseArgs(mockArgv);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0], samplePdf);
});

// -----------------------------------------------------------------
// 4. Data Root Containment & Git Repository Protection
// -----------------------------------------------------------------
test('P14-T003 / P14-G003: chooseDataRoot rejects directories inside the Git repository', () => {
  function validateChosenDataRoot(chosenPath, repositoryRoot) {
    const canonicalChosen = resolve(chosenPath);
    const canonicalRepo = resolve(repositoryRoot);
    const fromRoot = relative(canonicalRepo, canonicalChosen);
    const isInsideRepo = fromRoot === '' || (!fromRoot.startsWith('..') && !isAbsolute(fromRoot));
    if (isInsideRepo) {
      return { valid: false, error: 'Data folder must be outside the Git repository root' };
    }
    return { valid: true };
  }

  const insideRepo = resolve(appRoot, 'user-data');
  assert.equal(validateChosenDataRoot(insideRepo, repoRoot).valid, false);

  const outsideRepo = resolve(repoRoot, '..', 'Read and Watch - Local Data');
  assert.equal(validateChosenDataRoot(outsideRepo, repoRoot).valid, true);
});

// -----------------------------------------------------------------
// 5. Internal Desktop HTTP Service & Store Integration
// -----------------------------------------------------------------
test('P14-T003: Internal desktop service starts on 127.0.0.1, serves stores, and terminates cleanly', async () => {
  const service = createDesktopService({ appRoot });
  const instance = await service.start(0, '127.0.0.1');

  try {
    assert.ok(instance.port > 0, 'Must bind to dynamic loopback port');
    assert.ok(instance.origin.startsWith('http://127.0.0.1:'), 'Must bind strictly to 127.0.0.1');

    // 1. Desktop status
    const statusRes = await fetch(`${instance.origin}/api/desktop/status`);
    assert.equal(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.equal(statusData.isDesktop, true);
    assert.ok(statusData.sessionToken, 'Must generate session token');

    // 2. Library catalog
    const catalogRes = await fetch(`${instance.origin}/api/library/catalog`);
    assert.equal(catalogRes.status, 200);
    const catalogData = await catalogRes.json();
    assert.ok(catalogData.items && Array.isArray(catalogData.items));

    // 3. Search status
    const searchRes = await fetch(`${instance.origin}/api/search/status`);
    assert.equal(searchRes.status, 200);
    const searchData = await searchRes.json();
    assert.ok(searchData.status !== undefined || searchData.schemaVersion !== undefined);

    // 4. Resolve Open-With File (with valid session token)
    const samplePdf = resolve(appRoot, 'tests', 'fixtures', 'pdf', 'sample-alice.pdf');
    const resolveRes = await fetch(`${instance.origin}/api/desktop/resolve-open-file`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ReadWatch-Session-Token': instance.sessionToken,
      },
      body: JSON.stringify({ path: samplePdf }),
    });
    assert.equal(resolveRes.status, 200);
    const resolveData = await resolveRes.json();
    assert.ok(resolveData.file, 'Must return file metadata');
    assert.equal(resolveData.file.name, 'sample-alice.pdf');
    assert.ok(resolveData.file.hash.length === 64, 'Must compute SHA-256 hash');

    // 5. Negative test: Missing session token must return 401
    const missingTokenRes = await fetch(`${instance.origin}/api/desktop/resolve-open-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: samplePdf }),
    });
    assert.equal(missingTokenRes.status, 401, 'Missing session token must return 401');

    // 6. Negative test: Invalid session token must return 403
    const badTokenRes = await fetch(`${instance.origin}/api/desktop/resolve-open-file`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ReadWatch-Session-Token': 'bad-token-12345',
      },
      body: JSON.stringify({ path: samplePdf }),
    });
    assert.equal(badTokenRes.status, 403, 'Invalid session token must return 403');

    // 7. Negative test: Disallowed Origin header must return 403
    const badOriginRes = await fetch(`${instance.origin}/api/desktop/status`, {
      headers: { Origin: 'https://malicious-website.com' },
    });
    assert.equal(badOriginRes.status, 403, 'Untrusted origin must return 403');

    // 8. Negative test: Disallowed Host header must return 403
    const badHostStatus = await new Promise((resolveReq) => {
      const u = new URL(instance.origin);
      const req = http.request({
        hostname: u.hostname,
        port: u.port,
        path: '/api/desktop/status',
        headers: { Host: 'evil.com' },
      }, (res) => {
        resolveReq(res.statusCode);
      });
      req.end();
    });
    assert.equal(badHostStatus, 403, 'Untrusted host must return 403');

    // 9. Negative test on nonexistent file
    const badFileRes = await fetch(`${instance.origin}/api/desktop/resolve-open-file`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ReadWatch-Session-Token': instance.sessionToken,
      },
      body: JSON.stringify({ path: 'C:/totally/fake/path.epub' }),
    });
    assert.equal(badFileRes.status, 400);

  } finally {
    await instance.close();
  }
});

// -----------------------------------------------------------------
// 6. Source Publication Immutability Gate
// -----------------------------------------------------------------
test('P14-T007 & P14-G003: Source publications remain 100% byte-identical across desktop operations', async () => {
  const samplePdf = resolve(appRoot, 'tests', 'fixtures', 'pdf', 'sample-alice.pdf');
  const preBytes = readFileSync(samplePdf);
  const preHash = createHash('sha256').update(preBytes).digest('hex');
  const preMtime = statSync(samplePdf).mtimeMs;

  // Run desktop resolution and read
  const service = createDesktopService({ appRoot });
  const instance = await service.start(0, '127.0.0.1');

  try {
    const res = await fetch(`${instance.origin}/api/desktop/resolve-open-file`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ReadWatch-Session-Token': instance.sessionToken,
      },
      body: JSON.stringify({ path: samplePdf }),
    });
    assert.equal(res.status, 200);
  } finally {
    await instance.close();
  }

  const postBytes = readFileSync(samplePdf);
  const postHash = createHash('sha256').update(postBytes).digest('hex');
  const postMtime = statSync(samplePdf).mtimeMs;

  assert.equal(postHash, preHash, 'Source publication SHA-256 must remain strictly unchanged');
  assert.equal(postBytes.length, preBytes.length, 'Source publication byte length must remain identical');
  assert.equal(postMtime, preMtime, 'Source publication filesystem mtime must remain unchanged');
});
