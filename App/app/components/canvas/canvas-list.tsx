'use client';

/**
 * CanvasList Component.
 * Lists canvases with book associations, search, create actions, and quick open.
 * Phase 10 — Book-Linked Excalidraw Notes.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  PenTool,
  Plus,
  BookOpen,
  Calendar,
  Trash2,
  Search,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { CanvasMetadata } from '@/lib/canvas';

interface CanvasListProps {
  itemId?: string | null;
  bookTitle?: string;
  onSelectCanvas?: (canvasId: string) => void;
}

export function CanvasList({ itemId, bookTitle: _bookTitle, onSelectCanvas }: CanvasListProps) {
  const [canvases, setCanvases] = useState<CanvasMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const fetchCanvases = useCallback(async () => {
    try {
      const url = itemId
        ? `/api/reader/items/${encodeURIComponent(itemId)}/canvases`
        : '/api/reader/canvases';
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as CanvasMetadata[];
        setCanvases(data);
      }
    } catch (err) {
      console.error('Failed to load canvases:', err);
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    let active = true;
    const url = itemId
      ? `/api/reader/items/${encodeURIComponent(itemId)}/canvases`
      : '/api/reader/canvases';

    fetch(url)
      .then(async (res) => {
        if (!res.ok) return [] as CanvasMetadata[];
        return (await res.json()) as CanvasMetadata[];
      })
      .then((data) => {
        if (active) {
          setCanvases(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          console.error('Failed to load canvases:', err);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [itemId]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    try {
      const url = itemId
        ? `/api/reader/items/${encodeURIComponent(itemId)}/canvases`
        : '/api/reader/canvases';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), itemId: itemId || null }),
      });
      if (res.ok) {
        const created = (await res.json()) as { canvasId: string };
        setNewTitle('');
        setIsCreating(false);
        await fetchCanvases();
        if (onSelectCanvas) {
          onSelectCanvas(created.canvasId);
        }
      }
    } catch (err) {
      console.error('Failed to create canvas:', err);
    }
  };

  const handleDelete = async (canvasId: string, revision: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm('Are you sure you want to delete this canvas? It can be restored later.')) return;

    try {
      const res = await fetch(`/api/reader/canvases/${encodeURIComponent(canvasId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: revision }),
      });
      if (res.ok) {
        await fetchCanvases();
      }
    } catch (err) {
      console.error('Failed to delete canvas:', err);
    }
  };

  const filtered = canvases.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full w-full bg-surface text-foreground select-none">
      {/* Search & Actions Bar */}
      <div className="p-3 border-b border-border flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search canvases..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface-muted/50 border border-border text-xs rounded pl-8 pr-3 py-1.5 focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <Button
            size="sm"
            onClick={() => setIsCreating(true)}
            className="h-8 px-2.5 text-xs shrink-0"
          >
            <Plus size={14} className="mr-1" />
            New Canvas
          </Button>
        </div>

        {/* Inline Create Form */}
        {isCreating && (
          <div className="flex items-center gap-1.5 p-2 bg-surface-muted/60 border border-border rounded animate-in fade-in slide-in-from-top-1">
            <input
              type="text"
              placeholder="Canvas title..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
              className="flex-1 bg-surface border border-border text-xs rounded px-2.5 py-1 text-foreground"
            />
            <Button size="sm" onClick={handleCreate} className="h-7 text-xs px-2.5">
              Create
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsCreating(false)}
              className="h-7 text-xs px-2"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Canvases List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-6">Loading canvases...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 px-4 border border-dashed border-border rounded-lg">
            <PenTool className="h-7 w-7 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-xs font-semibold text-foreground mb-1">No canvases yet</p>
            <p className="text-[11px] text-muted-foreground mb-3">
              {itemId
                ? 'Create a linked drawing or notes canvas for this publication.'
                : 'Create a standalone canvas for notes and diagrams.'}
            </p>
            <Button size="sm" variant="secondary" onClick={() => setIsCreating(true)} className="text-xs">
              <Plus size={13} className="mr-1" />
              Create Canvas
            </Button>
          </div>
        ) : (
          filtered.map((c) => {
            const dateStr = new Date(c.updatedAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            });

            return (
              <div
                key={c.id}
                className="p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-surface-muted/50 transition-colors flex items-center justify-between gap-3 group"
              >
                {onSelectCanvas ? (
                  <button
                    type="button"
                    onClick={() => onSelectCanvas(c.id)}
                    className="text-left min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-xs font-semibold text-foreground truncate">{c.title}</h3>
                      {c.itemId && (
                        <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 shrink-0">
                          <BookOpen size={9} className="mr-1" />
                          Book-Linked
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
                      <span className="flex items-center gap-1">
                        <Calendar size={10} />
                        {dateStr}
                      </span>
                      <span>Rev. {c.revision}</span>
                    </div>
                  </button>
                ) : (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-xs font-semibold text-foreground truncate">{c.title}</h3>
                      {c.itemId && (
                        <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 shrink-0">
                          <BookOpen size={9} className="mr-1" />
                          Book-Linked
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
                      <span className="flex items-center gap-1">
                        <Calendar size={10} />
                        {dateStr}
                      </span>
                      <span>Rev. {c.revision}</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0">
                  {!onSelectCanvas && (
                    <Link href={`/canvas-notes/${c.id}`}>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" title="Open Fullscreen">
                        <ExternalLink size={13} />
                      </Button>
                    </Link>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleDelete(c.id, c.revision, e)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    title="Delete Canvas"
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
