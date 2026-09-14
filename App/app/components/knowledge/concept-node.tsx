'use client';

/**
 * ConceptNode Custom Component for React Flow.
 * Phase 13 — Knowledge and Diagram System.
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

export interface ConceptNodeData {
  label: string;
  nodeType: KnowledgeNodeType;
  notes?: string;
  deepLink?: DeepLinkRef | null;
  onEdit?: (nodeId: string) => void;
  [key: string]: unknown;
}

const TYPE_STYLES: Record<KnowledgeNodeType, { label: string; badgeClass: string; dotClass: string }> = {
  concept: {
    label: 'Concept',
    badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    dotClass: 'bg-indigo-500',
  },
  thesis: {
    label: 'Thesis',
    badgeClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
    dotClass: 'bg-purple-500',
  },
  evidence: {
    label: 'Evidence',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    dotClass: 'bg-emerald-500',
  },
  source: {
    label: 'Source',
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    dotClass: 'bg-blue-500',
  },
  person: {
    label: 'Person / Author',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    dotClass: 'bg-amber-500',
  },
  event: {
    label: 'Event / History',
    badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    dotClass: 'bg-rose-500',
  },
  question: {
    label: 'Question',
    badgeClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
    dotClass: 'bg-sky-500',
  },
};

function ConceptNodeBase({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as ConceptNodeData;
  const nodeType = nodeData.nodeType || 'concept';
  const typeStyle = TYPE_STYLES[nodeType] || TYPE_STYLES.concept;

  return (
    <div
      className={`min-w-[220px] max-w-[320px] rounded-xl border bg-surface/95 backdrop-blur-sm p-3.5 shadow-sm transition-all duration-200 text-foreground ${
        selected
          ? 'border-primary ring-2 ring-primary/20 shadow-md scale-[1.02]'
          : 'border-border hover:border-border-hover hover:shadow'
      }`}
    >
      {/* Connection Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-muted-foreground/60 !border-2 !border-surface transition-transform hover:!scale-125"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-muted-foreground/60 !border-2 !border-surface transition-transform hover:!scale-125"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-surface transition-transform hover:!scale-125"
      />
      <Handle
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
