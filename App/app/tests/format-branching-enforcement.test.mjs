import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));

// Suspicious patterns that indicate format-driven UI branching rather than capability-driven design
const SUSPICIOUS_PATTERNS = [
  /format\s*===\s*['"`](pdf|epub|mobi|azw3|cbz)['"`]/i,
  /extension\s*===\s*['"`]\.(pdf|epub|mobi|azw3|cbz)['"`]/i,
  /\b(isPdf|isEpub)\b/,
  /switch\s*\(\s*(format|extension)\s*\)/i,
];

// Approved boundaries where format identification or engine mapping is legitimate
const ALLOWED_DIRECTORIES = [
  join(APP_ROOT, 'server'), // Trusted backend filesystem resolver
  join(APP_ROOT, 'lib', 'document'), // Adapter registry & engine test doubles
  join(APP_ROOT, 'tests'), // Architectural test assertions
];

function isPathAllowed(filePath) {
  return ALLOWED_DIRECTORIES.some((allowed) => filePath.startsWith(allowed));
}

function collectFiles(dir, extensions, acc = []) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'dist') {
      continue;
    }
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectFiles(fullPath, extensions, acc);
    } else if (extensions.some((ext) => entry.endsWith(ext))) {
      acc.push(fullPath);
    }
  }
  return acc;
}

test('Format-branching audit: UI and presentation components must not branch on format', () => {
  const componentsDir = join(APP_ROOT, 'components');
  const appRoutesDir = join(APP_ROOT, 'app');

  const filesToCheck = [
    ...collectFiles(componentsDir, ['.ts', '.tsx']),
    ...collectFiles(appRoutesDir, ['.ts', '.tsx']),
  ];

  assert.ok(filesToCheck.length >= 10, 'Should find components and routes to audit');

  const violations = [];

  for (const file of filesToCheck) {
    if (isPathAllowed(file)) {
      continue;
    }

    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of SUSPICIOUS_PATTERNS) {
        if (pattern.test(line)) {
          violations.push({
            file: relative(APP_ROOT, file),
            line: i + 1,
            content: line.trim(),
            pattern: pattern.toString(),
          });
        }
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Found format-branching violations in presentation components!
UI components must query DocumentAdapter capabilities (e.g. session.canZoom, session.canAdjustFont)
instead of branching on format string or file extension directly:
${JSON.stringify(violations, null, 2)}`
  );
});
