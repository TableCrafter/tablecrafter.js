/**
 * render/a11y.ts
 *
 * ARIA grid pattern wiring: role=grid/row/gridcell, roving tabindex, and
 * aria-live polite announcements.  Called by render/dom.ts after each render
 * pass.  Always on -- no fallback needed.
 * Phase 0: typed stub.
 */

import type { TableState } from '../core/types';

/** ARIA live region handle. */
export interface LiveRegion {
  /** Announce a message to screen readers via the polite live region. */
  announce(message: string): void;
  /** Remove the live region element from the DOM. */
  destroy(): void;
}

/**
 * Apply ARIA grid attributes to the rendered table element and its
 * row / gridcell descendants.  Called after each render reconciliation.
 */
export function applyAriaGrid(
  _table: HTMLElement,
  _state: TableState
): void {
  throw new Error('applyAriaGrid: not implemented -- Phase 3');
}

/**
 * Set up roving tabindex on gridcell elements and wire keyboard navigation.
 * Returns a teardown function that removes the event listeners.
 */
export function mountRovingTabindex(
  _table: HTMLElement,
  _onNavigate: (rowIndex: number, colIndex: number) => void
): () => void {
  throw new Error('mountRovingTabindex: not implemented -- Phase 3');
}

/**
 * Create a polite aria-live region and attach it to the document body.
 */
export function createLiveRegion(): LiveRegion {
  throw new Error('createLiveRegion: not implemented -- Phase 3');
}
