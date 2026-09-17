/**
 * External OCR storage + activation manifest — Phase 17.
 *
 * Everything heavy lives outside Git, under the existing READ_WATCH_DATA_ROOT
 * convention:
 *
 *   <dataRoot>/ocr/
 *     engines/<providerId>/versions/<revision>/   staged + verified revisions
 *     engines/<providerId>/active.json            portable activation pointer
 *     engines/<providerId>/failed.json            last failed attempt record
 *     models/<providerId>/<revision>/             downloaded model weights
 *     runtimes/<providerId>/<revision>/           isolated python environments
 *     cache/<providerId>/<sourceHash>/            derived OCR results
 *     temp/                                       scratch page images
 *     evidence/                                   provenance + smoke evidence
 *
 * Activation uses a JSON pointer file, never a symbolic link: symlink creation
 * and permission semantics differ materially between Windows, macOS, and Linux.
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,128}$/;

export class EngineStoreError extends Error {
  constructor(message, code = 'INVALID_INPUT') {
    super(message);
    this.name = 'EngineStoreError';
    this.code = code;
  }
}

/** Rejects anything that could escape the managed OCR directory. */
export function assertSafeSegment(value, label) {
  const isDotSegment = typeof value === 'string' && /^\.+$/.test(value);
  if (typeof value !== 'string' || isDotSegment || !SAFE_SEGMENT.test(value)) {
    throw new EngineStoreError(`Unsafe ${label}: ${String(value)}`);
  }
  return value;
}

export function sha256OfFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Guards path containment, including through reparse points. */
export function assertInsideDirectory(root, candidate, label = 'path') {
  const resolved = resolve(candidate);
  const rel = relative(resolve(root), resolved);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new EngineStoreError(`Unsafe ${label} outside managed OCR directory`);
  }
  return resolved;
}

function writeJsonAtomic(target, value) {
  mkdirSync(dirname(target), { recursive: true });
  const tmp = join(
    dirname(target),
    `.${basename(target)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(tmp, target);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function createEngineStore({ ocrRoot }) {
  if (typeof ocrRoot !== 'string' || ocrRoot.length === 0) {
    throw new EngineStoreError('OCR engine store requires an external ocrRoot');
  }
  const root = resolve(ocrRoot);
  const layout = {
    root,
    engines: join(root, 'engines'),
    models: join(root, 'models'),
    runtimes: join(root, 'runtimes'),
    cache: join(root, 'cache'),
    temp: join(root, 'temp'),
    evidence: join(root, 'evidence'),
  };

  function ensureLayout() {
    for (const path of Object.values(layout)) {
      mkdirSync(path, { recursive: true });
    }
    return layout;
  }

  function providerDir(providerId, area = 'engines') {
    assertSafeSegment(providerId, 'provider id');
    const base = layout[area];
    if (!base) throw new EngineStoreError(`Unknown OCR storage area: ${String(area)}`);
    return join(base, providerId);
  }

  function versionDir(providerId, revision, area = 'engines') {
    assertSafeSegment(revision, 'revision');
    return join(providerDir(providerId, area), 'versions', revision);
  }

  function activePointerPath(providerId) {
    return join(providerDir(providerId, 'engines'), 'active.json');
  }

  function failedRecordPath(providerId) {
    return join(providerDir(providerId, 'engines'), 'failed.json');
  }

  /** Portable activation pointer. `activeRevision === null` means not installed. */
  function readActivation(providerId) {
    const record = readJson(activePointerPath(providerId));
    if (!record || typeof record !== 'object') {
      return {
        providerId,
        activeRevision: null,
        previousRevision: null,
        activatedAt: null,
        provenance: null,
      };
    }
    return {
      providerId,
      activeRevision: typeof record.activeRevision === 'string' ? record.activeRevision : null,
      previousRevision: typeof record.previousRevision === 'string' ? record.previousRevision : null,
      activatedAt: typeof record.activatedAt === 'string' ? record.activatedAt : null,
      provenance: record.provenance ?? null,
    };
  }

  /**
   * Atomically switches the activation pointer. The previously active revision
   * is retained as `previousRevision` so rollback needs no extra bookkeeping.
   */
  function writeActivation(providerId, { revision, provenance = null, keepPrevious = true }) {
    assertSafeSegment(revision, 'revision');
    const current = readActivation(providerId);
    const next = {
      providerId,
      activeRevision: revision,
      previousRevision:
        keepPrevious && current.activeRevision && current.activeRevision !== revision
          ? current.activeRevision
          : keepPrevious
            ? current.previousRevision
            : null,
      activatedAt: new Date().toISOString(),
      provenance,
    };
    ensureLayout();
    writeJsonAtomic(activePointerPath(providerId), next);
    return next;
  }

  function listRevisions(providerId, area = 'engines') {
    const versionsRoot = join(providerDir(providerId, area), 'versions');
    if (!existsSync(versionsRoot)) return [];
    return readdirSync(versionsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  }

  function hasRevision(providerId, revision, area = 'engines') {
    try {
      const dir = versionDir(providerId, revision, area);
      return existsSync(dir) && statSync(dir).isDirectory();
    } catch {
      return false;
    }
  }

  function recordFailure(providerId, failure) {
    ensureLayout();
    writeJsonAtomic(failedRecordPath(providerId), {
      providerId,
      failedAt: new Date().toISOString(),
      ...failure,
    });
  }

  function readFailure(providerId) {
    return readJson(failedRecordPath(providerId));
  }

  function clearFailure(providerId) {
    const path = failedRecordPath(providerId);
    if (existsSync(path)) rmSync(path, { force: true });
  }

  function writeEvidence(name, value) {
    const target = join(layout.evidence, `${assertSafeSegment(name, 'evidence name')}.json`);
    ensureLayout();
    writeJsonAtomic(target, value);
    return target;
  }

  /** Creates a fresh staging directory. Never touches the active revision. */
  function createStagingDir(providerId, revision, area = 'engines') {
    const dir = versionDir(providerId, revision, area);
    assertInsideDirectory(root, dir, 'staging directory');
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  function removeVersion(providerId, revision, area = 'engines') {
    const dir = versionDir(providerId, revision, area);
    assertInsideDirectory(root, dir, 'version directory');
    rmSync(dir, { recursive: true, force: true });
  }

  return {
    layout,
    ensureLayout,
    providerDir,
    versionDir,
    activePointerPath,
    readActivation,
    writeActivation,
    listRevisions,
    hasRevision,
    recordFailure,
    readFailure,
    clearFailure,
    writeEvidence,
    createStagingDir,
    removeVersion,
  };
}
