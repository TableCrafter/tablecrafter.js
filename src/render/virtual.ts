/**
 * render/virtual.ts
 *
 * DOM windowing / virtual scroll.  Renders only the visible row slice and
 * uses a spacer element to maintain scroll height, enabling large datasets
 * without full DOM materialisation.
 * Phase 0: typed stub.
 */

import type { TableState } from '../core/types';

/** Options for the virtual scroll controller. */
export interface VirtualScrollOptions {
  /** Height of each row in pixels (or a function returning variable heights). */
  rowHeight: number | ((rowIndex: number) => number);
  /** Number of rows to render above and below the visible window. */
  overscan?: number | undefined;
  /** Scroll container element (defaults to the table wrapper). */
  scrollContainer?: HTMLElement | undefined;
}

/** Handle returned by mountVirtualScroll(). */
export interface VirtualScrollController {
  /** Recalculate the visible window on scroll or resize. */
  update(state: TableState): void;
  /** Tear down scroll listeners and remove spacers. */
  destroy(): void;
  /** Scroll a given row index into view. */
  scrollToRow(rowIndex: number, behavior?: ScrollBehavior): void;
}

/**
 * Attach virtual scroll behaviour to the DOM renderer's scroll container.
 * Called by render/dom.ts when options.virtual is true.
 */
export function mountVirtualScroll(
  _container: HTMLElement,
  _options: VirtualScrollOptions
): VirtualScrollController {
  throw new Error('mountVirtualScroll: not implemented -- Phase 3');
}

/**
 * Compute the visible row slice for the current scroll position and
 * container height.  Pure function, usable in tests without a DOM.
 */
export function computeVisibleRange(
  _scrollTop: number,
  _containerHeight: number,
  _totalRows: number,
  _rowHeight: number,
  _overscan?: number
): { start: number; end: number; offsetTop: number; offsetBottom: number } {
  throw new Error('computeVisibleRange: not implemented -- Phase 3');
}
