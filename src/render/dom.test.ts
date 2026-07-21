/**
 * render/dom.test.ts
 *
 * Integration tests for the default DOM renderer (render/dom.ts).
 *
 * These run against the REAL merged sibling modules (render/a11y.ts and
 * render/virtual.ts) plus the real cells / permissions / sorting / i18n
 * modules -- no mocks -- so the wiring described in the Phase 3 spec is
 * exercised end to end in jsdom.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTable } from '../core/state';
import type { TableCrafterColumn } from '../core/types';
import { mountTable } from './dom';

// ---------------------------------------------------------------------------
// Controllable ResizeObserver stub (jsdom does not implement it).
// ---------------------------------------------------------------------------
type ROCallback = (entries: Array<{ contentRect: { width: number; height: number } }>) => void;
const roInstances: MockResizeObserver[] = [];
class MockResizeObserver {
  cb: ROCallback;
  target: Element | null = null;
  constructor(cb: ROCallback) {
    this.cb = cb;
    roInstances.push(this);
  }
  observe(target: Element): void {
    this.target = target;
  }
  disconnect(): void {
    /* noop */
  }
  trigger(width: number, height = 400): void {
    this.cb([{ contentRect: { width, height } }]);
  }
}

const COLUMNS: TableCrafterColumn[] = [
  { key: 'name', label: 'Name', sortable: true, editable: true, type: 'text' },
  { key: 'age', label: 'Age', sortable: true, type: 'number' },
];

const DATA = [
  { id: 1, name: 'Charlie', age: 30 },
  { id: 2, name: 'Alice', age: 25 },
  { id: 3, name: 'Bob', age: 40 },
];

function makeStore(overrides?: { columns?: TableCrafterColumn[]; data?: unknown[]; pageSize?: number }) {
  return createTable({
    data: overrides?.data ?? DATA.map((r) => ({ ...r })),
    columns: overrides?.columns ?? COLUMNS,
    pageSize: overrides?.pageSize ?? 0,
  });
}

let host: HTMLElement;

beforeEach(() => {
  roInstances.length = 0;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = MockResizeObserver;
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  host.remove();
  document.querySelectorAll('[role="status"]').forEach((n) => n.remove());
});

describe('mountTable — handle + skeleton', () => {
  it('returns a handle with destroy() and update() functions', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    expect(typeof r.destroy).toBe('function');
    expect(typeof r.update).toBe('function');
    r.destroy();
  });

  it('appends a managed div.tc-root without clearing the element', () => {
    host.appendChild(document.createElement('span'));
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    expect(host.querySelector('span')).not.toBeNull();
    expect(host.querySelector('.tc-root')).not.toBeNull();
    r.destroy();
  });

  it('mounts the full skeleton (toolbar, wrapper, cards, pagination, dialog, menu)', () => {
    const store = makeStore({ pageSize: 2 });
    const r = mountTable(store, host, { columns: COLUMNS });
    expect(host.querySelector('.tc-toolbar')).not.toBeNull();
    expect(host.querySelector('.tc-table-wrapper')).not.toBeNull();
    expect(host.querySelector('table.tc-table')).not.toBeNull();
    expect(host.querySelector('.tc-cards-container')).not.toBeNull();
    expect(host.querySelector('dialog.tc-dialog')).not.toBeNull();
    expect(host.querySelector('.tc-context-menu')).not.toBeNull();
    r.destroy();
  });
});

describe('initial render', () => {
  it('produces a role=grid table with the correct row count', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    const table = host.querySelector('table.tc-table')!;
    expect(table.getAttribute('role')).toBe('grid');
    expect(table.querySelectorAll('tbody tr').length).toBe(3);
    // aria-rowcount = totalRows + 1 (header)
    expect(table.getAttribute('aria-rowcount')).toBe('4');
    r.destroy();
  });

  it('renders one header per visible column with data-col', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    const ths = host.querySelectorAll('thead th');
    expect(ths.length).toBe(2);
    expect((ths[0] as HTMLElement).dataset.col).toBe('name');
    r.destroy();
  });

  it('renders a no-results row when there are no rows', () => {
    const store = makeStore({ data: [] });
    const r = mountTable(store, host, { columns: COLUMNS });
    expect(host.querySelector('.tc-no-results')).not.toBeNull();
    r.destroy();
  });
});

describe('sorting — full tbody rebuild', () => {
  it('reorders rows and updates aria-sort on header click', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    const firstCellText = () =>
      host.querySelector('tbody tr td')!.textContent;
    expect(firstCellText()).toBe('Charlie');

    (host.querySelector('th[data-col="name"]') as HTMLElement).click(); // sort asc

    expect(firstCellText()).toBe('Alice');
    // thead is rebuilt on sort, so re-query the header for the ARIA state.
    const nameTh = host.querySelector('th[data-col="name"]') as HTMLElement;
    expect(nameTh.getAttribute('aria-sort')).toBe('ascending');
    r.destroy();
  });

  it('full rebuild replaces tbody row nodes', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    const oldFirstRow = host.querySelector('tbody tr');
    store.sort('name');
    const newFirstRow = host.querySelector('tbody tr');
    expect(newFirstRow).not.toBe(oldFirstRow);
    r.destroy();
  });
});

describe('editing — editor materialization', () => {
  it('materializes an <input> in the editing cell', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    store.editCell(1, 'name', 'Charlie');
    const td = host.querySelector('td[data-row-id="1"][data-col="name"]')!;
    const input = td.querySelector('input.tc-editor') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('Charlie');
    r.destroy();
  });

  it('blur commits the edited value via COMMIT_EDIT', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    store.editCell(1, 'name', 'Charlie');
    const input = host.querySelector('td[data-row-id="1"][data-col="name"] input') as HTMLInputElement;
    input.value = 'Zoe';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur'));
    const state = store.getState();
    expect(state.editingCell).toBeNull();
    const row = state.rows.find((rr) => (rr as { id: number }).id === 1) as { name: string };
    expect(row.name).toBe('Zoe');
    r.destroy();
  });

  it('Escape keydown cancels the edit', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    store.editCell(1, 'name', 'Charlie');
    const input = host.querySelector('td[data-row-id="1"][data-col="name"] input') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(store.getState().editingCell).toBeNull();
    r.destroy();
  });

  it('typing does not tear down and recreate the editor (same node)', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    store.editCell(1, 'name', 'Charlie');
    const input1 = host.querySelector('td[data-row-id="1"][data-col="name"] input') as HTMLInputElement;
    input1.value = 'Ch';
    input1.dispatchEvent(new Event('input', { bubbles: true }));
    const input2 = host.querySelector('td[data-row-id="1"][data-col="name"] input') as HTMLInputElement;
    expect(input2).toBe(input1); // editor preserved through keystroke dispatch
    r.destroy();
  });
});

describe('selection — cheap patch without node replacement', () => {
  it('toggles tc-selected class without replacing the row node', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    const rowBefore = host.querySelector('tbody tr[data-row-id="1"]');
    store.select(1);
    const rowAfter = host.querySelector('tbody tr[data-row-id="1"]');
    expect(rowAfter).toBe(rowBefore); // node identity preserved (no rebuild)
    expect(rowAfter!.classList.contains('tc-selected')).toBe(true);
    r.destroy();
  });

  it('click on a row dispatches SELECT', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    const cell = host.querySelector('tbody tr[data-row-id="2"] td[data-col="age"]') as HTMLElement;
    cell.click();
    expect(store.getState().selection.has(2)).toBe(true);
    r.destroy();
  });
});

describe('permissions — column visibility', () => {
  it('excludes columns whose visibleTo does not include the role', () => {
    const cols: TableCrafterColumn[] = [
      { key: 'name', label: 'Name' },
      { key: 'salary', label: 'Salary', permission: { visibleTo: ['admin'] } },
    ];
    const store = makeStore({ columns: cols, data: [{ id: 1, name: 'A', salary: 100 }] });
    const r = mountTable(store, host, { columns: cols }); // role undefined
    const headers = Array.from(host.querySelectorAll('thead th')).map(
      (th) => (th as HTMLElement).dataset.col
    );
    expect(headers).toEqual(['name']);
    r.destroy();
  });

  it('includes a permissioned column when the role matches', () => {
    const cols: TableCrafterColumn[] = [
      { key: 'name', label: 'Name' },
      { key: 'salary', label: 'Salary', permission: { visibleTo: ['admin'] } },
    ];
    const store = makeStore({ columns: cols, data: [{ id: 1, name: 'A', salary: 100 }] });
    const r = mountTable(store, host, { columns: cols, role: 'admin' });
    const headers = Array.from(host.querySelectorAll('thead th')).map(
      (th) => (th as HTMLElement).dataset.col
    );
    expect(headers).toEqual(['name', 'salary']);
    r.destroy();
  });
});

describe('pagination', () => {
  it('renders pagination controls and advances pages', () => {
    const store = makeStore({ pageSize: 2 });
    const r = mountTable(store, host, { columns: COLUMNS });
    expect(host.querySelector('.tc-page-info')!.textContent).toBe('Page 1 of 2');
    (host.querySelector('.tc-page-next') as HTMLButtonElement).click();
    expect(store.getState().page).toBe(2);
    expect(host.querySelector('.tc-page-info')!.textContent).toBe('Page 2 of 2');
    r.destroy();
  });

  it('hides pagination when a single page', () => {
    const store = makeStore({ pageSize: 100 });
    const r = mountTable(store, host, { columns: COLUMNS });
    expect(host.querySelector('.tc-pagination')!.classList.contains('tc-hidden')).toBe(true);
    r.destroy();
  });
});

describe('search + filter summary', () => {
  it('search input dispatches SEARCH and narrows rows', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    const search = host.querySelector('.tc-search') as HTMLInputElement;
    search.value = 'Alice';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(host.querySelectorAll('tbody tr').length).toBe(1);
    expect(host.querySelector('tbody tr td')!.textContent).toBe('Alice');
    r.destroy();
  });

  it('renders a clearable filter chip and clears on click', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    store.setFilter('name', { operator: 'contains', value: 'Bob' });
    const chip = host.querySelector('.tc-filter-chip');
    expect(chip).not.toBeNull();
    (host.querySelector('.tc-filter-clear') as HTMLElement).click();
    expect(store.getState().filters['name']).toBeUndefined();
    r.destroy();
  });
});

describe('loading / error status', () => {
  it('shows overlay and sets aria-busy when loading', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    store.dispatch({ type: 'SET_LOADING', payload: { loading: true } });
    expect(host.querySelector('.tc-overlay')!.classList.contains('tc-hidden')).toBe(false);
    expect(host.querySelector('table.tc-table')!.getAttribute('aria-busy')).toBe('true');
    r.destroy();
  });

  it('renders an error alert when error is set', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    store.dispatch({ type: 'SET_ERROR', payload: { error: 'Boom' } });
    const alert = host.querySelector('.tc-error');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toBe('Boom');
    r.destroy();
  });
});

describe('theming + RTL', () => {
  it('applies data-theme from options', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS, theme: 'dark' });
    expect((host.querySelector('.tc-root') as HTMLElement).dataset.theme).toBe('dark');
    r.destroy();
  });

  it('applies dir=rtl for an RTL locale', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS, locale: 'ar' });
    expect((host.querySelector('.tc-root') as HTMLElement).dir).toBe('rtl');
    r.destroy();
  });
});

describe('card mode', () => {
  it('view=card sets data-card-mode=true', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS, view: 'card' });
    expect((host.querySelector('.tc-root') as HTMLElement).dataset.cardMode).toBe('true');
    r.destroy();
  });

  it('view=table sets data-card-mode=false', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS, view: 'table' });
    expect((host.querySelector('.tc-root') as HTMLElement).dataset.cardMode).toBe('false');
    r.destroy();
  });

  it('auto mode toggles card mode via the ResizeObserver fallback', () => {
    // Force the CQ-unsupported path so the RO fallback installs.
    const cssBackup = (globalThis as { CSS?: unknown }).CSS;
    (globalThis as { CSS?: unknown }).CSS = undefined;
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS, view: 'auto', breakpoints: { card: 640 } });
    expect(roInstances.length).toBeGreaterThan(0);
    roInstances[0]!.trigger(500); // below breakpoint
    expect((host.querySelector('.tc-root') as HTMLElement).dataset.cardMode).toBe('true');
    roInstances[0]!.trigger(900); // above breakpoint
    expect((host.querySelector('.tc-root') as HTMLElement).dataset.cardMode).toBe('false');
    (globalThis as { CSS?: unknown }).CSS = cssBackup;
    r.destroy();
  });

  it('renders a card per row in the cards container', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS, view: 'card' });
    expect(host.querySelectorAll('.tc-cards-container .tc-card').length).toBe(3);
    r.destroy();
  });
});

describe('keyboard action CustomEvents from a11y', () => {
  it('tablecrafter:edit starts an edit session on the target cell', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    const table = host.querySelector('table.tc-table')!;
    table.dispatchEvent(
      new CustomEvent('tablecrafter:edit', { bubbles: true, detail: { rowId: '1', colIndex: 0 } })
    );
    expect(store.getState().editingCell).toEqual(
      expect.objectContaining({ rowId: 1, column: 'name' })
    );
    r.destroy();
  });

  it('tablecrafter:select selects the target row', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    const table = host.querySelector('table.tc-table')!;
    table.dispatchEvent(
      new CustomEvent('tablecrafter:select', { bubbles: true, detail: { rowId: '3', multi: false } })
    );
    expect(store.getState().selection.has(3)).toBe(true);
    r.destroy();
  });

  it('tablecrafter:cancel cancels an active edit', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    store.editCell(1, 'name', 'Charlie');
    const table = host.querySelector('table.tc-table')!;
    table.dispatchEvent(new CustomEvent('tablecrafter:cancel', { bubbles: true }));
    expect(store.getState().editingCell).toBeNull();
    r.destroy();
  });
});

describe('context menu', () => {
  it('contextmenu on a cell reveals the 3-item menu', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    const cell = host.querySelector('td[data-row-id="1"][data-col="name"]') as HTMLElement;
    cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
    const menu = host.querySelector('.tc-context-menu')!;
    expect(menu.classList.contains('tc-hidden')).toBe(false);
    expect(menu.querySelectorAll('.tc-menu-item').length).toBe(3);
    r.destroy();
  });

  it('menu Delete removes the target row', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    const cell = host.querySelector('td[data-row-id="1"][data-col="name"]') as HTMLElement;
    cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
    const del = host.querySelector('.tc-menu-item[data-action="delete"]') as HTMLElement;
    del.click();
    expect(store.getState().rows.find((rr) => (rr as { id: number }).id === 1)).toBeUndefined();
    r.destroy();
  });
});

describe('add row', () => {
  it('clicking Add New dispatches addRow', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    const before = store.getState().rows.length;
    (host.querySelector('.tc-add-row') as HTMLButtonElement).click();
    expect(store.getState().rows.length).toBe(before + 1);
    r.destroy();
  });
});

describe('custom cell renderer override', () => {
  it('uses options.cells[key] with highest priority (string -> textContent)', () => {
    const store = makeStore();
    const r = mountTable(store, host, {
      columns: COLUMNS,
      cells: { name: (v) => `<<${String(v)}>>` },
    });
    const cell = host.querySelector('td[data-row-id="1"][data-col="name"]')!;
    expect(cell.textContent).toBe('<<Charlie>>');
    // string path must never use innerHTML for user data
    expect(cell.querySelector('*')).toBeNull();
    r.destroy();
  });
});

describe('virtual scroll activation', () => {
  it('mounts virtual scroll (spacers) when virtual=true and pageSize=0', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: i, name: `n${i}`, age: i }));
    const store = makeStore({ data: rows, pageSize: 0 });
    const r = mountTable(store, host, { columns: COLUMNS, virtual: true });
    expect(host.querySelector('.tc-vs-top-spacer')).not.toBeNull();
    expect(host.querySelector('.tc-vs-bottom-spacer')).not.toBeNull();
    // Windowed: far fewer than 100 rows rendered.
    const dataRows = host.querySelectorAll('tbody tr:not(.tc-vs-top-spacer):not(.tc-vs-bottom-spacer)');
    expect(dataRows.length).toBeLessThan(100);
    expect(dataRows.length).toBeGreaterThan(0);
    r.destroy();
  });
});

describe('teardown', () => {
  it('removes the root and stops reacting to store updates', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    expect(host.querySelector('.tc-root')).not.toBeNull();
    r.destroy();
    expect(host.querySelector('.tc-root')).toBeNull();
    // A store update after destroy must not recreate any DOM in host.
    store.sort('name');
    store.select(1);
    expect(host.querySelector('.tc-root')).toBeNull();
    expect(host.children.length).toBe(0);
  });

  it('removes the live region on destroy', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    const liveBefore = document.querySelectorAll('[role="status"]').length;
    expect(liveBefore).toBeGreaterThan(0);
    r.destroy();
    // The live region this renderer created is gone.
    expect(document.querySelectorAll('[role="status"]').length).toBe(liveBefore - 1);
  });
});

describe('update() imperative refresh', () => {
  it('reconciles when called manually', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    store.sort('age'); // youngest first via subscribe
    // Force a manual update with the current state; should not throw / duplicate.
    r.update(store.getState());
    expect(host.querySelectorAll('tbody tr').length).toBe(3);
    r.destroy();
  });
});

// Keep vi import referenced (used implicitly by environment); silence lints.
void vi;

// ---------------------------------------------------------------------------
// #330: search highlighting
// ---------------------------------------------------------------------------

describe('search highlighting — plain term', () => {
  it('wraps matched substring in <mark class="tc-highlight"> on a plain query', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    store.search('Ali');
    // Only Alice's row is shown; check name cell
    const nameCell = host.querySelector('tbody tr td[data-col="name"]') as HTMLElement;
    expect(nameCell).not.toBeNull();
    const mark = nameCell.querySelector('mark.tc-highlight');
    expect(mark).not.toBeNull();
    // The highlighted text should be the matched portion (case-insensitive)
    expect(mark!.textContent).toMatch(/ali/i);
    r.destroy();
  });

  it('XSS attempt in cell data is escaped inside mark wrapping', () => {
    const xssData = [{ id: 1, name: '<script>alert(1)</script>', age: 30 }];
    const store = makeStore({ data: xssData });
    const r = mountTable(store, host, { columns: COLUMNS });
    store.search('script');
    const nameCell = host.querySelector('tbody tr td[data-col="name"]') as HTMLElement;
    // The <script> should NOT be injected as real DOM
    expect(nameCell.querySelector('script')).toBeNull();
    // But the text content of the cell should include the literal angle-bracket text
    expect(nameCell.textContent).toContain('<script>');
    // A mark element should exist with the matched text
    const mark = nameCell.querySelector('mark.tc-highlight');
    expect(mark).not.toBeNull();
    r.destroy();
  });

  it('clears highlight marks when search is cleared', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    store.search('Charlie');
    // Verify mark exists
    const nameCell = () => host.querySelector('tbody tr td[data-col="name"]') as HTMLElement;
    expect(nameCell().querySelector('mark.tc-highlight')).not.toBeNull();
    // Clear search
    store.search('');
    expect(nameCell().querySelector('mark.tc-highlight')).toBeNull();
    r.destroy();
  });
});

describe('search highlighting — grammar field:value query', () => {
  it('highlights only the value portion in the matching column', () => {
    const store = makeStore();
    // fuzzy: true wires the grammar engine as parser, which understands field:value syntax
    const r = mountTable(store, host, { columns: COLUMNS, fuzzy: true });
    // Grammar field query: name:Alice — shows only Alice's row
    store.search('name:Alice');
    const nameCell = host.querySelector('tbody tr td[data-col="name"]') as HTMLElement;
    const ageCell = host.querySelector('tbody tr td[data-col="age"]') as HTMLElement;
    expect(nameCell).not.toBeNull();
    expect(ageCell).not.toBeNull();
    // Name cell should have a mark (field matches)
    expect(nameCell.querySelector('mark.tc-highlight')).not.toBeNull();
    // Age cell should NOT have a mark (different field)
    expect(ageCell.querySelector('mark.tc-highlight')).toBeNull();
    r.destroy();
  });
});

describe('search highlighting — fuzzy opt-in engine wiring', () => {
  it('wires createFuzzyEngine when fuzzy: true is passed', () => {
    const store = makeStore();
    // Spy on setSearchEngine if available
    const setSearchEngineSpy = vi.fn();
    const extended = store as unknown as Record<string, unknown>;
    const original = extended['setSearchEngine'];
    extended['setSearchEngine'] = setSearchEngineSpy;

    const r = mountTable(store, host, { columns: COLUMNS, fuzzy: true });
    expect(setSearchEngineSpy).toHaveBeenCalledTimes(1);
    // Restore
    extended['setSearchEngine'] = original;
    r.destroy();
  });

  it('does not wire a fuzzy engine when fuzzy is omitted', () => {
    const store = makeStore();
    const setSearchEngineSpy = vi.fn();
    const extended = store as unknown as Record<string, unknown>;
    const original = extended['setSearchEngine'];
    extended['setSearchEngine'] = setSearchEngineSpy;

    const r = mountTable(store, host, { columns: COLUMNS });
    expect(setSearchEngineSpy).not.toHaveBeenCalled();
    extended['setSearchEngine'] = original;
    r.destroy();
  });
});

// ---------------------------------------------------------------------------
// #329: pagination UI controls
// ---------------------------------------------------------------------------

describe('pagination — page-size selector', () => {
  it('renders a page-size select with default sizes [10, 25, 50, 100]', () => {
    const manyRows = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `Row${i + 1}`, age: i }));
    const store = makeStore({ data: manyRows, pageSize: 10 });
    const r = mountTable(store, host, { columns: COLUMNS });
    const sizeSelect = host.querySelector('.tc-page-size-select') as HTMLSelectElement;
    expect(sizeSelect).not.toBeNull();
    const optionValues = Array.from(sizeSelect.options).map((o) => Number(o.value));
    expect(optionValues).toContain(10);
    expect(optionValues).toContain(25);
    expect(optionValues).toContain(50);
    expect(optionValues).toContain(100);
    r.destroy();
  });

  it('reflects the current pageSize as selected option', () => {
    const manyRows = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `Row${i + 1}`, age: i }));
    const store = makeStore({ data: manyRows, pageSize: 25 });
    const r = mountTable(store, host, { columns: COLUMNS });
    const sizeSelect = host.querySelector('.tc-page-size-select') as HTMLSelectElement;
    expect(sizeSelect.value).toBe('25');
    r.destroy();
  });

  it('uses custom pageSizes option when provided', () => {
    const manyRows = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `Row${i + 1}`, age: i }));
    const store = makeStore({ data: manyRows, pageSize: 5 });
    const r = mountTable(store, host, { columns: COLUMNS, pageSizes: [5, 20, 50] });
    const sizeSelect = host.querySelector('.tc-page-size-select') as HTMLSelectElement;
    const optionValues = Array.from(sizeSelect.options).map((o) => Number(o.value));
    expect(optionValues).toContain(5);
    expect(optionValues).toContain(20);
    expect(optionValues).toContain(50);
    r.destroy();
  });

  it('dispatches setPageSize when select changes', () => {
    const manyRows = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `Row${i + 1}`, age: i }));
    const store = makeStore({ data: manyRows, pageSize: 10 });
    const r = mountTable(store, host, { columns: COLUMNS });
    const sizeSelect = host.querySelector('.tc-page-size-select') as HTMLSelectElement;
    sizeSelect.value = '25';
    sizeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.getState().pageSize).toBe(25);
    r.destroy();
  });
});

describe('pagination — jump-to-page input', () => {
  it('renders a numeric jump-to-page input', () => {
    const manyRows = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `Row${i + 1}`, age: i }));
    const store = makeStore({ data: manyRows, pageSize: 10 });
    const r = mountTable(store, host, { columns: COLUMNS });
    const jumpInput = host.querySelector('.tc-page-jump') as HTMLInputElement;
    expect(jumpInput).not.toBeNull();
    expect(jumpInput.type).toBe('number');
    r.destroy();
  });

  it('reflects the current page value', () => {
    const manyRows = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `Row${i + 1}`, age: i }));
    const store = makeStore({ data: manyRows, pageSize: 10 });
    const r = mountTable(store, host, { columns: COLUMNS });
    const jumpInput = host.querySelector('.tc-page-jump') as HTMLInputElement;
    expect(jumpInput.value).toBe('1');
    r.destroy();
  });

  it('dispatches setPage on Enter keydown with clamping', () => {
    const manyRows = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `Row${i + 1}`, age: i }));
    const store = makeStore({ data: manyRows, pageSize: 10 });
    const r = mountTable(store, host, { columns: COLUMNS });
    const jumpInput = host.querySelector('.tc-page-jump') as HTMLInputElement;
    jumpInput.value = '999'; // far beyond totalPages = 3
    jumpInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    // Should clamp to max page (30 rows / 10 per page = 3 pages)
    expect(store.getState().page).toBe(3);
    r.destroy();
  });

  it('clamps jump-to-page below 1', () => {
    const manyRows = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `Row${i + 1}`, age: i }));
    const store = makeStore({ data: manyRows, pageSize: 10 });
    const r = mountTable(store, host, { columns: COLUMNS });
    const jumpInput = host.querySelector('.tc-page-jump') as HTMLInputElement;
    jumpInput.value = '-5';
    jumpInput.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.getState().page).toBe(1);
    r.destroy();
  });

  it('has an aria-label for accessibility', () => {
    const manyRows = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `Row${i + 1}`, age: i }));
    const store = makeStore({ data: manyRows, pageSize: 10 });
    const r = mountTable(store, host, { columns: COLUMNS });
    const jumpInput = host.querySelector('.tc-page-jump') as HTMLInputElement;
    expect(jumpInput.getAttribute('aria-label')).not.toBeNull();
    r.destroy();
  });
});

describe('per-column role restrictions + column resize (#338)', () => {
  const ROLE_COLS: TableCrafterColumn[] = [
    { key: 'name', label: 'Name', editable: true },
    { key: 'salary', label: 'Salary', editable: true, editableRoles: ['admin'] },
  ];
  const ROLE_DATA = [{ id: 1, name: 'Alice', salary: 100 }];

  it('does not mark a role-restricted cell editable for a non-matching role', () => {
    const store = makeStore({ columns: ROLE_COLS, data: ROLE_DATA.map((r) => ({ ...r })) });
    const r = mountTable(store, host, { columns: ROLE_COLS, roles: ['viewer'] });

    const salary = host.querySelector('.tc-cell[data-col="salary"]') as HTMLElement;
    const name = host.querySelector('.tc-cell[data-col="name"]') as HTMLElement;
    expect(salary.dataset.editable).toBeUndefined();
    expect(name.dataset.editable).toBe('true'); // unrestricted column still editable
    r.destroy();
  });

  it('marks a role-restricted cell editable for a matching role', () => {
    const store = makeStore({ columns: ROLE_COLS, data: ROLE_DATA.map((r) => ({ ...r })) });
    const r = mountTable(store, host, { columns: ROLE_COLS, roles: ['admin'] });
    expect((host.querySelector('.tc-cell[data-col="salary"]') as HTMLElement).dataset.editable).toBe('true');
    r.destroy();
  });

  it('shows a permission tooltip on a restricted cell when enabled', () => {
    const store = makeStore({ columns: ROLE_COLS, data: ROLE_DATA.map((r) => ({ ...r })) });
    const r = mountTable(store, host, { columns: ROLE_COLS, roles: ['viewer'], showPermissionTooltip: true });
    const salary = host.querySelector('.tc-cell[data-col="salary"]') as HTMLElement;
    expect(salary.title).toMatch(/permission/i);
    expect(salary.classList.contains('tc-edit-restricted')).toBe(true);
    r.destroy();
  });

  it('setCurrentUser re-gates cells with new roles', () => {
    const store = makeStore({ columns: ROLE_COLS, data: ROLE_DATA.map((r) => ({ ...r })) });
    const r = mountTable(store, host, { columns: ROLE_COLS, roles: ['viewer'] });
    expect((host.querySelector('.tc-cell[data-col="salary"]') as HTMLElement).dataset.editable).toBeUndefined();

    r.setCurrentUser({ roles: ['admin'] });
    expect((host.querySelector('.tc-cell[data-col="salary"]') as HTMLElement).dataset.editable).toBe('true');
    r.destroy();
  });

  it('renders resize handles and a drag updates the column width', () => {
    const store = makeStore({ columns: ROLE_COLS, data: ROLE_DATA.map((r) => ({ ...r })) });
    const r = mountTable(store, host, { columns: ROLE_COLS, columnResize: true });

    const th = host.querySelector('.tc-th[data-col="name"]') as HTMLElement;
    const handle = th.querySelector('.tc-resize-handle') as HTMLElement;
    expect(handle).not.toBeNull();

    handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 160 }));
    window.dispatchEvent(new PointerEvent('pointerup', {}));

    expect(th.style.width).toBe('60px'); // startWidth 0 (jsdom) + 60px drag
    r.destroy();
  });

  it('preserves resized widths across a re-render (filter/paginate)', () => {
    const store = makeStore({ columns: ROLE_COLS, data: ROLE_DATA.map((r) => ({ ...r })) });
    const r = mountTable(store, host, { columns: ROLE_COLS, columnResize: true });
    const handle = host.querySelector('.tc-th[data-col="name"] .tc-resize-handle') as HTMLElement;
    handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 90 }));
    window.dispatchEvent(new PointerEvent('pointerup', {}));

    r.update({ ...store.getState() }); // force a rebuild
    expect((host.querySelector('.tc-th[data-col="name"]') as HTMLElement).style.width).toBe('90px');
    r.destroy();
  });

  it('double-click on a resize handle auto-sizes the column', () => {
    const store = makeStore({ columns: ROLE_COLS, data: ROLE_DATA.map((r) => ({ ...r })) });
    const r = mountTable(store, host, { columns: ROLE_COLS, columnResize: true });
    const handle = host.querySelector('.tc-th[data-col="name"] .tc-resize-handle') as HTMLElement;
    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    // jsdom reports scrollWidth 0, so auto-size falls back to the 40px minimum.
    expect((host.querySelector('.tc-th[data-col="name"]') as HTMLElement).style.width).toBe('40px');
    r.destroy();
  });
});

describe('row UX batch (#335)', () => {
  const ROW_COLS: TableCrafterColumn[] = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
  ];
  const ROWS = [
    { id: 1, name: 'Charlie' },
    { id: 2, name: 'Alice' },
  ];

  it('renders skeleton rows during an initial load', () => {
    const store = makeStore({ columns: ROW_COLS, data: [] });
    const r = mountTable(store, host, { columns: ROW_COLS, skeletonRows: 4 });
    // Drive a loading state with no rows yet (initial fetch in flight).
    r.update({ ...store.getState(), loading: true });
    expect(host.querySelectorAll('.tc-skeleton-row').length).toBe(4);
    expect(host.querySelectorAll('.tc-skeleton-row .tc-skeleton').length).toBeGreaterThan(0);
    r.destroy();
  });

  it('opens a detail modal with all fields on the eye button, closes on Escape', () => {
    const store = makeStore({ columns: ROW_COLS, data: ROWS.map((r) => ({ ...r })) });
    const r = mountTable(store, host, { columns: ROW_COLS, detailPopup: true });

    const eye = host.querySelector('.tc-detail-btn') as HTMLButtonElement;
    expect(eye).not.toBeNull();
    eye.click();

    const modal = host.querySelector('.tc-detail-modal') as HTMLElement;
    expect(modal.classList.contains('tc-hidden')).toBe(false);
    expect(modal.textContent).toContain('Charlie');
    expect(modal.querySelector('.tc-detail-value[data-col="name"]')?.textContent).toBe('Charlie');

    host.querySelector('.tc-root')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(modal.classList.contains('tc-hidden')).toBe(true);
    r.destroy();
  });

  it('closes the detail modal on the close button', () => {
    const store = makeStore({ columns: ROW_COLS, data: ROWS.map((r) => ({ ...r })) });
    const r = mountTable(store, host, { columns: ROW_COLS, detailPopup: true });
    (host.querySelector('.tc-detail-btn') as HTMLButtonElement).click();
    (host.querySelector('.tc-detail-close') as HTMLButtonElement).click();
    expect((host.querySelector('.tc-detail-modal') as HTMLElement).classList.contains('tc-hidden')).toBe(true);
    r.destroy();
  });

  it('expands rowLink tokens from row data onto each row', () => {
    const cols = ROW_COLS.map((c) => (c.key === 'name' ? { ...c, rowLink: '/records/{id}' } : c));
    const store = makeStore({ columns: cols, data: ROWS.map((r) => ({ ...r })) });
    const r = mountTable(store, host, { columns: cols });

    const rows = host.querySelectorAll('.tc-row');
    expect((rows[0] as HTMLElement).dataset.rowLink).toBe('/records/1');
    expect((rows[1] as HTMLElement).dataset.rowLink).toBe('/records/2');
    expect((rows[0] as HTMLElement).classList.contains('tc-row-link')).toBe(true);
    r.destroy();
  });

  it('navigates on a row-link click', () => {
    const navigate = vi.fn();
    const cols = ROW_COLS.map((c) => (c.key === 'name' ? { ...c, rowLink: '/records/{id}' } : c));
    const store = makeStore({ columns: cols, data: ROWS.map((r) => ({ ...r })) });
    const r = mountTable(store, host, { columns: cols, navigate });

    (host.querySelector('.tc-cell[data-col="name"]') as HTMLElement).click();
    expect(navigate).toHaveBeenCalledWith('/records/1');
    r.destroy();
  });

  it('shows a "Last updated" label after a load completes', () => {
    const store = makeStore({ columns: ROW_COLS, data: ROWS.map((r) => ({ ...r })) });
    const r = mountTable(store, host, { columns: ROW_COLS });
    const label = host.querySelector('.tc-last-updated') as HTMLElement;
    expect(label.classList.contains('tc-hidden')).toBe(true);

    // Simulate a fetch cycle: loading true, then false.
    r.update({ ...store.getState(), loading: true });
    r.update({ ...store.getState(), loading: false });

    expect(label.classList.contains('tc-hidden')).toBe(false);
    expect(label.textContent).toMatch(/Last updated: \d{2}:\d{2}:\d{2}/);
    r.destroy();
  });
});

describe('saved filter preset UI (#337)', () => {
  function presetController() {
    const saved: string[] = [];
    return {
      list: () => [...saved],
      save: vi.fn((name: string) => {
        if (!saved.includes(name)) saved.push(name);
      }),
      apply: vi.fn(),
      remove: vi.fn((name: string) => {
        const i = saved.indexOf(name);
        if (i >= 0) saved.splice(i, 1);
      }),
    };
  }

  it('renders a Save preset button and existing presets', () => {
    const presets = presetController();
    presets.save('Existing');
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS, presets });

    expect(host.querySelector('.tc-preset-save')).not.toBeNull();
    const items = host.querySelectorAll('.tc-preset-apply');
    expect(Array.from(items).map((n) => n.textContent)).toContain('Existing');
    r.destroy();
  });

  it('prompts for a name and saves on Save preset click, then shows it', () => {
    const presets = presetController();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('My view');
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS, presets });

    (host.querySelector('.tc-preset-save') as HTMLButtonElement).click();

    expect(presets.save).toHaveBeenCalledWith('My view');
    expect(Array.from(host.querySelectorAll('.tc-preset-apply')).map((n) => n.textContent)).toContain('My view');
    promptSpy.mockRestore();
    r.destroy();
  });

  it('applies a preset on click and deletes on the × button', () => {
    const presets = presetController();
    presets.save('Alpha');
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS, presets });

    (host.querySelector('.tc-preset-apply') as HTMLButtonElement).click();
    expect(presets.apply).toHaveBeenCalledWith('Alpha');

    (host.querySelector('.tc-preset-delete') as HTMLButtonElement).click();
    expect(presets.remove).toHaveBeenCalledWith('Alpha');
    expect(host.querySelector('.tc-preset-apply')).toBeNull();
    r.destroy();
  });

  it('renders no preset bar when no controller is supplied', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    expect(host.querySelector('.tc-preset-bar')).toBeNull();
    r.destroy();
  });
});

describe('column pinning (#328)', () => {
  const PIN_COLS: TableCrafterColumn[] = [
    { key: 'name', label: 'Name', width: 150 },
    { key: 'age', label: 'Age', width: 80 },
    { key: 'city', label: 'City' },
  ];
  const PIN_DATA = [
    { id: 1, name: 'Charlie', age: 30, city: 'Austin' },
    { id: 2, name: 'Alice', age: 25, city: 'Boston' },
  ];

  it('renders a declaratively-pinned column with sticky class and left offset 0', () => {
    const cols = PIN_COLS.map((c) => (c.key === 'name' ? { ...c, pinned: 'left' as const } : c));
    const store = makeStore({ columns: cols, data: PIN_DATA.map((r) => ({ ...r })) });
    const r = mountTable(store, host, { columns: cols });

    const th = host.querySelector('.tc-th[data-col="name"]') as HTMLElement;
    const td = host.querySelector('.tc-cell[data-col="name"]') as HTMLElement;
    expect(th.classList.contains('tc-pinned')).toBe(true);
    expect(th.classList.contains('tc-pinned-left')).toBe(true);
    expect(th.style.left).toBe('0px');
    expect(td.classList.contains('tc-pinned-left')).toBe(true);
    r.destroy();
  });

  it('stacks a second left-pinned column at the first column width offset', () => {
    const cols = PIN_COLS.map((c) =>
      c.key === 'name' || c.key === 'age' ? { ...c, pinned: 'left' as const } : c
    );
    const store = makeStore({ columns: cols, data: PIN_DATA.map((r) => ({ ...r })) });
    const r = mountTable(store, host, { columns: cols });

    const ageTh = host.querySelector('.tc-th[data-col="age"]') as HTMLElement;
    expect(ageTh.classList.contains('tc-pinned-left')).toBe(true);
    expect(ageTh.style.left).toBe('150px'); // width of the 'name' column ahead of it
    r.destroy();
  });

  it('pins a right-pinned column with a right offset', () => {
    const cols = PIN_COLS.map((c) => (c.key === 'city' ? { ...c, pinned: 'right' as const } : c));
    const store = makeStore({ columns: cols, data: PIN_DATA.map((r) => ({ ...r })) });
    const r = mountTable(store, host, { columns: cols });

    const th = host.querySelector('.tc-th[data-col="city"]') as HTMLElement;
    expect(th.classList.contains('tc-pinned-right')).toBe(true);
    expect(th.style.right).toBe('0px');
    r.destroy();
  });

  it('pinColumn() pins at runtime and unpinColumn() removes it', () => {
    const store = makeStore({ columns: PIN_COLS, data: PIN_DATA.map((r) => ({ ...r })) });
    const r = mountTable(store, host, { columns: PIN_COLS });

    expect((host.querySelector('.tc-th[data-col="age"]') as HTMLElement).classList.contains('tc-pinned')).toBe(false);

    r.pinColumn('age', 'left');
    expect((host.querySelector('.tc-th[data-col="age"]') as HTMLElement).classList.contains('tc-pinned-left')).toBe(true);
    expect((host.querySelector('.tc-cell[data-col="age"]') as HTMLElement).classList.contains('tc-pinned-left')).toBe(true);

    r.unpinColumn('age');
    expect((host.querySelector('.tc-th[data-col="age"]') as HTMLElement).classList.contains('tc-pinned')).toBe(false);
    expect((host.querySelector('.tc-cell[data-col="age"]') as HTMLElement).hasAttribute('style')).toBe(false);
    r.destroy();
  });
});

describe('undo/redo toast (#332)', () => {
  it('shows a toast naming the field and restored value on undo', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });

    store.editCell(1, 'name', 'Changed');
    store.commitEdit();
    store.undo();

    const toast = host.querySelector('.tc-toast');
    expect(toast).not.toBeNull();
    expect(toast?.getAttribute('role')).toBe('status');
    expect(toast?.textContent).toContain('Name'); // column label, not raw key
    expect(toast?.textContent).toContain('Charlie'); // restored value
    r.destroy();
  });

  it('shows a redo toast on redo', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    store.editCell(1, 'name', 'Changed');
    store.commitEdit();
    store.undo();
    host.querySelectorAll('.tc-toast').forEach((n) => n.remove());

    store.redo();

    const toast = host.querySelector('.tc-toast');
    expect(toast?.textContent).toContain('Changed');
    r.destroy();
  });

  it('auto-dismisses the toast after 3 seconds', () => {
    vi.useFakeTimers();
    try {
      const store = makeStore();
      const r = mountTable(store, host, { columns: COLUMNS });
      store.editCell(1, 'name', 'Changed');
      store.commitEdit();
      store.undo();

      expect(host.querySelector('.tc-toast')).not.toBeNull();
      vi.advanceTimersByTime(3000);
      expect(host.querySelector('.tc-toast')).toBeNull();
      r.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops firing toasts after destroy', () => {
    const store = makeStore();
    const r = mountTable(store, host, { columns: COLUMNS });
    r.destroy();
    store.editCell(1, 'name', 'Changed');
    store.commitEdit();
    store.undo();
    expect(host.querySelector('.tc-toast')).toBeNull();
  });
});
