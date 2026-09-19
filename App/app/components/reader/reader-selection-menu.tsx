'use client';

/**
 * Reader Selection Study Menu.
 * Phase 11 — Selection Actions, Dictionary/Translation Hooks, Notes & Canvas Handoff.
 *
 * Capabilities:
 *   1. Copy: Clipboard API with fallback and toast feedback.
 *   2. Define: Dictionary hook (graceful offline notice when unconfigured).
 *   3. Translate: Translation hook (graceful offline notice when unconfigured).
 *   4. Send to Notes: Appends excerpt + citation to item notes with conflict detection.
 *   5. Send to Canvas: Appends excerpt element to linked canvas or creates a new one.
 *
 * Privacy & Offline Guarantee:
 *   100% offline by default; zero cloud/remote calls.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Copy,
  BookA,
  Languages,
  StickyNote,
  LayoutGrid,
  Check,
  X,
  Plus,
  Loader2,
  Info,
  Highlighter,
  Underline,
  Strikethrough,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useReader } from './reader-context';
import { studyExtensions, type DictionaryLookupResult, type TranslationResult } from '@/lib/study/extension-hooks';
import { UserDataService } from '@/lib/user-data';
import type { CanvasMetadata } from '@/lib/canvas';
import { addAnnotationToKnowledgeCanvas } from '@/lib/canvas';

interface SelectionCoords {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function ReaderSelectionMenu() {
  const {
    snapshot,
    itemId,
    createTextMark,
    createExcerpt,
    refreshCanvases,
    setActiveAnnotationId,
    setStudyPane,
    readerLayout,
    setReaderLayout,
  } = useReader();
  const toast = useToast();

  const [selectedText, setSelectedText] = useState('');
  const [menuCoords, setMenuCoords] = useState<SelectionCoords | null>(null);
  const [activeModal, setActiveModal] = useState<
    'define' | 'translate' | 'notes' | 'canvas' | null
  >(null);

  // Define & Translate state
  const [lookupResult, setLookupResult] = useState<DictionaryLookupResult | null>(null);
  const [translationResult, setTranslationResult] = useState<TranslationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Notes state
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Canvas state
  const [canvases, setCanvases] = useState<CanvasMetadata[]>([]);
  const [isLoadingCanvases, setIsLoadingCanvases] = useState(false);
  const [isAddingToCanvas, setIsAddingToCanvas] = useState(false);
  const [newCanvasTitle, setNewCanvasTitle] = useState('');

  const menuRef = useRef<HTMLDivElement>(null);

  /**
   * Create the requested text mark from the live selection, then focus it in the
   * book's annotation pane so a note can be added immediately.
   */
  const markAndFocus = async (subKind: 'highlight' | 'underline' | 'strike') => {
    const created = await createTextMark(subKind);
    if (!created) return;
    setActiveAnnotationId(created.id);
    if (readerLayout === 'full') setReaderLayout('split');
    setStudyPane('annotations');
    setSelectedText('');
    setMenuCoords(null);
    if (typeof window !== 'undefined') window.getSelection()?.removeAllRanges();
  };

  // Listen to selection changes
  const updateSelection = useCallback(() => {
    if (typeof window === 'undefined') return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      // Don't close modal if one is open
      if (!activeModal) {
        setSelectedText('');
        setMenuCoords(null);
      }
      return;
    }

    const text = selection.toString().trim();
    if (text.length === 0) {
      if (!activeModal) {
        setSelectedText('');
        setMenuCoords(null);
      }
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) {
      return;
    }

    setSelectedText(text);
    setMenuCoords({
      top: rect.top,
      left: rect.left + rect.width / 2,
      width: rect.width,
      height: rect.height,
    });
  }, [activeModal]);

  useEffect(() => {
    const handleMouseUp = () => {
      // Delay slightly for selection to settle
      setTimeout(updateSelection, 20);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedText('');
        setMenuCoords(null);
        setActiveModal(null);
      } else {
        setTimeout(updateSelection, 20);
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [updateSelection]);

  // Action: Copy
  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(selectedText);
        toast.success('Copied text to clipboard');
      } else {
        toast.error('Clipboard not available');
      }
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  // Action: Define
  const handleDefine = async () => {
    setActiveModal('define');
    const provider = studyExtensions.getDictionaryProvider();
    if (!provider) {
      setLookupResult(null);
      return;
    }

    setIsProcessing(true);
    try {
      const cleanWord = selectedText.replace(/^[^\w]+|[^\w]+$/g, '').slice(0, 50);
      const res = await provider.lookup({ word: cleanWord });
      setLookupResult(res);
    } catch {
      setLookupResult(null);
    } finally {
      setIsProcessing(false);
    }
  };

  // Action: Translate
  const handleTranslate = async () => {
    setActiveModal('translate');
    const provider = studyExtensions.getTranslationProvider();
    if (!provider) {
      setTranslationResult(null);
      return;
    }

    setIsProcessing(true);
    try {
      const res = await provider.translate({
        text: selectedText,
        targetLanguage: 'en',
      });
      setTranslationResult(res);
    } catch {
      setTranslationResult(null);
    } finally {
      setIsProcessing(false);
    }
  };

  // Action: Open Notes Modal
  const handleOpenNotes = () => {
    setActiveModal('notes');
  };

  // Execute Send to Notes
  const handleSendToNotes = async () => {
    if (!itemId) return;
    setIsSavingNote(true);
    try {
      const existing = await UserDataService.load('notes', itemId);
      const currentContent = existing.content || '';

      const bookTitle = snapshot.source?.title || 'Publication';
      const pageInfo =
        snapshot.currentPage > 0 ? ` (Page ${snapshot.currentPage})` : '';
      const citation = `\n\n> "${selectedText}"\n> - *${bookTitle}${pageInfo}*\n`;

      const nextContent = currentContent ? `${currentContent.trimEnd()}${citation}` : citation.trimStart();

      const saveResult = await UserDataService.save(
        'notes',
        itemId,
        nextContent,
        existing.revision,
      );

      if (!saveResult.ok && saveResult.conflict) {
        // Resolve conflict by appending to latest
        const latestContent = saveResult.content || '';
        const resolvedContent = latestContent ? `${latestContent.trimEnd()}${citation}` : citation.trimStart();
        await UserDataService.save('notes', itemId, resolvedContent, saveResult.revision);
      }

      toast.success('Excerpt added to item notes');
      setActiveModal(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save excerpt to notes');
    } finally {
      setIsSavingNote(false);
    }
  };

  // Action: Open Canvas Modal
  const handleOpenCanvas = async () => {
    setActiveModal('canvas');
    setIsLoadingCanvases(true);
    try {
      const res = await fetch(`/api/reader/items/${encodeURIComponent(itemId)}/canvases`);
      if (res.ok) {
        const data = (await res.json()) as CanvasMetadata[];
        setCanvases(data.filter((c) => !c.deletedAt));
      }
    } catch {
      setCanvases([]);
    } finally {
      setIsLoadingCanvases(false);
    }
  };

  // Execute Send to Canvas
  const handleSendToCanvas = async (canvasId: string) => {
    setIsAddingToCanvas(true);
    try {
      // Unified Knowledge Canvas path: the selection first becomes a real source
      // annotation (evidence with provenance), then a structured, source-linked
      // canvas block with a real visual element. No detached raw text card.
      const annotation = await createExcerpt();
      if (!annotation) return;

      const result = await addAnnotationToKnowledgeCanvas(canvasId, annotation, {
        itemId,
      });
      if (result.status === 'failed') {
        toast.error(result.message || 'Adding to the Knowledge Canvas failed');
        return;
      }
      await refreshCanvases();
      setStudyPane('canvas');
      toast.success(
        result.status === 'already-present'
          ? 'Already on this Knowledge Canvas'
          : 'Added to the Knowledge Canvas',
      );
      setActiveModal(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add to the Knowledge Canvas');
    } finally {
      setIsAddingToCanvas(false);
    }
  };

  // Create a new book-level Knowledge Canvas (item-scoped) and add to it.
  const handleCreateCanvasAndSend = async () => {
    const title =
      newCanvasTitle.trim() ||
      `${snapshot.source?.title || 'Book'} - Knowledge Canvas`;
    setIsAddingToCanvas(true);
    try {
      const createRes = await fetch(
        `/api/reader/items/${encodeURIComponent(itemId)}/canvases`,
        {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          scope: { kind: 'book', label: 'Whole book' },
        }),
        },
      );

      if (!createRes.ok) {
        throw new Error('Failed to create new canvas');
      }

      const created = (await createRes.json()) as { canvasId: string };
      await handleSendToCanvas(created.canvasId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create the Knowledge Canvas');
      setIsAddingToCanvas(false);
    }
  };

  if (!menuCoords || !selectedText) {
    return null;
  }

  // Positioning: float 45px above selection center, clamp within window
  const topPos = Math.max(12, menuCoords.top - 48);
  const leftPos = Math.max(160, Math.min(window.innerWidth - 160, menuCoords.left));

  return (
    <>
      {/* Floating Action Menu Bar */}
      <div
        ref={menuRef}
        role="toolbar"
        aria-label="Selection Actions"
        style={{
          position: 'fixed',
          top: `${topPos}px`,
          left: `${leftPos}px`,
          transform: 'translateX(-50%)',
          zIndex: 50,
        }}
        className="flex items-center gap-0.5 p-1 bg-surface border border-border rounded-lg shadow-md text-foreground text-xs select-none animate-in fade-in-0 zoom-in-95 duration-100"
      >
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-surface-muted transition-colors font-medium text-[11px]"
          title="Copy selected text"
        >
          <Copy size={12} className="text-muted-foreground" />
          <span>Copy</span>
        </button>

        <div className="w-px h-3 bg-border/80 mx-0.5" />

        {/* Source marking: highlight / underline / strike, then an optional note */}
        <button
          type="button"
          onClick={() => void markAndFocus('highlight')}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-surface-muted transition-colors font-medium text-[11px]"
          title="Highlight selection"
          data-testid="selection-highlight"
        >
          <Highlighter size={12} className="text-amber-600" />
          <span>Highlight</span>
        </button>
        <button
          type="button"
          onClick={() => void markAndFocus('underline')}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-surface-muted transition-colors font-medium text-[11px]"
          title="Underline selection"
          data-testid="selection-underline"
        >
          <Underline size={12} className="text-primary" />
          <span>Underline</span>
        </button>
        <button
          type="button"
          onClick={() => void markAndFocus('strike')}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-surface-muted transition-colors font-medium text-[11px]"
          title="Strike through selection"
          data-testid="selection-strike"
        >
          <Strikethrough size={12} className="text-orange-700" />
          <span>Strike</span>
        </button>

        <div className="w-px h-3 bg-border/80 mx-0.5" />

        <button
          type="button"
          onClick={handleDefine}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-surface-muted transition-colors font-medium text-[11px]"
          title="Define word or phrase"
        >
          <BookA size={12} className="text-muted-foreground" />
          <span>Define</span>
        </button>

        <button
          type="button"
          onClick={handleTranslate}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-surface-muted transition-colors font-medium text-[11px]"
          title="Translate selection"
        >
          <Languages size={12} className="text-muted-foreground" />
          <span>Translate</span>
        </button>

        <div className="w-px h-3 bg-border/80 mx-0.5" />

        <button
          type="button"
          onClick={handleOpenNotes}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-surface-muted transition-colors font-medium text-[11px]"
          title="Send excerpt to item notes"
        >
          <StickyNote size={12} className="text-muted-foreground" />
          <span>Notes</span>
        </button>

        <button
          type="button"
          onClick={handleOpenCanvas}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-surface-muted transition-colors font-medium text-[11px]"
          title="Send excerpt to canvas"
        >
          <LayoutGrid size={12} className="text-muted-foreground" />
          <span>Canvas</span>
        </button>
      </div>

      {/* Define Dialog */}
      {activeModal === 'define' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-surface border border-border rounded-xl shadow-xl p-5 animate-in fade-in-0 zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <BookA size={16} className="text-primary" />
                <h3 className="font-semibold text-sm">Dictionary Definition</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1 text-muted-foreground hover:text-foreground rounded"
              >
                <X size={14} />
              </button>
            </div>

            <div className="py-4">
              <p className="text-xs text-muted-foreground mb-2">Word or phrase:</p>
              <div className="p-2 bg-surface-muted rounded text-xs font-mono mb-4 line-clamp-2">
                {selectedText}
              </div>

              {isProcessing ? (
                <div className="py-6 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 size={16} className="animate-spin text-primary" />
                  <span>Looking up definition...</span>
                </div>
              ) : lookupResult ? (
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {lookupResult.definitions.map((def, idx) => (
                    <div key={idx} className="text-xs leading-relaxed">
                      {def.partOfSpeech && (
                        <span className="italic text-muted-foreground mr-1.5 font-serif">
                          {def.partOfSpeech}
                        </span>
                      )}
                      <span>{def.definition}</span>
                      {def.example && (
                        <p className="text-[11px] text-muted-foreground italic mt-0.5">
                          &ldquo;{def.example}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground/70 pt-2 border-t border-border/50">
                    Source: {lookupResult.source}
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-surface-muted/50 rounded-lg border border-border/60 text-center">
                  <Info size={16} className="mx-auto text-muted-foreground/70 mb-1.5" />
                  <p className="text-xs font-medium text-foreground">
                    Dictionary Extension Not Configured
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                    Offline mode is active. You can configure a local dictionary provider in settings or use system lookups.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setActiveModal(null)}
                className="text-xs h-7"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Translate Dialog */}
      {activeModal === 'translate' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-surface border border-border rounded-xl shadow-xl p-5 animate-in fade-in-0 zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Languages size={16} className="text-primary" />
                <h3 className="font-semibold text-sm">Translation</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1 text-muted-foreground hover:text-foreground rounded"
              >
                <X size={14} />
              </button>
            </div>

            <div className="py-4">
              <p className="text-xs text-muted-foreground mb-2">Original text:</p>
              <div className="p-2 bg-surface-muted rounded text-xs font-serif italic mb-4 line-clamp-3">
                &ldquo;{selectedText}&rdquo;
              </div>

              {isProcessing ? (
                <div className="py-6 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 size={16} className="animate-spin text-primary" />
                  <span>Translating text...</span>
                </div>
              ) : translationResult ? (
                <div className="p-3 bg-surface-muted rounded text-xs leading-relaxed">
                  <p className="font-medium text-foreground mb-1">Translation:</p>
                  <p className="text-foreground/90">{translationResult.translatedText}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-2">
                    Provider: {translationResult.provider}
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-surface-muted/50 rounded-lg border border-border/60 text-center">
                  <Info size={16} className="mx-auto text-muted-foreground/70 mb-1.5" />
                  <p className="text-xs font-medium text-foreground">
                    Translation Extension Not Configured
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                    Offline mode is active. No external translation service was contacted. Configure an offline translation model in settings.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setActiveModal(null)}
                className="text-xs h-7"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Send to Notes Dialog */}
      {activeModal === 'notes' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-surface border border-border rounded-xl shadow-xl p-5 animate-in fade-in-0 zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <StickyNote size={16} className="text-primary" />
                <h3 className="font-semibold text-sm">Send Excerpt to Item Notes</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1 text-muted-foreground hover:text-foreground rounded"
              >
                <X size={14} />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                The following excerpt and citation will be appended to the notes for this book:
              </p>

              <blockquote className="p-3 bg-surface-muted rounded-lg border-l-2 border-primary text-xs italic font-serif leading-relaxed text-foreground/90">
                &ldquo;{selectedText}&rdquo;
              </blockquote>

              <p className="text-[11px] text-muted-foreground">
                Citation: <span className="font-medium text-foreground">{snapshot.source?.title || 'Publication'}</span>
                {snapshot.currentPage > 0 ? ` (Page ${snapshot.currentPage})` : ''}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="secondary"
                size="sm"
                disabled={isSavingNote}
                onClick={() => setActiveModal(null)}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isSavingNote}
                onClick={handleSendToNotes}
                className="text-xs h-8"
              >
                {isSavingNote ? (
                  <>
                    <Loader2 size={12} className="animate-spin mr-1.5" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check size={12} className="mr-1.5" />
                    Append to Notes
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Send to Canvas Dialog */}
      {activeModal === 'canvas' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-surface border border-border rounded-xl shadow-xl p-5 animate-in fade-in-0 zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <LayoutGrid size={16} className="text-primary" />
                <h3 className="font-semibold text-sm">Send Excerpt to Canvas</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1 text-muted-foreground hover:text-foreground rounded"
              >
                <X size={14} />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div className="p-2 bg-surface-muted rounded text-xs italic font-serif line-clamp-2">
                &ldquo;{selectedText}&rdquo;
              </div>

              {isLoadingCanvases ? (
                <div className="py-6 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 size={16} className="animate-spin text-primary" />
                  <span>Loading linked canvases...</span>
                </div>
              ) : (
                <>
                  {canvases.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-foreground">Select an existing canvas:</p>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {canvases.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            disabled={isAddingToCanvas}
                            onClick={() => handleSendToCanvas(c.id)}
                            className="w-full text-left p-2 rounded text-xs border border-border/70 hover:border-primary hover:bg-surface-muted transition-all flex items-center justify-between"
                          >
                            <span className="font-medium truncate">{c.title}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              Rev {c.revision}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t border-border/60">
                    <p className="text-xs font-medium text-foreground mb-1.5">
                      Or create a new canvas for this book:
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newCanvasTitle}
                        onChange={(e) => setNewCanvasTitle(e.target.value)}
                        placeholder={`e.g. Notes on ${snapshot.source?.title || 'Book'}`}
                        className="flex-1 bg-surface-muted px-2.5 py-1.5 rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <Button
                        size="sm"
                        disabled={isAddingToCanvas}
                        onClick={handleCreateCanvasAndSend}
                        className="text-xs h-8 whitespace-nowrap"
                      >
                        {isAddingToCanvas ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <>
                            <Plus size={12} className="mr-1" />
                            Create & Add
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setActiveModal(null)}
                className="text-xs h-7"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
