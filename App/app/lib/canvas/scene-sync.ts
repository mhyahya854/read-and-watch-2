/**
 * Semantic <-> visual reconciliation for the unified Knowledge Canvas.
 *
 * A Knowledge Canvas is ONE workspace: the structured model (blocks +
 * relationships) and the freeform Excalidraw scene must not drift apart. This
 * module is the single production reconciliation helper:
 *
 *   - every placed block keeps a real rectangle + its bound title label
 *   - renaming a block renames its visual label
 *   - every relationship between two placed blocks keeps a NAMED connector
 *     (label text on the arrow) with the right arrowheads
 *   - a relationship created before its blocks are placed gains its connector
 *     automatically once both visual endpoints exist
 *   - deleting a block removes its visual block/label and every connector that
 *     touched it; deleting a relationship removes its connector
 *   - deleting an app-owned visual element detaches the semantic record (the
 *     block survives, unplaced) instead of leaving a ghost elementId
 *
 * Only elements carrying Read & Watch `customData.rw` metadata participate.
 * Ordinary user drawings are never touched or reinterpreted.
 */

import type {
  CanvasKnowledge,
  KnowledgeBlock,
  KnowledgeRelationship,
} from './types.ts';

export type RwElementKind = 'block' | 'block-label' | 'connector' | 'connector-label';

export interface RwElementMeta {
  kind: RwElementKind;
  blockId?: string;
  relationshipId?: string;
}

/** Loose scene element shape: Excalidraw owns the real type. */
export interface SceneElementLike {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  angle?: number;
  text?: string;
  containerId?: string | null;
  boundElements?: ReadonlyArray<{ type: string; id: string }> | null;
  points?: ReadonlyArray<readonly [number, number]>;
  startBinding?: unknown;
  endBinding?: unknown;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  customData?: Record<string, unknown> | null;
  groupIds?: readonly string[];
  [key: string]: unknown;
}

export function blockElementId(blockId: string): string {
  return `rw-block-${blockId}`;
}

export function blockLabelElementId(blockId: string): string {
  return `rw-block-${blockId}-label`;
}

export function connectorElementId(relationshipId: string): string {
  return `rw-rel-${relationshipId}`;
}

export function connectorLabelElementId(relationshipId: string): string {
  return `rw-rel-${relationshipId}-label`;
}

export function elementRwMeta(element: SceneElementLike): RwElementMeta | null {
  const raw = element?.customData?.rw;
  if (!raw || typeof raw !== 'object') return null;
  const meta = raw as RwElementMeta;
  if (
    meta.kind !== 'block' &&
    meta.kind !== 'block-label' &&
    meta.kind !== 'connector' &&
    meta.kind !== 'connector-label'
  ) {
    return null;
  }
  return meta;
}

export function isAppOwnedElement(element: SceneElementLike): boolean {
  return elementRwMeta(element) !== null;
}

const BLOCK_WIDTH = 240;
const BLOCK_HEIGHT = 84;
const BLOCK_LABEL_PADDING = 12;

function rwMeta(kind: RwElementKind, ids: { blockId?: string; relationshipId?: string }) {
  return { rw: { kind, ...ids } };
}

function nonce(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function baseElement(id: string, type: string, x: number, y: number, nonceValue: number) {
  return {
    id,
    type,
    x,
    y,
    angle: 0,
    strokeColor: '#2f6f63',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: nonceValue,
    version: 1,
    versionNonce: nonceValue,
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
  };
}

/** Rectangle + bound title label for a structured block. */
export function createBlockElements(
  block: KnowledgeBlock,
  position: { x: number; y: number },
): SceneElementLike[] {
  const rectId = blockLabelElementId(block.id) && blockElementId(block.id);
  const labelId = blockLabelElementId(block.id);
  const n = nonce();
  const rect = {
    ...baseElement(rectId, 'rectangle', position.x, position.y, n),
    width: BLOCK_WIDTH,
    height: BLOCK_HEIGHT,
    backgroundColor: '#f4f1ea',
    roundness: { type: 3 },
    boundElements: [{ type: 'text', id: labelId }],
    customData: rwMeta('block', { blockId: block.id }),
  };
  const label = {
    ...baseElement(labelId, 'text', position.x + BLOCK_LABEL_PADDING, position.y + 26, n + 1),
    width: BLOCK_WIDTH - BLOCK_LABEL_PADDING * 2,
    height: 32,
    strokeColor: '#232323',
    text: block.title || 'Untitled block',
    fontSize: 16,
    fontFamily: 1,
    textAlign: 'left',
    verticalAlign: 'middle',
    containerId: rectId,
    originalText: block.title || 'Untitled block',
    lineHeight: 1.25,
    customData: rwMeta('block-label', { blockId: block.id }),
  };
  return [rect as SceneElementLike, label as SceneElementLike];
}

/** Arrow + bound label representing one semantic relationship. */
export function createConnectorElements(
  relationship: KnowledgeRelationship,
  source: SceneElementLike,
  target: SceneElementLike,
): SceneElementLike[] {
  const arrowId = connectorElementId(relationship.id);
  const labelId = connectorLabelElementId(relationship.id);
  const n = nonce();

  const startX = (source.x ?? 0) + (source.width ?? BLOCK_WIDTH);
  const startY = (source.y ?? 0) + (source.height ?? BLOCK_HEIGHT) / 2;
  const endX = target.x ?? 0;
  const endY = (target.y ?? 0) + (target.height ?? BLOCK_HEIGHT) / 2;

  const arrow = {
    ...baseElement(arrowId, 'arrow', startX, startY, n),
    width: Math.max(1, Math.abs(endX - startX)),
    height: Math.max(1, Math.abs(endY - startY)),
    roundness: { type: 2 },
    points: [
      [0, 0],
      [endX - startX, endY - startY],
    ] as ReadonlyArray<readonly [number, number]>,
    lastCommittedPoint: null,
    startBinding: { elementId: source.id, focus: 0, gap: 4 },
    endBinding: { elementId: target.id, focus: 0, gap: 4 },
    startArrowhead: relationship.direction === 'mutual' ? 'arrow' : null,
    endArrowhead: 'arrow',
    boundElements: [{ type: 'text', id: labelId }],
    customData: rwMeta('connector', { relationshipId: relationship.id }),
  };

  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const label = {
    ...baseElement(labelId, 'text', midX - 60, midY - 16, n + 1),
    width: 120,
    height: 32,
    strokeColor: '#1f4f47',
    text: relationship.label || 'related',
    fontSize: 14,
    fontFamily: 1,
    textAlign: 'center',
    verticalAlign: 'middle',
    containerId: arrowId,
    originalText: relationship.label || 'related',
    lineHeight: 1.25,
    customData: rwMeta('connector-label', { relationshipId: relationship.id }),
  };

  return [arrow as unknown as SceneElementLike, label as unknown as SceneElementLike];
}

export interface ReconcileInput {
  elements: ReadonlyArray<SceneElementLike>;
  knowledge: CanvasKnowledge;
  /** Placement for blocks that are being placed now (defaults to a grid). */
  placeBlockId?: string | null;
}

/**
 * Cheap structural check used by the live scene-change handler.
 *
 * Full reconciliation recomputes connector geometry, which would fight an
 * in-progress drag if it ran on every keystroke/frame. This only reports the
 * cases that NEED repair: a placed block whose visual element is gone, a
 * relationship whose endpoints are both placed but whose connector is missing,
 * or an app-owned element with no semantic object behind it.
 */
export function needsReconcile(
  elements: ReadonlyArray<SceneElementLike>,
  knowledge: CanvasKnowledge,
): boolean {
  const ids = new Set(elements.map((el) => el.id));
  const blockIds = new Set(knowledge.blocks.map((b) => b.id));
  const relationshipIds = new Set(knowledge.relationships.map((r) => r.id));

  for (const block of knowledge.blocks) {
    if (block.elementId && !ids.has(block.elementId)) return true;
  }

  const placedBlocks = new Map(
    knowledge.blocks
      .filter((b) => b.elementId && ids.has(b.elementId))
      .map((b) => [b.id, b] as const),
  );
  for (const rel of knowledge.relationships) {
    if (!placedBlocks.has(rel.sourceBlockId) || !placedBlocks.has(rel.targetBlockId)) continue;
    if (!ids.has(connectorElementId(rel.id))) return true;
  }

  for (const element of elements) {
    const meta = elementRwMeta(element);
    if (!meta) continue;
    if (meta.kind === 'block' || meta.kind === 'block-label') {
      if (!meta.blockId || !blockIds.has(meta.blockId)) return true;
    } else if (!meta.relationshipId || !relationshipIds.has(meta.relationshipId)) {
      return true;
    }
  }
  return false;
}

export interface ReconcileResult {
  elements: SceneElementLike[];
  knowledge: CanvasKnowledge;
  changed: boolean;
}

/**
 * Bring the scene and the structured model back into agreement. Pure: it returns
 * the reconciled elements and knowledge without mutating the inputs.
 */
export function reconcileKnowledgeScene({
  elements,
  knowledge,
  placeBlockId = null,
}: ReconcileInput): ReconcileResult {
  let changed = false;
  let nextElements: SceneElementLike[] = [...elements];

  // 1. Blocks: detach stale element ids, refresh labels, place requested blocks.
  const normalizedBlocks: KnowledgeBlock[] = knowledge.blocks.map((block, index) => {
    const rect = nextElements.find((el) => el.id === block.elementId);
    if (block.elementId && !rect) {
      // The app-owned visual element is gone (for example the user deleted it):
      // detach the record instead of keeping a ghost reference.
      changed = true;
      const { elementId: _dropped, ...rest } = block;
      return { ...rest };
    }
    if (!block.elementId && placeBlockId === block.id) {
      const position = { x: 140, y: 120 + (index % 6) * 130 };
      const created = createBlockElements(block, position);
      nextElements = [...nextElements, ...created];
      changed = true;
      return { ...block, elementId: created[0].id };
    }
    if (!block.elementId) return block;

    // Placed: keep the label text in sync with the structured title.
    const labelId = blockLabelElementId(block.id);
    const label = nextElements.find((el) => el.id === labelId);
    const wantedText = block.title || 'Untitled block';
    if (!label) {
      const created = createBlockElements(block, {
        x: rect?.x ?? 140,
        y: rect?.y ?? 120,
      });
      nextElements = [...nextElements, created[1]];
      changed = true;
    } else if (label.text !== wantedText) {
      nextElements = nextElements.map((el) =>
        el.id === labelId ? { ...el, text: wantedText, originalText: wantedText } : el,
      );
      changed = true;
    }
    return block;
  });

  const blockById = new Map(normalizedBlocks.map((b) => [b.id, b]));

  // 2. Relationships: keep a named connector whenever both endpoints are placed.
  const normalizedRelationships: KnowledgeRelationship[] = knowledge.relationships.map((rel) => {
    const source = blockById.get(rel.sourceBlockId);
    const target = blockById.get(rel.targetBlockId);
    const sourceEl = source?.elementId
      ? nextElements.find((el) => el.id === source.elementId)
      : undefined;
    const targetEl = target?.elementId
      ? nextElements.find((el) => el.id === target.elementId)
      : undefined;
    const arrowId = connectorElementId(rel.id);
    const exists = nextElements.some((el) => el.id === arrowId);

    if (!sourceEl || !targetEl) {
      // Endpoints are not both on the canvas: no connector may remain.
      if (exists) {
        nextElements = nextElements.filter(
          (el) => el.id !== arrowId && el.id !== connectorLabelElementId(rel.id),
        );
        changed = true;
      }
      return rel.linkedElementId ? { ...rel, linkedElementId: undefined } : rel;
    }

    const created = createConnectorElements(rel, sourceEl, targetEl);
    if (!exists) {
      // Covers relationships created before their blocks were placed.
      nextElements = [...nextElements, ...created];
      changed = true;
      return { ...rel, linkedElementId: arrowId };
    }

    // Refresh geometry, label text and direction on the existing connector.
    const wantedText = rel.label || 'related';
    const currentArrow = nextElements.find((el) => el.id === arrowId);
    const currentLabel = nextElements.find((el) => el.id === connectorLabelElementId(rel.id));
    const wanted = created[0];
    // Direction changes must be visible on the canvas, so any visual difference
    // (arrowheads, geometry, label) marks the scene as changed.
    if (
      !currentArrow ||
      currentArrow.startArrowhead !== wanted.startArrowhead ||
      currentArrow.endArrowhead !== wanted.endArrowhead ||
      currentArrow.x !== wanted.x ||
      currentArrow.y !== wanted.y ||
      JSON.stringify(currentArrow.points) !== JSON.stringify(wanted.points) ||
      currentLabel?.text !== wantedText
    ) {
      changed = true;
    }
    nextElements = nextElements.map((el) => {
      if (el.id === arrowId) {
        return {
          ...el,
          x: created[0].x,
          y: created[0].y,
          width: created[0].width,
          height: created[0].height,
          points: created[0].points,
          startBinding: created[0].startBinding,
          endBinding: created[0].endBinding,
          startArrowhead: created[0].startArrowhead,
          endArrowhead: created[0].endArrowhead,
          boundElements: [{ type: 'text', id: connectorLabelElementId(rel.id) }],
        };
      }
      if (el.id === connectorLabelElementId(rel.id)) {
        return { ...el, text: wantedText, originalText: wantedText, containerId: arrowId };
      }
      return el;
    });
    const labelEl = nextElements.find((el) => el.id === connectorLabelElementId(rel.id));
    if (!labelEl) {
      nextElements = [...nextElements, created[1]];
      changed = true;
    } else if (labelEl.text !== wantedText) {
      changed = true;
    }
    return rel.linkedElementId === arrowId ? rel : { ...rel, linkedElementId: arrowId };
  });

  // 3. Remove app-owned elements whose semantic object no longer exists.
  const liveBlockIds = new Set(normalizedBlocks.map((b) => b.id));
  const liveRelationshipIds = new Set(normalizedRelationships.map((r) => r.id));
  const before = nextElements.length;
  nextElements = nextElements.filter((el) => {
    const meta = elementRwMeta(el);
    if (!meta) return true; // ordinary freeform content is never touched
    if (meta.kind === 'block' || meta.kind === 'block-label') {
      return Boolean(meta.blockId && liveBlockIds.has(meta.blockId));
    }
    return Boolean(meta.relationshipId && liveRelationshipIds.has(meta.relationshipId));
  });
  if (nextElements.length !== before) changed = true;

  return {
    elements: nextElements,
    knowledge: { ...knowledge, blocks: normalizedBlocks, relationships: normalizedRelationships },
    changed,
  };
}
