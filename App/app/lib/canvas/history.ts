/**
 * In-memory Bounded Canvas History for Local Edit Sessions.
 * Phase 10 — Book-Linked Excalidraw Notes.
 */

import type { ReadWatchCanvasDocument } from './types.ts';

export const CANVAS_HISTORY_CAP = 50;

export interface CanvasHistoryEntry {
  timestamp: string;
  revision: number;
  document: ReadWatchCanvasDocument;
}

export class CanvasHistory {
  private readonly _past: CanvasHistoryEntry[] = [];
  private readonly _future: CanvasHistoryEntry[] = [];
  private readonly _cap: number;

  constructor(cap = CANVAS_HISTORY_CAP) {
    this._cap = cap;
  }

  get canUndo(): boolean {
    return this._past.length > 0;
  }

  get canRedo(): boolean {
    return this._future.length > 0;
  }

  get size(): number {
    return this._past.length;
  }

  push(document: ReadWatchCanvasDocument): void {
    const entry: CanvasHistoryEntry = {
      timestamp: new Date().toISOString(),
      revision: document.revision,
      document: JSON.parse(JSON.stringify(document)),
    };
    this._past.push(entry);
    if (this._past.length > this._cap) {
      this._past.shift();
    }
    this._future.length = 0;
  }

  undo(): CanvasHistoryEntry | null {
    const entry = this._past.pop();
    if (!entry) return null;
    this._future.push(entry);
    return entry;
  }

  redo(): CanvasHistoryEntry | null {
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
