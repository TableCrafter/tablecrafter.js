/**
 * render/a11y.ts
 *
 * ARIA grid pattern wiring: role=grid/row/gridcell, roving tabindex, and
 * aria-live polite announcements. Called by render/dom.ts after each render
 * pass. Always on -- no fallback needed.
 */

import type { TableState, TableCrafterColumn } from '../core/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** ARIA live region handle. */
export interface LiveRegion {
  /** Announce a message to screen readers via the polite live region. */
  announce(message: string): void;
  /** Remove the live region element from the DOM. */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Idempotent setAttribute: only mutates when the value differs. */
function setAttr(el: Element, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/** Idempotent removeAttribute: only mutates when the attribute is present. */
function removeAttr(el: Element, name: string): void {
  if (el.hasAttribute(name)) el.removeAttribute(name);
}

// ---------------------------------------------------------------------------
// applyAriaGrid
// ---------------------------------------------------------------------------

/**
 * Apply ARIA grid attributes to the rendered table element and its
 * row / gridcell descendants.
 *
 * Called after each render reconciliation (full rebuild and row-level patch).
 * All setAttribute calls are guarded by a string-equality check so unchanged
 * attributes are never mutated, preventing accessibility-tree churn.
 *
 * @param table          - The <table> element.
 * @param state          - Current TableState snapshot.
 * @param visibleColumns - Ordered list of visible column definitions.
 * @param vsOffset       - Virtual scroll window start index (0 when inactive).
 */
export function applyAriaGrid(
  table: HTMLElement,
  state: TableState,
  visibleColumns: TableCrafterColumn[],
  vsOffset = 0
): void {
  const colCount = visibleColumns.length;

  // --- <table> element ---
  setAttr(table, 'role', 'grid');
  setAttr(table, 'aria-rowcount', String(state.totalRows + 1));
  setAttr(table, 'aria-colcount', String(colCount));
  setAttr(table, 'aria-busy', state.loading ? 'true' : 'false');
  setAttr(table, 'aria-label', 'Data table');
  // Conservative: always declare multiselectable (cost-free, always correct)
  setAttr(table, 'aria-multiselectable', 'true');

  // --- <thead> <tr> ---
  const theadRow = table.querySelector('thead tr');
  if (theadRow) {
    setAttr(theadRow, 'role', 'row');
    setAttr(theadRow, 'aria-rowindex', '1');
  }

  // --- <th> elements in <thead> ---
  table.querySelectorAll('thead th').forEach((th, i) => {
    const col = visibleColumns[i];
    if (!col) return;
    setAttr(th, 'role', 'columnheader');
    setAttr(th, 'aria-colindex', String(i + 1));
    if (col.sortable === false) {
      removeAttr(th, 'aria-sort');
    } else {
      const entry = state.sort.find(s => s.column === col.key);
      const dir = entry?.direction ?? null;
      setAttr(
        th,
        'aria-sort',
        dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'
      );
    }
  });

  // --- <tbody> <tr> elements ---
  table.querySelectorAll('tbody tr').forEach((tr, i) => {
    setAttr(tr, 'role', 'row');
    setAttr(tr, 'aria-rowindex', String(vsOffset + i + 2));
    const rowId = (tr as HTMLElement).dataset['rowId'];
    const selected = rowId !== undefined && state.selection.has(rowId);
    setAttr(tr, 'aria-selected', selected ? 'true' : 'false');
  });

  // --- <td> elements in <tbody> ---
  // Rows are homogeneous: every row has colCount cells, iterated row-major.
  table.querySelectorAll('tbody td').forEach((td, idx) => {
    const colIdx = colCount > 0 ? idx % colCount : 0;
    const col = visibleColumns[colIdx];
    if (!col) return;
    setAttr(td, 'role', 'gridcell');
    setAttr(td, 'aria-colindex', String(colIdx + 1));
    if (col.editable) {
      removeAttr(td, 'aria-readonly');
    } else {
      setAttr(td, 'aria-readonly', 'true');
    }
  });
}

// ---------------------------------------------------------------------------
// mountRovingTabindex
// ---------------------------------------------------------------------------

/**
 * Install a single delegated keydown listener on the grid that manages a
 * roving tabindex across all gridcell (and header columnheader) elements.
 *
 * rowIdx = 0-based index within visible tbody rows; -1 = header row.
 * colIdx = 0-based index within visible columns.
 *
 * Action keys (Enter/F2/Escape/Space) are surfaced as CustomEvents fired on
 * the table element so dom.ts can translate them into store dispatches without
 * a11y.ts importing the Store.
 *
 * @returns A teardown function that removes the keydown listener.
 */
export function mountRovingTabindex(
  table: HTMLElement,
  onNavigate: (rowIndex: number, colIndex: number) => void
): () => void {
  // Roving tabindex cursor.  rowIdx -1 = header.
  let cur: { rowIdx: number; colIdx: number } | null = null;

  // -------------------------------------------------------------------------
  // DOM helpers (query live DOM so virtual-scroll patches are transparent)
  // -------------------------------------------------------------------------

  function bodyRows(): HTMLElement[] {
    return Array.from(table.querySelectorAll('tbody [role="row"]')) as HTMLElement[];
  }

  function getRowCount(): number {
    return table.querySelectorAll('tbody [role="row"]').length;
  }

  function getColCount(): number {
    return table.querySelectorAll('thead [role="columnheader"]').length;
  }

  function getBodyCell(rowIdx: number, colIdx: number): HTMLElement | null {
    const rows = bodyRows();
    const row = rows[rowIdx];
    if (!row) return null;
    return (row.querySelectorAll('[role="gridcell"]')[colIdx] as HTMLElement | undefined) ?? null;
  }

  function getHeaderCell(colIdx: number): HTMLElement | null {
    const cells = table.querySelectorAll('thead [role="columnheader"]');
    return (cells[colIdx] as HTMLElement | undefined) ?? null;
  }

  function currentCell(): HTMLElement | null {
    if (!cur) return null;
    return cur.rowIdx === -1
      ? getHeaderCell(cur.colIdx)
      : getBodyCell(cur.rowIdx, cur.colIdx);
  }

  // -------------------------------------------------------------------------
  // Focus management
  // -------------------------------------------------------------------------

  function moveTo(rowIdx: number, colIdx: number): void {
    // Deactivate previous cell
    const prev = currentCell();
    if (prev) prev.tabIndex = -1;

    cur = { rowIdx, colIdx };

    const next = currentCell();
    if (!next) return;

    next.tabIndex = 0;
    next.focus();

    // Compute absolute row index for dom.ts (aria-rowindex - 2)
    const tr = next.closest('[role="row"]') as HTMLElement | null;
    const ariaRow = tr ? Number(tr.getAttribute('aria-rowindex')) : NaN;
    const absRowIdx = isNaN(ariaRow) ? rowIdx : ariaRow - 2;
    onNavigate(absRowIdx, colIdx);
  }

  // -------------------------------------------------------------------------
  // Initialise: set first gridcell to tabIndex=0, rest to -1
  // -------------------------------------------------------------------------

  const allCells = table.querySelectorAll('[role="gridcell"]');
  allCells.forEach(c => { (c as HTMLElement).tabIndex = -1; });
  const firstCell = allCells[0] as HTMLElement | undefined;
  if (firstCell) {
    firstCell.tabIndex = 0;
    cur = { rowIdx: 0, colIdx: 0 };
  }

  // -------------------------------------------------------------------------
  // Keydown handler
  // -------------------------------------------------------------------------

  const ac = new AbortController();

  table.addEventListener(
    'keydown',
    (evt: Event) => {
      const e = evt as KeyboardEvent;
      if (!cur) return;

      const { rowIdx, colIdx } = cur;
      const rowCount = getRowCount();
      const colCount = getColCount();

      // Navigation keys -------------------------------------------------------
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (rowIdx === -1) {
          if (rowCount > 0) moveTo(0, colIdx);
        } else if (rowIdx < rowCount - 1) {
          moveTo(rowIdx + 1, colIdx);
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (rowIdx === 0) {
          moveTo(-1, colIdx);
        } else if (rowIdx > 0) {
          moveTo(rowIdx - 1, colIdx);
        }
        // rowIdx === -1: already in header, clamp silently
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (colIdx < colCount - 1) moveTo(rowIdx, colIdx + 1);
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (colIdx > 0) moveTo(rowIdx, colIdx - 1);
        return;
      }

      if (e.key === 'Home') {
        e.preventDefault();
        // Ctrl+Home: first column, first body row
        moveTo(e.ctrlKey ? 0 : rowIdx, 0);
        return;
      }

      if (e.key === 'End') {
        e.preventDefault();
        // Ctrl+End: last column, last body row
        moveTo(e.ctrlKey ? rowCount - 1 : rowIdx, colCount - 1);
        return;
      }

      if (e.key === 'PageDown') {
        e.preventDefault();
        const target = Math.min(rowIdx + rowCount, rowCount - 1);
        moveTo(target, colIdx);
        return;
      }

      if (e.key === 'PageUp') {
        e.preventDefault();
        const target = Math.max(rowIdx - rowCount, 0);
        moveTo(target, colIdx);
        return;
      }

      // Action keys -- surfaced as CustomEvents; dom.ts translates to dispatch
      if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault();
        const cell = currentCell();
        if (!cell) return;
        // Check if already in edit mode (dom.ts sets data-editing on the cell)
        if ((cell as HTMLElement).dataset['editing'] === 'true') {
          table.dispatchEvent(
            new CustomEvent('tablecrafter:commit', { bubbles: true })
          );
        } else if (cell.getAttribute('aria-readonly') !== 'true') {
          const tr = cell.closest('[role="row"]') as HTMLElement | null;
          const rowId = tr ? (tr as HTMLElement).dataset['rowId'] : undefined;
          const colIndex = cell.getAttribute('aria-colindex');
          table.dispatchEvent(
            new CustomEvent('tablecrafter:edit', {
              bubbles: true,
              detail: { rowId, colIndex: colIndex ? Number(colIndex) - 1 : colIdx },
            })
          );
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        table.dispatchEvent(
          new CustomEvent('tablecrafter:cancel', { bubbles: true })
        );
        // Close any open popover (Popover API)
        const popover = table.querySelector('[popover]:popover-open');
        if (popover && typeof (popover as HTMLElement).hidePopover === 'function') {
          (popover as HTMLElement).hidePopover();
        }
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        const cell = currentCell();
        const tr = cell?.closest('[role="row"]') as HTMLElement | null;
        const rowId = tr ? tr.dataset['rowId'] : undefined;
        if (rowId !== undefined) {
          table.dispatchEvent(
            new CustomEvent('tablecrafter:select', {
              bubbles: true,
              detail: { rowId, multi: e.shiftKey },
            })
          );
        }
        return;
      }
    },
    { signal: ac.signal }
  );

  return () => { ac.abort(); };
}

// ---------------------------------------------------------------------------
// createLiveRegion
// ---------------------------------------------------------------------------

/**
 * Create a polite aria-live region element and attach it to document.body.
 *
 * The element is positioned off-screen rather than hidden with display:none
 * (display:none suppresses announcements in some assistive technologies).
 *
 * announce() clears the element first then sets the new text on the next
 * event loop tick, giving AT time to observe the mutation pair.
 */
export function createLiveRegion(): LiveRegion {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  el.style.cssText =
    'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);';
  document.body.appendChild(el);

  return {
    announce(message: string): void {
      el.textContent = '';
      setTimeout(() => { el.textContent = message; }, 0);
    },
    destroy(): void {
      el.remove();
    },
  };
}

// ---------------------------------------------------------------------------
// preserveFocusThroughPatch
// ---------------------------------------------------------------------------

/**
 * Preserve keyboard focus across a DOM patch that destroys and recreates rows.
 *
 * Captures the focused cell's position by its stable ARIA indices (aria-rowindex
 * + aria-colindex) before the patch runs, then restores focus to the newly
 * created node with the same indices after the patch completes.
 *
 * If the previously focused row falls outside the virtual window after the
 * patch (restored === null), focus is not moved -- this is intentional, not
 * an error.
 *
 * virtual.ts must call applyAriaGrid inside the patch callback so that ARIA
 * indices are set on the new nodes before this function queries them.
 *
 * @param container - The table wrapper element (used for contains() check).
 * @param patch     - Synchronous callback that rebuilds DOM nodes.
 */
export function preserveFocusThroughPatch(
  container: HTMLElement,
  patch: () => void
): void {
  const active = document.activeElement as HTMLElement | null;
  if (!active || !container.contains(active)) {
    patch();
    return;
  }

  // Capture stable position by ARIA indices (survives DOM re-creation)
  const rowEl = active.closest('[role="row"]') as HTMLElement | null;
  const rowIdx = rowEl?.getAttribute('aria-rowindex') ?? null;
  const colIdx = active.getAttribute('aria-colindex') ?? null;

  patch(); // destroys and recreates DOM nodes synchronously

  if (rowIdx !== null && colIdx !== null) {
    const sel = `[role="row"][aria-rowindex="${rowIdx}"] [aria-colindex="${colIdx}"]`;
    const restored = container.querySelector(sel) as HTMLElement | null;
    // preventScroll: virtual.ts scrollToRow already positioned the row
    restored?.focus({ preventScroll: true });
    // Intentionally no throw when restored === null (row outside virtual window)
  }
}
