/**
 * Bounded in-memory annotation undo/redo history.
 * Cap: 50 mutations per session.
 * Does NOT persist — reopen starts fresh (persistence is SQLite + external JSON).
 */

import { type Annotation } from './types.ts';

export const ANNOTATION_HISTORY_CAP = 50;

export type AnnotationHistoryEntry =
  | { readonly op: 'create'; readonly annotation: Annotation }
  | { readonly op: 'update'; readonly before: Annotation; readonly after: Annotation }
  | { readonly op: 'delete'; readonly annotation: Annotation };

export class AnnotationHistory {
  private readonly _past: AnnotationHistoryEntry[] = [];
  private readonly _future: AnnotationHistoryEntry[] = [];

  get canUndo(): boolean { return this._past.length > 0; }
  get canRedo(): boolean { return this._future.length > 0; }
  get size(): number { return this._past.length; }

  push(entry: AnnotationHistoryEntry): void {
    this._past.push(entry);
    if (this._past.length > ANNOTATION_HISTORY_CAP) {
      this._past.shift();
    }
    // New action clears redo stack
    this._future.length = 0;
  }

  /**
   * Returns the inverse of the last past entry so the caller can apply it.
   * Returns null if nothing to undo.
   */
  undo(): AnnotationHistoryEntry | null {
    const entry = this._past.pop();
    if (!entry) return null;
    this._future.push(entry);
    return entry;
  }

  /**
   * Returns the entry to re-apply.
   * Returns null if nothing to redo.
   */
  redo(): AnnotationHistoryEntry | null {
    const entry = this._future.pop();
    if (!entry) return null;
    this._past.push(entry);
    return entry;
  }

  clear(): void {
    this._past.length = 0;
    this._future.length = 0;
  }
}
