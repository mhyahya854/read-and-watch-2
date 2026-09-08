import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const COLLECTIONS = new Set(['read', 'watch']);

function parse(value) {
  return JSON.parse(value);
}

function id(prefix, value) {
  return `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

export function createLibraryStore({ databasePath, readOnly = false }) {
  const database = new DatabaseSync(databasePath, {
    readOnly,
    allowExtension: false,
  });
  database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000');

  function itemExists(itemId) {
    return Boolean(
      database.prepare('SELECT 1 FROM items WHERE id=?').get(itemId),
    );
  }

  function getCatalog() {
    const meta = Object.fromEntries(
      database
        .prepare('SELECT key,value_json FROM library_meta')
        .all()
        .map((row) => [row.key, parse(row.value_json)]),
    );
    const rows = database
      .prepare('SELECT * FROM items ORDER BY source_order')
      .all();
    const propertyStatement = database.prepare(
      'SELECT * FROM item_properties WHERE item_id=? ORDER BY namespace,source_order',
    );
    const tagStatement = database.prepare(
      'SELECT t.name FROM item_tags it JOIN tags t ON t.id=it.tag_id WHERE it.item_id=? ORDER BY it.position',
    );
    const mediaStatement = database.prepare(
      "SELECT a.display_name,a.relative_path,a.extension FROM item_assets a JOIN asset_roles r ON r.asset_id=a.id AND r.role='catalog_media' WHERE a.item_id=? ORDER BY a.source_order",
    );
    const relationshipStatement = database.prepare(
      'SELECT target_item_id FROM relationships WHERE source_item_id=? AND target_item_id IS NOT NULL ORDER BY position',
    );
    const items = rows.map((row) => {
      const properties = propertyStatement.all(row.id);
      const internal = Object.fromEntries(
        properties
          .filter(({ namespace }) => namespace === 'catalog_internal')
          .map(({ property_key, value_json }) => [
            property_key,
            parse(value_json),
          ]),
      );
      const notionProperties = Object.fromEntries(
        properties
          .filter(({ namespace }) => namespace === 'notion')
          .map(({ property_key, value_json }) => [
            property_key,
            parse(value_json),
          ]),
      );
      return {
        id: row.id,
        title: row.title,
        collection: row.collection,
        itemPath: row.item_path,
        type: row.item_type,
        status: row.status,
        added: row.source_added,
        tags: tagStatement.all(row.id).map(({ name }) => name),
        summary: row.summary,
        cover: internal.cover ?? null,
        preview: internal.preview ?? null,
        notionProperties,
        media: mediaStatement.all(row.id).map((media) => ({
          name: media.display_name,
          path: media.relative_path,
          extension: media.extension,
        })),
        relationshipIds: relationshipStatement
          .all(row.id)
          .map(({ target_item_id }) => target_item_id),
      };
    });
    const read = items.filter(({ collection }) => collection === 'read').length;
    return {
      schemaVersion: meta.catalog_schema_version,
      generatedFromImportUtc: meta.generated_from_import_utc,
      counts: { read, watch: items.length - read, total: items.length },
      items,
    };
  }

  function queryItems({
    collection,
    status,
    tag,
    search,
    sort = 'title',
    direction = 'asc',
  } = {}) {
    if (collection && !COLLECTIONS.has(collection)) fail('Invalid collection');
    if (!['title', 'added', 'rating', 'updated'].includes(sort))
      fail('Invalid sort');
    if (!['asc', 'desc'].includes(direction)) fail('Invalid direction');
    const clauses = [];
    const values = [];
    if (collection) {
      clauses.push('i.collection=?');
      values.push(collection);
    }
    if (status) {
      clauses.push('i.status=?');
      values.push(status);
    }
    if (tag) {
      clauses.push(
        'EXISTS(SELECT 1 FROM item_tags it JOIN tags t ON t.id=it.tag_id WHERE it.item_id=i.id AND t.name=? COLLATE NOCASE)',
      );
      values.push(tag);
    }
    if (search) {
      clauses.push(
        "(i.title LIKE ? ESCAPE '\\' OR i.summary LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM item_properties p WHERE p.item_id=i.id AND p.value_json LIKE ? ESCAPE '\\'))",
      );
      const escaped = `%${search.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
      values.push(escaped, escaped, escaped);
    }
    const order = {
      title: 'i.title COLLATE NOCASE',
      added: 'i.source_added',
      rating: 'i.rating',
      updated: 'i.updated_at_utc',
    }[sort];
    return database
      .prepare(
        `SELECT i.* FROM items i ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY ${order} ${direction.toUpperCase()},i.id`,
      )
      .all(...values);
  }

  function updateMetadata(itemId, patch, expectedRevision) {
    const allowed = new Map([
      ['title', 'title'],
      ['type', 'item_type'],
      ['status', 'status'],
      ['rating', 'rating'],
      ['summary', 'summary'],
      ['added', 'source_added'],
    ]);
    const changes = Object.entries(patch).filter(([key]) => allowed.has(key));
    if (!changes.length || changes.length !== Object.keys(patch).length) {
      fail('No valid metadata changes');
    }
    database.exec('BEGIN IMMEDIATE');
    try {
      const current = database
        .prepare('SELECT revision FROM items WHERE id=?')
        .get(itemId);
      if (!current) fail('Unknown item ID', 404);
      if (current.revision !== expectedRevision) fail('Metadata conflict', 409);
      const assignments = changes
        .map(([key]) => `${allowed.get(key)}=?`)
        .join(',');
      database
        .prepare(
          `UPDATE items SET ${assignments},revision=revision+1,updated_at_utc=? WHERE id=?`,
        )
        .run(
          ...changes.map(([, value]) => value),
          new Date().toISOString(),
          itemId,
        );
      database.exec('COMMIT');
      return database.prepare('SELECT * FROM items WHERE id=?').get(itemId);
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  function setProperty(itemId, namespace, key, value, expectedRevision) {
    if (!namespace || !key) fail('Property namespace and key are required');
    database.exec('BEGIN IMMEDIATE');
    try {
      const current = database
        .prepare('SELECT revision FROM items WHERE id=?')
        .get(itemId);
      if (!current) fail('Unknown item ID', 404);
      if (current.revision !== expectedRevision) fail('Metadata conflict', 409);
      const valueType =
        value === null
          ? 'null'
          : Array.isArray(value) || typeof value === 'object'
            ? 'json'
            : typeof value;
      const type = ['string', 'number', 'boolean'].includes(valueType)
        ? valueType
        : valueType === 'null'
          ? 'null'
          : 'json';
      database
        .prepare(
          `INSERT INTO item_properties(item_id,namespace,property_key,value_type,value_json,source_order)
         VALUES(?,?,?,?,?,COALESCE((SELECT max(source_order)+1 FROM item_properties WHERE item_id=? AND namespace=?),0))
         ON CONFLICT(item_id,namespace,property_key) DO UPDATE SET value_type=excluded.value_type,value_json=excluded.value_json`,
        )
        .run(
          itemId,
          namespace,
          key,
          type,
          JSON.stringify(value),
          itemId,
          namespace,
        );
      database
        .prepare(
          'UPDATE items SET revision=revision+1,updated_at_utc=? WHERE id=?',
        )
        .run(new Date().toISOString(), itemId);
      database.exec('COMMIT');
      return current.revision + 1;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  function setTags(itemId, tags, expectedRevision) {
    const normalized = [
      ...new Set(tags.map((tag) => tag.trim()).filter(Boolean)),
    ];
    database.exec('BEGIN IMMEDIATE');
    try {
      const current = database
        .prepare('SELECT revision FROM items WHERE id=?')
        .get(itemId);
      if (!current) fail('Unknown item ID', 404);
      if (current.revision !== expectedRevision) fail('Metadata conflict', 409);
      database.prepare('DELETE FROM item_tags WHERE item_id=?').run(itemId);
      normalized.forEach((tag, position) => {
        const tagId = id('tag', tag.toLocaleLowerCase());
        database
          .prepare('INSERT OR IGNORE INTO tags VALUES(?,?)')
          .run(tagId, tag);
        database
          .prepare('INSERT INTO item_tags VALUES(?,?,?)')
          .run(itemId, tagId, position);
      });
      database
        .prepare(
          'UPDATE items SET revision=revision+1,updated_at_utc=? WHERE id=?',
        )
        .run(new Date().toISOString(), itemId);
      database.exec('COMMIT');
      return current.revision + 1;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  function duplicateCandidates() {
    const titles = database
      .prepare(
        `SELECT lower(trim(title)) normalized_title,collection,count(*) item_count,group_concat(id) item_ids
       FROM items GROUP BY collection,lower(trim(title)) HAVING count(*)>1 ORDER BY collection,normalized_title`,
      )
      .all();
    const files = database
      .prepare(
        `SELECT sha256,count(DISTINCT item_id) item_count,group_concat(DISTINCT item_id) item_ids
       FROM item_assets WHERE sha256 IS NOT NULL GROUP BY sha256 HAVING count(DISTINCT item_id)>1 ORDER BY sha256`,
      )
      .all();
    return { titles, files };
  }

  function getFormatInventory(itemId) {
    if (!itemExists(itemId)) fail('Unknown item ID', 404);
    return database
      .prepare(
        `SELECT a.id,a.relative_path,a.display_name,a.format,a.extension,a.byte_size,a.sha256,a.source_sha256,a.is_primary,
              group_concat(r.role) roles
       FROM item_assets a JOIN asset_roles r ON r.asset_id=a.id WHERE a.item_id=?
       GROUP BY a.id ORDER BY a.source_order,a.id`,
      )
      .all(itemId);
  }

  function setPeople(itemId, role, names, expectedRevision) {
    const normalized = [
      ...new Set(names.map((name) => name.trim()).filter(Boolean)),
    ];
    database.exec('BEGIN IMMEDIATE');
    try {
      const current = database
        .prepare('SELECT revision FROM items WHERE id=?')
        .get(itemId);
      if (!current) fail('Unknown item ID', 404);
      if (current.revision !== expectedRevision) fail('Metadata conflict', 409);
      database
        .prepare('DELETE FROM item_people WHERE item_id=? AND role=?')
        .run(itemId, role);
      normalized.forEach((name, position) => {
        const personId = id('person', name.toLocaleLowerCase());
        database
          .prepare('INSERT OR IGNORE INTO people VALUES(?,?,?)')
          .run(personId, name, name);
        database
          .prepare('INSERT INTO item_people VALUES(?,?,?,?)')
          .run(itemId, personId, role, position);
      });
      database
        .prepare(
          'UPDATE items SET revision=revision+1,updated_at_utc=? WHERE id=?',
        )
        .run(new Date().toISOString(), itemId);
      database.exec('COMMIT');
      return current.revision + 1;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  function setSeries(itemId, name, position, expectedRevision) {
    database.exec('BEGIN IMMEDIATE');
    try {
      const current = database
        .prepare('SELECT revision,collection FROM items WHERE id=?')
        .get(itemId);
      if (!current) fail('Unknown item ID', 404);
      if (current.collection !== 'read') fail('Series is Read-specific');
      if (current.revision !== expectedRevision) fail('Metadata conflict', 409);
      database.prepare('DELETE FROM read_series WHERE item_id=?').run(itemId);
      if (name?.trim()) {
        const seriesId = id('series', name.trim().toLocaleLowerCase());
        database
          .prepare('INSERT OR IGNORE INTO series VALUES(?,?,?)')
          .run(seriesId, name.trim(), name.trim());
        database
          .prepare('INSERT INTO read_series VALUES(?,?,?)')
          .run(itemId, seriesId, String(position ?? ''));
      }
      database
        .prepare(
          'UPDATE items SET revision=revision+1,updated_at_utc=? WHERE id=?',
        )
        .run(new Date().toISOString(), itemId);
      database.exec('COMMIT');
      return current.revision + 1;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  function addRelationship(
    sourceItemId,
    targetItemId,
    relationshipType,
    expectedRevision,
  ) {
    database.exec('BEGIN IMMEDIATE');
    try {
      const current = database
        .prepare('SELECT revision FROM items WHERE id=?')
        .get(sourceItemId);
      if (!current || !itemExists(targetItemId)) fail('Unknown item ID', 404);
      if (current.revision !== expectedRevision) fail('Metadata conflict', 409);
      const relationshipId = id(
        'relation',
        `${sourceItemId}\0${targetItemId}\0${relationshipType}`,
      );
      database
        .prepare(
          `INSERT INTO relationships(id,source_item_id,target_item_id,relationship_type,direction,position,provenance_json,created_at_utc)
         VALUES(?,?,?,?, 'directed',COALESCE((SELECT max(position)+1 FROM relationships WHERE source_item_id=?),0),'{}',?)`,
        )
        .run(
          relationshipId,
          sourceItemId,
          targetItemId,
          relationshipType,
          sourceItemId,
          new Date().toISOString(),
        );
      database
        .prepare(
          'UPDATE items SET revision=revision+1,updated_at_utc=? WHERE id=?',
        )
        .run(new Date().toISOString(), sourceItemId);
      database.exec('COMMIT');
      return { id: relationshipId, revision: current.revision + 1 };
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  function saveView(name, definition) {
    const now = new Date().toISOString();
    const viewId = id('view', name.toLocaleLowerCase());
    database
      .prepare(
        `INSERT INTO saved_views VALUES(?,?,?,1,?,?)
       ON CONFLICT(name) DO UPDATE SET definition_json=excluded.definition_json,revision=saved_views.revision+1,updated_at_utc=excluded.updated_at_utc`,
      )
      .run(viewId, name, JSON.stringify(definition), now, now);
    return database
      .prepare('SELECT * FROM saved_views WHERE name=? COLLATE NOCASE')
      .get(name);
  }

  function listViews() {
    return database
      .prepare('SELECT * FROM saved_views ORDER BY name COLLATE NOCASE')
      .all()
      .map((row) => ({ ...row, definition: parse(row.definition_json) }));
  }

  function loadNote(kind, itemId) {
    if (!['thoughts', 'notes'].includes(kind)) fail('Invalid user-data type');
    if (!itemExists(itemId)) fail('Unknown item ID', 404);
    const row = database
      .prepare(
        'SELECT body_markdown,revision FROM notes WHERE item_id=? AND kind=?',
      )
      .get(itemId, kind);
    return row
      ? { content: row.body_markdown, revision: String(row.revision) }
      : { content: null, revision: null };
  }

  function saveNote(kind, itemId, content, baseRevision) {
    if (!['thoughts', 'notes'].includes(kind)) fail('Invalid user-data type');
    if (!itemExists(itemId)) fail('Unknown item ID', 404);
    const current = database
      .prepare(
        'SELECT id,revision,created_at_utc FROM notes WHERE item_id=? AND kind=?',
      )
      .get(itemId, kind);
    if (current && String(current.revision) !== baseRevision) {
      return { ok: false, conflict: true, ...loadNote(kind, itemId) };
    }
    if (!content.trim()) {
      if (current)
        database.prepare('DELETE FROM notes WHERE id=?').run(current.id);
      return { ok: true, content: '', revision: null, exists: false };
    }
    const now = new Date().toISOString();
    if (current) {
      database
        .prepare(
          'UPDATE notes SET body_markdown=?,revision=revision+1,updated_at_utc=? WHERE id=?',
        )
        .run(content, now, current.id);
    } else {
      database
        .prepare('INSERT INTO notes VALUES(?,?,?,?,?,?,?)')
        .run(
          id('note', `${itemId}\0${kind}`),
          itemId,
          kind,
          content,
          1,
          now,
          now,
        );
    }
    const saved = loadNote(kind, itemId);
    return { ok: true, ...saved, exists: true };
  }

  function close() {
    database.close();
  }

  return {
    database,
    getCatalog,
    itemExists,
    queryItems,
    updateMetadata,
    setProperty,
    setTags,
    duplicateCandidates,
    getFormatInventory,
    setPeople,
    setSeries,
    addRelationship,
    saveView,
    listViews,
    loadNote,
    saveNote,
    close,
  };
}
