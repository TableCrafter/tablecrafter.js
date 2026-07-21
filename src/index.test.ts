/**
 * index.test.ts
 *
 * Unit tests for the TableCrafter batteries wrapper and WrapperConfig.
 * Environment: jsdom (via vitest.config.ts).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import TableCrafter from './index';
import type { WrapperConfig } from './index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHost(): HTMLDivElement {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

function removeHost(host: HTMLElement): void {
  // destroy any live region left by mountTable
  document.querySelectorAll('[role="status"]').forEach((el) => el.remove());
  host.remove();
}

// ---------------------------------------------------------------------------
// WrapperConfig normalization
// ---------------------------------------------------------------------------

describe('WrapperConfig normalization', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = makeHost(); });
  afterEach(() => { removeHost(host); });

  it('new TableCrafter(element, {data, columns}) does not throw', () => {
    expect(() => {
      new TableCrafter(host, { data: [], columns: [{ key: 'x' }] });
    }).not.toThrow();
  });

  it('columns with field alias get normalized to key', () => {
    // field: 'name' should become key: 'name' after normalization
    const t = new TableCrafter(host, {
      data: [{ name: 'B' }, { name: 'A' }],
      columns: [{ field: 'name', label: 'Name' } as WrapperConfig['columns'][number]],
    });
    // Sort should work with the effective key 'name'
    t.sort('name', 'asc');
    const state = t.getState();
    expect(state.sort[0]?.column).toBe('name');
    // The first sorted row should have name 'A'
    const first = state.sortedRows[0] as Record<string, unknown>;
    expect(first['name']).toBe('A');
  });

  it('editable: true marks all non-explicit columns as editable', () => {
    const t = new TableCrafter(host, {
      data: [{ a: 1, b: 2 }],
      columns: [
        { key: 'a' },                   // no editable specified -> should become true
        { key: 'b', editable: false },  // explicit false -> unchanged
      ],
      editable: true,
    });
    t.render();
    const cellA = host.querySelector<HTMLElement>('td[data-col="a"]');
    const cellB = host.querySelector<HTMLElement>('td[data-col="b"]');
    expect(cellA?.dataset['editable']).toBe('true');
    expect(cellB?.dataset['editable']).toBeUndefined();
    t.destroy();
  });

  it('pagination: {pageSize: 10} maps to pageSize 10 in state', () => {
    const data = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    const t = new TableCrafter(host, {
      data,
      columns: [{ key: 'id' }],
      pagination: { pageSize: 10 },
    });
    expect(t.getState().pageSize).toBe(10);
    expect(t.getState().displayRows.length).toBe(10);
  });

  it('pagination: false sets pageSize to 0 (no pagination)', () => {
    const data = Array.from({ length: 30 }, (_, i) => ({ id: i }));
    const t = new TableCrafter(host, {
      data,
      columns: [{ key: 'id' }],
      pagination: false,
    });
    expect(t.getState().pageSize).toBe(0);
    expect(t.getState().displayRows.length).toBe(30);
  });

  it('pagination: number sets pageSize directly', () => {
    const data = Array.from({ length: 40 }, (_, i) => ({ id: i }));
    const t = new TableCrafter(host, {
      data,
      columns: [{ key: 'id' }],
      pagination: 5,
    });
    expect(t.getState().pageSize).toBe(5);
    expect(t.getState().displayRows.length).toBe(5);
  });

  it('i18n: {locale: "fr"} flows through to locale (no error, table renders)', () => {
    expect(() => {
      const t = new TableCrafter(host, {
        data: [{ val: 1234 }],
        columns: [{ key: 'val', type: 'number' }],
        i18n: { locale: 'fr' },
      });
      t.render();
      t.destroy();
    }).not.toThrow();
  });

  it('onEdit callback wires to store\'s cell:edit event', () => {
    const onEdit = vi.fn();
    const t = new TableCrafter(host, {
      data: [{ id: 1, name: 'Alice' }],
      columns: [{ key: 'name', editable: true }],
      onEdit,
    });
    t.editCell(1, 'name', 'Bob');
    t.commitEdit();
    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: 1, column: 'name', value: 'Bob' })
    );
  });

  it('onSort callback wires to store\'s sort event', () => {
    const onSort = vi.fn();
    const t = new TableCrafter(host, {
      data: [],
      columns: [{ key: 'name' }],
      onSort,
    });
    t.sort('name');
    expect(onSort).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// render()
// ---------------------------------------------------------------------------

describe('render()', () => {
  let host: HTMLDivElement;
  let instance: TableCrafter | null;

  beforeEach(() => {
    host = makeHost();
    instance = null;
  });
  afterEach(() => {
    instance?.destroy();
    instance = null;
    removeHost(host);
  });

  it('calling render() on a host element appends .tc-root to it', () => {
    instance = new TableCrafter(host, { data: [], columns: [{ key: 'x' }] });
    instance.render();
    expect(host.querySelector('.tc-root')).not.toBeNull();
  });

  it('calling render() twice returns this without double-mounting', () => {
    instance = new TableCrafter(host, { data: [], columns: [{ key: 'x' }] });
    const result1 = instance.render();
    const result2 = instance.render();
    expect(result1).toBe(instance);
    expect(result2).toBe(instance);
    expect(host.querySelectorAll('.tc-root').length).toBe(1);
  });

  it('render() returns this (chainable)', () => {
    instance = new TableCrafter(host, { data: [], columns: [{ key: 'x' }] });
    const result = instance.render();
    expect(result).toBe(instance);
  });

  it('render() throws when no element is found for the selector', () => {
    const t = new TableCrafter('#tc-no-such-element-xyz-99999', {
      data: [],
      columns: [{ key: 'x' }],
    });
    expect(() => t.render()).toThrow('TableCrafter: no element found for selector');
  });
});

// ---------------------------------------------------------------------------
// destroy()
// ---------------------------------------------------------------------------

describe('destroy()', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = makeHost(); });
  afterEach(() => { removeHost(host); });

  it('after destroy(), .tc-root is removed from host', () => {
    const t = new TableCrafter(host, { data: [], columns: [{ key: 'x' }] });
    t.render();
    expect(host.querySelector('.tc-root')).not.toBeNull();
    t.destroy();
    expect(host.querySelector('.tc-root')).toBeNull();
  });

  it('after destroy(), store events do not fire', () => {
    const fn = vi.fn();
    const t = new TableCrafter(host, { data: [], columns: [{ key: 'name' }] });
    t.on('sort', fn);
    t.render();
    t.destroy();
    // sort after destroy should not fire the handler
    try {
      t.sort('name');
    } catch {
      // ignore potential errors from calling methods after destroy
    }
    expect(fn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Proxy methods
// ---------------------------------------------------------------------------

describe('proxy methods', () => {
  let host: HTMLDivElement;
  let t: TableCrafter;

  beforeEach(() => {
    host = makeHost();
    t = new TableCrafter(host, {
      data: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
      columns: [{ key: 'id' }, { key: 'name' }],
      pageSize: 10,
    });
  });
  afterEach(() => { removeHost(host); });

  it('sort("name") changes getState().sort', () => {
    t.sort('name');
    const state = t.getState();
    expect(state.sort[0]?.column).toBe('name');
  });

  it('addRow({name: "X"}) increments getState().rows.length', () => {
    const before = t.getState().rows.length;
    t.addRow({ name: 'X' });
    expect(t.getState().rows.length).toBe(before + 1);
  });

  it('on("sort", fn) / off("sort", fn) work', () => {
    const fn = vi.fn();
    t.on('sort', fn);
    t.sort('name');
    expect(fn).toHaveBeenCalledTimes(1);
    fn.mockClear();
    t.off('sort', fn);
    t.sort('id');
    expect(fn).not.toHaveBeenCalled();
  });

  it('setPage / setPageSize are chainable', () => {
    const data = Array.from({ length: 50 }, (_, i) => ({ id: i, name: `R${i}` }));
    const t2 = new TableCrafter(host, {
      data,
      columns: [{ key: 'id' }, { key: 'name' }],
      pageSize: 10,
    });
    expect(t2.setPageSize(5)).toBe(t2);
    expect(t2.getState().pageSize).toBe(5);
    expect(t2.setPage(2)).toBe(t2);
    expect(t2.getState().page).toBe(2);
  });

  it('search filters rows', () => {
    t.search('Alice');
    expect(t.getState().totalRows).toBe(1);
    t.search('');
    expect(t.getState().totalRows).toBe(2);
  });

  it('select / selectAll / deselectAll work', () => {
    t.select(1);
    expect(t.getState().selection.size).toBe(1);
    t.selectAll();
    expect(t.getState().selection.size).toBe(2);
    t.deselectAll();
    expect(t.getState().selection.size).toBe(0);
  });

  it('undo / redo work', () => {
    const before = t.getState().rows.length;
    t.addRow({ name: 'Undo Me' });
    expect(t.getState().rows.length).toBe(before + 1);
    t.undo();
    expect(t.getState().rows.length).toBe(before);
    t.redo();
    expect(t.getState().rows.length).toBe(before + 1);
  });

  it('once("sort", fn) fires only once', () => {
    const fn = vi.fn();
    t.once('sort', fn);
    t.sort('name');
    t.sort('id');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('getState() returns the current state', () => {
    const state = t.getState();
    expect(state.rows.length).toBe(2);
    expect(state.page).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// bootstrap()
// ---------------------------------------------------------------------------

describe('bootstrap()', () => {
  afterEach(() => {
    // Clean up any live regions left over
    document.querySelectorAll('[role="status"]').forEach((el) => el.remove());
  });

  it('scans [data-tc-bootstrap] in document and returns a Map', () => {
    const el = document.createElement('div');
    el.setAttribute('data-tc-bootstrap', '');
    el.dataset['tcConfig'] = JSON.stringify({ data: [], columns: [{ key: 'x' }] });
    document.body.appendChild(el);

    const map = TableCrafter.bootstrap();
    expect(map.has(el)).toBe(true);
    expect(map.get(el)).toBeInstanceOf(TableCrafter);

    map.forEach((t) => t.destroy());
    el.remove();
  });

  it('returns a Map with one entry per matching element', () => {
    const el1 = document.createElement('div');
    el1.setAttribute('data-tc-bootstrap', '');
    el1.dataset['tcConfig'] = JSON.stringify({ data: [], columns: [{ key: 'a' }] });
    const el2 = document.createElement('div');
    el2.setAttribute('data-tc-bootstrap', '');
    el2.dataset['tcConfig'] = JSON.stringify({ data: [], columns: [{ key: 'b' }] });
    document.body.appendChild(el1);
    document.body.appendChild(el2);

    const map = TableCrafter.bootstrap();
    expect(map.has(el1)).toBe(true);
    expect(map.has(el2)).toBe(true);

    map.forEach((t) => t.destroy());
    el1.remove();
    el2.remove();
  });

  it('parsed data-tc-config JSON is used as config', () => {
    const el = document.createElement('div');
    el.setAttribute('data-tc-bootstrap', '');
    el.dataset['tcConfig'] = JSON.stringify({
      data: [{ id: 1, val: 'hello' }],
      columns: [{ key: 'id' }, { key: 'val' }],
    });
    document.body.appendChild(el);

    const map = TableCrafter.bootstrap();
    const instance = map.get(el);
    expect(instance?.getState().rows.length).toBe(1);

    map.forEach((t) => t.destroy());
    el.remove();
  });

  it('invalid JSON logs a console.warn and skips without throwing', () => {
    const el = document.createElement('div');
    el.setAttribute('data-tc-bootstrap', '');
    el.dataset['tcConfig'] = 'NOT VALID JSON {{{}';
    document.body.appendChild(el);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    let map!: Map<HTMLElement, TableCrafter>;
    expect(() => {
      map = TableCrafter.bootstrap();
    }).not.toThrow();
    expect(map.has(el)).toBe(false);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
    el.remove();
  });

  it('scoped to a subtree when an HTMLElement is passed', () => {
    const outer = document.createElement('div');
    const inner = document.createElement('div');
    inner.setAttribute('data-tc-bootstrap', '');
    inner.dataset['tcConfig'] = JSON.stringify({ data: [], columns: [{ key: 'x' }] });
    outer.appendChild(inner);

    const outside = document.createElement('div');
    outside.setAttribute('data-tc-bootstrap', '');
    outside.dataset['tcConfig'] = JSON.stringify({ data: [], columns: [{ key: 'y' }] });

    document.body.appendChild(outer);
    document.body.appendChild(outside);

    const map = TableCrafter.bootstrap(outer);
    expect(map.has(inner)).toBe(true);
    expect(map.has(outside)).toBe(false);
    expect(map.size).toBe(1);

    map.forEach((t) => t.destroy());
    outer.remove();
    outside.remove();
  });

  it('scoped to a subtree when a CSS selector string is passed', () => {
    const outer = document.createElement('div');
    outer.id = 'tc-bootstrap-scope-test-99';
    const inner = document.createElement('div');
    inner.setAttribute('data-tc-bootstrap', '');
    inner.dataset['tcConfig'] = JSON.stringify({ data: [], columns: [{ key: 'x' }] });
    outer.appendChild(inner);
    document.body.appendChild(outer);

    const outside = document.createElement('div');
    outside.setAttribute('data-tc-bootstrap', '');
    outside.dataset['tcConfig'] = JSON.stringify({ data: [], columns: [{ key: 'z' }] });
    document.body.appendChild(outside);

    const map = TableCrafter.bootstrap('#tc-bootstrap-scope-test-99');
    expect(map.has(inner)).toBe(true);
    expect(map.has(outside)).toBe(false);

    map.forEach((t) => t.destroy());
    outer.remove();
    outside.remove();
  });
});

// ---------------------------------------------------------------------------
// use(plugin) / unuse(name)
// ---------------------------------------------------------------------------

describe('use(plugin) / unuse(name)', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = makeHost(); });
  afterEach(() => { removeHost(host); });

  it('plugin is installed on the store', () => {
    const installFn = vi.fn();
    const plugin = { name: 'test-plugin-p4', install: installFn };
    const t = new TableCrafter(host, { data: [], columns: [{ key: 'x' }] });
    t.use(plugin);
    expect(installFn).toHaveBeenCalledTimes(1);
  });

  it('use() is chainable', () => {
    const plugin = { name: 'chain-plugin-p4', install: vi.fn() };
    const t = new TableCrafter(host, { data: [], columns: [{ key: 'x' }] });
    expect(t.use(plugin)).toBe(t);
  });

  it('unuse() returns true for a known plugin', () => {
    const plugin = { name: 'unuse-plugin-p4', install: vi.fn() };
    const t = new TableCrafter(host, { data: [], columns: [{ key: 'x' }] });
    t.use(plugin);
    expect(t.unuse('unuse-plugin-p4')).toBe(true);
  });

  it('unuse() returns false for an unknown plugin', () => {
    const t = new TableCrafter(host, { data: [], columns: [{ key: 'x' }] });
    expect(t.unuse('no-such-plugin-xyz')).toBe(false);
  });
});

describe('filter presets + URL sync (#337)', () => {
  let host: HTMLDivElement;
  beforeEach(() => {
    globalThis.window?.localStorage?.clear?.();
    host = document.createElement('div');
    host.id = 'preset-host';
    document.body.appendChild(host);
    window.history.replaceState({}, '', '/');
  });
  afterEach(() => {
    host?.remove();
    window.history.replaceState({}, '', '/');
  });

  const DATA = [
    { id: 1, status: 'active', region: 'west' },
    { id: 2, status: 'closed', region: 'east' },
  ];
  const COLUMNS = [{ key: 'status' }, { key: 'region' }];

  it('saves the current filters as a preset and lists it', () => {
    const t = new TableCrafter(host, { data: DATA, columns: COLUMNS, tableId: 't-presets' });
    t.setFilter('status', { operator: 'contains', value: 'active' });
    t.saveFilterPreset('Active only');

    expect(t.listFilterPresets()).toContain('Active only');
  });

  it('loadFilterPreset restores saved filter state', () => {
    const t = new TableCrafter(host, { data: DATA, columns: COLUMNS, tableId: 't-load' });
    t.setFilter('region', { operator: 'contains', value: 'west' });
    t.saveFilterPreset('West');
    t.clearFilter();
    expect(t.getState().filters.region).toBeUndefined();

    t.loadFilterPreset('West');
    expect(t.getState().filters.region).toEqual({ operator: 'contains', value: 'west' });
  });

  it('deleteFilterPreset removes it from the list', () => {
    const t = new TableCrafter(host, { data: DATA, columns: COLUMNS, tableId: 't-del' });
    t.saveFilterPreset('Temp');
    t.deleteFilterPreset('Temp');
    expect(t.listFilterPresets()).not.toContain('Temp');
  });

  it('applies ?tc_{field}= URL params as filters on init', () => {
    window.history.replaceState({}, '', '/?tc_status=active');
    const t = new TableCrafter(host, { data: DATA, columns: COLUMNS, tableId: 't-url' });
    expect(t.getState().filters.status).toEqual({ operator: 'contains', value: 'active' });
  });

  it('syncUrl:true writes filters to the URL on change', () => {
    const t = new TableCrafter(host, { data: DATA, columns: COLUMNS, tableId: 't-sync', syncUrl: true });
    t.setFilter('region', { operator: 'contains', value: 'east' });
    expect(new URLSearchParams(window.location.search).get('tc_region')).toBe('east');
  });

  it('does not touch the URL when syncUrl is off (default)', () => {
    const t = new TableCrafter(host, { data: DATA, columns: COLUMNS, tableId: 't-nosync' });
    t.setFilter('region', { operator: 'contains', value: 'east' });
    expect(window.location.search).toBe('');
  });
});

describe('auto-refresh (#335)', () => {
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => {
    host?.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('re-fetches the data URL on the configured interval', () => {
    vi.useFakeTimers();
    const t = new TableCrafter(host, {
      data: 'https://example.test/rows',
      columns: [{ key: 'id' }],
      autoRefresh: 30,
    });
    const loadSpy = vi.spyOn((t as unknown as { store: { load: () => Promise<void> } }).store, 'load')
      .mockResolvedValue(undefined);

    vi.advanceTimersByTime(30_000);
    expect(loadSpy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    expect(loadSpy).toHaveBeenCalledTimes(2);
  });

  it('stops refreshing after destroy', () => {
    vi.useFakeTimers();
    const t = new TableCrafter(host, {
      data: 'https://example.test/rows',
      columns: [{ key: 'id' }],
      autoRefresh: 10,
    });
    const loadSpy = vi.spyOn((t as unknown as { store: { load: () => Promise<void> } }).store, 'load')
      .mockResolvedValue(undefined);
    t.destroy();
    vi.advanceTimersByTime(30_000);
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('does not set an interval without autoRefresh', () => {
    vi.useFakeTimers();
    const t = new TableCrafter(host, { data: 'https://example.test/rows', columns: [{ key: 'id' }] });
    const loadSpy = vi.spyOn((t as unknown as { store: { load: () => Promise<void> } }).store, 'load')
      .mockResolvedValue(undefined);
    vi.advanceTimersByTime(60_000);
    expect(loadSpy).not.toHaveBeenCalled();
  });
});
