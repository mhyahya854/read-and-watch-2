#!/usr/bin/env node
/**
 * Assign portable stable identity to organized title Markdown.
 *
 *   node scripts/assign-portable-identity.mjs --root "<library root>" [--apply]
 *
 * Dry run is the default: nothing is written and no report is emitted to Git.
 * With --apply the tool verifies a dry run first, backs up the 219 title
 * Markdown files, then inserts only the missing identity keys per file.
 *
 * Private reports and the rollback archive are written beneath
 * `<root>/App/migration/portable-metadata/<timestamp>/` and are never committed.
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { argv, exit } from 'node:process';

import { discoverOrganizedLibrary, toLongPath } from '../server/portable-library.mjs';
import {
  PORTABLE_SCHEMA_VERSION,
  buildIdentityPatch,
  parseTitleMarkdown,
  readIdentity,
} from '../server/portable-metadata.mjs';

function argument(name, fallback = null) {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
}

const root = resolve(argument('root', '') || '');
const apply = argv.includes('--apply');
if (!root) {
  console.error('usage: assign-portable-identity.mjs --root <library root> [--apply]');
  exit(2);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(header, rows) {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/**
 * Rollback bundle: a copy of every title Markdown that preserves its relative
 * path, plus a hash manifest. Chosen over a bespoke ZIP writer so the archive is
 * verifiable with ordinary file access and no custom binary format.
 */
async function writeRollbackTree(bundleRoot, plans) {
  const written = [];
  for (const plan of plans) {
    const target = join(bundleRoot, plan.title.relativeMarkdownPath);
    await mkdir(toLongPath(dirnameOf(target)), { recursive: true });
    await writeFile(toLongPath(target), plan.buffer);
    const check = await readFile(toLongPath(target));
    if (check.length !== plan.buffer.length || sha256(check) !== plan.hash) {
      throw new Error(`rollback copy failed verification: ${plan.title.relativeMarkdownPath}`);
    }
    written.push(plan.title.relativeMarkdownPath);
  }
  return written;
}

function dirnameOf(path) {
  const normalized = path.replace(/\\/g, '/');
  return normalized.slice(0, normalized.lastIndexOf('/')) || '.';
}

function newStableId(collection) {
  return `${collection.toLowerCase()}-${randomBytes(8).toString('hex')}`;
}

async function main() {
  const discovery = await discoverOrganizedLibrary(root);
  if (!discovery.ok) {
    console.error('discovery diagnostics:', JSON.stringify(discovery.diagnostics, null, 2));
    exit(1);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportRoot = join(root, 'App', 'migration', 'portable-metadata', stamp);

  const rows = [];
  const plans = [];
  const usedIds = new Map();
  let severe = 0;

  for (const title of discovery.titles) {
    const absolute = join(root, title.relativeMarkdownPath);
    const buffer = await readFile(toLongPath(absolute));
    const text = buffer.toString('utf8');
    const hash = sha256(buffer);
    const parsed = parseTitleMarkdown(text, {
      relativePath: title.relativeMarkdownPath,
      collection: title.collection,
    });
    const current = readIdentity(text);
    const errors = parsed.diagnostics.filter((item) => item.severity === 'error');
    if (errors.length > 0) severe += 1;

    let proposed = current.id;
    let mechanism = current.id ? 'existing_id' : 'generated_once';
    if (!proposed) {
      proposed = newStableId(title.collection);
      while (usedIds.has(proposed)) proposed = newStableId(title.collection);
    }
    if (usedIds.has(proposed)) {
      console.error(`ID collision for ${title.relativeMarkdownPath}`);
      exit(1);
    }
    usedIds.set(proposed, title.relativeMarkdownPath);

    const patch = buildIdentityPatch(text, {
      schemaVersion: PORTABLE_SCHEMA_VERSION,
      id: proposed,
      collection: title.collection,
    });
    if (!patch.ok) {
      console.error(`cannot patch ${title.relativeMarkdownPath}: ${patch.reason}`);
      exit(1);
    }

    plans.push({ title, absolute, text, patch, buffer, hash, proposed, mechanism, current });
    rows.push([
      title.relativeMarkdownPath, title.collection, title.category,
      current.id ?? '', proposed, mechanism,
      patch.changed ? 'yes' : 'no',
      errors.length === 0 ? 'ok' : 'errors',
      String(parsed.diagnostics.length),
    ]);
  }

  const header = [
    'relative_markdown_path', 'collection', 'category',
    'current_id', 'proposed_id', 'id_mechanism',
    'needs_write', 'parse_status', 'diagnostic_count',
  ];
  await mkdir(toLongPath(reportRoot), { recursive: true });
  await writeFile(join(reportRoot, 'PARSE_DRY_RUN.csv'),
    toCsv(header, rows), 'utf8');

  const preRows = plans.map((plan) => [
    plan.title.relativeMarkdownPath,
    String(plan.buffer.length),
    plan.hash,
    plan.current.schemaVersion ?? '',
    plan.current.id ?? '',
    plan.proposed,
    plan.mechanism,
    plan.patch.changed ? 'insert_identity' : 'leave_unchanged',
  ]);
  await writeFile(join(reportRoot, 'PRE_STABLE_ID_MANIFEST.csv'), toCsv([
    'relative_path', 'byte_size', 'sha256', 'existing_schema_version',
    'existing_id', 'proposed_id', 'id_mechanism', 'planned_action',
  ], preRows), 'utf8');

  const summary = {
    root,
    discovered: discovery.counts,
    readTitles: discovery.counts.read,
    watchTitles: discovery.counts.watch,
    uniqueIds: usedIds.size,
    needWrite: plans.filter((plan) => plan.patch.changed).length,
    parseErrors: severe,
    reportRoot,
    applied: false,
  };

  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
    console.log('dry run only; no file was modified');
    return;
  }

  if (severe > 0) {
    console.error(`${severe} title(s) have parse errors; refusing to write.`);
    exit(1);
  }

  const bundleRoot = join(reportRoot, 'TITLE_MARKDOWN_BEFORE');
  let rollbackCount = 0;
  try {
    rollbackCount = (await writeRollbackTree(bundleRoot, plans)).length;
  } catch (error) {
    console.error(`${error.message}; refusing to write.`);
    exit(1);
  }
  console.log(`rollback bundle verified: ${bundleRoot} (${rollbackCount} files)`);

  let written = 0;
  for (const plan of plans) {
    if (!plan.patch.changed) continue;
    const temp = `${plan.absolute}.rw-tmp`;
    await writeFile(toLongPath(temp), Buffer.from(plan.patch.text, 'utf8'));
    const check = parseTitleMarkdown(readFileSync(toLongPath(temp), 'utf8'), {
      relativePath: plan.title.relativeMarkdownPath,
      collection: plan.title.collection,
    });
    if (check.diagnostics.some((item) => item.severity === 'error')) {
      console.error(`generated file invalid, not replacing: ${plan.title.relativeMarkdownPath}`);
      exit(1);
    }
    await rename(toLongPath(temp), toLongPath(plan.absolute));
    written += 1;
  }

  const postRows = [];
  for (const plan of plans) {
    const buffer = await readFile(toLongPath(plan.absolute));
    const text = buffer.toString('utf8');
    const parsed = parseTitleMarkdown(text, {
      relativePath: plan.title.relativeMarkdownPath,
      collection: plan.title.collection,
    });
    const identity = readIdentity(text);
    postRows.push([
      plan.title.relativeMarkdownPath,
      String(buffer.length),
      sha256(buffer),
      identity.id ?? '',
      identity.schemaVersion ?? '',
      identity.collection ?? '',
      parsed.diagnostics.some((item) => item.severity === 'error') ? 'errors' : 'ok',
    ]);
  }
  await writeFile(join(reportRoot, 'POST_STABLE_ID_MANIFEST.csv'), toCsv([
    'relative_path', 'byte_size', 'sha256', 'stable_id', 'schema_version',
    'collection', 'parse_status',
  ], postRows), 'utf8');

  summary.applied = true;
  summary.written = written;
  console.log(JSON.stringify(summary, null, 2));
}

await main();
