'use client';

/**
 * Structured knowledge editor for a Knowledge Canvas.
 *
 * This is the semantic half of ONE workspace: the Excalidraw surface is the
 * freeform half, and these blocks/relationships are stored in the same canvas
 * document. The panel also provides the accessible list/table alternative that
 * drag-only editing cannot offer.
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Trash2,
  ArrowLeftRight,
  ArrowRight,
  ExternalLink,
  LayoutList,
  PencilLine,
  Blocks,
  Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  addBlock,
  addRelationship,
  createKnowledgeBlock,
  createRelationship,
  KNOWLEDGE_BLOCK_TYPES,
  RELATIONSHIP_PRESETS,
  removeBlock,
  removeRelationship,
  updateBlock,
  updateRelationship,
} from '@/lib/canvas/knowledge';
import type {
  CanvasKnowledge,
  KnowledgeBlock,
  KnowledgeRelationship,
} from '@/lib/canvas';

export interface KnowledgePanelProps {
  knowledge: CanvasKnowledge;
  onChange: (next: CanvasKnowledge) => void;
  /** True when a block has a visual element on the canvas surface. */
  onPlaceBlock?: (block: KnowledgeBlock) => void;
  onFocusBlock?: (block: KnowledgeBlock) => void;
  /** Called after a relationship is created so the surface can draw a connector. */
  onRelationshipCreated?: (relationship: KnowledgeRelationship) => void;
  /** Read-only rendering (used for the accessible summary in the library). */
  readOnly?: boolean;
}

function sourceHref(source: KnowledgeBlock['source']): string | null {
  if (!source) return null;
  if (source.annotationId && source.itemId) {
    return `/reader/${encodeURIComponent(source.itemId)}?annotationId=${encodeURIComponent(source.annotationId)}`;
  }
  if (source.itemId) return `/reader/${encodeURIComponent(source.itemId)}`;
  return null;
}

function sourceLabel(block: KnowledgeBlock): string | null {
  const source = block.source;
  if (!source) return null;
  if (source.label) return source.label;
  if (source.quote) return `“${source.quote.slice(0, 32)}${source.quote.length > 32 ? '…' : ''}”`;
  if (source.annotationId) return 'Annotation';
  if (source.legacyGraphId) return 'Imported';
  return 'Source';
}

export function KnowledgePanel({
  knowledge,
  onChange,
  onPlaceBlock,
  onFocusBlock,
  onRelationshipCreated,
  readOnly = false,
}: KnowledgePanelProps) {
  const [view, setView] = useState<'blocks' | 'relationships'>('blocks');
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingRelationshipId, setEditingRelationshipId] = useState<string | null>(null);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [linkTargetId, setLinkTargetId] = useState<string | null>(null);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkMutual, setLinkMutual] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const handleAddBlock = (type = 'concept') => {
    const block = createKnowledgeBlock({ type, title: '' });
    onChange(addBlock(knowledge, block));
    setEditingBlockId(block.id);
  };

  const handleDeleteBlock = (blockId: string) => {
    onChange(removeBlock(knowledge, blockId));
    if (editingBlockId === blockId) setEditingBlockId(null);
  };

  const handleAddRelationship = () => {
    setLinkError(null);
    if (!linkSourceId || !linkTargetId) {
      setLinkError('Choose both a source block and a target block.');
      return;
    }
    if (linkSourceId === linkTargetId) {
      setLinkError('A block cannot be related to itself.');
      return;
    }
    const relationship = createRelationship({
      sourceBlockId: linkSourceId,
      targetBlockId: linkTargetId,
      label: linkLabel,
      direction: linkMutual ? 'mutual' : 'directed',
    });
    onChange(addRelationship(knowledge, relationship));
    onRelationshipCreated?.(relationship);
    setLinkLabel('');
    setLinkMutual(false);
    setEditingRelationshipId(relationship.id);
  };

  return (
    <div className="flex h-full w-full flex-col bg-surface" data-testid="knowledge-panel">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5 shrink-0">
        <button
          type="button"
          onClick={() => setView('blocks')}
          aria-pressed={view === 'blocks'}
          data-testid="knowledge-tab-blocks"
          className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
            view === 'blocks'
              ? 'bg-surface-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Blocks size={12} />
          Blocks
          <span className="font-mono text-[10px]">{knowledge.blocks.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setView('relationships')}
          aria-pressed={view === 'relationships'}
          data-testid="knowledge-tab-relationships"
          className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
            view === 'relationships'
              ? 'bg-surface-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Link2 size={12} />
          Relationships
          <span className="font-mono text-[10px]">{knowledge.relationships.length}</span>
        </button>
        {!readOnly && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => handleAddBlock()}
            className="ml-auto h-6 px-2 text-[11px]"
            title="Add a structured knowledge block"
          >
            <Plus size={11} className="mr-1" />
            New block
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {view === 'blocks' && (
          <div className="divide-y divide-border">
            {knowledge.blocks.length === 0 && (
              <div className="p-6 text-center text-[11px] text-muted-foreground">
                No structured blocks yet. Blocks live in the same document as the freeform
                canvas, so you can mix drawings, images, and structured knowledge freely.
              </div>
            )}
            {knowledge.blocks.map((block) => {
              const href = sourceHref(block.source);
              const label = sourceLabel(block);
              const isEditing = editingBlockId === block.id;
              return (
                <div key={block.id} className="px-3 py-2.5" data-testid={`block-${block.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] capitalize shrink-0">
                          {block.type}
                        </Badge>
                        {block.title ? (
                          <span className="truncate text-xs font-semibold text-foreground">
                            {block.title}
                          </span>
                        ) : (
                          <span className="truncate text-xs italic text-muted-foreground">
                            Untitled block
                          </span>
                        )}
                      </div>
                      {block.body && (
                        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                          {block.body}
                        </p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {label && href && (
                          <Link
                            href={href}
                            className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                            title="Go to source"
                          >
                            <ExternalLink size={10} />
                            {label}
                          </Link>
                        )}
                        {block.elementId ? (
                          <button
                            type="button"
                            onClick={() => onFocusBlock?.(block)}
                            className="text-[10px] text-muted-foreground hover:text-foreground"
                          >
                            On canvas
                          </button>
                        ) : (
                          !readOnly && (
                            <button
                              type="button"
                              onClick={() => onPlaceBlock?.(block)}
                              className="text-[10px] text-muted-foreground hover:text-foreground"
                              title="Create a visual element for this block"
                            >
                              Place on canvas
                            </button>
                          )
                        )}
                      </div>
                    </div>
                    {!readOnly && (
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setEditingBlockId(isEditing ? null : block.id)}
                          aria-label={`Edit block ${block.title || 'untitled'}`}
                          aria-expanded={isEditing}
                          className="rounded p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                        >
                          <PencilLine size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBlock(block.id)}
                          aria-label={`Delete block ${block.title || 'untitled'}`}
                          className="rounded p-1 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    )}
                  </div>

                  {isEditing && !readOnly && (
                    <div className="mt-2.5 space-y-2 rounded-md border border-border bg-surface-muted/30 p-2.5">
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Title
                        </span>
                        <input
                          type="text"
                          value={block.title}
                          aria-label="Block title"
                          onChange={(e) =>
                            onChange(updateBlock(knowledge, block.id, { title: e.target.value }))
                          }
                          className="w-full rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Type
                        </span>
                        <select
                          value={block.type}
                          aria-label="Block type"
                          onChange={(e) =>
                            onChange(updateBlock(knowledge, block.id, { type: e.target.value }))
                          }
                          className="w-full rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
                        >
                          {KNOWLEDGE_BLOCK_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                          {!KNOWLEDGE_BLOCK_TYPES.some((t) => t.value === block.type) && (
                            <option value={block.type}>{block.type}</option>
                          )}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Notes
                        </span>
                        <textarea
                          value={block.body ?? ''}
                          aria-label="Block notes"
                          rows={3}
                          onChange={(e) =>
                            onChange(updateBlock(knowledge, block.id, { body: e.target.value }))
                          }
                          className="w-full rounded border border-border bg-surface p-2 text-xs text-foreground"
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {view === 'relationships' && (
          <div>
            {!readOnly && (
              <div className="space-y-2 border-b border-border bg-surface-muted/25 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      From
                    </span>
                    <select
                      value={linkSourceId ?? ''}
                      aria-label="Relationship source block"
                      onChange={(e) => setLinkSourceId(e.target.value || null)}
                      className="w-full rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
                    >
                      <option value="">Select block</option>
                      {knowledge.blocks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.title || 'Untitled block'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      To
                    </span>
                    <select
                      value={linkTargetId ?? ''}
                      aria-label="Relationship target block"
                      onChange={(e) => setLinkTargetId(e.target.value || null)}
                      className="w-full rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
                    >
                      <option value="">Select block</option>
                      {knowledge.blocks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.title || 'Untitled block'}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Relationship label
                  </span>
                  <input
                    type="text"
                    value={linkLabel}
                    aria-label="New relationship label"
                    placeholder="causes, supports, contradicts…"
                    onChange={(e) => setLinkLabel(e.target.value)}
                    className="w-full rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-1">
                  {RELATIONSHIP_PRESETS.slice(0, 8).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setLinkLabel(preset)}
                      className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={linkMutual}
                      onChange={(e) => setLinkMutual(e.target.checked)}
                    />
                    Mutual
                  </label>
                  <Button type="button" size="sm" onClick={handleAddRelationship} className="h-6 px-2 text-[11px]">
                    <Plus size={11} className="mr-1" />
                    Connect
                  </Button>
                </div>
                {linkError && <p className="text-[11px] text-destructive">{linkError}</p>}
              </div>
            )}

            <div className="divide-y divide-border">
              {knowledge.relationships.length === 0 && (
                <div className="p-6 text-center text-[11px] text-muted-foreground">
                  No relationships yet. Named lines live in the same document as the blocks.
                </div>
              )}
              {knowledge.relationships.map((rel) => {
                const source = knowledge.blocks.find((b) => b.id === rel.sourceBlockId);
                const target = knowledge.blocks.find((b) => b.id === rel.targetBlockId);
                const isEditing = editingRelationshipId === rel.id;
                return (
                  <div key={rel.id} className="px-3 py-2.5" data-testid={`relationship-${rel.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5 text-xs">
                        <span className="truncate font-medium text-foreground">
                          {source?.title || 'Missing block'}
                        </span>
                        {rel.direction === 'mutual' ? (
                          <ArrowLeftRight size={12} className="shrink-0 text-muted-foreground" />
                        ) : (
                          <ArrowRight size={12} className="shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate font-medium text-foreground">
                          {target?.title || 'Missing block'}
                        </span>
                      </div>
                      {!readOnly && (
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => setEditingRelationshipId(isEditing ? null : rel.id)}
                            aria-label="Edit relationship"
                            aria-expanded={isEditing}
                            className="rounded p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                          >
                            <PencilLine size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onChange(removeRelationship(knowledge, rel.id))}
                            aria-label="Delete relationship"
                            className="rounded p-1 text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                    {!isEditing && rel.label && (
                      <p className="mt-0.5 text-[11px] text-primary">{rel.label}</p>
                    )}
                    {isEditing && !readOnly && (
                      <div className="mt-2 space-y-2 rounded-md border border-border bg-surface-muted/30 p-2.5">
                        <input
                          type="text"
                          value={rel.label}
                          aria-label="Relationship label"
                          onChange={(e) =>
                            onChange(
                              updateRelationship(knowledge, rel.id, { label: e.target.value }),
                            )
                          }
                          className="w-full rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
                        />
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onChange(
                                updateRelationship(knowledge, rel.id, { direction: 'directed' }),
                              )
                            }
                            className={`rounded border px-2 py-1 text-[10px] ${
                              rel.direction === 'directed'
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground'
                            }`}
                          >
                            Directed
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onChange(
                                updateRelationship(knowledge, rel.id, { direction: 'mutual' }),
                              )
                            }
                            className={`rounded border px-2 py-1 text-[10px] ${
                              rel.direction === 'mutual'
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground'
                            }`}
                          >
                            Mutual
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Accessible alternative: the same knowledge as a plain table. */}
      <details className="border-t border-border bg-surface-muted/20 px-3 py-2 text-[11px]">
        <summary className="flex cursor-pointer items-center gap-1.5 text-muted-foreground">
          <LayoutList size={12} />
          Accessible list
        </summary>
        <div className="mt-2 space-y-1.5">
          {knowledge.blocks.map((block) => (
            <div key={`list-${block.id}`} className="flex items-start justify-between gap-2">
              <span className="truncate text-foreground">
                {block.title || 'Untitled block'}
                {block.body ? ` — ${block.body}` : ''}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {block.type}
              </span>
            </div>
          ))}
          {knowledge.relationships.map((rel) => {
            const source = knowledge.blocks.find((b) => b.id === rel.sourceBlockId);
            const target = knowledge.blocks.find((b) => b.id === rel.targetBlockId);
            return (
              <div key={`list-${rel.id}`} className="text-muted-foreground">
                {source?.title || '?'} {rel.direction === 'mutual' ? '↔' : '→'}{' '}
                {target?.title || '?'} — {rel.label || 'related'}
              </div>
            );
          })}
          {knowledge.blocks.length === 0 && knowledge.relationships.length === 0 && (
            <div className="text-muted-foreground">No structured knowledge on this canvas yet.</div>
          )}
        </div>
      </details>

      <span className="sr-only" aria-live="polite">
        {editingBlockId
          ? `Editing block ${knowledge.blocks.find((b) => b.id === editingBlockId)?.title || 'untitled'}`
          : editingRelationshipId
            ? `Editing relationship ${knowledge.relationships.find((r) => r.id === editingRelationshipId)?.label || 'unlabelled'}`
            : ''}
      </span>
    </div>
  );
}
