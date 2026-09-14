/**
 * Canvas Store — Server-side canonical canvas persistence.
 * Phase 10 — Book-Linked Excalidraw Notes.
 *
 * Architecture:
 *   - SQLite (read-watch.sqlite3) is canonical for canvas metadata and deep links.
 *   - External file-first storage (user-data/canvases/:canvasId/canvas.json) stores scene and elements.
 *   - All mutations use BEGIN IMMEDIATE transactions for isolation.
 *   - Optimistic concurrency: expectedRevision mismatch returns 409 Conflict.
 *   - Atomic write-temp-then-rename for crash-proof durability.
 *   - External recovery mirror (recovery.json) and bounded history (history/*.json, cap=50).
 *   - Zero cloud, 100% offline, zero source book writes.
 */

import {
  mkdirSync,
  renameSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { basename, dirname, join, extname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// SQL DDL
// ---------------------------------------------------------------------------

const DDL_CANVASES = `
CREATE TABLE IF NOT EXISTS canvases (
  id                      TEXT PRIMARY KEY,
  item_id                 TEXT,
  title                   TEXT NOT NULL DEFAULT '',
  document_relative_path  TEXT NOT NULL UNIQUE,
  revision                INTEGER NOT NULL DEFAULT 1,
  lifecycle               TEXT NOT NULL DEFAULT 'active',
  created_at_utc          TEXT NOT NULL,
  updated_at_utc          TEXT NOT NULL,
  deleted_at_utc          TEXT,
  FOREIGN KEY (item_id) REFERENCES items(id)
);
CREATE INDEX IF NOT EXISTS idx_canvases_item_active
  ON canvases(item_id, deleted_at_utc);

CREATE TABLE IF NOT EXISTS canvas_links (
  id             TEXT PRIMARY KEY,
  canvas_id      TEXT NOT NULL,
  element_id     TEXT NOT NULL,
  item_id        TEXT NOT NULL,
  annotation_id  TEXT,
  anchor_json    TEXT,
  label          TEXT,
  created_at_utc TEXT NOT NULL,
  FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (annotation_id) REFERENCES annotations(id) ON DELETE SET NULL,
  UNIQUE(canvas_id, element_id, item_id, annotation_id)
);
CREATE INDEX IF NOT EXISTS idx_canvas_links_canvas ON canvas_links(canvas_id);
CREATE INDEX IF NOT EXISTS idx_canvas_links_item ON canvas_links(item_id);
CREATE INDEX IF NOT EXISTS idx_canvas_links_annotation ON canvas_links(annotation_id);

CREATE TABLE IF NOT EXISTS canvas_assets (
  id             TEXT PRIMARY KEY,
  canvas_id      TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL,
  sha256         TEXT NOT NULL,
  original_name  TEXT NOT NULL,
  relative_path  TEXT NOT NULL,
  created_at_utc TEXT NOT NULL,
  FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_canvas_assets_canvas ON canvas_assets(canvas_id);
`;

const CANVAS_HISTORY_CAP = 50;

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

function writeAtomicBinary(target, buffer) {
  mkdirSync(dirname(target), { recursive: true });
  const tmp = join(
    dirname(target),
    `.${basename(target)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  );
  writeFileSync(tmp, buffer);
  renameSync(tmp, target);
}

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function nowUtc() {
  return new Date().toISOString();
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCanvasStore({ databasePath, userDataRoot }) {
  const db = new DatabaseSync(databasePath, { readOnly: false, allowExtension: false });
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(DDL_CANVASES);

  // Directory resolution
  function canvasDir(canvasId) {
    return join(userDataRoot, 'canvases', canvasId);
  }

  function canvasDocPath(canvasId) {
    return join(canvasDir(canvasId), 'canvas.json');
  }

  function canvasRecoveryPath(canvasId) {
    return join(canvasDir(canvasId), 'recovery.json');
  }

  function canvasHistoryDir(canvasId) {
    return join(canvasDir(canvasId), 'history');
  }

  function canvasAssetsDir(canvasId) {
    return join(canvasDir(canvasId), 'assets');
  }

  // Row mapping
  function rowToMetadata(row) {
    return {
      schemaVersion: 1,
      id: row.id,
      itemId: row.item_id,
      title: row.title,
      documentRelativePath: row.document_relative_path,
      revision: row.revision,
      lifecycle: row.lifecycle,
      createdAt: row.created_at_utc,
      updatedAt: row.updated_at_utc,
      deletedAt: row.deleted_at_utc ?? null,
    };
  }

  function rowToLink(row) {
    return {
      id: row.id,
      canvasId: row.canvas_id,
      elementId: row.element_id,
      itemId: row.item_id,
      annotationId: row.annotation_id ?? null,
      anchorJson: row.anchor_json ?? null,
      label: row.label ?? undefined,
      createdAt: row.created_at_utc,
    };
  }

  function rowToAsset(row) {
    return {
      id: row.id,
      canvasId: row.canvas_id,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      sha256: row.sha256,
      originalName: row.original_name,
      relativePath: row.relative_path,
      createdAt: row.created_at_utc,
    };
  }

  // File persistence helpers
  function saveDocumentFile(doc) {
    const filePath = canvasDocPath(doc.canvasId);
    const content = JSON.stringify(doc, null, 2);
    writeAtomic(filePath, content);

    // Save recovery mirror
    const recoveryPath = canvasRecoveryPath(doc.canvasId);
    writeAtomic(recoveryPath, content);

    // Save history snapshot (bounded to 50)
    const hDir = canvasHistoryDir(doc.canvasId);
    mkdirSync(hDir, { recursive: true });
    const hPath = join(hDir, `rev-${String(doc.revision).padStart(6, '0')}.json`);
    writeAtomic(hPath, content);

    // Prune history if exceeds cap
    try {
      const files = readdirSync(hDir).filter((f) => f.endsWith('.json')).sort();
      if (files.length > CANVAS_HISTORY_CAP) {
        const toDelete = files.slice(0, files.length - CANVAS_HISTORY_CAP);
        for (const f of toDelete) {
          try {
            unlinkSync(join(hDir, f));
          } catch {}
        }
      }
    } catch {}
  }

  function readDocumentFile(canvasId) {
    const docPath = canvasDocPath(canvasId);
    if (existsSync(docPath)) {
      try {
        return JSON.parse(readFileSync(docPath, 'utf8'));
      } catch (err) {
        // Try recovery snapshot if primary file is corrupt
        const recPath = canvasRecoveryPath(canvasId);
        if (existsSync(recPath)) {
          try {
            return JSON.parse(readFileSync(recPath, 'utf8'));
          } catch {}
        }
        throw err;
      }
    }

    // Try recovery if docPath does not exist
    const recPath = canvasRecoveryPath(canvasId);
    if (existsSync(recPath)) {
      return JSON.parse(readFileSync(recPath, 'utf8'));
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** List canvas metadata records. */
  function listCanvases({ itemId = null, includeDeleted = false } = {}) {
    let sql = 'SELECT * FROM canvases WHERE 1=1';
    const params = [];

    if (itemId !== null && itemId !== undefined) {
      sql += ' AND item_id = ?';
      params.push(itemId);
    }
    if (!includeDeleted) {
      sql += ' AND deleted_at_utc IS NULL';
    }
    sql += ' ORDER BY updated_at_utc DESC';

    const rows = db.prepare(sql).all(...params);
    return rows.map(rowToMetadata);
  }

  /** Get canvas metadata by ID. */
  function getCanvasMetadata(canvasId) {
    if (typeof canvasId !== 'string' || !canvasId) fail('Invalid canvasId');
    const row = db.prepare('SELECT * FROM canvases WHERE id = ?').get(canvasId);
    if (!row) fail('Canvas not found', 404);
    return rowToMetadata(row);
  }

  /** Get complete canvas document (metadata + scene + links + assets). */
  function getCanvas(canvasId) {
    const meta = getCanvasMetadata(canvasId);
    let doc = readDocumentFile(canvasId);

    // Get live links and assets from SQLite
    const linkRows = db.prepare('SELECT * FROM canvas_links WHERE canvas_id = ?').all(canvasId);
    const assetRows = db.prepare('SELECT * FROM canvas_assets WHERE canvas_id = ?').all(canvasId);

    const links = linkRows.map(rowToLink);
    const assets = assetRows.map(rowToAsset);

    if (!doc) {
      // Reconstruct minimal document if file is missing
      doc = {
        schemaVersion: 1,
        canvasId: meta.id,
        itemId: meta.itemId,
        title: meta.title,
        revision: meta.revision,
        lifecycle: meta.lifecycle,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        deletedAt: meta.deletedAt,
        scene: { elements: [], appState: {}, files: {} },
        links,
        assets,
      };
      saveDocumentFile(doc);
    } else {
      doc.title = meta.title;
      doc.itemId = meta.itemId;
      doc.revision = meta.revision;
      doc.lifecycle = meta.lifecycle;
      doc.deletedAt = meta.deletedAt;
      doc.links = links;
      doc.assets = assets;
    }

    return doc;
  }

  /** Create a new canvas attached to an item or standalone. */
  function createCanvas({ id, itemId = null, title = 'Untitled Canvas', scene = null }) {
    const canvasId = id || randomUUID();
    const cleanTitle = (title || 'Untitled Canvas').trim().slice(0, 500);
    const relPath = `canvases/${canvasId}/canvas.json`;
    const now = nowUtc();

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        INSERT INTO canvases
          (id, item_id, title, document_relative_path, revision, lifecycle, created_at_utc, updated_at_utc, deleted_at_utc)
        VALUES (?, ?, ?, ?, 1, 'active', ?, ?, NULL)
      `).run(canvasId, itemId, cleanTitle, relPath, now, now);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const doc = {
      schemaVersion: 1,
      canvasId,
      itemId,
      title: cleanTitle,
      revision: 1,
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      scene: scene || { elements: [], appState: { viewBackgroundColor: '#ffffff' }, files: {} },
      links: [],
      assets: [],
    };

    saveDocumentFile(doc);
    return doc;
  }

  /** Update canvas scene, links, and optional metadata with optimistic concurrency. */
  function updateCanvas(canvasId, payload, expectedRevision) {
    if (typeof canvasId !== 'string' || !canvasId) fail('Invalid canvasId');
    if (typeof expectedRevision !== 'number') fail('expectedRevision required for update', 400);

    let updatedMeta;
    const now = nowUtc();

    db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare('SELECT * FROM canvases WHERE id = ?').get(canvasId);
      if (!row) fail('Canvas not found', 404);
      if (row.deleted_at_utc) fail('Cannot update a deleted canvas', 409);
      if (row.revision !== expectedRevision) {
        fail(`Revision conflict: expected ${expectedRevision}, found ${row.revision}`, 409);
      }

      const newTitle = payload.title !== undefined ? payload.title.slice(0, 500) : row.title;
      const newRevision = row.revision + 1;

      db.prepare(`
        UPDATE canvases
        SET title = ?, revision = ?, updated_at_utc = ?
        WHERE id = ?
      `).run(newTitle, newRevision, now, canvasId);

      // Synchronize canvas_links if provided
      if (Array.isArray(payload.links)) {
        db.prepare('DELETE FROM canvas_links WHERE canvas_id = ?').run(canvasId);
        const insertLink = db.prepare(`
          INSERT OR REPLACE INTO canvas_links
            (id, canvas_id, element_id, item_id, annotation_id, anchor_json, label, created_at_utc)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const l of payload.links) {
          const lid = l.id || randomUUID();
          insertLink.run(
            lid,
            canvasId,
            l.elementId,
            l.itemId,
            l.annotationId ?? null,
            l.anchorJson ?? null,
            l.label ?? null,
            l.createdAt || now,
          );
        }
      }

      db.exec('COMMIT');
      updatedMeta = rowToMetadata(db.prepare('SELECT * FROM canvases WHERE id = ?').get(canvasId));
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    // Build and save updated document
    const linkRows = db.prepare('SELECT * FROM canvas_links WHERE canvas_id = ?').all(canvasId);
    const assetRows = db.prepare('SELECT * FROM canvas_assets WHERE canvas_id = ?').all(canvasId);

    const doc = {
      schemaVersion: 1,
      canvasId: updatedMeta.id,
      itemId: updatedMeta.itemId,
      title: updatedMeta.title,
      revision: updatedMeta.revision,
      lifecycle: updatedMeta.lifecycle,
      createdAt: updatedMeta.createdAt,
      updatedAt: updatedMeta.updatedAt,
      deletedAt: updatedMeta.deletedAt,
      scene: payload.scene || { elements: [] },
      links: linkRows.map(rowToLink),
      assets: assetRows.map(rowToAsset),
    };

    saveDocumentFile(doc);
    return doc;
  }

  /** Rename / update canvas title without modifying scene. */
  function renameCanvas(canvasId, newTitle, expectedRevision) {
    if (typeof canvasId !== 'string' || !canvasId) fail('Invalid canvasId');
    if (typeof expectedRevision !== 'number') fail('expectedRevision required', 400);

    const cleanTitle = (newTitle || 'Untitled Canvas').trim().slice(0, 500);
    const now = nowUtc();
    let updatedMeta;

    db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare('SELECT * FROM canvases WHERE id = ?').get(canvasId);
      if (!row) fail('Canvas not found', 404);
      if (row.deleted_at_utc) fail('Cannot rename a deleted canvas', 409);
      if (row.revision !== expectedRevision) {
        fail(`Revision conflict: expected ${expectedRevision}, found ${row.revision}`, 409);
      }

      db.prepare(`
        UPDATE canvases
        SET title = ?, revision = revision + 1, updated_at_utc = ?
        WHERE id = ?
      `).run(cleanTitle, now, canvasId);

      db.exec('COMMIT');
      updatedMeta = rowToMetadata(db.prepare('SELECT * FROM canvases WHERE id = ?').get(canvasId));
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    // Update document file
    const doc = readDocumentFile(canvasId);
    if (doc) {
      doc.title = cleanTitle;
      doc.revision = updatedMeta.revision;
      doc.updatedAt = updatedMeta.updatedAt;
      saveDocumentFile(doc);
    }

    return updatedMeta;
  }

  /** Soft-delete a canvas. */
  function deleteCanvas(canvasId, expectedRevision) {
    if (typeof canvasId !== 'string' || !canvasId) fail('Invalid canvasId');
    if (typeof expectedRevision !== 'number') fail('expectedRevision required', 400);

    const now = nowUtc();
    let updatedMeta;

    db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare('SELECT * FROM canvases WHERE id = ?').get(canvasId);
      if (!row) fail('Canvas not found', 404);
      if (row.deleted_at_utc) return { ok: true, alreadyDeleted: true };
      if (row.revision !== expectedRevision) {
        fail(`Revision conflict: expected ${expectedRevision}, found ${row.revision}`, 409);
      }

      db.prepare(`
        UPDATE canvases
        SET deleted_at_utc = ?, lifecycle = 'soft-deleted', revision = revision + 1, updated_at_utc = ?
        WHERE id = ?
      `).run(now, now, canvasId);

      db.exec('COMMIT');
      updatedMeta = rowToMetadata(db.prepare('SELECT * FROM canvases WHERE id = ?').get(canvasId));
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const doc = readDocumentFile(canvasId);
    if (doc) {
      doc.lifecycle = 'soft-deleted';
      doc.deletedAt = now;
      doc.revision = updatedMeta.revision;
      doc.updatedAt = now;
      saveDocumentFile(doc);
    }

    return { ok: true, metadata: updatedMeta };
  }

  /** Restore a soft-deleted canvas. */
  function restoreCanvas(canvasId, expectedRevision) {
    if (typeof canvasId !== 'string' || !canvasId) fail('Invalid canvasId');

    const now = nowUtc();
    let updatedMeta;

    db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare('SELECT * FROM canvases WHERE id = ?').get(canvasId);
      if (!row) fail('Canvas not found', 404);
      if (!row.deleted_at_utc) return rowToMetadata(row);
      if (typeof expectedRevision === 'number' && row.revision !== expectedRevision) {
        fail(`Revision conflict: expected ${expectedRevision}, found ${row.revision}`, 409);
      }

      db.prepare(`
        UPDATE canvases
        SET deleted_at_utc = NULL, lifecycle = 'active', revision = revision + 1, updated_at_utc = ?
        WHERE id = ?
      `).run(now, canvasId);

      db.exec('COMMIT');
      updatedMeta = rowToMetadata(db.prepare('SELECT * FROM canvases WHERE id = ?').get(canvasId));
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const doc = readDocumentFile(canvasId);
    if (doc) {
      doc.lifecycle = 'active';
      doc.deletedAt = null;
      doc.revision = updatedMeta.revision;
      doc.updatedAt = now;
      saveDocumentFile(doc);
    }

    return updatedMeta;
  }

  /** Add or replace a bidirectional canvas link. */
  function addCanvasLink(canvasId, link) {
    const { elementId, itemId, annotationId = null, anchorJson = null, label = null } = link;
    if (!elementId || !itemId) fail('elementId and itemId are required for canvas link');

    const id = link.id || randomUUID();
    const now = nowUtc();

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        INSERT OR REPLACE INTO canvas_links
          (id, canvas_id, element_id, item_id, annotation_id, anchor_json, label, created_at_utc)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, canvasId, elementId, itemId, annotationId, anchorJson, label, now);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    return rowToLink(db.prepare('SELECT * FROM canvas_links WHERE id = ?').get(id));
  }

  /** Remove a specific canvas link by ID. */
  function removeCanvasLink(linkId) {
    db.prepare('DELETE FROM canvas_links WHERE id = ?').run(linkId);
    return { ok: true };
  }

  /** Get all links for a canvas. */
  function getCanvasLinks(canvasId) {
    const rows = db.prepare('SELECT * FROM canvas_links WHERE canvas_id = ?').all(canvasId);
    return rows.map(rowToLink);
  }

  /** Get all canvas links pointing to a specific book item. */
  function getLinksForItem(itemId) {
    const rows = db.prepare('SELECT * FROM canvas_links WHERE item_id = ?').all(itemId);
    return rows.map(rowToLink);
  }

  /** Get all canvas links pointing to a specific annotation. */
  function getLinksForAnnotation(annotationId) {
    const rows = db.prepare('SELECT * FROM canvas_links WHERE annotation_id = ?').all(annotationId);
    return rows.map(rowToLink);
  }

  /** Save an image asset for a canvas. */
  function saveCanvasAsset(canvasId, { originalName, mimeType, buffer }) {
    if (!buffer || buffer.length === 0) fail('Asset buffer cannot be empty');
    const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!ALLOWED.includes(mimeType)) {
      fail(`Unsupported asset mimeType: ${mimeType}`);
    }
    if (buffer.length > 10 * 1024 * 1024) {
      fail('Asset exceeds 10MB limit');
    }

    const sha256 = sha256Buffer(buffer);
    const id = sha256.slice(0, 32);
    const ext = extname(originalName) || (mimeType === 'image/png' ? '.png' : '.jpg');
    const filename = `${id}${ext}`;
    const relPath = `canvases/${canvasId}/assets/${filename}`;
    const absPath = join(canvasAssetsDir(canvasId), filename);
    const now = nowUtc();

    writeAtomicBinary(absPath, buffer);

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        INSERT OR REPLACE INTO canvas_assets
          (id, canvas_id, mime_type, size_bytes, sha256, original_name, relative_path, created_at_utc)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, canvasId, mimeType, buffer.length, sha256, originalName, relPath, now);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    return rowToAsset(db.prepare('SELECT * FROM canvas_assets WHERE id = ?').get(id));
  }

  /** Read an image asset buffer and metadata. */
  function getCanvasAsset(canvasId, assetId) {
    const row = db.prepare('SELECT * FROM canvas_assets WHERE canvas_id = ? AND id = ?').get(canvasId, assetId);
    if (!row) fail('Asset not found', 404);
    const absPath = join(userDataRoot, row.relative_path);
    if (!existsSync(absPath)) fail('Asset file missing on disk', 404);
    const buffer = readFileSync(absPath);
    return {
      meta: rowToAsset(row),
      buffer,
    };
  }

  /** Full standalone export package for a canvas. */
  function exportCanvas(canvasId) {
    const doc = getCanvas(canvasId);
    const assetsWithData = doc.assets.map((a) => {
      try {
        const { buffer } = getCanvasAsset(canvasId, a.id);
        return {
          ...a,
          dataBase64: buffer.toString('base64'),
        };
      } catch {
        return a;
      }
    });

    return {
      schemaVersion: 1,
      format: 'read-watch-canvas-export',
      exportedAt: nowUtc(),
      document: {
        ...doc,
        assets: assetsWithData,
      },
    };
  }

  /** Restore / Import a canvas from an export package. */
  function importCanvas(exportPackage, { newId = false } = {}) {
    if (!exportPackage || exportPackage.schemaVersion !== 1 || !exportPackage.document) {
      fail('Invalid canvas export package format');
    }

    const sourceDoc = exportPackage.document;
    const targetCanvasId = newId ? randomUUID() : sourceDoc.canvasId;
    const existing = db.prepare('SELECT id FROM canvases WHERE id = ?').get(targetCanvasId);
    if (existing && !newId) {
      fail(`Canvas ${targetCanvasId} already exists. Use newId: true to import as copy.`, 409);
    }

    createCanvas({
      id: targetCanvasId,
      itemId: sourceDoc.itemId,
      title: sourceDoc.title,
      scene: sourceDoc.scene,
    });

    // Restore links
    if (Array.isArray(sourceDoc.links)) {
      for (const l of sourceDoc.links) {
        addCanvasLink(targetCanvasId, {
          ...l,
          id: randomUUID(),
          canvasId: targetCanvasId,
        });
      }
    }

    // Restore assets
    if (Array.isArray(sourceDoc.assets)) {
      for (const a of sourceDoc.assets) {
        if (a.dataBase64) {
          const buf = Buffer.from(a.dataBase64, 'base64');
          saveCanvasAsset(targetCanvasId, {
            originalName: a.originalName,
            mimeType: a.mimeType,
            buffer: buf,
          });
        }
      }
    }

    return getCanvas(targetCanvasId);
  }

  /** Recover a canvas from external recovery file into DB if missing. */
  function recoverCanvasFromExternal(canvasId) {
    const doc = readDocumentFile(canvasId);
    if (!doc) fail('No external canvas file found to recover from', 404);

    const existing = db.prepare('SELECT * FROM canvases WHERE id = ?').get(canvasId);
    if (existing) {
      return { ok: true, message: 'Canvas already present in database', canvas: rowToMetadata(existing) };
    }

    const now = nowUtc();
    const relPath = `canvases/${canvasId}/canvas.json`;

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        INSERT INTO canvases
          (id, item_id, title, document_relative_path, revision, lifecycle, created_at_utc, updated_at_utc, deleted_at_utc)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        canvasId,
        doc.itemId,
        doc.title || 'Recovered Canvas',
        relPath,
        doc.revision || 1,
        doc.lifecycle || 'active',
        doc.createdAt || now,
        doc.updatedAt || now,
        doc.deletedAt || null,
      );

      if (Array.isArray(doc.links)) {
        const insertLink = db.prepare(`
          INSERT OR IGNORE INTO canvas_links
            (id, canvas_id, element_id, item_id, annotation_id, anchor_json, label, created_at_utc)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const l of doc.links) {
          insertLink.run(
            l.id || randomUUID(),
            canvasId,
            l.elementId,
            l.itemId,
            l.annotationId ?? null,
            l.anchorJson ?? null,
            l.label ?? null,
            l.createdAt || now,
          );
        }
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    return { ok: true, recovered: true, canvas: getCanvasMetadata(canvasId) };
  }

  function close() {
    try {
      db.close();
    } catch {}
  }

  return {
    listCanvases,
    getCanvasMetadata,
    getCanvas,
    createCanvas,
    updateCanvas,
    renameCanvas,
    deleteCanvas,
    restoreCanvas,
    addCanvasLink,
    removeCanvasLink,
    getCanvasLinks,
    getLinksForItem,
    getLinksForAnnotation,
    saveCanvasAsset,
    getCanvasAsset,
    exportCanvas,
    importCanvas,
    recoverCanvasFromExternal,
    close,
  };
}
