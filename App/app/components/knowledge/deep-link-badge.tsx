'use client';

/**
 * DeepLinkBadge Component.
 * Phase 13 — Knowledge and Diagram System.
 *
 * Renders verified deep links from concept nodes to library books,
 * document locations, annotations, notes, and canvases.
 * Enforces Gate P13-G002: Calm, explicit unresolved states with zero silent failure.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Highlighter,
  FileText,
  PenTool,
  ExternalLink,
  AlertCircle,
  MapPin,
} from 'lucide-react';
import type { DeepLinkRef, DeepLinkResolution } from '@/lib/knowledge';

interface DeepLinkBadgeProps {
  link: DeepLinkRef;
  className?: string;
  onJump?: () => void;
}

export function DeepLinkBadge({ link, className = '', onJump }: DeepLinkBadgeProps) {
  const [resolution, setResolution] = useState<DeepLinkResolution | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/knowledge/resolve-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(link),
    })
      .then(async (res) => {
        if (!res.ok) {
          return {
            resolved: false,
            type: link.type,
            target: link.target,
            reason: 'Failed to verify link',
          };
        }
        return (await res.json()) as DeepLinkResolution;
      })
      .then((data) => {
        if (active) {
          setResolution(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setResolution({
            resolved: false,
            type: link.type,
            target: link.target,
            reason: 'Network or server error',
          });
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [link]);

  if (loading) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded bg-surface-muted text-muted-foreground animate-pulse ${className}`}>
        Resolving link...
      </span>
    );
  }

  if (!resolution || !resolution.resolved) {
    return (
      <span
        title={resolution?.reason || 'Referenced source missing or deleted'}
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 ${className}`}
      >
        <AlertCircle size={11} className="shrink-0" />
        <span className="truncate max-w-[160px]">
          {resolution?.reason ? `Unresolved: ${resolution.reason}` : 'Unresolved Link'}
        </span>
      </span>
    );
  }

  // Icons based on link type
  let Icon = BookOpen;
  if (link.type === 'annotation') Icon = Highlighter;
  else if (link.type === 'location') Icon = MapPin;
  else if (link.type === 'notes') Icon = FileText;
  else if (link.type === 'canvas') Icon = PenTool;
  else if (link.type === 'external') Icon = ExternalLink;

  const content = (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors ${className}`}
    >
      <Icon size={12} className="shrink-0" />
      <span className="truncate max-w-[180px]">{resolution.title || resolution.target}</span>
      <ExternalLink size={10} className="shrink-0 opacity-60" />
    </span>
  );

  if (resolution.url) {
    if (link.type === 'external') {
      return (
        <a
          href={resolution.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onJump}
          className="inline-block"
        >
          {content}
        </a>
      );
    }

    return (
      <Link href={resolution.url} onClick={onJump} className="inline-block">
        {content}
      </Link>
    );
  }

  return content;
}
