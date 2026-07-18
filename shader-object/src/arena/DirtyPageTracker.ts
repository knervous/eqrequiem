export interface DirtyRange {
  /** Inclusive start byte offset. */
  start: number;
  /** Exclusive end byte offset. */
  end: number;
}

/**
 * Page-granular dirty tracking for the unified float arena.
 *
 * Mutations mark 4 KiB pages in a bitset; synchronization consumes the bitset
 * as coalesced byte ranges. Overlapping and out-of-order writes are safe
 * because pages only ever accumulate. Structural changes (reallocation,
 * adoption, unknown raw-view writes) call markAll(), which degrades to the
 * previous full-upload behavior.
 */
export class DirtyPageTracker {
  public static readonly PAGE_BYTES = 4096;

  private pages = new Uint32Array(64);
  private allDirty = true;
  private anyDirty = true;

  markBytes(byteOffset: number, byteLength: number): void {
    if (byteLength <= 0 || this.allDirty) {
      this.anyDirty ||= byteLength > 0 || this.allDirty;
      return;
    }
    const first = Math.max(0, byteOffset) >>> 12;
    const last = Math.max(0, byteOffset + byteLength - 1) >>> 12;
    const neededWords = (last >>> 5) + 1;
    if (neededWords > this.pages.length) {
      const grown = new Uint32Array(Math.max(neededWords, this.pages.length * 2));
      grown.set(this.pages);
      this.pages = grown;
    }
    for (let page = first; page <= last; page++) {
      this.pages[page >>> 5] |= 1 << (page & 31);
    }
    this.anyDirty = true;
  }

  markAll(): void {
    this.allDirty = true;
    this.anyDirty = true;
  }

  isDirty(): boolean {
    return this.anyDirty;
  }

  /**
   * Dirty pages coalesced into byte ranges clipped to totalBytes, then reset.
   * A markAll() (or dirty coverage above fullUploadFraction) returns one full
   * range so callers keep a simple full-upload fallback.
   */
  consumeRanges(totalBytes: number, fullUploadFraction = 0.5): readonly DirtyRange[] {
    if (!this.anyDirty || totalBytes <= 0) {
      this.reset();
      return [];
    }
    if (this.allDirty) {
      this.reset();
      return [{ start: 0, end: totalBytes }];
    }

    const pageBytes = DirtyPageTracker.PAGE_BYTES;
    const totalPages = Math.ceil(totalBytes / pageBytes);
    const ranges: DirtyRange[] = [];
    let dirtyPages = 0;
    let runStart = -1;
    for (let page = 0; page < totalPages; page++) {
      const dirty = (this.pages[page >>> 5] & (1 << (page & 31))) !== 0;
      if (dirty) {
        dirtyPages++;
        if (runStart < 0) runStart = page;
      } else if (runStart >= 0) {
        ranges.push({ start: runStart * pageBytes, end: Math.min(page * pageBytes, totalBytes) });
        runStart = -1;
      }
    }
    if (runStart >= 0) {
      ranges.push({ start: runStart * pageBytes, end: totalBytes });
    }
    this.reset();
    if (dirtyPages / totalPages > fullUploadFraction) {
      return [{ start: 0, end: totalBytes }];
    }
    return ranges;
  }

  private reset(): void {
    this.pages.fill(0);
    this.allDirty = false;
    this.anyDirty = false;
  }
}
