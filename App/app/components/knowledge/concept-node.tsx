'use client';

/**
 * ConceptNode Custom Component for React Flow.
 * Phase 13: Knowledge and Diagram System.
 *
 * Implements tasteful, polished node aesthetics following Apple / Emil Kowalski design principles:
 *   - Balanced typographic hierarchy
 *   - Semantic type pill
 *   - Deep link badge to source publication / annotation
 *   - Multi-directional handles for fluid topological connection
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { DeepLinkBadge } from './deep-link-badge';
import type { KnowledgeNodeType, DeepLinkRef } from '@/lib/knowledge';
import { KNOWLEDGE_HANDLES } from '@/lib/knowledge/edge-routing';

export interface ConceptNodeData {
  label: string;
  nodeType: KnowledgeNodeType;
  notes?: string;
  deepLink?: DeepLinkRef | null;
  onEdit?: (nodeId: string) => void;
  [key: string]: unknown;
}

/**
 * Restrained Read & Watch palette: warm neutrals, charcoal text, muted deep teal
 * accent. No purple, neon, or gradient treatments — semantic distinction comes
 * from a small set of muted hues only.
 */
const TYPE_STYLES: Record<string, { label: string; badgeClass: string; dotClass: string }> = {
  concept: {
    label: 'Concept',
    badgeClass: 'bg-teal-600/10 text-teal-800 dark:text-teal-300 border-teal-700/25',
    dotClass: 'bg-teal-700',
  },
  character: {
    label: 'Character',
    badgeClass: 'bg-emerald-600/10 text-emerald-800 dark:text-emerald-300 border-emerald-700/25',
    dotClass: 'bg-emerald-700',
  },
  location: {
    label: 'Location',
    badgeClass: 'bg-amber-600/10 text-amber-800 dark:text-amber-300 border-amber-700/25',
    dotClass: 'bg-amber-700',
  },
  group: {
    label: 'Group / Faction',
    badgeClass: 'bg-stone-600/10 text-stone-800 dark:text-stone-300 border-stone-700/25',
    dotClass: 'bg-stone-700',
  },
  object: {
    label: 'Object',
    badgeClass: 'bg-orange-600/10 text-orange-800 dark:text-orange-300 border-orange-700/25',
    dotClass: 'bg-orange-700',
  },
  theme: {
    label: 'Theme',
    badgeClass: 'bg-teal-700/10 text-teal-900 dark:text-teal-200 border-teal-800/25',
    dotClass: 'bg-teal-800',
  },
  episode: {
    label: 'Episode',
    badgeClass: 'bg-stone-600/10 text-stone-800 dark:text-stone-300 border-stone-700/25',
    dotClass: 'bg-stone-600',
  },
  theory: {
    label: 'Theory',
    badgeClass: 'bg-cyan-700/10 text-cyan-900 dark:text-cyan-300 border-cyan-800/25',
    dotClass: 'bg-cyan-800',
  },
  thesis: {
    label: 'Thesis',
    badgeClass: 'bg-teal-700/10 text-teal-900 dark:text-teal-200 border-teal-800/25',
    dotClass: 'bg-teal-900',
  },
  evidence: {
    label: 'Evidence',
    badgeClass: 'bg-emerald-700/10 text-emerald-900 dark:text-emerald-300 border-emerald-800/25',
    dotClass: 'bg-emerald-800',
  },
  source: {
    label: 'Source',
    badgeClass: 'bg-stone-700/10 text-stone-800 dark:text-stone-300 border-stone-800/25',
    dotClass: 'bg-stone-800',
  },
  person: {
    label: 'Person / Author',
    badgeClass: 'bg-amber-700/10 text-amber-900 dark:text-amber-300 border-amber-800/25',
    dotClass: 'bg-amber-800',
  },
  event: {
    label: 'Event / History',
    badgeClass: 'bg-rose-700/10 text-rose-900 dark:text-rose-300 border-rose-800/25',
    dotClass: 'bg-rose-800',
  },
  question: {
    label: 'Question',
    badgeClass: 'bg-amber-600/10 text-amber-800 dark:text-amber-300 border-amber-700/25',
    dotClass: 'bg-amber-600',
  },
};

function ConceptNodeBase({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as ConceptNodeData;
  const nodeType = nodeData.nodeType || 'concept';
  const typeStyle = TYPE_STYLES[nodeType] || TYPE_STYLES.concept;

  return (
    <div
      className={`min-w-[220px] max-w-[320px] rounded-lg border bg-surface p-3.5 shadow-xs transition-all duration-200 text-foreground ${
        selected
          ? 'border-primary ring-2 ring-primary/25 shadow-sm'
          : 'border-border hover:border-primary/45 hover:shadow-xs'
      }`}
    >
      {/* Connection Handles — named so multi-edge routing can pick distinct anchors */}
      <Handle
        id={KNOWLEDGE_HANDLES.targetTop}
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-muted-foreground/60 !border-2 !border-surface transition-transform hover:!scale-125"
      />
      <Handle
        id={KNOWLEDGE_HANDLES.targetLeft}
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-muted-foreground/60 !border-2 !border-surface transition-transform hover:!scale-125"
      />
      <Handle
        id={KNOWLEDGE_HANDLES.sourceRight}
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-surface transition-transform hover:!scale-125"
      />
      <Handle
        id={KNOWLEDGE_HANDLES.sourceBottom}
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-surface transition-transform hover:!scale-125"
      />

      {/* Node Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md border ${typeStyle.badgeClass}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${typeStyle.dotClass}`} />
          {typeStyle.label}
        </span>

        {nodeData.onEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              nodeData.onEdit?.(id);
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-surface-muted cursor-pointer"
          >
            Edit
          </button>
        )}
      </div>

      {/* Label */}
      <h4 className="text-sm font-semibold tracking-tight text-foreground leading-snug break-words">
        {nodeData.label || 'Untitled Concept'}
      </h4>

      {/* Notes snippet */}
      {nodeData.notes && (
        <p className="mt-1.5 text-xs text-muted-foreground line-clamp-3 leading-relaxed">
          {nodeData.notes}
        </p>
      )}

      {/* Deep Link to Source Material */}
      {nodeData.deepLink && (
        <div className="mt-2.5 pt-2 border-t border-border/50">
          <DeepLinkBadge link={nodeData.deepLink} />
        </div>
      )}
    </div>
  );
}

export const ConceptNode = memo(ConceptNodeBase);
