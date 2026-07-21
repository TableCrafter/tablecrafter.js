import { describe, it, expect, vi } from 'vitest';
import { createTable } from './state';
import type { TableCrafterStore } from './state';
import type { TableCrafterColumn, TableCrafterPlugin } from './types';
import type { HookablePlugin } from './plugins';

const columns: TableCrafterColumn[] = [
  { key: 'id' },
  { key: 'name' },
  { key: 'age' },
  { key: 'city' },
];

interface Person {
  id: number;
  name: string;
  age: number;
  city: string;
}

const people: Person[] = [
  { id: 1, name: 'Charlie', age: 30, city: 'Austin' },
  { id: 2, name: 'alice', age: 25, city: 'Boston' },
  { id: 3, name: 'Bob', age: 30, city: 'Austin' },
  { id: 4, name: 'Dave', age: 22, city: 'Chicago' },
];

function make(
  overrides: Partial<Parameters<typeof createTable>[0]> = {}
): TableCrafterStore {
  return createTable({
    data: people.map((p) => ({ ...p })),
    columns,
    pageSize: 0,
    ...overrides,
  });
}

describe('core/state module', () => {
  it('loads and exports createTable', () => {
    expect(typeof createTable).toBe('function');
  });

  it('throws when config is not an object', () => {
    // @ts-expect-error deliberately invalid
    expect(() => createTable(null)).toThrow();
  });

  it('hydrates array data into state.rows immediately', () => {
    const s = make();
    expect(s.getState().rows).toHaveLength(4);
    expect(s.getState().totalRows).toBe(4);
    expect(s.getState().displayRows).toHaveLength(4);
  });

  it('handles empty data', () => {
    const s = createTable({ data: [], columns, pageSize: 10 });
    const st = s.getState();
    expect(st.rows).toEqual([]);
    expect(st.displayRows).toEqual([]);
    expect(st.totalRows).toBe(0);
    expect(st.pageCount).toBe(1);
  });

  // --- subscribe --------------------------------------------------------
  it('subscribe notifies on change and returns an unsubscribe', () => {
    const s = make();
    const spy = vi.fn();
    const off = s.subscribe(spy);
    s.sort('name');
    expect(spy).toHaveBeenCalledTimes(1);
    off();
    s.sort('age');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not notify listeners immediately on subscribe', () => {
    const s = make();
    const spy = vi.fn();
    s.subscribe(spy);
    expect(spy).not.toHaveBeenCalled();
  });

  it('isolates subscriber exceptions', () => {
    const s = make();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ok = vi.fn();
    s.subscribe(() => {
      throw new Error('boom');
    });
    s.subscribe(ok);
    s.sort('name');
    expect(ok).toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  // --- sorting ----------------------------------------------------------
  it('sorts ascending by default and is stable on ties', () => {
    const s = make();
    s.sort('age');
    const ages = (s.getState().sortedRows as Person[]).map((r) => r.age);
    expect(ages).toEqual([22, 25, 30, 30]);
    const thirties = (s.getState().sortedRows as Person[]).filter((r) => r.age === 30);
    expect(thirties.map((r) => r.name)).toEqual(['Charlie', 'Bob']);
  });

  it('toggles direction on repeated sort of the same column', () => {
    const s = make();
    s.sort('age');
    expect(s.getState().sort).toEqual([{ column: 'age', direction: 'asc' }]);
    s.sort('age');
    expect(s.getState().sort).toEqual([{ column: 'age', direction: 'desc' }]);
  });

  it('honors an explicit direction', () => {
    const s = make();
    s.sort('name', 'desc');
    expect(s.getState().sort[0]?.direction).toBe('desc');
  });

  it('sorts nulls last ascending (v2 semantics)', () => {
    const s = createTable({
      data: [{ v: 2 }, { v: null }, { v: 1 }],
      columns: [{ key: 'v' }],
      pageSize: 0,
    });
    s.sort('v');
    const vals = (s.getState().sortedRows as Array<{ v: number | null }>).map((r) => r.v);
    expect(vals).toEqual([1, 2, null]);
  });

  it('uses a custom comparator when registered', () => {
    const s = make();
    s.setComparator('name', (a, b) => String(a).length - String(b).length);
    s.sort('name');
    const names = (s.getState().sortedRows as Person[]).map((r) => r.name);
    expect(names[0]).toBe('Bob'); // shortest
  });

  it('emits a sort event with the SortState[] payload', () => {
    const s = make();
    const spy = vi.fn();
    s.on('sort', spy);
    s.sort('city', 'asc');
    expect(spy).toHaveBeenCalledWith([{ column: 'city', direction: 'asc' }]);
  });

  // --- filtering --------------------------------------------------------
  it('applies a column equality filter', () => {
    const s = make();
    s.setFilter('city', { operator: 'eq', value: 'Austin' });
    expect(s.getState().filteredRows).toHaveLength(2);
  });

  it('supports contains / gt / in / empty operators', () => {
    const s = make();
    s.setFilter('name', { operator: 'contains', value: 'a' });
    expect((s.getState().filteredRows as Person[]).map((r) => r.name).sort()).toEqual(
      ['Charlie', 'Dave', 'alice'].sort()
    );
    s.clearFilter();

    s.setFilter('age', { operator: 'gt', value: 25 });
    expect(s.getState().filteredRows).toHaveLength(2);
    s.clearFilter();

    s.setFilter('city', { operator: 'in', value: ['Boston', 'Chicago'] });
    expect(s.getState().filteredRows).toHaveLength(2);
    s.clearFilter();

    s.setFilter('city', { operator: 'empty', value: null });
    expect(s.getState().filteredRows).toHaveLength(0);
  });

  it('combines multiple column filters with AND', () => {
    const s = make();
    s.setFilter('city', { operator: 'eq', value: 'Austin' });
    s.setFilter('age', { operator: 'eq', value: 30 });
    expect(s.getState().filteredRows).toHaveLength(2);
  });

  it('setFilter(null) removes the filter; clearFilter clears one or all', () => {
    const s = make();
    s.setFilter('city', { operator: 'eq', value: 'Austin' });
    s.setFilter('city', null);
    expect(s.getState().filteredRows).toHaveLength(4);
    s.setFilter('city', { operator: 'eq', value: 'Austin' });
    s.setFilter('age', { operator: 'eq', value: 30 });
    s.clearFilter('city');
    expect(s.getState().filteredRows).toHaveLength(2);
    s.clearFilter();
    expect(s.getState().filteredRows).toHaveLength(4);
  });

  it('emits a filter event', () => {
    const s = make();
    const spy = vi.fn();
    s.on('filter', spy);
    const f = { operator: 'eq' as const, value: 'Austin' };
    s.setFilter('city', f);
    expect(spy).toHaveBeenCalledWith({ column: 'city', filter: f });
  });

  // --- search -----------------------------------------------------------
  it('search does a case-insensitive substring across columns', () => {
    const s = make();
    s.search('austin');
    expect(s.getState().filteredRows).toHaveLength(2);
    expect(s.getState().searchQuery).toBe('austin');
    expect(s.getState().searchAst).toEqual({ kind: 'term', value: 'austin' });
  });

  it('empty search matches all and clears the AST', () => {
    const s = make();
    s.search('bob');
    s.search('');
    expect(s.getState().filteredRows).toHaveLength(4);
    expect(s.getState().searchAst).toBeNull();
  });

  it('a custom search engine can be swapped in (grammar seam)', () => {
    const s = make();
    s.setSearchEngine({
      parse: (q) => (q ? { kind: 'term', value: q } : null),
      match: (row) => (row as Person).name === 'Bob',
    });
    s.search('anything');
    expect(s.getState().filteredRows).toHaveLength(1);
  });

  it('filter and search compose (both AND)', () => {
    const s = make();
    s.setFilter('age', { operator: 'eq', value: 30 });
    s.search('bob');
    expect(s.getState().filteredRows).toHaveLength(1);
  });

  // --- pagination -------------------------------------------------------
  it('derives pagination state', () => {
    const s = make({ pageSize: 2 });
    const st = s.getState();
    expect(st.pageCount).toBe(2);
    expect(st.displayRows).toHaveLength(2);
    expect(st.page).toBe(1);
  });

  it('setPage slices the sorted rows and clamps out-of-range pages', () => {
    const s = make({ pageSize: 2 });
    s.setPage(2);
    expect(s.getState().page).toBe(2);
    expect(s.getState().displayRows).toHaveLength(2);
    s.setPage(999); // clamps to last
    expect(s.getState().page).toBe(2);
    s.setPage(-5); // clamps to first
    expect(s.getState().page).toBe(1);
  });

  it('setPageSize resets to page 1 and recomputes pageCount', () => {
    const s = make({ pageSize: 2 });
    s.setPage(2);
    s.setPageSize(4);
    expect(s.getState().page).toBe(1);
    expect(s.getState().pageCount).toBe(1);
    expect(s.getState().displayRows).toHaveLength(4);
  });

  it('pageSize 0 disables pagination', () => {
    const s = make({ pageSize: 0 });
    expect(s.getState().pageCount).toBe(1);
    expect(s.getState().displayRows).toHaveLength(4);
  });

  it('emits page:change on page and size changes', () => {
    const s = make({ pageSize: 2 });
    const spy = vi.fn();
    s.on('page:change', spy);
    s.setPage(2);
    expect(spy).toHaveBeenCalledWith({ page: 2, pageSize: 2 });
    s.setPageSize(4);
    expect(spy).toHaveBeenLastCalledWith({ page: 1, pageSize: 4 });
  });

  // --- editing ----------------------------------------------------------
  it('editCell opens a session; commitEdit applies and emits', () => {
    const s = make();
    const cellSpy = vi.fn();
    const rowSpy = vi.fn();
    s.on('cell:edit', cellSpy);
    s.on('row:update', rowSpy);
    s.editCell(1, 'name', 'Charles');
    expect(s.getState().editingCell).toEqual({
      rowId: 1,
      column: 'name',
      originalValue: 'Charlie',
    });
    s.commitEdit();
    expect(s.getState().editingCell).toBeNull();
    expect((s.getState().rows[0] as Person).name).toBe('Charles');
    expect(cellSpy).toHaveBeenCalledWith({
      rowId: 1,
      column: 'name',
      value: 'Charles',
      previousValue: 'Charlie',
    });
    expect(rowSpy).toHaveBeenCalled();
  });

  it('cancelEdit discards the pending value', () => {
    const s = make();
    s.editCell(1, 'name', 'X');
    s.cancelEdit();
    expect(s.getState().editingCell).toBeNull();
    expect((s.getState().rows[0] as Person).name).toBe('Charlie');
  });

  it('commitEdit is a no-op with no active session', () => {
    const s = make();
    expect(() => s.commitEdit()).not.toThrow();
  });

  it('editCell on an unknown row is a no-op', () => {
    const s = make();
    s.editCell(999, 'name', 'X');
    expect(s.getState().editingCell).toBeNull();
  });

  it('a failing validator blocks the commit and surfaces the error', () => {
    const s = make();
    s.setValidator((value) => ({
      valid: String(value).length > 0,
      errors: String(value).length > 0 ? [] : ['required'],
    }));
    s.editCell(1, 'name', '');
    s.commitEdit();
    expect(s.getState().editingCell).not.toBeNull(); // session stays open
    expect(s.getState().error).toBe('required');
    expect((s.getState().rows[0] as Person).name).toBe('Charlie');
  });

  // --- row ops ----------------------------------------------------------
  it('addRow appends and emits row:add', () => {
    const s = make();
    const spy = vi.fn();
    s.on('row:add', spy);
    s.addRow({ id: 9, name: 'New', age: 1, city: 'Z' });
    expect(s.getState().rows).toHaveLength(5);
    expect(spy).toHaveBeenCalled();
  });

  it('addRow with no data appends an empty object', () => {
    const s = make();
    s.addRow();
    expect(s.getState().rows).toHaveLength(5);
    expect(s.getState().rows[4]).toEqual({});
  });

  it('duplicateRow inserts a copy after the original without its id', () => {
    const s = make();
    s.duplicateRow(1);
    expect(s.getState().rows).toHaveLength(5);
    const dup = s.getState().rows[1] as Partial<Person>;
    expect(dup.name).toBe('Charlie');
    expect('id' in dup).toBe(false);
  });

  it('deleteRow removes the row, drops it from selection, and emits', () => {
    const s = make();
    const spy = vi.fn();
    s.on('row:delete', spy);
    s.select(1);
    s.deleteRow(1);
    expect(s.getState().rows).toHaveLength(3);
    expect(s.getState().selection.has(1)).toBe(false);
    expect(spy).toHaveBeenCalledWith({ rowId: 1 });
  });

  it('bulkFill sets one column across many rows and emits per row', () => {
    const s = make();
    const spy = vi.fn();
    s.on('row:update', spy);
    s.bulkFill([1, 2, 3], 'city', 'Denver');
    const cities = (s.getState().rows as Person[]).slice(0, 3).map((r) => r.city);
    expect(cities).toEqual(['Denver', 'Denver', 'Denver']);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('bulkFill with an empty id list is a no-op', () => {
    const s = make();
    s.bulkFill([], 'city', 'X');
    expect((s.getState().rows[0] as Person).city).toBe('Austin');
  });

  // --- selection --------------------------------------------------------
  it('select replaces selection by default and toggles with multi', () => {
    const s = make();
    s.select(1);
    expect([...s.getState().selection]).toEqual([1]);
    s.select(2);
    expect([...s.getState().selection]).toEqual([2]); // replaced
    s.select(3, true);
    expect([...s.getState().selection].sort()).toEqual([2, 3]);
    s.select(3, true); // toggle off
    expect([...s.getState().selection]).toEqual([2]);
  });

  it('selectAll selects every row; deselectAll clears', () => {
    const s = make();
    s.selectAll();
    expect(s.getState().selection.size).toBe(4);
    s.deselectAll();
    expect(s.getState().selection.size).toBe(0);
  });

  it('emits selection:change with a Set payload', () => {
    const s = make();
    const spy = vi.fn();
    s.on('selection:change', spy);
    s.select(1);
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0]![0].selection).toBeInstanceOf(Set);
  });

  it('getState selection is a defensive copy (external mutation cannot corrupt state)', () => {
    const s = make();
    s.select(1);
    s.getState().selection.add(999); // mutate the snapshot's copy
    s.select(2, true); // trigger a fresh snapshot from internal state
    expect(s.getState().selection.has(999)).toBe(false);
  });

  // --- undo / redo ------------------------------------------------------
  it('undo reverts a data mutation and redo re-applies it', () => {
    const s = make();
    s.editCell(1, 'name', 'Changed');
    s.commitEdit();
    expect((s.getState().rows[0] as Person).name).toBe('Changed');
    s.undo();
    expect((s.getState().rows[0] as Person).name).toBe('Charlie');
    s.redo();
    expect((s.getState().rows[0] as Person).name).toBe('Changed');
  });

  it('undo emits history:undo with the changed field and values (for the toast, #332)', () => {
    const s = make();
    const seen: unknown[] = [];
    s.on('history:undo', (p) => seen.push(p));
    s.editCell(1, 'name', 'Changed');
    s.commitEdit();

    s.undo();

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      column: 'name',
      value: 'Charlie', // value AFTER undo (restored)
      previousValue: 'Changed', // value BEFORE undo
      changed: 1,
    });
  });

  it('redo emits history:redo with the changed field and values', () => {
    const s = make();
    const seen: unknown[] = [];
    s.on('history:redo', (p) => seen.push(p));
    s.editCell(1, 'name', 'Changed');
    s.commitEdit();
    s.undo();

    s.redo();

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ column: 'name', value: 'Changed', previousValue: 'Charlie', changed: 1 });
  });

  it('a no-op undo (empty history) emits no history:undo event', () => {
    const s = make();
    const seen: unknown[] = [];
    s.on('history:undo', (p) => seen.push(p));
    s.undo();
    expect(seen).toHaveLength(0);
  });

  it('undo past history is a no-op', () => {
    const s = make();
    expect(() => s.undo()).not.toThrow();
    expect(s.getState().rows).toHaveLength(4);
  });

  it('redo with nothing to redo is a no-op', () => {
    const s = make();
    s.addRow();
    expect(() => s.redo()).not.toThrow();
    expect(s.getState().rows).toHaveLength(5);
  });

  it('a new mutation clears the redo stack', () => {
    const s = make();
    s.addRow({ id: 9 });
    s.undo();
    s.addRow({ id: 10 });
    s.redo(); // nothing to redo
    expect(
      (s.getState().rows as Array<{ id?: number }>).some((r) => r.id === 9)
    ).toBe(false);
  });

  it('history is capped at 100 entries', () => {
    const s = createTable({
      data: [{ id: 0, v: 0 }],
      columns: [{ key: 'v' }],
      pageSize: 0,
    });
    for (let i = 1; i <= 150; i++) {
      s.editCell(0, 'v', i);
      s.commitEdit();
    }
    let undos = 0;
    let last = -1;
    while (undos < 200) {
      const before = (s.getState().rows[0] as { v: number }).v;
      s.undo();
      const after = (s.getState().rows[0] as { v: number }).v;
      if (after === before) break;
      last = after;
      undos++;
    }
    expect(undos).toBe(100);
    expect(last).toBe(50); // earliest retained value (150 - 100)
  });

  // --- export seam ------------------------------------------------------
  it('export throws when no format is registered', () => {
    const s = make();
    expect(() => s.export('csv')).toThrow(/no exporter/i);
  });

  it('export invokes a registered handler with a state snapshot', () => {
    const s = make();
    const handler = vi.fn();
    s.registerExportFormat('csv', handler);
    s.export('csv', { filename: 'out.csv' });
    expect(handler).toHaveBeenCalledTimes(1);
    const [state, options, cols] = handler.mock.calls[0]!;
    expect(state.rows).toHaveLength(4);
    expect(options).toEqual({ filename: 'out.csv' });
    expect(cols).toHaveLength(4);
  });

  // --- dispatch ---------------------------------------------------------
  it('dispatch drives the same behavior as the imperative helpers', () => {
    const s = make();
    s.dispatch({ type: 'SORT', payload: { column: 'age', direction: 'asc' } });
    expect(s.getState().sort).toEqual([{ column: 'age', direction: 'asc' }]);
    s.dispatch({ type: 'SEARCH', payload: { query: 'bob' } });
    expect(s.getState().filteredRows).toHaveLength(1);
    s.dispatch({ type: 'SET_ROWS', payload: { rows: [{ id: 1 }] } });
    expect(s.getState().rows).toHaveLength(1);
    s.dispatch({ type: 'SET_LOADING', payload: { loading: true } });
    expect(s.getState().loading).toBe(true);
    s.dispatch({ type: 'SET_ERROR', payload: { error: 'oops' } });
    expect(s.getState().error).toBe('oops');
  });

  // --- plugins ----------------------------------------------------------
  it('use()/unuse() manage plugins and config.plugins auto-registers', () => {
    const install = vi.fn();
    const plugin: TableCrafterPlugin = { name: 'auto', install };
    const s = make({ plugins: [plugin] });
    expect(install).toHaveBeenCalled();
    expect(s.listPlugins()).toContain('auto');
    const p2: TableCrafterPlugin = { name: 'manual', install() {} };
    s.use(p2);
    expect(s.listPlugins()).toContain('manual');
    expect(s.unuse('manual')).toBe(true);
    expect(s.listPlugins()).not.toContain('manual');
  });

  it('a beforeSort hook returning false cancels the sort (no state, no event)', () => {
    const s = make();
    const sortSpy = vi.fn();
    s.on('sort', sortSpy);
    const plugin: HookablePlugin = {
      name: 'veto',
      install() {},
      hooks: { beforeSort: () => false },
    };
    s.use(plugin);
    s.sort('age');
    expect(s.getState().sort).toEqual([]);
    expect(sortSpy).not.toHaveBeenCalled();
  });

  it('beforeEdit false cancels the commit and afterEdit does not fire', () => {
    const s = make();
    const after = vi.fn();
    const plugin: HookablePlugin = {
      name: 'veto-edit',
      install() {},
      hooks: { beforeEdit: () => false, afterEdit: after },
    };
    s.use(plugin);
    s.editCell(1, 'name', 'X');
    s.commitEdit();
    expect((s.getState().rows[0] as Person).name).toBe('Charlie');
    expect(after).not.toHaveBeenCalled();
    expect(s.getState().editingCell).toBeNull();
  });

  it('afterSort fires after a successful sort (dynamic hook seam)', () => {
    const s = make();
    const after = vi.fn();
    s.use({
      name: 'log',
      install(ctx) {
        // @ts-expect-error narrow to V3 context at runtime
        ctx.hook('afterSort', after);
      },
    });
    s.sort('name');
    expect(after).toHaveBeenCalledWith({ column: 'name', direction: 'asc' });
  });

  // --- load seam --------------------------------------------------------
  it('load() uses the loader seam and fires before/after hooks', async () => {
    const rows = [{ id: 1, name: 'Remote' }];
    const s = createTable({ data: '/api/rows', columns, pageSize: 0 });
    const before = vi.fn();
    const after = vi.fn();
    s.use({
      name: 'load-log',
      install() {},
      hooks: { beforeLoad: before, afterLoad: after },
    } as HookablePlugin);
    s.setLoader(async () => rows);
    await s.load();
    expect(before).toHaveBeenCalledWith({ source: '/api/rows' });
    expect(after).toHaveBeenCalledWith({ rows });
    expect(s.getState().rows).toEqual(rows);
    expect(s.getState().loading).toBe(false);
  });

  it('load() sets error on loader rejection', async () => {
    const s = createTable({ data: '/api/rows', columns, pageSize: 0 });
    s.setLoader(async () => {
      throw new Error('network down');
    });
    await s.load();
    expect(s.getState().error).toBe('network down');
    expect(s.getState().loading).toBe(false);
  });

  it('a beforeLoad hook returning false cancels the load', async () => {
    const s = createTable({ data: '/api/rows', columns, pageSize: 0 });
    const loader = vi.fn(async () => [{ id: 1 }]);
    s.setLoader(loader);
    s.use({
      name: 'block',
      install() {},
      hooks: { beforeLoad: () => false },
    } as HookablePlugin);
    await s.load();
    expect(loader).not.toHaveBeenCalled();
  });

  it('load() is a no-op when data was an inline array', async () => {
    const s = make();
    await s.load();
    expect(s.getState().rows).toHaveLength(4);
  });

  // --- destroy ----------------------------------------------------------
  it('destroy fires the destroy hook, tears down, and clears rows', () => {
    const s = make();
    const destroySpy = vi.fn();
    s.use({
      name: 'd',
      install() {},
      hooks: { destroy: destroySpy },
    } as HookablePlugin);
    const sub = vi.fn();
    s.subscribe(sub);
    s.destroy();
    expect(destroySpy).toHaveBeenCalled();
    expect(s.getState().rows).toHaveLength(0);
    sub.mockClear();
    s.sort('name');
    expect(sub).not.toHaveBeenCalled();
  });

  it('rowId resolves via a natural id field or falls back to index', () => {
    const noId = createTable({
      data: [{ name: 'a' }, { name: 'b' }],
      columns: [{ key: 'name' }],
      pageSize: 0,
    });
    noId.editCell(1, 'name', 'B'); // index-based id
    noId.commitEdit();
    expect((noId.getState().rows[1] as { name: string }).name).toBe('B');
  });
});
