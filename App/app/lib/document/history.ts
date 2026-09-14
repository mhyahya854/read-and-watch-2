/**
 * Bounded Reader Navigation History.
 * Tracks user-directed navigation steps (TOC jumps, search jumps, bookmarks, links)
 * using canonical DocumentLocation envelopes without engine dependence or memory leaks.
 */

import { type DocumentLocation, areDocumentLocationsEqual } from './location.ts';

export const DEFAULT_MAX_HISTORY_ENTRIES = 50;

export class ReaderHistory {
  private readonly maxEntries: number;
  private entries: DocumentLocation[] = [];
  private index: number = -1;

  constructor(maxEntries = DEFAULT_MAX_HISTORY_ENTRIES) {
    this.maxEntries = Math.max(2, maxEntries);
  }

  get canGoBack(): boolean {
    return this.index > 0;
  }

  get canGoForward(): boolean {
    return this.index >= 0 && this.index < this.entries.length - 1;
  }

  get current(): DocumentLocation | null {
    return this.index >= 0 && this.index < this.entries.length ? this.entries[this.index] : null;
  }

  get size(): number {
    return this.entries.length;
  }

  get currentIndex(): number {
    return this.index;
  }

  get allEntries(): ReadonlyArray<DocumentLocation> {
    return [...this.entries];
  }

  /**
   * Push a new user-directed navigation location.
   * If currently in the middle of history, future forward entries are dropped.
   * Duplicate consecutive locations are ignored.
   */
  push(location: DocumentLocation): void {
    if (!location) return;

    if (this.current && areDocumentLocationsEqual(this.current, location)) {
      return;
    }

    // Truncate any forward history if navigated from past state
    if (this.index >= 0 && this.index < this.entries.length - 1) {
      this.entries = this.entries.slice(0, this.index + 1);
    }

    this.entries.push(location);

    // Bound maximum history length
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    this.index = this.entries.length - 1;
  }

  /** Step back to preceding history location */
  back(): DocumentLocation | null {
    if (!this.canGoBack) return null;
    this.index--;
    return this.entries[this.index];
  }

  /** Step forward to succeeding history location */
  forward(): DocumentLocation | null {
    if (!this.canGoForward) return null;
    this.index++;
    return this.entries[this.index];
  }

  /** Clear all history records */
  clear(): void {
    this.entries = [];
    this.index = -1;
  }
}
