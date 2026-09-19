/**
 * Derived Local Search Store (SQLite FTS5).
 *
 * Phase 11 — Search, Annotation Browser, and Study Workflow.
 *
 * Architecture & Ownership:
 *   - The global search index is DERIVED and REBUILDABLE; it is never canonical.
 *   - Canonical stores: SQLite items/annotations/canvases/notes + bookmarks.json.
 *   - Uses SQLite FTS5 directly via node:sqlite DatabaseSync on read-watch.sqlite3.
 *   - No external search engine or cloud services.
 *   - Deleting or corrupting the index does not damage canonical user data.
 *   - Incremental invalidation keeps the index fresh; mutation failures degrade
 *     to 'stale' without rolling back canonical writes.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  buildFtsQuery,
  normalizeQuery,
  parseSnippetTokens,
  MATCH_OPEN_TAG,
  MATCH_CLOSE_TAG,
  MAX_PAGE_SIZE,
} from './search-query.mjs';

export const SEARCH_INDEX_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// SQL DDL for Derived Search Index
// ---------------------------------------------------------------------------

const DDL_SEARCH_TABLES = `
CREATE TABLE IF NOT EXISTS search_index_meta (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS search_index_records (
  id               TEXT PRIMARY KEY,
  kind             TEXT NOT NULL,
  subkind          TEXT,
  item_id          TEXT,
  book_title       TEXT,
  title            TEXT NOT NULL,
  secondary_label  TEXT,
  snippet_preview  TEXT,
  target_json      TEXT NOT NULL,
  source_hash      TEXT,
  updated_at_utc   TEXT,
  created_at_utc   TEXT
);

CREATE INDEX IF NOT EXISTS idx_search_records_kind ON search_index_records(kind);
CREATE INDEX IF NOT EXISTS idx_search_records_subkind ON search_index_records(subkind);
CREATE INDEX IF NOT EXISTS idx_search_records_item ON search_index_records(item_id);
CREATE INDEX IF NOT EXISTS idx_search_records_updated ON search_index_records(updated_at_utc DESC);
`;

const DDL_FTS_VIRTUAL = `
CREATE VIRTUAL TABLE IF NOT EXISTS search_index_fts USING fts5(
  id UNINDEXED,
  kind UNINDEXED,
  subkind UNINDEXED,
  item_id UNINDEXED,
  title,
  secondary_label,
  text_content,
  metadata_text,
  tokenize='unicode61 remove_diacritics 0'
);
`;

// ---------------------------------------------------------------------------
// SearchStore Factory
// ---------------------------------------------------------------------------

export function createSearchStore({
  databasePath,
  userDataRoot,
  libraryDatabase = null,
}) {
  if (!libraryDatabase && databasePath && databasePath !== ':memory:') {
    try {
      mkdirSync(dirname(databasePath), { recursive: true });
    } catch {}
  }

  const db =
    libraryDatabase ||
    new DatabaseSync(databasePath, {
      readOnly: false,
      allowExtension: false,
    });

  // Enable foreign keys and busy timeout
  db.exec('PRAGMA busy_timeout = 5000');

  function initTables() {
    db.exec(DDL_SEARCH_TABLES);
    db.exec(DDL_FTS_VIRTUAL);
  }

  // Ensure tables exist
  initTables();

  // -------------------------------------------------------------------------
  // Meta helpers
  // -------------------------------------------------------------------------

  function getMetaValue(key, fallback = null) {
    try {
      const row = db
        .prepare('SELECT value_json FROM search_index_meta WHERE key = ?')
        .get(key);
      return row ? JSON.parse(row.value_json) : fallback;
    } catch {
      return fallback;
    }
  }

  function setMetaValue(key, value) {
    try {
      db.prepare(
        'INSERT INTO search_index_meta (key, value_json) VALUES (?, ?) ' +
          'ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json',
      ).run(key, JSON.stringify(value));
    } catch (err) {
      console.error('Failed to set search_index_meta:', err);
    }
  }

  function getStatus() {
    try {
      const version = getMetaValue('schema_version', 0);
      const status = getMetaValue('status', 'empty');
      const lastRebuilt = getMetaValue('last_rebuilt_at_utc', null);
      const counts = getMetaValue('counts', {
        items: 0,
        annotations: 0,
        bookmarks: 0,
        canvases: 0,
        notes: 0,
        total: 0,
      });
      const errorMsg = getMetaValue('error_message', null);

      if (version !== SEARCH_INDEX_SCHEMA_VERSION) {
        return {
          schemaVersion: SEARCH_INDEX_SCHEMA_VERSION,
          status: 'stale',
          lastRebuiltAtUtc: lastRebuilt,
          counts,
          errorMessage: 'Index schema version mismatch; rebuild required.',
        };
      }

      return {
        schemaVersion: SEARCH_INDEX_SCHEMA_VERSION,
        status,
        lastRebuiltAtUtc: lastRebuilt,
        counts,
        errorMessage: errorMsg,
      };
    } catch (err) {
      return {
        schemaVersion: SEARCH_INDEX_SCHEMA_VERSION,
        status: 'failed',
        lastRebuiltAtUtc: null,
        counts: { items: 0, annotations: 0, bookmarks: 0, canvases: 0, notes: 0, total: 0 },
        errorMessage: String(err),
      };
    }
  }

  function markStale(errorMessage = null) {
    setMetaValue('status', 'stale');
    if (errorMessage) {
      setMetaValue('error_message', errorMessage);
    }
  }

  // -------------------------------------------------------------------------
  // Rebuild Derived Index
  // -------------------------------------------------------------------------

  function rebuildIndex() {
    initTables();
    setMetaValue('status', 'rebuilding');
    setMetaValue('error_message', null);

    db.exec('BEGIN IMMEDIATE');
    try {
      // Clear derived tables
      db.exec('DROP TABLE IF EXISTS search_index_fts');
      db.exec('DELETE FROM search_index_records');
      db.exec(DDL_FTS_VIRTUAL);

      const counts = {
        items: 0,
        annotations: 0,
        bookmarks: 0,
        canvases: 0,
        notes: 0,
        graphs: 0,
        diagrams: 0,
        total: 0,
      };

      const insertRecord = db.prepare(
        `INSERT INTO search_index_records (
          id, kind, subkind, item_id, book_title, title, secondary_label,
          snippet_preview, target_json, source_hash, updated_at_utc, created_at_utc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      const insertFts = db.prepare(
        `INSERT INTO search_index_fts (
          id, kind, subkind, item_id, title, secondary_label, text_content, metadata_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      // 1. Index Library Items
      const items = db
        .prepare('SELECT id, collection, title, item_type, status, summary, source_added, created_at_utc, updated_at_utc FROM items')
        .all();

      const itemBookTitleMap = new Map();
      for (const item of items) {
        itemBookTitleMap.set(item.id, item.title);
      }

      const tagsByItem = new Map();
      try {
        const tagRows = db
          .prepare('SELECT it.item_id, t.name FROM item_tags it JOIN tags t ON t.id = it.tag_id')
          .all();
        for (const row of tagRows) {
          if (!tagsByItem.has(row.item_id)) tagsByItem.set(row.item_id, []);
          tagsByItem.get(row.item_id).push(row.name);
        }
      } catch {
        // tags table may be empty or missing in test db
      }

      const authorsByItem = new Map();
      try {
        const authorRows = db
          .prepare("SELECT ip.item_id, p.display_name FROM item_people ip JOIN people p ON p.id = ip.person_id WHERE ip.role = 'author'")
          .all();
        for (const row of authorRows) {
          if (!authorsByItem.has(row.item_id)) authorsByItem.set(row.item_id, []);
          authorsByItem.get(row.item_id).push(row.display_name);
        }
      } catch {
        // author tables optional
      }

      for (const item of items) {
        const tags = tagsByItem.get(item.id) || [];
        const authors = authorsByItem.get(item.id) || [];
        const metadataText = [
          item.item_type,
          item.status,
          authors.join(' '),
          tags.join(' '),
        ].filter(Boolean).join(' ');

        const target = {
          type: 'library-item',
          itemId: item.id,
        };

        insertRecord.run(
          item.id,
          'library-item',
          item.collection,
          item.id,
          item.title,
          item.title,
          authors.length > 0 ? authors.join(', ') : item.item_type || item.collection,
          item.summary || '',
          JSON.stringify(target),
          null,
          item.updated_at_utc || item.created_at_utc,
          item.created_at_utc,
        );

        insertFts.run(
          item.id,
          'library-item',
          item.collection,
          item.id,
          item.title,
          authors.join(', '),
          item.summary || '',
          metadataText,
        );

        counts.items++;
        counts.total++;
      }

      // 2. Index Annotations (Active only)
      try {
        const annotations = db
          .prepare("SELECT * FROM annotations WHERE deleted_at_utc IS NULL AND lifecycle != 'soft-deleted'")
          .all();

        for (const ann of annotations) {
          let anchor = {};
          let content = {};
          try {
            anchor = JSON.parse(ann.anchor_json);
          } catch {}
          try {
            content = JSON.parse(ann.content_json);
          } catch {}

          let subkind = ann.kind;
          if (ann.kind === 'text-mark' && content.subKind) {
            subkind = content.subKind; // 'highlight' | 'underline' | 'strike'
          } else if (ann.kind === 'drawing' && content.subKind) {
            subkind = `drawing:${content.subKind}`;
          }

          let textContent = '';
          let title = '';
          let secondaryLabel = '';

          if (ann.kind === 'text-mark') {
            textContent = [anchor.quote, content.note].filter(Boolean).join(' — ');
            title = content.note
              ? content.note.slice(0, 80)
              : anchor.quote
                ? anchor.quote.slice(0, 80)
                : `${subkind} mark`;
            secondaryLabel = anchor.pageNumber ? `Page ${anchor.pageNumber}` : 'Reflowable';
          } else if (ann.kind === 'comment') {
            textContent = [content.body, anchor.quote].filter(Boolean).join(' — ');
            title = content.body ? content.body.slice(0, 80) : 'Comment';
            secondaryLabel = anchor.pageNumber ? `Page ${anchor.pageNumber}` : 'Reflowable';
          } else if (ann.kind === 'excerpt') {
            textContent = [content.passage, content.note].filter(Boolean).join(' — ');
            title = content.passage ? content.passage.slice(0, 80) : 'Excerpt';
            secondaryLabel = anchor.pageNumber ? `Page ${anchor.pageNumber}` : 'Reflowable';
          } else if (ann.kind === 'drawing') {
            textContent = [content.text, content.note].filter(Boolean).join(' — ');
            title = content.text ? content.text.slice(0, 80) : `Drawing: ${content.subKind || 'shape'}`;
            secondaryLabel = anchor.pageNumber ? `Page ${anchor.pageNumber}` : 'Drawing';
          }

          const bookTitle = itemBookTitleMap.get(ann.item_id) || '';
          const target = {
            type: 'annotation',
            itemId: ann.item_id,
            assetId: ann.asset_id,
            annotationId: ann.id,
            anchor,
          };

          insertRecord.run(
            ann.id,
            'annotation',
            subkind,
            ann.item_id,
            bookTitle,
            title,
            secondaryLabel,
            textContent,
            JSON.stringify(target),
            ann.source_sha256,
            ann.updated_at_utc,
            ann.created_at_utc,
          );

          insertFts.run(
            ann.id,
            'annotation',
            subkind,
            ann.item_id,
            title,
            secondaryLabel,
            textContent,
            `${subkind} ${bookTitle}`,
          );

          counts.annotations++;
          counts.total++;
        }
      } catch (annErr) {
        console.warn('Annotation indexing note:', annErr.message);
      }

      // 3. Index Bookmarks
      if (userDataRoot && existsSync(userDataRoot)) {
        try {
          const itemsDir = join(userDataRoot, 'items');
          if (existsSync(itemsDir)) {
            const itemFolders = readdirSync(itemsDir, { withFileTypes: true })
              .filter((d) => d.isDirectory())
              .map((d) => d.name);

            for (const itemId of itemFolders) {
              const bmFile = join(itemsDir, itemId, 'bookmarks.json');
              if (!existsSync(bmFile)) continue;
              try {
                const list = JSON.parse(readFileSync(bmFile, 'utf8'));
                if (!Array.isArray(list)) continue;

                const bookTitle = itemBookTitleMap.get(itemId) || '';
                for (const bm of list) {
                  if (!bm.id || !bm.location) continue;
                  const label = bm.label || `Bookmark at Page ${bm.pageNumber || '?'}`;
                  const secondaryLabel = typeof bm.pageNumber === 'number'
                    ? `Page ${bm.pageNumber}`
                    : bm.progression !== undefined
                    ? `${Math.round(bm.progression * 100)}%`
                    : 'Bookmark';
                  const textContent = [label, bm.snippet].filter(Boolean).join(' ');

                  const target = {
                    type: 'bookmark',
                    itemId,
                    bookmarkId: bm.id,
                    location: bm.location,
                  };

                  insertRecord.run(
                    bm.id,
                    'bookmark',
                    'bookmark',
                    itemId,
                    bookTitle,
                    label,
                    secondaryLabel,
                    bm.snippet || label,
                    JSON.stringify(target),
                    bm.sourceHash || null,
                    bm.createdAt || new Date().toISOString(),
                    bm.createdAt || new Date().toISOString(),
                  );

                  insertFts.run(
                    bm.id,
                    'bookmark',
                    'bookmark',
                    itemId,
                    label,
                    secondaryLabel,
                    textContent,
                    `bookmark ${bookTitle}`,
                  );

                  counts.bookmarks++;
                  counts.total++;
                }
              } catch {}
            }
          }
        } catch (bmErr) {
          console.warn('Bookmark indexing note:', bmErr.message);
        }
      }

      // 4. Index Canvases (Active only)
      try {
        const canvases = db
          .prepare("SELECT id, item_id, title, document_relative_path, created_at_utc, updated_at_utc FROM canvases WHERE deleted_at_utc IS NULL AND lifecycle != 'soft-deleted'")
          .all();

        for (const canvas of canvases) {
          let sceneText = '';
          if (userDataRoot) {
            const canvasPath = join(userDataRoot, canvas.document_relative_path);
            if (existsSync(canvasPath)) {
              try {
                const doc = JSON.parse(readFileSync(canvasPath, 'utf8'));
                const elements = doc.scene?.elements || [];
                const textElements = elements
                  .filter((el) => el.type === 'text' && el.text)
                  .map((el) => el.text);
                const linkLabels = (doc.links || [])
                  .map((l) => l.label)
                  .filter(Boolean);
                const knowledge = doc.knowledge || {};
                const blockText = (knowledge.blocks || [])
                  .map((b) => [b.title, b.body].filter(Boolean).join(' '))
                  .filter(Boolean);
                const relationshipLabels = (knowledge.relationships || [])
                  .map((rel) => rel.label)
                  .filter(Boolean);
                sceneText = [
                  ...textElements,
                  ...linkLabels,
                  ...blockText,
                  ...relationshipLabels,
                ].join(' ');
              } catch {}
            }
          }

          const bookTitle = canvas.item_id ? (itemBookTitleMap.get(canvas.item_id) || '') : '';
          const target = {
            type: 'canvas',
            canvasId: canvas.id,
            itemId: canvas.item_id || undefined,
          };

          const title = canvas.title || 'Untitled Canvas';
          const secondaryLabel =
            canvas.scope_kind === 'location'
              ? `Page/Location canvas${bookTitle ? `: ${bookTitle}` : ''}`
              : canvas.item_id
                ? `Book canvas: ${bookTitle || 'Book'}`
                : 'Standalone Canvas';

          insertRecord.run(
            canvas.id,
            'canvas',
            'canvas',
            canvas.item_id || null,
            bookTitle,
            title,
            secondaryLabel,
            sceneText.slice(0, 300) || title,
            JSON.stringify(target),
            null,
            canvas.updated_at_utc,
            canvas.created_at_utc,
          );

          insertFts.run(
            canvas.id,
            'canvas',
            'canvas',
            canvas.item_id || null,
            title,
            secondaryLabel,
            sceneText,
            `canvas ${bookTitle}`,
          );

          counts.canvases++;
          counts.total++;
        }
      } catch (canvasErr) {
        console.warn('Canvas indexing note:', canvasErr.message);
      }

      // 5. Index Notes
      try {
        const notes = db.prepare('SELECT id, item_id, kind, body_markdown, updated_at_utc, created_at_utc FROM notes').all();
        for (const note of notes) {
          const bookTitle = itemBookTitleMap.get(note.item_id) || '';
          const title = note.kind === 'thoughts' ? 'Reading Thoughts' : 'Book Notes';
          const target = {
            type: 'note',
            itemId: note.item_id,
          };

          insertRecord.run(
            note.id,
            'note',
            note.kind,
            note.item_id,
            bookTitle,
            title,
            note.kind,
            note.body_markdown.slice(0, 200),
            JSON.stringify(target),
            null,
            note.updated_at_utc,
            note.created_at_utc,
          );

          insertFts.run(
            note.id,
            'note',
            note.kind,
            note.item_id,
            title,
            note.kind,
            note.body_markdown,
            `note ${note.kind} ${bookTitle}`,
          );

          counts.notes++;
          counts.total++;
        }
      } catch {
        // notes table optional
      }

      // 6. Index Knowledge Graphs
      try {
        const graphs = db.prepare("SELECT * FROM knowledge_graphs WHERE deleted_at_utc IS NULL").all();
        const nodesStmt = db.prepare("SELECT label, notes FROM knowledge_nodes WHERE graph_id = ? AND deleted_at_utc IS NULL");
        for (const g of graphs) {
          const nodes = nodesStmt.all(g.id);
          const nodeTexts = nodes.map((n) => `${n.label} ${n.notes}`).join(' ');
          const fullText = [g.title, g.description, nodeTexts].filter(Boolean).join(' ');
          const target = {
            type: 'knowledge-graph',
            graphId: g.id,
          };

          const bookTitle = g.associated_item_id ? (itemBookTitleMap.get(g.associated_item_id) || '') : '';
          const secondaryLabel = g.associated_item_id
            ? `${nodes.length} concepts · ${bookTitle || 'Watch title'}`
            : `${nodes.length} concepts`;

          insertRecord.run(
            g.id,
            'knowledge',
            'graph',
            g.associated_item_id || null,
            bookTitle || null,
            g.title,
            secondaryLabel,
            (g.description || nodeTexts).slice(0, 200),
            JSON.stringify(target),
            null,
            g.updated_at_utc,
            g.created_at_utc,
          );

          insertFts.run(
            g.id,
            'knowledge',
            'graph',
            g.associated_item_id || null,
            g.title,
            bookTitle || 'Concept Graph',
            fullText,
            `knowledge graph concept ${g.title} ${bookTitle}`,
          );

          counts.graphs++;
          counts.total++;
        }
      } catch {
        // knowledge_graphs table optional
      }

      // 7. Index Mermaid Diagrams
      try {
        const diagrams = db.prepare("SELECT * FROM mermaid_documents WHERE deleted_at_utc IS NULL").all();
        for (const d of diagrams) {
          const bookTitle = d.associated_item_id ? (itemBookTitleMap.get(d.associated_item_id) || '') : '';
          const fullText = [d.title, d.description, d.source_text].filter(Boolean).join(' ');
          const target = {
            type: 'mermaid-diagram',
            diagramId: d.id,
          };

          insertRecord.run(
            d.id,
            'diagram',
            d.diagram_type,
            d.associated_item_id || null,
            bookTitle,
            d.title,
            d.diagram_type,
            (d.description || d.source_text).slice(0, 200),
            JSON.stringify(target),
            null,
            d.updated_at_utc,
            d.created_at_utc,
          );

          insertFts.run(
            d.id,
            'diagram',
            d.diagram_type,
            d.associated_item_id || null,
            d.title,
            d.diagram_type,
            fullText,
            `diagram mermaid ${d.diagram_type} ${bookTitle}`,
          );

          counts.diagrams++;
          counts.total++;
        }
      } catch {
        // mermaid_documents table optional
      }

      // Commit transaction
      db.exec('COMMIT');

      // Update metadata
      const nowUtc = new Date().toISOString();
      setMetaValue('schema_version', SEARCH_INDEX_SCHEMA_VERSION);
      setMetaValue('status', 'ready');
      setMetaValue('last_rebuilt_at_utc', nowUtc);
      setMetaValue('counts', counts);

      return { ok: true, counts, rebuiltAt: nowUtc };
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      setMetaValue('status', 'failed');
      setMetaValue('error_message', String(err));
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Search & Query
  // -------------------------------------------------------------------------

  function search({
    query = '',
    typeFilter = 'all',
    bookFilter = null,
    limit = 50,
    offset = 0,
  } = {}) {
    const meta = getStatus();
    const cleanLimit = Math.min(Math.max(1, Number(limit) || 50), MAX_PAGE_SIZE);
    const cleanOffset = Math.max(0, Number(offset) || 0);
    const normalized = normalizeQuery(query);

    // Filter clauses for search_index_records
    const whereClauses = [];
    const filterParams = [];

    // Type filter mapping
    if (typeFilter && typeFilter !== 'all') {
      if (typeFilter === 'highlight') {
        whereClauses.push("r.kind = 'annotation' AND r.subkind = 'highlight'");
      } else if (typeFilter === 'underline') {
        whereClauses.push("r.kind = 'annotation' AND r.subkind = 'underline'");
      } else if (typeFilter === 'strike') {
        whereClauses.push("r.kind = 'annotation' AND r.subkind = 'strike'");
      } else if (typeFilter === 'comment') {
        whereClauses.push("r.kind = 'annotation' AND r.subkind = 'comment'");
      } else if (typeFilter === 'excerpt') {
        whereClauses.push("r.kind = 'annotation' AND r.subkind = 'excerpt'");
      } else if (typeFilter === 'drawing') {
        whereClauses.push("r.kind = 'annotation' AND r.subkind LIKE 'drawing%'");
      } else if (typeFilter === 'bookmark') {
        whereClauses.push("r.kind = 'bookmark'");
      } else if (typeFilter === 'canvas') {
        whereClauses.push("r.kind = 'canvas'");
      } else if (typeFilter === 'note') {
        whereClauses.push("r.kind = 'note'");
      } else if (typeFilter === 'library-item') {
        whereClauses.push("r.kind = 'library-item'");
      }
    }

    if (bookFilter) {
      whereClauses.push('r.item_id = ?');
      filterParams.push(bookFilter);
    }

    // 1. Browsing mode (empty query)
    if (!normalized) {
      const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
      const countSql = `SELECT COUNT(*) as total FROM search_index_records r ${whereSql}`;
      let total = 0;
      try {
        const countRow = db.prepare(countSql).get(...filterParams);
        total = countRow ? countRow.total : 0;
      } catch (err) {
        console.error('Count query error in browse mode:', err);
        return { results: [], total: 0, meta };
      }

      const rowsSql = `
        SELECT r.* FROM search_index_records r
        ${whereSql}
        ORDER BY r.updated_at_utc DESC, r.id ASC
        LIMIT ? OFFSET ?
      `;

      let rows = [];
      try {
        rows = db.prepare(rowsSql).all(...filterParams, cleanLimit, cleanOffset);
      } catch (err) {
        console.error('Select query error in browse mode:', err);
        return { results: [], total: 0, meta };
      }

      const results = rows.map((row) => {
        let target = {};
        try {
          target = JSON.parse(row.target_json);
        } catch {}
        const snippetText = row.snippet_preview || '';
        return {
          id: row.id,
          kind: row.kind,
          subkind: row.subkind,
          itemId: row.item_id || undefined,
          bookTitle: row.book_title || undefined,
          title: row.title,
          secondaryLabel: row.secondary_label || undefined,
          snippet: snippetText,
          snippetTokens: parseSnippetTokens(snippetText),
          target,
          sourceHash: row.source_hash || undefined,
          updatedAt: row.updated_at_utc || undefined,
        };
      });

      return { results, total, meta };
    }

    // 2. Full-Text Search mode (FTS5 MATCH)
    const ftsQuery = buildFtsQuery(normalized);
    if (!ftsQuery) {
      return { results: [], total: 0, meta };
    }

    try {
      const matchWhere = ["search_index_fts MATCH ?", ...whereClauses];
      const matchParams = [ftsQuery, ...filterParams];

      const countSql = `
        SELECT COUNT(*) as total
        FROM search_index_fts
        JOIN search_index_records r ON r.id = search_index_fts.id
        WHERE ${matchWhere.join(' AND ')}
      `;

      let total = 0;
      try {
        const countRow = db.prepare(countSql).get(...matchParams);
        total = countRow ? countRow.total : 0;
      } catch (err) {
        console.error('Count query error in FTS mode:', err);
        return { results: [], total: 0, meta };
      }

      const selectSql = `
        SELECT
          r.*,
          search_index_fts.rank as score,
          snippet(search_index_fts, 6, '${MATCH_OPEN_TAG}', '${MATCH_CLOSE_TAG}', '…', 32) as match_snippet
        FROM search_index_fts
        JOIN search_index_records r ON r.id = search_index_fts.id
        WHERE ${matchWhere.join(' AND ')}
        ORDER BY search_index_fts.rank ASC, r.updated_at_utc DESC
        LIMIT ? OFFSET ?
      `;

      const rows = db.prepare(selectSql).all(...matchParams, cleanLimit, cleanOffset);

      const results = rows.map((row) => {
        let target = {};
        try {
          target = JSON.parse(row.target_json);
        } catch {}

        const snippetText = row.match_snippet || row.snippet_preview || '';
        return {
          id: row.id,
          kind: row.kind,
          subkind: row.subkind,
          itemId: row.item_id || undefined,
          bookTitle: row.book_title || undefined,
          title: row.title,
          secondaryLabel: row.secondary_label || undefined,
          snippet: snippetText,
          snippetTokens: parseSnippetTokens(snippetText),
          target,
          sourceHash: row.source_hash || undefined,
          updatedAt: row.updated_at_utc || undefined,
          score: typeof row.score === 'number' ? row.score : undefined,
        };
      });

      return { results, total, meta };
    } catch (err) {
      console.error('FTS search error:', err);
      // Return empty results with diagnostic meta rather than crashing
      return {
        results: [],
        total: 0,
        meta: {
          ...meta,
          errorMessage: 'Search query could not be executed on index',
        },
      };
    }
  }

  // -------------------------------------------------------------------------
  // Filterable Books Helper
  // -------------------------------------------------------------------------

  function getFilterableBooks() {
    try {
      const rows = db
        .prepare(`
          SELECT
            r.item_id as itemId,
            COALESCE(r.book_title, (SELECT title FROM items WHERE id = r.item_id), 'Untitled') as title,
            COUNT(*) as count
          FROM search_index_records r
          WHERE r.item_id IS NOT NULL AND r.kind != 'library-item'
          GROUP BY r.item_id
          ORDER BY count DESC, title ASC
        `)
        .all();
      return rows;
    } catch (err) {
      console.error('Failed to get filterable books:', err);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Incremental Invalidation Helpers
  // -------------------------------------------------------------------------

  function indexItem(item) {
    try {
      db.prepare('DELETE FROM search_index_records WHERE id = ?').run(item.id);
      db.prepare('DELETE FROM search_index_fts WHERE id = ?').run(item.id);

      const target = { type: 'library-item', itemId: item.id };
      db.prepare(
        `INSERT INTO search_index_records (
          id, kind, subkind, item_id, book_title, title, secondary_label,
          snippet_preview, target_json, source_hash, updated_at_utc, created_at_utc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        item.id,
        'library-item',
        item.collection,
        item.id,
        item.title,
        item.title,
        item.item_type || item.collection,
        item.summary || '',
        JSON.stringify(target),
        null,
        item.updated_at_utc || new Date().toISOString(),
        item.created_at_utc || new Date().toISOString(),
      );

      db.prepare(
        `INSERT INTO search_index_fts (
          id, kind, subkind, item_id, title, secondary_label, text_content, metadata_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        item.id,
        'library-item',
        item.collection,
        item.id,
        item.title,
        item.item_type || item.collection,
        item.summary || '',
        `${item.item_type || ''} ${item.status || ''}`,
      );
    } catch (err) {
      console.warn('Incremental item index failure:', err.message);
      markStale(err.message);
    }
  }

  function removeItem(itemId) {
    try {
      db.prepare('DELETE FROM search_index_records WHERE item_id = ?').run(itemId);
      db.prepare('DELETE FROM search_index_fts WHERE item_id = ?').run(itemId);
    } catch (err) {
      console.warn('Incremental item removal failure:', err.message);
      markStale(err.message);
    }
  }

  function indexAnnotation(ann) {
    if (ann.deleted_at_utc || ann.deletedAt || ann.lifecycle === 'soft-deleted') {
      return removeAnnotation(ann.id);
    }
    try {
      db.prepare('DELETE FROM search_index_records WHERE id = ?').run(ann.id);
      db.prepare('DELETE FROM search_index_fts WHERE id = ?').run(ann.id);

      const anchor = typeof ann.anchor === 'object' ? ann.anchor : JSON.parse(ann.anchor_json || '{}');
      const content = typeof ann.content === 'object' ? ann.content : JSON.parse(ann.content_json || '{}');

      let subkind = ann.kind;
      if (ann.kind === 'text-mark' && content.subKind) {
        subkind = content.subKind;
      } else if (ann.kind === 'drawing' && content.subKind) {
        subkind = `drawing:${content.subKind}`;
      }

      let textContent = '';
      let title = '';
      let secondaryLabel = '';

      if (ann.kind === 'text-mark') {
        textContent = [anchor.quote, content.note].filter(Boolean).join(' — ');
        title = content.note
          ? content.note.slice(0, 80)
          : anchor.quote
            ? anchor.quote.slice(0, 80)
            : `${subkind} mark`;
        secondaryLabel = anchor.pageNumber ? `Page ${anchor.pageNumber}` : 'Reflowable';
      } else if (ann.kind === 'comment') {
        textContent = [content.body, anchor.quote].filter(Boolean).join(' — ');
        title = content.body ? content.body.slice(0, 80) : 'Comment';
        secondaryLabel = anchor.pageNumber ? `Page ${anchor.pageNumber}` : 'Reflowable';
      } else if (ann.kind === 'excerpt') {
        textContent = [content.passage, content.note].filter(Boolean).join(' — ');
        title = content.passage ? content.passage.slice(0, 80) : 'Excerpt';
        secondaryLabel = anchor.pageNumber ? `Page ${anchor.pageNumber}` : 'Reflowable';
      } else if (ann.kind === 'drawing') {
        textContent = [content.text, content.note].filter(Boolean).join(' — ');
        title = content.text ? content.text.slice(0, 80) : `Drawing: ${content.subKind || 'shape'}`;
        secondaryLabel = anchor.pageNumber ? `Page ${anchor.pageNumber}` : 'Drawing';
      }

      const bookRow = db.prepare('SELECT title FROM items WHERE id = ?').get(ann.itemId || ann.item_id);
      const bookTitle = bookRow ? bookRow.title : '';

      const target = {
        type: 'annotation',
        itemId: ann.itemId || ann.item_id,
        assetId: ann.assetId || ann.asset_id,
        annotationId: ann.id,
        anchor,
      };

      db.prepare(
        `INSERT INTO search_index_records (
          id, kind, subkind, item_id, book_title, title, secondary_label,
          snippet_preview, target_json, source_hash, updated_at_utc, created_at_utc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        ann.id,
        'annotation',
        subkind,
        ann.itemId || ann.item_id,
        bookTitle,
        title,
        secondaryLabel,
        textContent,
        JSON.stringify(target),
        ann.sourceHash || ann.source_sha256 || null,
        ann.updatedAt || ann.updated_at_utc || new Date().toISOString(),
        ann.createdAt || ann.created_at_utc || new Date().toISOString(),
      );

      db.prepare(
        `INSERT INTO search_index_fts (
          id, kind, subkind, item_id, title, secondary_label, text_content, metadata_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        ann.id,
        'annotation',
        subkind,
        ann.itemId || ann.item_id,
        title,
        secondaryLabel,
        textContent,
        `${subkind} ${bookTitle}`,
      );
    } catch (err) {
      console.warn('Incremental annotation index failure:', err.message);
      markStale(err.message);
    }
  }

  function removeAnnotation(annotationId) {
    try {
      db.prepare('DELETE FROM search_index_records WHERE id = ?').run(annotationId);
      db.prepare('DELETE FROM search_index_fts WHERE id = ?').run(annotationId);
    } catch (err) {
      console.warn('Incremental annotation removal failure:', err.message);
      markStale(err.message);
    }
  }

  function indexBookmark(itemId, bm) {
    try {
      db.prepare('DELETE FROM search_index_records WHERE id = ?').run(bm.id);
      db.prepare('DELETE FROM search_index_fts WHERE id = ?').run(bm.id);

      const bookRow = db.prepare('SELECT title FROM items WHERE id = ?').get(itemId);
      const bookTitle = bookRow ? bookRow.title : '';

      const label = bm.label || `Bookmark at Page ${bm.pageNumber || '?'}`;
      const secondaryLabel = typeof bm.pageNumber === 'number'
        ? `Page ${bm.pageNumber}`
        : bm.progression !== undefined
        ? `${Math.round(bm.progression * 100)}%`
        : 'Bookmark';
      const textContent = [label, bm.snippet].filter(Boolean).join(' ');

      const target = {
        type: 'bookmark',
        itemId,
        bookmarkId: bm.id,
        location: bm.location,
      };

      db.prepare(
        `INSERT INTO search_index_records (
          id, kind, subkind, item_id, book_title, title, secondary_label,
          snippet_preview, target_json, source_hash, updated_at_utc, created_at_utc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        bm.id,
        'bookmark',
        'bookmark',
        itemId,
        bookTitle,
        label,
        secondaryLabel,
        bm.snippet || label,
        JSON.stringify(target),
        bm.sourceHash || null,
        bm.createdAt || new Date().toISOString(),
        bm.createdAt || new Date().toISOString(),
      );

      db.prepare(
        `INSERT INTO search_index_fts (
          id, kind, subkind, item_id, title, secondary_label, text_content, metadata_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        bm.id,
        'bookmark',
        'bookmark',
        itemId,
        label,
        secondaryLabel,
        textContent,
        `bookmark ${bookTitle}`,
      );
    } catch (err) {
      console.warn('Incremental bookmark index failure:', err.message);
      markStale(err.message);
    }
  }

  function removeBookmark(itemId, bookmarkId) {
    try {
      db.prepare('DELETE FROM search_index_records WHERE id = ?').run(bookmarkId);
      db.prepare('DELETE FROM search_index_fts WHERE id = ?').run(bookmarkId);
    } catch (err) {
      console.warn('Incremental bookmark removal failure:', err.message);
      markStale(err.message);
    }
  }

  function indexCanvas(canvasId) {
    try {
      db.prepare('DELETE FROM search_index_records WHERE id = ?').run(canvasId);
      db.prepare('DELETE FROM search_index_fts WHERE id = ?').run(canvasId);

      const canvas = db
        .prepare("SELECT id, item_id, title, document_relative_path, created_at_utc, updated_at_utc, lifecycle FROM canvases WHERE id = ?")
        .get(canvasId);

      if (!canvas || canvas.lifecycle === 'soft-deleted') {
        return;
      }

      let sceneText = '';
      if (userDataRoot) {
        const canvasPath = join(userDataRoot, canvas.document_relative_path);
        if (existsSync(canvasPath)) {
          try {
            const doc = JSON.parse(readFileSync(canvasPath, 'utf8'));
            const elements = doc.scene?.elements || [];
            const textElements = elements
              .filter((el) => el.type === 'text' && el.text)
              .map((el) => el.text);
            const linkLabels = (doc.links || []).map((l) => l.label).filter(Boolean);
            const knowledge = doc.knowledge || {};
            const blockText = (knowledge.blocks || [])
              .map((b) => [b.title, b.body].filter(Boolean).join(' '))
              .filter(Boolean);
            const relationshipLabels = (knowledge.relationships || [])
              .map((rel) => rel.label)
              .filter(Boolean);
            sceneText = [...textElements, ...linkLabels, ...blockText, ...relationshipLabels].join(' ');
          } catch {}
        }
      }

      const bookRow = canvas.item_id ? db.prepare('SELECT title FROM items WHERE id = ?').get(canvas.item_id) : null;
      const bookTitle = bookRow ? bookRow.title : '';

      const target = {
        type: 'canvas',
        canvasId: canvas.id,
        itemId: canvas.item_id || undefined,
      };

      const title = canvas.title || 'Untitled Canvas';
      const scopeLabel =
        canvas.scope_kind === 'location'
          ? `Page/Location canvas${bookTitle ? `: ${bookTitle}` : ''}`
          : canvas.item_id
            ? `Book canvas: ${bookTitle || 'Book'}`
            : 'Standalone Canvas';
      const secondaryLabel = scopeLabel;

      db.prepare(
        `INSERT INTO search_index_records (
          id, kind, subkind, item_id, book_title, title, secondary_label,
          snippet_preview, target_json, source_hash, updated_at_utc, created_at_utc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        canvas.id,
        'canvas',
        'canvas',
        canvas.item_id || null,
        bookTitle,
        title,
        secondaryLabel,
        sceneText.slice(0, 300) || title,
        JSON.stringify(target),
        null,
        canvas.updated_at_utc,
        canvas.created_at_utc,
      );

      db.prepare(
        `INSERT INTO search_index_fts (
          id, kind, subkind, item_id, title, secondary_label, text_content, metadata_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        canvas.id,
        'canvas',
        'canvas',
        canvas.item_id || null,
        title,
        secondaryLabel,
        sceneText,
        `canvas ${bookTitle}`,
      );
    } catch (err) {
      console.warn('Incremental canvas index failure:', err.message);
      markStale(err.message);
    }
  }

  function removeCanvas(canvasId) {
    try {
      db.prepare('DELETE FROM search_index_records WHERE id = ?').run(canvasId);
      db.prepare('DELETE FROM search_index_fts WHERE id = ?').run(canvasId);
    } catch (err) {
      console.warn('Incremental canvas removal failure:', err.message);
      markStale(err.message);
    }
  }

  function indexNote(itemId, kind, content) {
    try {
      const noteId = `${itemId}:${kind}`;
      db.prepare('DELETE FROM search_index_records WHERE id = ?').run(noteId);
      db.prepare('DELETE FROM search_index_fts WHERE id = ?').run(noteId);

      if (!content || !content.trim()) return;

      const bookRow = db.prepare('SELECT title FROM items WHERE id = ?').get(itemId);
      const bookTitle = bookRow ? bookRow.title : '';
      const title = kind === 'thoughts' ? 'Reading Thoughts' : 'Book Notes';
      const target = { type: 'note', itemId };
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO search_index_records (
          id, kind, subkind, item_id, book_title, title, secondary_label,
          snippet_preview, target_json, source_hash, updated_at_utc, created_at_utc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        noteId,
        'note',
        kind,
        itemId,
        bookTitle,
        title,
        kind,
        content.slice(0, 200),
        JSON.stringify(target),
        null,
        now,
        now,
      );

      db.prepare(
        `INSERT INTO search_index_fts (
          id, kind, subkind, item_id, title, secondary_label, text_content, metadata_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        noteId,
        'note',
        kind,
        itemId,
        title,
        kind,
        content,
        `note ${kind} ${bookTitle}`,
      );
    } catch (err) {
      console.warn('Incremental note index failure:', err.message);
      markStale(err.message);
    }
  }

  function removeNote(itemId, kind) {
    try {
      const noteId = `${itemId}:${kind}`;
      db.prepare('DELETE FROM search_index_records WHERE id = ?').run(noteId);
      db.prepare('DELETE FROM search_index_fts WHERE id = ?').run(noteId);
    } catch (err) {
      console.warn('Incremental note removal failure:', err.message);
      markStale(err.message);
    }
  }

  function close() {
    if (!libraryDatabase) {
      try {
        db.close();
      } catch {}
    }
  }

  return {
    getStatus,
    rebuildIndex,
    search,
    getFilterableBooks,
    indexItem,
    removeItem,
    indexAnnotation,
    removeAnnotation,
    indexBookmark,
    removeBookmark,
    indexCanvas,
    removeCanvas,
    indexNote,
    removeNote,
    close,
  };
}
