/**
 * render/virtual.ts
 *
 * DOM windowing / virtual scroll.  Renders only the visible row slice and
 * uses a spacer element to maintain scroll height, enabling large datasets
 * without full DOM materialisation.
 *
 * Two surfaces:
 *   computeVisibleRange -- pure function, no DOM, fully testable in jsdom.
 *   mountVirtualScroll  -- installs the RAF-throttled scroll handler and
 *                          manages spacer elements.
 *
 * Algorithm: direct port of the v2 spacer-row windowing algorithm (PR #348,
 * tablecrafter.js lines 4467-4498 + 4524-4590).  Variable-height rows are a
 * Phase 4 concern; passing a function for rowHeight throws with a clear message.
 */

import type { TableState } from '../core/types';

// ---------------------------------------------------------------------------
// Options and controller
// ---------------------------------------------------------------------------

/** Options for the virtual scroll controller. */
export interface VirtualScrollOptions {
  /** Height of each row in pixels (function form reserved for Phase 4 -- throws). */
  rowHeight: number | ((rowIndex: number) => number);
  /** Number of rows to render above and below the visible window. */
  overscan?: number | undefined;
  /** Scroll container element (defaults to the table wrapper). */
  scrollContainer?: HTMLElement | undefined;
}

/** Handle returned by mountVirtualScroll(). */
export interface VirtualScrollController {
  /** Recalculate the visible window after a data change (filter / sort / search). */
  update(state: TableState): void;
  /** Tear down scroll listeners, ResizeObserver, and remove spacers. */
  destroy(): void;
  /** Scroll a given row index into view. */
  scrollToRow(rowIndex: number, behavior?: ScrollBehavior): void;
  /**
   * Return the last computed visible range.
   * render/dom.ts reads this to compute aria-rowindex offsets for applyAriaGrid.
   */
  getCurrentRange(): { start: number; end: number } | null;
}

// ---------------------------------------------------------------------------
// Pure algorithm (direct port of v2 computeVirtualWindow)
// ---------------------------------------------------------------------------

/**
 * Compute the visible row slice for the current scroll position.
 * Pure function -- no DOM access; fully testable without a browser.
 *
 * Name mapping from v2: startIndex->start, endIndex->end,
 * topPadding->offsetTop, bottomPadding->offsetBottom.
 */
export function computeVisibleRange(
  scrollTop: number,
  containerHeight: number,
  totalRows: number,
  rowHeight: number,
  overscan = 5,
): { start: number; end: number; offsetTop: number; offsetBottom: number } {
  if (totalRows <= 0) return { start: 0, end: 0, offsetTop: 0, offsetBottom: 0 };

  const visibleCount  = containerHeight > 0 ? Math.ceil(containerHeight / rowHeight) : 0;
  const firstVisible  = Math.floor(scrollTop / rowHeight);
  const start         = Math.max(0, Math.min(firstVisible - overscan, totalRows));
  const end           = Math.min(totalRows, firstVisible + visibleCount + overscan);
  // end can never be less than start
  const clampedEnd    = end < start ? start : end;

  return {
    start,
    end:          clampedEnd,
    offsetTop:    start * rowHeight,
    offsetBottom: (totalRows - clampedEnd) * rowHeight,
  };
}

// ---------------------------------------------------------------------------
// DOM controller
// ---------------------------------------------------------------------------

/**
 * Attach virtual scroll behaviour to a DOM container.
 * Called by render/dom.ts when options.virtual === true AND state.pageSize === 0.
 * (Virtual scroll and pagination are mutually exclusive, matching v2 behaviour.)
 */
export function mountVirtualScroll(
  container: HTMLElement,
  options: VirtualScrollOptions & {
    /** 'table' operates on <tr> elements inside a <tbody> container. */
    mode: 'table' | 'card';
    /** Factory provided by dom.ts; keeps DOM construction logic out of this module. */
    buildRow:  (row: unknown, absIndex: number) => HTMLTableRowElement;
    buildCard: (row: unknown, absIndex: number) => HTMLElement;
    /** Always state.sortedRows (full filtered set). Updated before update() is called. */
    getRows: () => unknown[];
  },
): VirtualScrollController {
  const { mode, buildRow, buildCard, getRows } = options;
  const overscan = options.overscan ?? 5;

  // Phase 3 supports only fixed row height; variable height is Phase 4.
  if (typeof options.rowHeight === 'function') {
    throw new Error(
      'mountVirtualScroll: variable rowHeight not yet supported -- pass a fixed number',
    );
  }
  const rowHeight = options.rowHeight;

  // --- Container setup ---
  container.style.overflowY = 'auto';
  if (!container.style.height) {
    const defaultHeight =
      options.scrollContainer != null
        ? options.scrollContainer.clientHeight || 400
        : 400;
    container.style.height = `${defaultHeight}px`;
  }

  // --- Spacer elements ---
  let topSpacer: HTMLElement;
  let bottomSpacer: HTMLElement;

  if (mode === 'table') {
    topSpacer    = document.createElement('tr');
    topSpacer.className = 'tc-vs-top-spacer';
    bottomSpacer = document.createElement('tr');
    bottomSpacer.className = 'tc-vs-bottom-spacer';
  } else {
    topSpacer    = document.createElement('div');
    topSpacer.className = 'tc-vs-top-spacer-card';
    bottomSpacer = document.createElement('div');
    bottomSpacer.className = 'tc-vs-bottom-spacer-card';
  }

  container.prepend(topSpacer);
  container.append(bottomSpacer);

  // --- State ---
  let currentRange: { start: number; end: number } | null = null;
  let containerHeight = container.clientHeight || 400;

  // --- Patch (reconcile DOM to current scroll position) ---
  function _patch(): void {
    const scrollTop = container.scrollTop;
    const rows      = getRows();
    const range     = computeVisibleRange(
      scrollTop, containerHeight, rows.length, rowHeight, overscan,
    );
    currentRange = { start: range.start, end: range.end };

    topSpacer.style.height    = `${range.offsetTop}px`;
    bottomSpacer.style.height = `${range.offsetBottom}px`;

    if (mode === 'table') {
      // Remove only data rows; keep spacers
      Array.from(
        container.querySelectorAll('tr:not(.tc-vs-top-spacer):not(.tc-vs-bottom-spacer)'),
      ).forEach(r => r.remove());

      const frag = document.createDocumentFragment();
      for (let i = range.start; i < range.end; i++) {
        frag.appendChild(buildRow(rows[i]!, i));
      }
      bottomSpacer.before(frag);
    } else {
      // Card mode
      Array.from(container.querySelectorAll('.tc-card')).forEach(c => c.remove());

      const frag = document.createDocumentFragment();
      for (let i = range.start; i < range.end; i++) {
        frag.appendChild(buildCard(rows[i]!, i));
      }
      bottomSpacer.before(frag);
    }
  }

  // --- RAF-throttled scroll handler (direct port of v2 _vsRaf pattern) ---
  let raf: number | null = null;
  const ac = new AbortController();

  container.addEventListener(
    'scroll',
    () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        _patch();
      });
    },
    { passive: true, signal: ac.signal },
  );

  // --- ResizeObserver: recalculate when container resizes ---
  const ro = new ResizeObserver(entries => {
    for (const entry of entries) {
      containerHeight = entry.contentRect.height || containerHeight;
    }
    _patch();
  });
  ro.observe(container);

  // --- Initial render ---
  _patch();

  // --- Public controller ---
  return {
    /**
     * Called by dom.ts after every full rebuild (filter / sort / search).
     * getRows() already returns the updated sortedRows at call time.
     */
    update(_state: TableState): void {
      _patch();
    },

    destroy(): void {
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      ac.abort();
      ro.disconnect();
      topSpacer.remove();
      bottomSpacer.remove();
      // Remove any remaining data rows / cards
      Array.from(
        container.querySelectorAll(
          'tr:not(.tc-vs-top-spacer):not(.tc-vs-bottom-spacer), .tc-card',
        ),
      ).forEach(el => el.remove());
    },

    scrollToRow(rowIndex: number, behavior: ScrollBehavior = 'smooth'): void {
      container.scrollTo({ top: rowIndex * rowHeight, behavior });
    },

    getCurrentRange(): { start: number; end: number } | null {
      return currentRange;
    },
  };
}
