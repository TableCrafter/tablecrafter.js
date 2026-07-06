/**
 * render/a11y.test.ts
 *
 * Unit tests for the ARIA grid wiring layer.
 * Environment: jsdom (via vitest.config.ts).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  applyAriaGrid,
  mountRovingTabindex,
  createLiveRegion,
  preserveFocusThroughPatch,
} from './a11y';
import type { TableState, TableCrafterColumn } from '../core/types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<TableState> = {}): TableState {
  return {
    rows: [],
    filteredRows: [],
    sortedRows: [],
    displayRows: [],
    sort: [],
    filters: {},
    searchQuery: '',
    searchAst: null,
    page: 1,
    pageSize: 25,
    pageCount: 1,
    totalRows: 0,
    selection: new Set(),
    editingCell: null,
    loading: false,
    error: null,
    ...overrides,
  };
}

function makeColumns(count = 3): TableCrafterColumn[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `col${i}`,
    label: `Column ${i}`,
    sortable: true,
    editable: i === 0, // only first column editable
  }));
}

/**
 * Build a minimal table DOM: <table><thead><tr><th*n</tr></thead>
 * <tbody><tr data-row-id="..."><td*n</tr>*rows</tbody></table>
 */
function makeTable(rowCount = 3, colCount = 3): HTMLTableElement {
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const theadRow = document.createElement('tr');
  for (let c = 0; c < colCount; c++) {
    const th = document.createElement('th');
    theadRow.appendChild(th);
  }
  thead.appendChild(theadRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (let r = 0; r < rowCount; r++) {
    const tr = document.createElement('tr');
    tr.dataset['rowId'] = String(r);
    for (let c = 0; c < colCount; c++) {
      const td = document.createElement('td');
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  document.body.appendChild(table);
  return table;
}

function dispatchKey(
  target: HTMLElement,
  key: string,
  extra: Partial<KeyboardEventInit> = {}
): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })
  );
}

// ---------------------------------------------------------------------------
// applyAriaGrid
// ---------------------------------------------------------------------------

describe('applyAriaGrid', () => {
  let table: HTMLTableElement;
  afterEach(() => { table.remove(); });

  it('sets role=grid and core ARIA attributes on the table element', () => {
    table = makeTable(2, 3);
    const cols = makeColumns(3);
    const state = makeState({ totalRows: 10 });
    applyAriaGrid(table, state, cols);

    expect(table.getAttribute('role')).toBe('grid');
    expect(table.getAttribute('aria-rowcount')).toBe('11'); // totalRows + 1
    expect(table.getAttribute('aria-colcount')).toBe('3');
    expect(table.getAttribute('aria-busy')).toBe('false');
    expect(table.getAttribute('aria-label')).toBe('Data table');
    expect(table.getAttribute('aria-multiselectable')).toBe('true');
  });

  it('sets aria-busy=true when state.loading is true', () => {
    table = makeTable(1, 2);
    applyAriaGrid(table, makeState({ loading: true }), makeColumns(2));
    expect(table.getAttribute('aria-busy')).toBe('true');
  });

  it('sets role=row and aria-rowindex=1 on thead tr', () => {
    table = makeTable(1, 2);
    applyAriaGrid(table, makeState(), makeColumns(2));
    const theadRow = table.querySelector('thead tr')!;
    expect(theadRow.getAttribute('role')).toBe('row');
    expect(theadRow.getAttribute('aria-rowindex')).toBe('1');
  });

  it('sets role=columnheader and aria-colindex on each th', () => {
    table = makeTable(1, 3);
    applyAriaGrid(table, makeState(), makeColumns(3));
    const ths = table.querySelectorAll('thead th');
    ths.forEach((th, i) => {
      expect(th.getAttribute('role')).toBe('columnheader');
      expect(th.getAttribute('aria-colindex')).toBe(String(i + 1));
    });
  });

  it('sets aria-sort=none on sortable columns with no active sort', () => {
    table = makeTable(1, 2);
    applyAriaGrid(table, makeState({ sort: [] }), makeColumns(2));
    table.querySelectorAll('thead th').forEach(th => {
      expect(th.getAttribute('aria-sort')).toBe('none');
    });
  });

  it('sets aria-sort=ascending for the active sort column', () => {
    table = makeTable(1, 3);
    const cols = makeColumns(3);
    const state = makeState({ sort: [{ column: 'col1', direction: 'asc' }] });
    applyAriaGrid(table, state, cols);
    const ths = table.querySelectorAll('thead th');
    expect(ths[0]?.getAttribute('aria-sort')).toBe('none'); // col0 not sorted
    expect(ths[1]?.getAttribute('aria-sort')).toBe('ascending');
    expect(ths[2]?.getAttribute('aria-sort')).toBe('none');
  });

  it('sets aria-sort=descending for a desc sort', () => {
    table = makeTable(1, 2);
    const cols = makeColumns(2);
    const state = makeState({ sort: [{ column: 'col0', direction: 'desc' }] });
    applyAriaGrid(table, state, cols);
    expect(table.querySelector('thead th')?.getAttribute('aria-sort')).toBe('descending');
  });

  it('omits aria-sort entirely on columns where sortable===false', () => {
    table = makeTable(1, 2);
    const cols: TableCrafterColumn[] = [
      { key: 'a', sortable: false },
      { key: 'b', sortable: true },
    ];
    applyAriaGrid(table, makeState(), cols);
    const ths = table.querySelectorAll('thead th');
    expect(ths[0]?.hasAttribute('aria-sort')).toBe(false);
    expect(ths[1]?.hasAttribute('aria-sort')).toBe(true);
  });

  it('sets role=row, aria-rowindex, and aria-selected on tbody trs', () => {
    table = makeTable(3, 2);
    const state = makeState({ totalRows: 3, selection: new Set(['1']) });
    applyAriaGrid(table, state, makeColumns(2));

    const rows = table.querySelectorAll('tbody tr');
    expect(rows[0]?.getAttribute('role')).toBe('row');
    expect(rows[0]?.getAttribute('aria-rowindex')).toBe('2'); // vsOffset=0, i=0 -> 0+0+2
    expect(rows[0]?.getAttribute('aria-selected')).toBe('false');
    expect(rows[1]?.getAttribute('aria-rowindex')).toBe('3');
    expect(rows[1]?.getAttribute('aria-selected')).toBe('true');
    expect(rows[2]?.getAttribute('aria-rowindex')).toBe('4');
  });

  it('applies vsOffset to aria-rowindex correctly', () => {
    table = makeTable(2, 2);
    applyAriaGrid(table, makeState({ totalRows: 100 }), makeColumns(2), 50);
    const rows = table.querySelectorAll('tbody tr');
    // vsOffset=50, i=0 -> 50+0+2=52; i=1 -> 50+1+2=53
    expect(rows[0]?.getAttribute('aria-rowindex')).toBe('52');
    expect(rows[1]?.getAttribute('aria-rowindex')).toBe('53');
  });

  it('sets role=gridcell and aria-colindex on tbody tds', () => {
    table = makeTable(2, 3);
    applyAriaGrid(table, makeState(), makeColumns(3));
    const tds = table.querySelectorAll('tbody td');
    // Row 0: colindex 1,2,3; Row 1: 1,2,3
    expect(tds[0]?.getAttribute('role')).toBe('gridcell');
    expect(tds[0]?.getAttribute('aria-colindex')).toBe('1');
    expect(tds[2]?.getAttribute('aria-colindex')).toBe('3');
    expect(tds[3]?.getAttribute('aria-colindex')).toBe('1'); // second row, first col
  });

  it('sets aria-readonly=true for non-editable columns', () => {
    table = makeTable(1, 2);
    const cols: TableCrafterColumn[] = [
      { key: 'a', editable: true },
      { key: 'b', editable: false },
    ];
    applyAriaGrid(table, makeState(), cols);
    const tds = table.querySelectorAll('tbody td');
    expect(tds[0]?.hasAttribute('aria-readonly')).toBe(false); // editable
    expect(tds[1]?.getAttribute('aria-readonly')).toBe('true');
  });

  it('omits aria-readonly on editable columns (does not write false)', () => {
    table = makeTable(1, 1);
    const cols: TableCrafterColumn[] = [{ key: 'a', editable: true }];
    applyAriaGrid(table, makeState(), cols);
    const td = table.querySelector('tbody td')!;
    expect(td.hasAttribute('aria-readonly')).toBe(false);
  });

  it('is idempotent: calling twice with same state does not mutate attributes', () => {
    table = makeTable(2, 2);
    const cols = makeColumns(2);
    const state = makeState({ totalRows: 5 });
    applyAriaGrid(table, state, cols);

    // Spy on setAttribute to verify no mutations on second call
    const spy = vi.spyOn(table, 'setAttribute');
    applyAriaGrid(table, state, cols);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('updates aria-sort when sort state changes (removes and re-adds)', () => {
    table = makeTable(1, 2);
    const cols = makeColumns(2);
    applyAriaGrid(table, makeState({ sort: [{ column: 'col0', direction: 'asc' }] }), cols);
    expect(table.querySelector('thead th')?.getAttribute('aria-sort')).toBe('ascending');

    applyAriaGrid(table, makeState({ sort: [{ column: 'col0', direction: 'desc' }] }), cols);
    expect(table.querySelector('thead th')?.getAttribute('aria-sort')).toBe('descending');

    applyAriaGrid(table, makeState({ sort: [] }), cols);
    expect(table.querySelector('thead th')?.getAttribute('aria-sort')).toBe('none');
  });

  it('uses first matching sort entry (primary sort wins) for aria-sort', () => {
    table = makeTable(1, 2);
    const cols = makeColumns(2);
    const state = makeState({
      sort: [
        { column: 'col0', direction: 'asc' },
        { column: 'col1', direction: 'desc' },
      ],
    });
    applyAriaGrid(table, state, cols);
    const ths = table.querySelectorAll('thead th');
    expect(ths[0]?.getAttribute('aria-sort')).toBe('ascending');
    expect(ths[1]?.getAttribute('aria-sort')).toBe('descending');
  });
});

// ---------------------------------------------------------------------------
// mountRovingTabindex
// ---------------------------------------------------------------------------

describe('mountRovingTabindex', () => {
  let table: HTMLTableElement;
  let teardown: () => void;

  beforeEach(() => {
    table = makeTable(4, 3);
    // Apply ARIA attributes so roving tabindex can read them
    applyAriaGrid(table, makeState({ totalRows: 4 }), makeColumns(3));
  });

  afterEach(() => {
    teardown?.();
    table.remove();
  });

  it('sets tabIndex=0 on the first gridcell, -1 on all others', () => {
    teardown = mountRovingTabindex(table, vi.fn());
    const cells = table.querySelectorAll('[role="gridcell"]');
    expect((cells[0] as HTMLElement).tabIndex).toBe(0);
    cells.forEach((c, i) => {
      if (i > 0) expect((c as HTMLElement).tabIndex).toBe(-1);
    });
  });

  it('ArrowDown moves focus to next row, same column', () => {
    const onNav = vi.fn();
    teardown = mountRovingTabindex(table, onNav);
    dispatchKey(table, 'ArrowDown');
    const rows = table.querySelectorAll('tbody [role="row"]');
    const cells = rows[1]!.querySelectorAll('[role="gridcell"]');
    expect((cells[0] as HTMLElement).tabIndex).toBe(0);
  });

  it('ArrowUp from first row moves to header', () => {
    teardown = mountRovingTabindex(table, vi.fn());
    dispatchKey(table, 'ArrowUp');
    const headerCells = table.querySelectorAll('thead [role="columnheader"]');
    expect((headerCells[0] as HTMLElement).tabIndex).toBe(0);
  });

  it('ArrowDown from header moves to first body row', () => {
    teardown = mountRovingTabindex(table, vi.fn());
    dispatchKey(table, 'ArrowUp'); // go to header first
    dispatchKey(table, 'ArrowDown'); // back to body
    const firstCell = table.querySelector('tbody [role="row"] [role="gridcell"]') as HTMLElement;
    expect(firstCell.tabIndex).toBe(0);
  });

  it('ArrowRight moves one column right', () => {
    teardown = mountRovingTabindex(table, vi.fn());
    dispatchKey(table, 'ArrowRight');
    const row = table.querySelector('tbody [role="row"]')!;
    const cells = row.querySelectorAll('[role="gridcell"]');
    expect((cells[1] as HTMLElement).tabIndex).toBe(0);
    expect((cells[0] as HTMLElement).tabIndex).toBe(-1);
  });

  it('ArrowLeft moves one column left', () => {
    teardown = mountRovingTabindex(table, vi.fn());
    dispatchKey(table, 'ArrowRight'); // col 1
    dispatchKey(table, 'ArrowLeft'); // back to col 0
    const row = table.querySelector('tbody [role="row"]')!;
    const cells = row.querySelectorAll('[role="gridcell"]');
    expect((cells[0] as HTMLElement).tabIndex).toBe(0);
    expect((cells[1] as HTMLElement).tabIndex).toBe(-1);
  });

  it('Home moves to first column of current row', () => {
    teardown = mountRovingTabindex(table, vi.fn());
    dispatchKey(table, 'ArrowRight');
    dispatchKey(table, 'ArrowRight');
    dispatchKey(table, 'Home');
    const row = table.querySelector('tbody [role="row"]')!;
    const cells = row.querySelectorAll('[role="gridcell"]');
    expect((cells[0] as HTMLElement).tabIndex).toBe(0);
  });

  it('End moves to last column of current row', () => {
    teardown = mountRovingTabindex(table, vi.fn());
    dispatchKey(table, 'End');
    const row = table.querySelector('tbody [role="row"]')!;
    const cells = row.querySelectorAll('[role="gridcell"]');
    expect((cells[cells.length - 1] as HTMLElement).tabIndex).toBe(0);
  });

  it('Ctrl+Home moves to first row, first column', () => {
    teardown = mountRovingTabindex(table, vi.fn());
    dispatchKey(table, 'ArrowDown');
    dispatchKey(table, 'ArrowRight');
    dispatchKey(table, 'Home', { ctrlKey: true });
    const firstCell = table.querySelector('tbody [role="row"] [role="gridcell"]') as HTMLElement;
    expect(firstCell.tabIndex).toBe(0);
  });

  it('Ctrl+End moves to last row, last column', () => {
    teardown = mountRovingTabindex(table, vi.fn());
    dispatchKey(table, 'End', { ctrlKey: true });
    const rows = table.querySelectorAll('tbody [role="row"]');
    const lastRow = rows[rows.length - 1]!;
    const cells = lastRow.querySelectorAll('[role="gridcell"]');
    expect((cells[cells.length - 1] as HTMLElement).tabIndex).toBe(0);
  });

  it('PageDown moves down by visible row count without exceeding bounds', () => {
    teardown = mountRovingTabindex(table, vi.fn());
    // 4 rows; PageDown from row 0 should land at row 3 (clamped)
    dispatchKey(table, 'PageDown');
    const rows = table.querySelectorAll('tbody [role="row"]');
    const cells = rows[rows.length - 1]!.querySelectorAll('[role="gridcell"]');
    expect((cells[0] as HTMLElement).tabIndex).toBe(0);
  });

  it('PageUp from first row clamps to row 0', () => {
    teardown = mountRovingTabindex(table, vi.fn());
    // Already at row 0; PageUp should stay
    dispatchKey(table, 'PageUp');
    const firstCell = table.querySelector('tbody [role="row"] [role="gridcell"]') as HTMLElement;
    expect(firstCell.tabIndex).toBe(0);
  });

  it('boundary clamping: ArrowLeft at col 0 does not throw', () => {
    teardown = mountRovingTabindex(table, vi.fn());
    expect(() => dispatchKey(table, 'ArrowLeft')).not.toThrow();
  });

  it('boundary clamping: ArrowRight at last col does not throw', () => {
    teardown = mountRovingTabindex(table, vi.fn());
    dispatchKey(table, 'End');
    expect(() => dispatchKey(table, 'ArrowRight')).not.toThrow();
  });

  it('boundary clamping: ArrowDown at last row does not throw', () => {
    teardown = mountRovingTabindex(table, vi.fn());
    dispatchKey(table, 'End', { ctrlKey: true });
    expect(() => dispatchKey(table, 'ArrowDown')).not.toThrow();
  });

  it('onNavigate is called with absolute row index (aria-rowindex - 2)', () => {
    const onNav = vi.fn();
    teardown = mountRovingTabindex(table, onNav);
    dispatchKey(table, 'ArrowDown');
    // Row 1 in body, aria-rowindex=3 (vsOffset=0, i=1 -> 0+1+2=3)
    expect(onNav).toHaveBeenCalledWith(1, 0); // absRowIdx=3-2=1, colIdx=0
  });

  it('Enter on non-readonly cell fires tablecrafter:edit event', () => {
    teardown = mountRovingTabindex(table, vi.fn());
    // applyAriaGrid set col0 as editable, so no aria-readonly on first td
    const editEvents: CustomEvent[] = [];
    table.addEventListener('tablecrafter:edit', e => editEvents.push(e as CustomEvent));
    dispatchKey(table, 'Enter');
    expect(editEvents).toHaveLength(1);
  });

  it('Enter on readonly cell does not fire tablecrafter:edit', () => {
    teardown = mountRovingTabindex(table, vi.fn());
    // Move to col 1 which is not editable -> aria-readonly=true
    dispatchKey(table, 'ArrowRight');
    const editEvents: CustomEvent[] = [];
    table.addEventListener('tablecrafter:edit', e => editEvents.push(e as CustomEvent));
    dispatchKey(table, 'Enter');
    expect(editEvents).toHaveLength(0);
  });

  it('F2 on editable cell fires tablecrafter:edit event', () => {
    teardown = mountRovingTabindex(table, vi.fn());
    const editEvents: CustomEvent[] = [];
    table.addEventListener('tablecrafter:edit', e => editEvents.push(e as CustomEvent));
    dispatchKey(table, 'F2');
    expect(editEvents).toHaveLength(1);
  });

  it('Enter on a cell with data-editing=true fires tablecrafter:commit', () => {
    teardown = mountRovingTabindex(table, vi.fn());
    const firstCell = table.querySelector('[role="gridcell"]') as HTMLElement;
    firstCell.dataset['editing'] = 'true';
    const commitEvents: CustomEvent[] = [];
    table.addEventListener('tablecrafter:commit', e => commitEvents.push(e as CustomEvent));
    dispatchKey(table, 'Enter');
    expect(commitEvents).toHaveLength(1);
    delete firstCell.dataset['editing'];
  });

  it('Escape fires tablecrafter:cancel event', () => {
    teardown = mountRovingTabindex(table, vi.fn());
    const cancelEvents: CustomEvent[] = [];
    table.addEventListener('tablecrafter:cancel', e => cancelEvents.push(e as CustomEvent));
    dispatchKey(table, 'Escape');
    expect(cancelEvents).toHaveLength(1);
  });

  it('Space fires tablecrafter:select with multi=false', () => {
    teardown = mountRovingTabindex(table, vi.fn());
    const selectEvents: CustomEvent[] = [];
    table.addEventListener('tablecrafter:select', e => selectEvents.push(e as CustomEvent));
    dispatchKey(table, ' ');
    expect(selectEvents).toHaveLength(1);
    expect((selectEvents[0] as CustomEvent).detail.multi).toBe(false);
  });

  it('Shift+Space fires tablecrafter:select with multi=true', () => {
    teardown = mountRovingTabindex(table, vi.fn());
    const selectEvents: CustomEvent[] = [];
    table.addEventListener('tablecrafter:select', e => selectEvents.push(e as CustomEvent));
    dispatchKey(table, ' ', { shiftKey: true });
    expect(selectEvents).toHaveLength(1);
    expect((selectEvents[0] as CustomEvent).detail.multi).toBe(true);
  });

  it('teardown function removes the keydown listener', () => {
    const onNav = vi.fn();
    teardown = mountRovingTabindex(table, onNav);
    teardown();
    dispatchKey(table, 'ArrowDown');
    // If listener were still active, onNav would be called
    expect(onNav).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createLiveRegion
// ---------------------------------------------------------------------------

describe('createLiveRegion', () => {
  it('appends an element to document.body with correct roles', () => {
    const region = createLiveRegion();
    const el = document.body.querySelector('[role="status"]');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('aria-live')).toBe('polite');
    expect(el?.getAttribute('aria-atomic')).toBe('true');
    region.destroy();
  });

  it('positions the element off-screen (not display:none)', () => {
    const region = createLiveRegion();
    const el = document.body.querySelector('[role="status"]') as HTMLElement;
    expect(el?.style.left).toBe('-9999px');
    expect(el?.style.position).toBe('absolute');
    region.destroy();
  });

  it('announce sets textContent asynchronously via setTimeout', () => {
    vi.useFakeTimers();
    const region = createLiveRegion();
    const el = document.body.querySelector('[role="status"]')!;
    region.announce('3 results found');
    expect(el.textContent).toBe(''); // cleared synchronously
    vi.runAllTimers();
    expect(el.textContent).toBe('3 results found');
    region.destroy();
    vi.useRealTimers();
  });

  it('announce clears before setting to allow repeated identical announcements', () => {
    vi.useFakeTimers();
    const region = createLiveRegion();
    const el = document.body.querySelector('[role="status"]')!;
    region.announce('Loading...');
    vi.runAllTimers();
    expect(el.textContent).toBe('Loading...');

    region.announce('Loading...');
    expect(el.textContent).toBe(''); // synchronously cleared
    vi.runAllTimers();
    expect(el.textContent).toBe('Loading...');
    region.destroy();
    vi.useRealTimers();
  });

  it('destroy removes the element from the DOM', () => {
    const region = createLiveRegion();
    expect(document.body.querySelector('[role="status"]')).not.toBeNull();
    region.destroy();
    expect(document.body.querySelector('[role="status"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// preserveFocusThroughPatch
// ---------------------------------------------------------------------------

describe('preserveFocusThroughPatch', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('runs patch even when no element is focused inside container', () => {
    let patched = false;
    preserveFocusThroughPatch(container, () => { patched = true; });
    expect(patched).toBe(true);
  });

  it('runs patch when focused element is outside the container', () => {
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    outside.focus();

    let patched = false;
    preserveFocusThroughPatch(container, () => { patched = true; });
    expect(patched).toBe(true);
    outside.remove();
  });

  it('restores focus to the new node with same aria-rowindex + aria-colindex', () => {
    // Build a simple table-like structure
    const table = document.createElement('table');
    const tbody = document.createElement('tbody');
    const tr = document.createElement('tr');
    tr.setAttribute('role', 'row');
    tr.setAttribute('aria-rowindex', '3');
    const td = document.createElement('td');
    td.setAttribute('role', 'gridcell');
    td.setAttribute('aria-colindex', '2');
    td.tabIndex = 0;
    tr.appendChild(td);
    tbody.appendChild(tr);
    table.appendChild(tbody);
    container.appendChild(table);

    td.focus();
    expect(document.activeElement).toBe(td);

    preserveFocusThroughPatch(container, () => {
      // Simulate DOM patch: remove old tr, add new tr with fresh td
      tbody.removeChild(tr);
      const newTr = document.createElement('tr');
      newTr.setAttribute('role', 'row');
      newTr.setAttribute('aria-rowindex', '3');
      const newTd = document.createElement('td');
      newTd.setAttribute('role', 'gridcell');
      newTd.setAttribute('aria-colindex', '2');
      newTd.tabIndex = 0;
      newTr.appendChild(newTd);
      tbody.appendChild(newTr);
    });

    // Focus should have moved to the newly created td
    const restored = container.querySelector(
      '[role="row"][aria-rowindex="3"] [aria-colindex="2"]'
    );
    expect(document.activeElement).toBe(restored);
  });

  it('does not throw when focused row falls outside virtual window post-patch', () => {
    const table = document.createElement('table');
    const tbody = document.createElement('tbody');
    const tr = document.createElement('tr');
    tr.setAttribute('role', 'row');
    tr.setAttribute('aria-rowindex', '5');
    const td = document.createElement('td');
    td.setAttribute('role', 'gridcell');
    td.setAttribute('aria-colindex', '1');
    td.tabIndex = 0;
    tr.appendChild(td);
    tbody.appendChild(tr);
    table.appendChild(tbody);
    container.appendChild(table);

    td.focus();

    expect(() => {
      preserveFocusThroughPatch(container, () => {
        // Remove all rows (simulate scrolled out of virtual window)
        tbody.innerHTML = '';
      });
    }).not.toThrow();
  });

  it('patch runs when focused element is in the container', () => {
    const input = document.createElement('input');
    input.tabIndex = 0;
    container.appendChild(input);
    input.focus();

    let ran = false;
    preserveFocusThroughPatch(container, () => { ran = true; });
    expect(ran).toBe(true);
  });
});
