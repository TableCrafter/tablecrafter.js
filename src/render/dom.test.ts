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
