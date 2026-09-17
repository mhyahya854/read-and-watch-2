/**
 * Annotation Store — Server-side canonical annotation persistence.
 *
 * Phase 09 — Unified Annotation Foundation.
 *
 * Architecture:
 *   - SQLite (node:sqlite DatabaseSync) is the canonical store.
 *   - Every write is wrapped in BEGIN IMMEDIATE to prevent concurrent corruption.
 *   - Optimistic concurrency: client must supply current revision; mismatch = 409.
 *   - Each save also writes an atomic file-first recovery mirror at:
 *       READ_WATCH_DATA_ROOT/App/user-data/items/:itemId/annotations.json
 *   - Source EPUBs and PDFs are NEVER touched.
 *   - No engine-specific types imported.
 */

import { mkdirSync, renameSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// SQL DDL — forward-only migration
// ---------------------------------------------------------------------------

const DDL_ANNOTATIONS = `
CREATE TABLE IF NOT EXISTS annotations (
  id              TEXT PRIMARY KEY,
  item_id         TEXT NOT NULL,
  asset_id        TEXT NOT NULL,
  kind            TEXT NOT NULL,
  anchor_json     TEXT NOT NULL,
  content_json    TEXT NOT NULL,
  style_json      TEXT,
  source_sha256   TEXT NOT NULL,
  revision        INTEGER NOT NULL DEFAULT 1,
  lifecycle       TEXT NOT NULL DEFAULT 'active',
  created_at_utc  TEXT NOT NULL,
  updated_at_utc  TEXT NOT NULL,
  deleted_at_utc  TEXT,
  FOREIGN KEY (item_id) REFERENCES items(id)
);
CREATE INDEX IF NOT EXISTS idx_annotations_item_active
  ON annotations(item_id, deleted_at_utc);
CREATE INDEX IF NOT EXISTS idx_annotations_item_asset
  ON annotations(item_id, asset_id, deleted_at_utc);
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeAtomic(target, content) {
  mkdirSync(dirname(target), { recursive: true });
  const tmp = join(
    dirname(target),
    `.${basename(target)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  );
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, target);
}

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function nowUtc() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAnnotationStore({ databasePath, userDataRoot, searchStore = null }) {
  const db = new DatabaseSync(databasePath, { readOnly: false, allowExtension: false });
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(DDL_ANNOTATIONS);

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  function rowToAnnotation(row) {
    return {
      schemaVersion: 1,
      id: row.id,
      itemId: row.item_id,
      assetId: row.asset_id,
      kind: row.kind,
      anchor: JSON.parse(row.anchor_json),
      content: JSON.parse(row.content_json),
      ...(row.style_json ? { style: JSON.parse(row.style_json) } : {}),
      sourceHash: row.source_sha256,
      revision: row.revision,
      lifecycle: row.lifecycle,
      createdAt: row.created_at_utc,
      updatedAt: row.updated_at_utc,
      deletedAt: row.deleted_at_utc ?? null,
    };
  }

  function exportRecoveryFile(itemId) {
    const rows = db
      .prepare('SELECT * FROM annotations WHERE item_id=? ORDER BY created_at_utc')
      .all(itemId);
    const data = {
      schemaVersion: 1,
      itemId,
      exportedAt: nowUtc(),
      annotations: rows.map(rowToAnnotation),
    };
    const target = join(userDataRoot, 'items', itemId, 'annotations.json');
    writeAtomic(target, JSON.stringify(data, null, 2));
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  function getAnnotations(itemId, { includeDeleted = false } = {}) {
    if (typeof itemId !== 'string' || !itemId) fail('Invalid itemId');
    const rows = includeDeleted
      ? db.prepare('SELECT * FROM annotations WHERE item_id=? ORDER BY created_at_utc').all(itemId)
      : db.prepare("SELECT * FROM annotations WHERE item_id=? AND deleted_at_utc IS NULL ORDER BY created_at_utc").all(itemId);
    return rows.map(rowToAnnotation);
  }

  function getAnnotation(id) {
    if (typeof id !== 'string' || !id) fail('Invalid annotation id');
    const row = db.prepare('SELECT * FROM annotations WHERE id=?').get(id);
    if (!row) fail('Annotation not found', 404);
    return rowToAnnotation(row);
  }

  function createAnnotation(payload) {
    const {
      itemId,
      assetId,
      kind,
      anchor,
      content,
      style,
      sourceHash,
    } = payload;

    if (!itemId || !assetId || !kind || !anchor || !content || !sourceHash) {
      fail('Missing required annotation fields');
    }

    const id = payload.id || randomUUID();
    const now = nowUtc();

    const anchorJson = JSON.stringify(anchor);
    const contentJson = JSON.stringify(content);
    const styleJson = style ? JSON.stringify(style) : null;

    let created;
    // Use BEGIN IMMEDIATE for write isolation
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        INSERT INTO annotations
          (id, item_id, asset_id, kind, anchor_json, content_json, style_json,
           source_sha256, revision, lifecycle, created_at_utc, updated_at_utc, deleted_at_utc)
        VALUES (?,?,?,?,?,?,?,?,1,'active',?,?,NULL)
      `).run(id, itemId, assetId, kind, anchorJson, contentJson, styleJson, sourceHash, now, now);
      db.exec('COMMIT');
      created = rowToAnnotation(db.prepare('SELECT * FROM annotations WHERE id=?').get(id));
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    exportRecoveryFile(itemId);
    if (searchStore) {
      try { searchStore.indexAnnotation(created); } catch {}
    }
    return created;
  }

  function updateAnnotation(id, patch, expectedRevision) {
    if (typeof id !== 'string' || !id) fail('Invalid annotation id');
    if (typeof expectedRevision !== 'number') fail('expectedRevision required');

    let updated;
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare('SELECT * FROM annotations WHERE id=?').get(id);
      if (!row) fail('Annotation not found', 404);
      if (row.deleted_at_utc) fail('Cannot update a deleted annotation', 409);
      if (row.revision !== expectedRevision) {
        fail(`Revision conflict: expected ${expectedRevision}, found ${row.revision}`, 409);
      }

      const newContent = patch.content !== undefined
        ? JSON.stringify(patch.content)
        : row.content_json;
      const newStyle = patch.style !== undefined
        ? JSON.stringify(patch.style)
        : row.style_json;
      const newLifecycle = patch.lifecycle ?? 'active';
      const now = nowUtc();

      db.prepare(`
        UPDATE annotations
        SET content_json=?, style_json=?, lifecycle=?, revision=revision+1, updated_at_utc=?
        WHERE id=?
      `).run(newContent, newStyle, newLifecycle, now, id);
      db.exec('COMMIT');
      updated = rowToAnnotation(db.prepare('SELECT * FROM annotations WHERE id=?').get(id));
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    exportRecoveryFile(updated.itemId);
    if (searchStore) {
      try { searchStore.indexAnnotation(updated); } catch {}
    }
    return updated;
  }

  function deleteAnnotation(id, expectedRevision) {
    if (typeof id !== 'string' || !id) fail('Invalid annotation id');
    if (typeof expectedRevision !== 'number') fail('expectedRevision required');

    let itemId;
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare('SELECT * FROM annotations WHERE id=?').get(id);
      if (!row) fail('Annotation not found', 404);
      if (row.deleted_at_utc) return { ok: true, alreadyDeleted: true };
      if (row.revision !== expectedRevision) {
        fail(`Revision conflict: expected ${expectedRevision}, found ${row.revision}`, 409);
      }
      const now = nowUtc();
      db.prepare(`
        UPDATE annotations
        SET deleted_at_utc=?, lifecycle='soft-deleted', revision=revision+1, updated_at_utc=?
        WHERE id=?
      `).run(now, now, id);
      db.exec('COMMIT');
      itemId = row.item_id;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    exportRecoveryFile(itemId);
    if (searchStore) {
      try { searchStore.removeAnnotation(id); } catch {}
    }
    return { ok: true };
  }

  function restoreAnnotation(id, expectedRevision) {
    if (typeof id !== 'string' || !id) fail('Invalid annotation id');

    let restored;
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare('SELECT * FROM annotations WHERE id=?').get(id);
      if (!row) fail('Annotation not found', 404);
      if (!row.deleted_at_utc) return rowToAnnotation(row); // nothing to restore
      if (typeof expectedRevision === 'number' && row.revision !== expectedRevision) {
        fail(`Revision conflict: expected ${expectedRevision}, found ${row.revision}`, 409);
      }
      const now = nowUtc();
      db.prepare(`
        UPDATE annotations
        SET deleted_at_utc=NULL, lifecycle='active', revision=revision+1, updated_at_utc=?
        WHERE id=?
      `).run(now, id);
      db.exec('COMMIT');
      restored = rowToAnnotation(db.prepare('SELECT * FROM annotations WHERE id=?').get(id));
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    exportRecoveryFile(restored.itemId);
    if (searchStore) {
      try { searchStore.indexAnnotation(restored); } catch {}
    }
    return restored;
  }

  function batchCreateAnnotations(items) {
    if (!Array.isArray(items) || items.length === 0) fail('items must be a non-empty array');

    const created = [];
    const now = nowUtc();

    db.exec('BEGIN IMMEDIATE');
    try {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO annotations
          (id, item_id, asset_id, kind, anchor_json, content_json, style_json,
           source_sha256, revision, lifecycle, created_at_utc, updated_at_utc, deleted_at_utc)
        VALUES (?,?,?,?,?,?,?,?,1,'active',?,?,NULL)
      `);
      for (const p of items) {
        const id = p.id || randomUUID();
        stmt.run(
          id, p.itemId, p.assetId, p.kind,
          JSON.stringify(p.anchor), JSON.stringify(p.content),
          p.style ? JSON.stringify(p.style) : null,
          p.sourceHash, now, now,
        );
        created.push(id);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    // Export per unique itemId
    const itemIds = [...new Set(items.map((p) => p.itemId))];
    for (const iid of itemIds) exportRecoveryFile(iid);

    if (searchStore) {
      for (const id of created) {
        try {
          const row = db.prepare('SELECT * FROM annotations WHERE id=?').get(id);
          if (row) searchStore.indexAnnotation(rowToAnnotation(row));
        } catch {}
      }
    }

    return { ok: true, count: created.length, ids: created };
  }

  /**
   * Verify source hash of existing annotations against the current document hash.
   * Returns a list of mismatched annotation IDs with expected vs actual hashes.
   */
  function checkSourceHashMismatches(itemId, currentSourceHash) {
    const rows = db
      .prepare("SELECT id, source_sha256 FROM annotations WHERE item_id=? AND deleted_at_utc IS NULL")
      .all(itemId);
    return rows
      .filter((r) => r.source_sha256 !== currentSourceHash)
      .map((r) => ({
        annotationId: r.id,
        expectedHash: r.source_sha256,
        actualHash: currentSourceHash,
      }));
  }

  /**
   * Rebuild from external recovery file if the DB annotations are gone.
   * ONLY used after a DB reset — does NOT overwrite existing rows (INSERT OR IGNORE).
   */
  function recoverFromExternalFile(itemId) {
    const recoveryPath = join(userDataRoot, 'items', itemId, 'annotations.json');
    if (!existsSync(recoveryPath)) return { ok: true, recovered: 0 };

    let data;
    try {
      data = JSON.parse(readFileSync(recoveryPath, 'utf8'));
    } catch {
      return { ok: false, error: 'Failed to parse recovery file' };
    }

    if (!Array.isArray(data.annotations)) return { ok: false, error: 'Invalid recovery file format' };

    let count = 0;
    db.exec('BEGIN IMMEDIATE');
    try {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO annotations
          (id, item_id, asset_id, kind, anchor_json, content_json, style_json,
           source_sha256, revision, lifecycle, created_at_utc, updated_at_utc, deleted_at_utc)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      for (const a of data.annotations) {
        stmt.run(
          a.id, a.itemId, a.assetId, a.kind,
          JSON.stringify(a.anchor), JSON.stringify(a.content),
          a.style ? JSON.stringify(a.style) : null,
          a.sourceHash, a.revision, a.lifecycle,
          a.createdAt, a.updatedAt, a.deletedAt ?? null,
        );
        count++;
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      return { ok: false, error: String(err) };
    }

    return { ok: true, recovered: count };
  }

  function close() {
    db.close();
  }

  return {
    getAnnotations,
    listAnnotations: getAnnotations,
    getAnnotation,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    restoreAnnotation,
    batchCreateAnnotations,
    checkSourceHashMismatches,
    recoverFromExternalFile,
    close,
  };
}
