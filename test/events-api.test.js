/**
 * Events API tests (issue #324)
 * Covers on / off / once listener registration, payload shapes,
 * co-emission alongside config callbacks, handler isolation,
 * and exception safety.
 */

const TableCrafter = require('../src/tablecrafter');

// Helper to build a minimal table with two columns and two data rows.
function makeTable(config = {}) {
  document.body.innerHTML = '<div id="tc"></div>';
  return new TableCrafter('#tc', {
    data: [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ],
    columns: [
      { field: 'id', label: 'ID', sortable: true },
      { field: 'name', label: 'Name', sortable: true }
    ],
    editable: true,
    pagination: true,
    pageSize: 10,
    ...config
  });
}

// ── on / off / once fundamentals ────────────────────────────────────────────

describe('on(event, handler)', () => {
  let table;
  afterEach(() => {
    if (table && typeof table.destroy === 'function') table.destroy();
    table = null;
    document.body.innerHTML = '';
  });

  test('registers a listener that receives emitted payloads', () => {
    table = makeTable();
    const handler = jest.fn();
    table.on('sort', handler);

    table.sort('id');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ sortKeys: expect.any(Array) }));
  });

  test('returns an unsubscribe function', () => {
    table = makeTable();
    const handler = jest.fn();
    const unsub = table.on('sort', handler);

    expect(typeof unsub).toBe('function');

    unsub();
    table.sort('id');

    expect(handler).not.toHaveBeenCalled();
  });

  test('multiple listeners for the same event all fire', () => {
    table = makeTable();
    const h1 = jest.fn();
    const h2 = jest.fn();
    table.on('sort', h1);
    table.on('sort', h2);

    table.sort('name');

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  test('listeners for different events are independent', () => {
    table = makeTable({ pagination: true, pageSize: 1 });
    const sortHandler = jest.fn();
    const filterHandler = jest.fn();
    table.on('sort', sortHandler);
    table.on('filter', filterHandler);

    table.sort('id');

    expect(sortHandler).toHaveBeenCalledTimes(1);
    expect(filterHandler).not.toHaveBeenCalled();
  });
});

// ── off ─────────────────────────────────────────────────────────────────────

describe('off(event, handler)', () => {
  let table;
  afterEach(() => {
    if (table && typeof table.destroy === 'function') table.destroy();
    table = null;
    document.body.innerHTML = '';
  });

  test('removes the specific handler so it no longer fires', () => {
    table = makeTable();
    const handler = jest.fn();
    table.on('sort', handler);

    table.off('sort', handler);
    table.sort('id');

    expect(handler).not.toHaveBeenCalled();
  });

  test('removing one handler leaves other handlers intact', () => {
    table = makeTable();
    const h1 = jest.fn();
    const h2 = jest.fn();
    table.on('sort', h1);
    table.on('sort', h2);

    table.off('sort', h1);
    table.sort('name');

    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledTimes(1);
  });

  test('calling off with an unregistered handler is a no-op', () => {
    table = makeTable();
    expect(() => table.off('sort', jest.fn())).not.toThrow();
  });

  test('calling off for an unknown event is a no-op', () => {
    table = makeTable();
    expect(() => table.off('unknownEvent', jest.fn())).not.toThrow();
  });
});

// ── once ────────────────────────────────────────────────────────────────────

describe('once(event, handler)', () => {
  let table;
  afterEach(() => {
    if (table && typeof table.destroy === 'function') table.destroy();
    table = null;
    document.body.innerHTML = '';
  });

  test('fires the handler exactly once and auto-removes it', () => {
    table = makeTable();
    const handler = jest.fn();
    table.once('sort', handler);

    table.sort('id');
    table.sort('name');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('receives the correct payload', () => {
    table = makeTable();
    const handler = jest.fn();
    table.once('sort', handler);

    table.sort('name');

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ sortKeys: expect.any(Array) }));
    const { sortKeys } = handler.mock.calls[0][0];
    expect(sortKeys[0]).toMatchObject({ field: 'name', direction: 'asc' });
  });

  test('unsubscribe from once before it fires prevents invocation', () => {
    table = makeTable();
    const handler = jest.fn();
    const unsub = table.once('sort', handler);

    unsub();
    table.sort('id');

    expect(handler).not.toHaveBeenCalled();
  });
});

// ── sort event ───────────────────────────────────────────────────────────────

describe('sort event', () => {
  let table;
  afterEach(() => {
    if (table && typeof table.destroy === 'function') table.destroy();
    table = null;
    document.body.innerHTML = '';
  });

  test('emits sort with sortKeys payload when sort() is called', () => {
    table = makeTable();
    const handler = jest.fn();
    table.on('sort', handler);

    table.sort('id', { direction: 'desc' });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        sortKeys: expect.arrayContaining([expect.objectContaining({ field: 'id', direction: 'desc' })])
      })
    );
  });

  test('emits sort when multiSort() is called', () => {
    table = makeTable();
    const handler = jest.fn();
    table.on('sort', handler);

    table.multiSort([{ field: 'id', direction: 'asc' }, { field: 'name', direction: 'desc' }]);

    expect(handler).toHaveBeenCalledTimes(1);
    const { sortKeys } = handler.mock.calls[0][0];
    expect(sortKeys).toHaveLength(2);
  });
});

// ── filter event ─────────────────────────────────────────────────────────────

describe('filter event', () => {
  let table;
  afterEach(() => {
    if (table && typeof table.destroy === 'function') table.destroy();
    table = null;
    document.body.innerHTML = '';
  });

  test('emits filter with active filters payload when setFilter() is called', () => {
    table = makeTable();
    const handler = jest.fn();
    table.on('filter', handler);

    table.setFilter('name', 'Alice');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ name: 'Alice' }) })
    );
  });

  test('config.onFilter still fires alongside the event', () => {
    const configCb = jest.fn();
    table = makeTable({ onFilter: configCb });
    const eventHandler = jest.fn();
    table.on('filter', eventHandler);

    table.setFilter('id', 1);

    expect(configCb).toHaveBeenCalledTimes(1);
    expect(eventHandler).toHaveBeenCalledTimes(1);
  });
});

// ── pageChange event ─────────────────────────────────────────────────────────

describe('pageChange event', () => {
  let table;
  afterEach(() => {
    if (table && typeof table.destroy === 'function') table.destroy();
    table = null;
    document.body.innerHTML = '';
  });

  test('emits pageChange with current page when goToPage() is called', () => {
    table = makeTable({
      pagination: true,
      pageSize: 1,
      data: [{ id: 1 }, { id: 2 }, { id: 3 }],
      columns: [{ field: 'id' }]
    });
    const handler = jest.fn();
    table.on('pageChange', handler);

    table.goToPage(2);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
  });

  test('does not emit pageChange when goToPage is called with an out-of-range page', () => {
    table = makeTable({ pagination: true, pageSize: 1 });
    const handler = jest.fn();
    table.on('pageChange', handler);

    table.goToPage(999);

    expect(handler).not.toHaveBeenCalled();
  });

  test('emits pageChange on nextPage()', () => {
    table = makeTable({
      pagination: true,
      pageSize: 1,
      data: [{ id: 1 }, { id: 2 }],
      columns: [{ field: 'id' }]
    });
    const handler = jest.fn();
    table.on('pageChange', handler);

    table.nextPage();

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
  });
});

// Helper: create a minimal input element that saveEdit() accepts.
// saveEdit reads dataset.rowIndex, dataset.field, dataset.originalValue
// and element.value. It also needs element.parentElement to be non-null
// because it updates the cell's textContent after committing.
function makeFakeInput(rowIndex, field, originalValue, newValue) {
  const td = document.createElement('td');
  const el = document.createElement('input');
  el.dataset.rowIndex = String(rowIndex);
  el.dataset.field = field;
  el.dataset.originalValue = originalValue;
  el.value = newValue;
  td.appendChild(el);
  document.body.appendChild(td);
  return el;
}

// ── cellEdit event ───────────────────────────────────────────────────────────

describe('cellEdit event', () => {
  let table;
  afterEach(() => {
    if (table && typeof table.destroy === 'function') table.destroy();
    table = null;
    document.body.innerHTML = '';
  });

  test('emits cellEdit with row, field, oldValue, newValue when saveEdit() commits a change', async () => {
    // Disable validation so saveEdit proceeds without a live DOM input context.
    table = makeTable({ editable: true, validation: { enabled: false } });
    const handler = jest.fn();
    table.on('cellEdit', handler);

    const originalVal = table.data[0].name; // 'Alice'
    const el = makeFakeInput(0, 'name', originalVal, 'Charlie');
    await table.saveEdit(el);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        row: 0,
        field: 'name',
        oldValue: originalVal,
        newValue: 'Charlie'
      })
    );
  });

  test('config.onEdit still fires alongside the cellEdit event', async () => {
    const configCb = jest.fn();
    table = makeTable({ editable: true, validation: { enabled: false }, onEdit: configCb });
    table.on('cellEdit', jest.fn());

    const el = makeFakeInput(0, 'name', 'Alice', 'Dave');
    await table.saveEdit(el);

    expect(configCb).toHaveBeenCalledTimes(1);
  });
});

// ── selectionChange event ────────────────────────────────────────────────────

describe('selectionChange event', () => {
  let table;
  afterEach(() => {
    if (table && typeof table.destroy === 'function') table.destroy();
    table = null;
    document.body.innerHTML = '';
  });

  test('emits selectionChange when a row is toggled', () => {
    // toggleRowSelection emits regardless of bulk UI; no bulk config needed.
    table = makeTable();
    const handler = jest.fn();
    table.on('selectionChange', handler);

    table.toggleRowSelection(0, true);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ selectedRows: expect.any(Array) })
    );
  });

  test('config.onSelectionChange still fires alongside the event', () => {
    const configCb = jest.fn();
    table = makeTable({ onSelectionChange: configCb });
    table.on('selectionChange', jest.fn());

    table.toggleRowSelection(1, true);

    expect(configCb).toHaveBeenCalledTimes(1);
  });
});

// ── rowAdd / rowUpdate / rowDelete events ────────────────────────────────────

describe('rowAdd event', () => {
  let table;
  afterEach(() => {
    if (table && typeof table.destroy === 'function') table.destroy();
    table = null;
    document.body.innerHTML = '';
  });

  test('emits rowAdd with row and index when addRow() is called', async () => {
    table = makeTable();
    const handler = jest.fn();
    table.on('rowAdd', handler);

    await table.addRow({ id: 3, name: 'Carol' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ row: { id: 3, name: 'Carol' }, index: 2 })
    );
  });

  test('config.onAdd still fires alongside rowAdd event', async () => {
    const configCb = jest.fn();
    table = makeTable({ onAdd: configCb });
    table.on('rowAdd', jest.fn());

    await table.addRow({ id: 4, name: 'Dan' });

    expect(configCb).toHaveBeenCalledTimes(1);
  });
});

describe('rowUpdate event', () => {
  let table;
  afterEach(() => {
    if (table && typeof table.destroy === 'function') table.destroy();
    table = null;
    document.body.innerHTML = '';
  });

  test('emits rowUpdate with row, index, previous when updateRow() is called', async () => {
    table = makeTable();
    const handler = jest.fn();
    table.on('rowUpdate', handler);

    await table.updateRow(0, { name: 'Updated Alice' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 0,
        previous: expect.objectContaining({ name: 'Alice' })
      })
    );
  });

  test('config.onUpdate still fires alongside rowUpdate event', async () => {
    const configCb = jest.fn();
    table = makeTable({ onUpdate: configCb });
    table.on('rowUpdate', jest.fn());

    await table.updateRow(0, { name: 'Updated' });

    expect(configCb).toHaveBeenCalledTimes(1);
  });
});

describe('rowDelete event', () => {
  let table;
  afterEach(() => {
    if (table && typeof table.destroy === 'function') table.destroy();
    table = null;
    document.body.innerHTML = '';
  });

  test('emits rowDelete with row and index when removeRow() is called', async () => {
    table = makeTable();
    const handler = jest.fn();
    table.on('rowDelete', handler);

    await table.removeRow(0);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ row: expect.objectContaining({ id: 1 }), index: 0 })
    );
  });

  test('config.onDelete still fires alongside rowDelete event', async () => {
    const configCb = jest.fn();
    table = makeTable({ onDelete: configCb });
    table.on('rowDelete', jest.fn());

    await table.removeRow(0);

    expect(configCb).toHaveBeenCalledTimes(1);
  });
});

// ── Exception isolation ──────────────────────────────────────────────────────

describe('handler exception isolation', () => {
  let table;
  let consoleSpy;
  afterEach(() => {
    if (table && typeof table.destroy === 'function') table.destroy();
    table = null;
    document.body.innerHTML = '';
    if (consoleSpy) consoleSpy.mockRestore();
    consoleSpy = null;
  });

  test('a throwing handler does not prevent other handlers from running', () => {
    table = makeTable();
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const bad = jest.fn(() => { throw new Error('boom'); });
    const good = jest.fn();
    table.on('sort', bad);
    table.on('sort', good);

    expect(() => table.sort('id')).not.toThrow();
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
  });

  test('a throwing handler logs the error to console.error', () => {
    table = makeTable();
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('handler error');
    table.on('sort', () => { throw err; });

    table.sort('name');

    expect(consoleSpy).toHaveBeenCalled();
  });

  test('rendering completes normally even when a handler throws', () => {
    table = makeTable();
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    table.on('sort', () => { throw new Error('boom'); });

    expect(() => table.sort('id')).not.toThrow();
    // Table renders with sort applied -- data is still sorted
    expect(table.sortKeys[0].field).toBe('id');
  });
});
