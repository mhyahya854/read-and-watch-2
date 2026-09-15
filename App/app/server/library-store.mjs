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

export function createLibraryStore({ databasePath, readOnly = false, searchStore = null }) {
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

  function isTablePresent(tableName) {
    try {
      return Boolean(
        database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tableName),
      );
    } catch {
      return false;
    }
  }

  function getCatalog() {
    if (!isTablePresent('library_meta')) {
      return {
        catalogSchemaVersion: 1,
        generatedFromImportUtc: null,
        counts: { read: 0, watch: 0, total: 0 },
        items: [],
      };
    }
    const meta = Object.fromEntries(
      database
        .prepare('SELECT key,value_json FROM library_meta')
        .all()
        .map((row) => [row.key, parse(row.value_json)]),
    );
    const rows = database
      .prepare('SELECT * FROM items ORDER BY source_order')
      .all();

    const propRows = database
      .prepare('SELECT item_id, namespace, property_key, value_json FROM item_properties ORDER BY namespace, source_order')
      .all();
    const propsByItem = new Map();
    for (const p of propRows) {
      let list = propsByItem.get(p.item_id);
      if (!list) {
        list = [];
        propsByItem.set(p.item_id, list);
      }
      list.push(p);
    }

    const tagRows = database
      .prepare('SELECT it.item_id, t.name FROM item_tags it JOIN tags t ON t.id = it.tag_id ORDER BY it.position')
      .all();
    const tagsByItem = new Map();
    for (const t of tagRows) {
      let list = tagsByItem.get(t.item_id);
      if (!list) {
        list = [];
        tagsByItem.set(t.item_id, list);
      }
      list.push(t.name);
    }

    const mediaRows = database
      .prepare("SELECT a.item_id, a.display_name, a.relative_path, a.extension FROM item_assets a JOIN asset_roles r ON r.asset_id = a.id AND r.role = 'catalog_media' ORDER BY a.source_order")
      .all();
    const mediaByItem = new Map();
    for (const m of mediaRows) {
      let list = mediaByItem.get(m.item_id);
      if (!list) {
        list = [];
        mediaByItem.set(m.item_id, list);
      }
      list.push({
        name: m.display_name,
        path: m.relative_path,
        extension: m.extension,
      });
    }

    const relRows = database
      .prepare('SELECT source_item_id, target_item_id FROM relationships WHERE target_item_id IS NOT NULL ORDER BY position')
      .all();
    const relsByItem = new Map();
    for (const r of relRows) {
      let list = relsByItem.get(r.source_item_id);
      if (!list) {
        list = [];
        relsByItem.set(r.source_item_id, list);
      }
      list.push(r.target_item_id);
    }

    const items = rows.map((row) => {
      const properties = propsByItem.get(row.id) || [];
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
        tags: tagsByItem.get(row.id) || [],
        summary: row.summary,
        cover: internal.cover ?? null,
        preview: internal.preview ?? null,
        notionProperties,
        media: mediaByItem.get(row.id) || [],
        relationshipIds: relsByItem.get(row.id) || [],
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

  function getUiCatalog() {
    if (!isTablePresent('library_meta')) {
      return {
        schemaVersion: 1,
        generatedFromImportUtc: null,
        counts: { read: 0, watch: 0, total: 0 },
        items: [],
      };
    }
    const meta = Object.fromEntries(
      database
        .prepare('SELECT key,value_json FROM library_meta')
        .all()
        .map((row) => [row.key, parse(row.value_json)]),
    );
    const rows = database
      .prepare('SELECT * FROM items ORDER BY source_order')
      .all();

    const propRows = database
      .prepare('SELECT item_id, namespace, property_key, value_json FROM item_properties ORDER BY namespace, source_order, property_key')
      .all();
    const propsByItem = new Map();
    for (const p of propRows) {
      let list = propsByItem.get(p.item_id);
      if (!list) {
        list = [];
        propsByItem.set(p.item_id, list);
      }
      list.push(p);
    }

    const tagRows = database
      .prepare('SELECT it.item_id, t.name FROM item_tags it JOIN tags t ON t.id = it.tag_id ORDER BY it.position')
      .all();
    const tagsByItem = new Map();
    for (const t of tagRows) {
      let list = tagsByItem.get(t.item_id);
      if (!list) {
        list = [];
        tagsByItem.set(t.item_id, list);
      }
      list.push(t.name);
    }

    const mediaRows = database
      .prepare("SELECT a.item_id, a.display_name, a.relative_path, a.extension FROM item_assets a JOIN asset_roles r ON r.asset_id = a.id AND r.role = 'catalog_media' ORDER BY a.source_order")
      .all();
    const mediaByItem = new Map();
    for (const m of mediaRows) {
      let list = mediaByItem.get(m.item_id);
      if (!list) {
        list = [];
        mediaByItem.set(m.item_id, list);
      }
      list.push({
        name: m.display_name,
        path: m.relative_path,
        extension: m.extension,
      });
    }

    const relRows = database
      .prepare('SELECT source_item_id, target_item_id FROM relationships WHERE target_item_id IS NOT NULL ORDER BY position')
      .all();
    const relsByItem = new Map();
    for (const r of relRows) {
      let list = relsByItem.get(r.source_item_id);
      if (!list) {
        list = [];
        relsByItem.set(r.source_item_id, list);
      }
      list.push(r.target_item_id);
    }

    const peopleRows = database
      .prepare('SELECT ip.item_id, ip.role, p.display_name FROM item_people ip JOIN people p ON p.id = ip.person_id ORDER BY ip.role, ip.position')
      .all();
    const peopleByItem = new Map();
    for (const p of peopleRows) {
      let list = peopleByItem.get(p.item_id);
      if (!list) {
        list = [];
        peopleByItem.set(p.item_id, list);
      }
      list.push(p);
    }

    const seriesRows = database
      .prepare('SELECT rs.item_id, s.name, rs.position FROM read_series rs JOIN series s ON s.id = rs.series_id')
      .all();
    const seriesByItem = new Map();
    for (const s of seriesRows) {
      seriesByItem.set(s.item_id, { name: s.name, position: s.position });
    }

    const items = rows.map((row) => {
      const properties = propsByItem.get(row.id) || [];
      const internal = {};
      const notionProperties = {};
      const customProperties = {};
      for (const p of properties) {
        if (p.namespace === 'catalog_internal') {
          internal[p.property_key] = parse(p.value_json);
        } else if (p.namespace === 'notion') {
          notionProperties[p.property_key] = parse(p.value_json);
        } else {
          customProperties[p.property_key] = parse(p.value_json);
        }
      }

      const people = peopleByItem.get(row.id) || [];
      const series = seriesByItem.get(row.id) || null;

      return {
        id: row.id,
        title: row.title,
        collection: row.collection,
        itemPath: row.item_path,
        type: row.item_type,
        status: row.status,
        added: row.source_added,
        tags: tagsByItem.get(row.id) || [],
        summary: row.summary,
        cover: internal.cover ?? null,
        preview: internal.preview ?? null,
        notionProperties,
        media: mediaByItem.get(row.id) || [],
        relationshipIds: relsByItem.get(row.id) || [],
        rating: row.rating,
        revision: row.revision,
        provenanceKind: row.provenance_kind,
        updatedAt: row.updated_at_utc,
        authors: people
          .filter(({ role }) => role === 'author')
          .map(({ display_name }) => display_name),
        creators: people
          .filter(({ role }) => role === 'creator')
          .map(({ display_name }) => display_name),
        series: series ? { name: series.name, position: series.position } : null,
        customProperties,
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

  function updateItem(itemId, patch, expectedRevision) {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      fail('Invalid metadata revision');
    }
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      fail('Invalid metadata changes');
    }
    const allowed = new Set([
      'title',
      'type',
      'status',
      'summary',
      'rating',
      'tags',
      'people',
      'series',
      'customProperties',
    ]);
    if (
      !Object.keys(patch).length ||
      Object.keys(patch).some((key) => !allowed.has(key))
    ) {
      fail('No valid metadata changes');
    }
    for (const key of ['title', 'type', 'status', 'summary']) {
      if (key in patch && typeof patch[key] !== 'string') {
        fail(`${key} must be a string`);
      }
    }
    if ('title' in patch && !patch.title.trim()) fail('Title is required');
    if (
      'rating' in patch &&
      patch.rating !== null &&
      (typeof patch.rating !== 'number' || patch.rating < 0 || patch.rating > 5)
    ) {
      fail('Rating must be between 0 and 5');
    }
    for (const key of ['tags', 'people']) {
      if (
        key in patch &&
        (!Array.isArray(patch[key]) ||
          patch[key].some((value) => typeof value !== 'string'))
      ) {
        fail(`${key} must be a list of strings`);
      }
    }
    if (
      'series' in patch &&
      patch.series !== null &&
      (typeof patch.series !== 'object' ||
        typeof patch.series.name !== 'string' ||
        typeof patch.series.position !== 'string')
    ) {
      fail('Invalid series');
    }
    if (
      'customProperties' in patch &&
      (!patch.customProperties ||
        typeof patch.customProperties !== 'object' ||
        Array.isArray(patch.customProperties) ||
        Object.entries(patch.customProperties).some(
          ([key, value]) => !key.trim() || typeof value !== 'string',
        ))
    ) {
      fail('Invalid custom properties');
    }

    const normalizeList = (values) => [
      ...new Set(values.map((value) => value.trim()).filter(Boolean)),
    ];
    database.exec('BEGIN IMMEDIATE');
    try {
      const current = database
        .prepare('SELECT revision,collection FROM items WHERE id=?')
        .get(itemId);
      if (!current) fail('Unknown item ID', 404);
      if (current.revision !== expectedRevision) fail('Metadata conflict', 409);
      if ('series' in patch && current.collection !== 'read') {
        fail('Series is Read-specific');
      }

      const columns = new Map([
        ['title', 'title'],
        ['type', 'item_type'],
        ['status', 'status'],
        ['summary', 'summary'],
        ['rating', 'rating'],
      ]);
      const metadata = Object.entries(patch).filter(([key]) => columns.has(key));
      if (metadata.length) {
        database
          .prepare(
            `UPDATE items SET ${metadata.map(([key]) => `${columns.get(key)}=?`).join(',')} WHERE id=?`,
          )
          .run(...metadata.map(([, value]) => value), itemId);
      }

      if ('tags' in patch) {
        database.prepare('DELETE FROM item_tags WHERE item_id=?').run(itemId);
        normalizeList(patch.tags).forEach((tag, position) => {
          const tagId = id('tag', tag.toLocaleLowerCase());
          database.prepare('INSERT OR IGNORE INTO tags VALUES(?,?)').run(tagId, tag);
          database.prepare('INSERT INTO item_tags VALUES(?,?,?)').run(itemId, tagId, position);
        });
      }

      if ('people' in patch) {
        const role = current.collection === 'read' ? 'author' : 'creator';
        database.prepare('DELETE FROM item_people WHERE item_id=? AND role=?').run(itemId, role);
        normalizeList(patch.people).forEach((name, position) => {
          const personId = id('person', name.toLocaleLowerCase());
          database.prepare('INSERT OR IGNORE INTO people VALUES(?,?,?)').run(personId, name, name);
          database.prepare('INSERT INTO item_people VALUES(?,?,?,?)').run(itemId, personId, role, position);
        });
      }

      if ('series' in patch) {
        database.prepare('DELETE FROM read_series WHERE item_id=?').run(itemId);
        if (patch.series?.name.trim()) {
          const name = patch.series.name.trim();
          const seriesId = id('series', name.toLocaleLowerCase());
          database.prepare('INSERT OR IGNORE INTO series VALUES(?,?,?)').run(seriesId, name, name);
          database.prepare('INSERT INTO read_series VALUES(?,?,?)').run(
            itemId,
            seriesId,
            patch.series.position.trim(),
          );
        }
      }

      if ('customProperties' in patch) {
        database
          .prepare("DELETE FROM item_properties WHERE item_id=? AND namespace='manual'")
          .run(itemId);
        Object.entries(patch.customProperties).forEach(([key, value], sourceOrder) => {
          database
            .prepare('INSERT INTO item_properties VALUES(?,?,?,?,?,?)')
            .run(itemId, 'manual', key.trim(), 'string', JSON.stringify(value), sourceOrder);
        });
      }

      database
        .prepare('UPDATE items SET revision=revision+1,updated_at_utc=? WHERE id=?')
        .run(new Date().toISOString(), itemId);
      database.exec('COMMIT');

      const updated = getUiCatalog().items.find(({ id: candidateId }) => candidateId === itemId);
      if (searchStore && updated) {
        try { searchStore.indexItem(updated); } catch {}
      }
      return updated;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
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
    getUiCatalog,
    updateItem,
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
