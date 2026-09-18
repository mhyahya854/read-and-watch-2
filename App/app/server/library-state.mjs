/**
 * File-first durable state for library-level saved views and relationships.
 *
 * `App/user-data/library-state.json` is the durable portable record. The
 * SQLite `saved_views` and `relationships` tables are runtime projections.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { toLongPath } from './portable-library.mjs';

export const LIBRARY_STATE_SCHEMA_VERSION = 1;
export const LIBRARY_STATE_FILENAME = 'library-state.json';

export const LIBRARY_STATE_CODES = Object.freeze({
  MALFORMED: 'MALFORMED_LIBRARY_STATE',
  MIGRATED: 'RECOVERED_LIBRARY_STATE_MIGRATED',
  RECONCILED: 'RECOVERED_LIBRARY_STATE_RECONCILED',
  DIVERGENCE: 'LIBRARY_STATE_DIVERGENCE',
});

const STABLE_ID_PATTERN = /^(read|watch)-[0-9a-f]{8,64}$/i;
const DIRECTIONS = new Set(['directed', 'undirected']);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function diagnostic(code, message, field = null, entityId = null) {
  return { code, message, field, entityId };
}

export function libraryStatePath(userDataRoot) {
  return join(userDataRoot, LIBRARY_STATE_FILENAME);
}

export function emptyLibraryState() {
  return {
    schemaVersion: LIBRARY_STATE_SCHEMA_VERSION,
    savedViews: [],
    relationships: [],
  };
}

export function normalizeLibraryState(state) {
  return {
    schemaVersion: LIBRARY_STATE_SCHEMA_VERSION,
    savedViews: [...(state.savedViews ?? [])]
      .map((view) => ({
        id: view.id,
        name: view.name,
        definition: view.definition,
        revision: view.revision,
        createdAtUtc: view.createdAtUtc,
        updatedAtUtc: view.updatedAtUtc,
      }))
      .sort((left, right) => {
        const byName = String(left.name).toLocaleLowerCase().localeCompare(
          String(right.name).toLocaleLowerCase(),
        );
        return byName || String(left.id).localeCompare(String(right.id));
      }),
    relationships: [...(state.relationships ?? [])]
      .map((relationship) => ({
        id: relationship.id,
        sourceItemId: relationship.sourceItemId,
        targetItemId: relationship.targetItemId ?? null,
        targetExternal: relationship.targetExternal ?? null,
        relationshipType: relationship.relationshipType,
        direction: relationship.direction,
        position: relationship.position,
        provenance: relationship.provenance ?? {},
        createdAtUtc: relationship.createdAtUtc,
      }))
      .sort((left, right) => String(left.id).localeCompare(String(right.id))),
  };
}

export function serializeLibraryState(state) {
  return `${JSON.stringify(normalizeLibraryState(state), null, 2)}\n`;
}

export function stateFingerprint(state) {
  return createHash('sha256')
    .update(canonicalJson(normalizeLibraryState(state)))
    .digest('hex');
}

export function validateLibraryState(state, { itemExists = null } = {}) {
  const diagnostics = [];
  if (!isObject(state)) {
    return {
      ok: false,
      diagnostics: [diagnostic(LIBRARY_STATE_CODES.MALFORMED, 'Library state must be an object.')],
    };
  }
  if (state.schemaVersion !== LIBRARY_STATE_SCHEMA_VERSION) {
    diagnostics.push(diagnostic(
      LIBRARY_STATE_CODES.MALFORMED,
      `Unsupported library state schema version: ${String(state.schemaVersion)}.`,
      'schemaVersion',
    ));
  }
  if (!Array.isArray(state.savedViews)) {
    diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, 'savedViews must be an array.', 'savedViews'));
  }
  if (!Array.isArray(state.relationships)) {
    diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, 'relationships must be an array.', 'relationships'));
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const viewIds = new Set();
  const viewNames = new Set();
  for (const view of state.savedViews) {
    if (!isObject(view)) {
      diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, 'Saved view entry must be an object.', 'savedViews'));
      continue;
    }
    if (typeof view.id !== 'string' || !view.id.trim()) {
      diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, 'Saved view id is required.', 'id'));
    } else if (viewIds.has(view.id)) {
      diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, `Duplicate saved view id: ${view.id}.`, 'id', view.id));
    } else {
      viewIds.add(view.id);
    }
    if (typeof view.name !== 'string' || !view.name.trim()) {
      diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, 'Saved view name is required.', 'name', view.id));
    } else {
      const normalizedName = view.name.trim().toLocaleLowerCase();
      if (viewNames.has(normalizedName)) {
        diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, `Duplicate saved view name: ${view.name}.`, 'name', view.id));
      }
      viewNames.add(normalizedName);
    }
    if (!isObject(view.definition) && !Array.isArray(view.definition)) {
      diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, 'Saved view definition must be JSON.', 'definition', view.id));
    }
    if (!Number.isInteger(view.revision) || view.revision < 1) {
      diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, 'Saved view revision must be a positive integer.', 'revision', view.id));
    }
    for (const key of ['createdAtUtc', 'updatedAtUtc']) {
      if (typeof view[key] !== 'string' || !view[key].trim()) {
        diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, `${key} is required.`, key, view.id));
      }
    }
  }

  const relationshipIds = new Set();
  for (const relationship of state.relationships) {
    if (!isObject(relationship)) {
      diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, 'Relationship entry must be an object.', 'relationships'));
      continue;
    }
    if (typeof relationship.id !== 'string' || !relationship.id.trim()) {
      diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, 'Relationship id is required.', 'id'));
    } else if (relationshipIds.has(relationship.id)) {
      diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, `Duplicate relationship id: ${relationship.id}.`, 'id', relationship.id));
    } else {
      relationshipIds.add(relationship.id);
    }
    if (
      typeof relationship.sourceItemId !== 'string' ||
      !STABLE_ID_PATTERN.test(relationship.sourceItemId)
    ) {
      diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, 'Relationship sourceItemId must be a stable item id.', 'sourceItemId', relationship.id));
    } else if (itemExists && !itemExists(relationship.sourceItemId)) {
      diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, `Relationship source item is missing: ${relationship.sourceItemId}.`, 'sourceItemId', relationship.id));
    }
    const hasInternalTarget = typeof relationship.targetItemId === 'string' && relationship.targetItemId.trim() !== '';
    const hasExternalTarget = relationship.targetExternal !== null && relationship.targetExternal !== undefined;
    if (hasInternalTarget === hasExternalTarget) {
      diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, 'Relationship must have exactly one internal or external target.', 'targetItemId', relationship.id));
    }
    if (hasInternalTarget) {
      if (!STABLE_ID_PATTERN.test(relationship.targetItemId)) {
        diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, 'Relationship targetItemId must be a stable item id.', 'targetItemId', relationship.id));
      } else if (itemExists && !itemExists(relationship.targetItemId)) {
        diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, `Relationship target item is missing: ${relationship.targetItemId}.`, 'targetItemId', relationship.id));
      }
    }
    if (hasExternalTarget && !isObject(relationship.targetExternal)) {
      diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, 'Relationship targetExternal must be a JSON object.', 'targetExternal', relationship.id));
    }
    if (typeof relationship.relationshipType !== 'string' || !relationship.relationshipType.trim()) {
      diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, 'Relationship type is required.', 'relationshipType', relationship.id));
    }
    if (!DIRECTIONS.has(relationship.direction)) {
      diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, 'Relationship direction must be directed or undirected.', 'direction', relationship.id));
    }
    if (!Number.isInteger(relationship.position) || relationship.position < 0) {
      diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, 'Relationship position must be a non-negative integer.', 'position', relationship.id));
    }
    if (!isObject(relationship.provenance)) {
      diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, 'Relationship provenance must be a JSON object.', 'provenance', relationship.id));
    }
    if (typeof relationship.createdAtUtc !== 'string' || !relationship.createdAtUtc.trim()) {
      diagnostics.push(diagnostic(LIBRARY_STATE_CODES.MALFORMED, 'Relationship createdAtUtc is required.', 'createdAtUtc', relationship.id));
    }
  }

  return { ok: diagnostics.length === 0, diagnostics };
}

export function readLibraryState(userDataRoot) {
  const path = libraryStatePath(userDataRoot);
  if (!existsSync(toLongPath(path))) return { present: false, ok: true, state: null, diagnostics: [] };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(toLongPath(path), 'utf8'));
  } catch (error) {
    return {
      present: true,
      ok: false,
      state: null,
      diagnostics: [diagnostic(
        LIBRARY_STATE_CODES.MALFORMED,
        `library-state.json is not valid JSON: ${error?.message ?? error}`,
      )],
    };
  }
  const validation = validateLibraryState(parsed);
  return {
    present: true,
    ok: validation.ok,
    state: validation.ok ? normalizeLibraryState(parsed) : null,
    diagnostics: validation.diagnostics,
  };
}

export function writeLibraryStateAtomic(userDataRoot, state) {
  const validation = validateLibraryState(state);
  if (!validation.ok) {
    throw Object.assign(new Error(validation.diagnostics[0]?.message ?? 'Invalid library state.'), {
      code: LIBRARY_STATE_CODES.MALFORMED,
      diagnostics: validation.diagnostics,
    });
  }
  const normalized = normalizeLibraryState(state);
  const path = libraryStatePath(userDataRoot);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = join(
    dirname(path),
    `.${basename(path)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  );
  const serialized = serializeLibraryState(normalized);
  writeFileSync(toLongPath(temporary), serialized, 'utf8');
  const staged = JSON.parse(readFileSync(toLongPath(temporary), 'utf8'));
  const stagedValidation = validateLibraryState(staged);
  if (!stagedValidation.ok) {
    rmSync(toLongPath(temporary), { force: true });
    throw Object.assign(new Error('Staged library state did not validate.'), {
      code: LIBRARY_STATE_CODES.MALFORMED,
      diagnostics: stagedValidation.diagnostics,
    });
  }
  renameSync(toLongPath(temporary), toLongPath(path));
  return normalized;
}

export function readLibraryStateFromDatabase(database) {
  const savedViews = database
    .prepare('SELECT * FROM saved_views ORDER BY name COLLATE NOCASE')
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      definition: JSON.parse(row.definition_json),
      revision: row.revision,
      createdAtUtc: row.created_at_utc,
      updatedAtUtc: row.updated_at_utc,
    }));
  const relationships = database
    .prepare('SELECT * FROM relationships ORDER BY id')
    .all()
    .map((row) => ({
      id: row.id,
      sourceItemId: row.source_item_id,
      targetItemId: row.target_item_id,
      targetExternal: row.target_external_json ? JSON.parse(row.target_external_json) : null,
      relationshipType: row.relationship_type,
      direction: row.direction,
      position: row.position,
      provenance: JSON.parse(row.provenance_json),
      createdAtUtc: row.created_at_utc,
    }));
  return normalizeLibraryState({
    schemaVersion: LIBRARY_STATE_SCHEMA_VERSION,
    savedViews,
    relationships,
  });
}

export function projectLibraryStateToDatabase(database, state) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const normalized = applyLibraryStateRows(database, state);
    database.exec('COMMIT');
    return normalized;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function applyLibraryStateRows(database, state) {
  const normalized = normalizeLibraryState(state);
  database.prepare('DELETE FROM saved_views').run();
  const insertView = database.prepare(
    'INSERT INTO saved_views (id,name,definition_json,revision,created_at_utc,updated_at_utc) VALUES (?,?,?,?,?,?)',
  );
  for (const view of normalized.savedViews) {
    insertView.run(
      view.id,
      view.name,
      JSON.stringify(view.definition),
      view.revision,
      view.createdAtUtc,
      view.updatedAtUtc,
    );
  }
  database.prepare('DELETE FROM relationships').run();
  const insertRelationship = database.prepare(
    `INSERT INTO relationships
     (id,source_item_id,target_item_id,target_external_json,relationship_type,direction,position,provenance_json,created_at_utc)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  );
  for (const relationship of normalized.relationships) {
    insertRelationship.run(
      relationship.id,
      relationship.sourceItemId,
      relationship.targetItemId,
      relationship.targetExternal ? JSON.stringify(relationship.targetExternal) : null,
      relationship.relationshipType,
      relationship.direction,
      relationship.position,
      JSON.stringify(relationship.provenance),
      relationship.createdAtUtc,
    );
  }
  return normalized;
}

export function mergeLibraryState(current, incoming, {
  conflictResolution = 'skip',
  itemExists = null,
} = {}) {
  const savedViews = [...normalizeLibraryState(current).savedViews];
  const relationships = [...normalizeLibraryState(current).relationships];
  const restored = { savedViews: 0, relationships: 0 };
  const skipped = { savedViews: 0, relationships: 0 };
  const warnings = [];

  const incomingViews = normalizeLibraryState(incoming).savedViews;
  for (const view of incomingViews) {
    const existingIndex = savedViews.findIndex(
      (candidate) =>
        candidate.id === view.id ||
        candidate.name.toLocaleLowerCase() === view.name.toLocaleLowerCase(),
    );
    if (existingIndex === -1) {
      savedViews.push(view);
      restored.savedViews += 1;
      continue;
    }
    const existing = savedViews[existingIndex];
    if (canonicalJson(existing) === canonicalJson(view)) {
      skipped.savedViews += 1;
    } else if (conflictResolution === 'overwrite') {
      savedViews[existingIndex] = view;
      restored.savedViews += 1;
    } else {
      skipped.savedViews += 1;
    }
  }

  const incomingRelationships = normalizeLibraryState(incoming).relationships;
  for (const relationship of incomingRelationships) {
    if (
      itemExists &&
      (!itemExists(relationship.sourceItemId) ||
        (relationship.targetItemId && !itemExists(relationship.targetItemId)))
    ) {
      warnings.push({
        code: LIBRARY_STATE_CODES.MALFORMED,
        message: `Relationship ${relationship.id} references a missing item and was not restored.`,
        relationshipId: relationship.id,
      });
      skipped.relationships += 1;
      continue;
    }
    const existingIndex = relationships.findIndex(
      (candidate) => candidate.id === relationship.id,
    );
    if (existingIndex === -1) {
      relationships.push(relationship);
      restored.relationships += 1;
      continue;
    }
    const existing = relationships[existingIndex];
    if (canonicalJson(existing) === canonicalJson(relationship)) {
      skipped.relationships += 1;
    } else if (conflictResolution === 'overwrite') {
      relationships[existingIndex] = relationship;
      restored.relationships += 1;
    } else {
      skipped.relationships += 1;
    }
  }

  const merged = normalizeLibraryState({
    schemaVersion: LIBRARY_STATE_SCHEMA_VERSION,
    savedViews,
    relationships,
  });
  const validation = validateLibraryState(merged, { itemExists });
  if (!validation.ok) {
    return { ok: false, diagnostics: validation.diagnostics, restored, skipped, warnings };
  }
  return { ok: true, state: merged, restored, skipped, warnings };
}

export function libraryStatesEqual(left, right) {
  return canonicalJson(normalizeLibraryState(left)) === canonicalJson(normalizeLibraryState(right));
}

export function libraryStateClassesEqual(left, right) {
  const normalizedLeft = normalizeLibraryState(left);
  const normalizedRight = normalizeLibraryState(right);
  return {
    savedViewsMatch:
      canonicalJson(normalizedLeft.savedViews) === canonicalJson(normalizedRight.savedViews),
    relationshipsMatch:
      canonicalJson(normalizedLeft.relationships) ===
      canonicalJson(normalizedRight.relationships),
  };
}

/**
 * Read-only integrity diagnostic. Never mutates the mirror, the database, the
 * filesystem, search state or the portable library.
 */
export function inspectLibraryStateIntegrity({
  database,
  userDataRoot,
  itemExists = null,
} = {}) {
  const startedAt = Date.now();
  const file = readLibraryState(userDataRoot);
  const mirrorCounts = {
    savedViewCount: file.state?.savedViews?.length ?? 0,
    relationshipCount: file.state?.relationships?.length ?? 0,
  };
  const baseMetrics = {
    durationMs: 0,
    dbMutated: false,
    portableRootScanned: false,
    searchRebuilt: false,
  };
  const baseRuntime = {
    available: Boolean(database),
    savedViewCount: 0,
    relationshipCount: 0,
  };
  const finish = (value) => {
    value.metrics = { ...baseMetrics, ...value.metrics, durationMs: Date.now() - startedAt };
    return value;
  };

  if (!file.present) {
    return finish({
      status: 'MIRROR_MISSING',
      code: 'MIRROR_MISSING',
      mirror: {
        present: false,
        valid: false,
        schemaVersion: null,
        ...mirrorCounts,
      },
      runtime: baseRuntime,
      parity: {
        matches: false,
        savedViewsMatch: false,
        relationshipsMatch: false,
      },
      diagnostics: [],
      metrics: baseMetrics,
    });
  }

  if (!file.ok) {
    return finish({
      status: 'RECOVERY_REQUIRED',
      code: LIBRARY_STATE_CODES.MALFORMED,
      mirror: {
        present: true,
        valid: false,
        schemaVersion: null,
        ...mirrorCounts,
      },
      runtime: baseRuntime,
      parity: {
        matches: false,
        savedViewsMatch: false,
        relationshipsMatch: false,
      },
      diagnostics: file.diagnostics.map((entry) => ({
        code: entry.code,
        field: entry.field,
      })),
      metrics: baseMetrics,
    });
  }

  const validation = validateLibraryState(file.state, { itemExists });
  if (!validation.ok) {
    return finish({
      status: 'RECOVERY_REQUIRED',
      code: LIBRARY_STATE_CODES.MALFORMED,
      mirror: {
        present: true,
        valid: false,
        schemaVersion: file.state.schemaVersion,
        ...mirrorCounts,
      },
      runtime: baseRuntime,
      parity: {
        matches: false,
        savedViewsMatch: false,
        relationshipsMatch: false,
      },
      diagnostics: validation.diagnostics.map((entry) => ({
        code: entry.code,
        field: entry.field,
      })),
      metrics: baseMetrics,
    });
  }

  if (!database) {
    return finish({
      status: 'RECOVERY_REQUIRED',
      code: 'RUNTIME_DB_UNUSABLE',
      mirror: {
        present: true,
        valid: true,
        schemaVersion: file.state.schemaVersion,
        ...mirrorCounts,
      },
      runtime: baseRuntime,
      parity: {
        matches: false,
        savedViewsMatch: false,
        relationshipsMatch: false,
      },
      diagnostics: [{ code: 'RUNTIME_DB_UNUSABLE' }],
      metrics: baseMetrics,
    });
  }

  let runtimeState;
  try {
    runtimeState = readLibraryStateFromDatabase(database);
  } catch (error) {
    return finish({
      status: 'RECOVERY_REQUIRED',
      code: 'RUNTIME_DB_UNUSABLE',
      mirror: {
        present: true,
        valid: true,
        schemaVersion: file.state.schemaVersion,
        ...mirrorCounts,
      },
      runtime: baseRuntime,
      parity: {
        matches: false,
        savedViewsMatch: false,
        relationshipsMatch: false,
      },
      diagnostics: [{ code: String(error?.code ?? 'RUNTIME_DB_UNUSABLE') }],
      metrics: baseMetrics,
    });
  }

  const equality = libraryStateClassesEqual(file.state, runtimeState);
  const matches = equality.savedViewsMatch && equality.relationshipsMatch;
  return finish({
    status: matches ? 'HEALTHY' : 'MISMATCH',
    code: matches ? 'HEALTHY' : 'LIBRARY_STATE_MISMATCH',
    mirror: {
      present: true,
      valid: true,
      schemaVersion: file.state.schemaVersion,
      savedViewCount: file.state.savedViews.length,
      relationshipCount: file.state.relationships.length,
    },
    runtime: {
      available: true,
      savedViewCount: runtimeState.savedViews.length,
      relationshipCount: runtimeState.relationships.length,
    },
    parity: {
      matches,
      savedViewsMatch: equality.savedViewsMatch,
      relationshipsMatch: equality.relationshipsMatch,
    },
    diagnostics: [],
    metrics: baseMetrics,
  });
}

export function reconcileLibraryState({ database, userDataRoot, itemExists = null }) {
  const file = readLibraryState(userDataRoot);
  if (file.present && !file.ok) {
    return {
      status: 'RECOVERY_REQUIRED',
      code: LIBRARY_STATE_CODES.MALFORMED,
      diagnostics: file.diagnostics,
    };
  }
  if (!file.present) {
    const dbState = readLibraryStateFromDatabase(database);
    const validation = validateLibraryState(dbState, { itemExists });
    if (!validation.ok) {
      return {
        status: 'RECOVERY_REQUIRED',
        code: LIBRARY_STATE_CODES.MALFORMED,
        diagnostics: validation.diagnostics,
      };
    }
    const written = writeLibraryStateAtomic(userDataRoot, dbState);
    const verified = readLibraryState(userDataRoot);
    if (!verified.ok || !libraryStatesEqual(verified.state, written)) {
      return {
        status: 'RECOVERY_REQUIRED',
        code: LIBRARY_STATE_CODES.MALFORMED,
        diagnostics: [diagnostic(LIBRARY_STATE_CODES.MALFORMED, 'Library state migration verification failed.')],
      };
    }
    return {
      status: 'RECOVERED',
      code: LIBRARY_STATE_CODES.MIGRATED,
      state: written,
    };
  }

  const validation = validateLibraryState(file.state, { itemExists });
  if (!validation.ok) {
    return {
      status: 'RECOVERY_REQUIRED',
      code: LIBRARY_STATE_CODES.MALFORMED,
      diagnostics: validation.diagnostics,
    };
  }
  const dbState = readLibraryStateFromDatabase(database);
  if (libraryStatesEqual(file.state, dbState)) {
    return { status: 'HEALTHY', code: 'HEALTHY', state: file.state };
  }
  projectLibraryStateToDatabase(database, file.state);
  const verified = readLibraryStateFromDatabase(database);
  if (!libraryStatesEqual(verified, file.state)) {
    return {
      status: 'RECOVERY_REQUIRED',
      code: LIBRARY_STATE_CODES.MALFORMED,
      diagnostics: [diagnostic(LIBRARY_STATE_CODES.MALFORMED, 'Library state reconciliation verification failed.')],
    };
  }
  return {
    status: 'RECOVERED',
    code: LIBRARY_STATE_CODES.RECONCILED,
    state: file.state,
  };
}

export function writeLibraryStateMarkerForDivergence(userDataRoot, details) {
  const marker = join(userDataRoot, '..', 'state', 'portable-recovery-required.json');
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(
    toLongPath(marker),
    `${JSON.stringify({
      code: LIBRARY_STATE_CODES.DIVERGENCE,
      detectedAtUtc: new Date().toISOString(),
      ...details,
    }, null, 2)}\n`,
    'utf8',
  );
}
