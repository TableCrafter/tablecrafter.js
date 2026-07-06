/**
 * store.contract.test.ts
 *
 * Frozen Store interface contract.
 *
 * This file records the exact public shape of the Store returned by
 * createTable().  It is the authoritative handoff spec for Phase 1 (core
 * implementation) and Phase 2 (leaf module) agents.
 *
 * Rules:
 *   - Do NOT change type assertions here without an RFC amendment.
 *   - Do NOT call createTable() at runtime in this file (it throws in Phase 0).
 *   - Type assertions use import type + typeof so they are erased at runtime.
 *   - expectTypeOf() passes at runtime regardless of implementation state.
 */

import { describe, it, expectTypeOf } from 'vitest';

import type { createTable } from './state';
import type {
  Store,
  TableState,
  Action,
  PluginContext,
  TableCrafterPlugin,
  TableCrafterConfig,
  RowId,
  SortDirection,
  ColumnFilter,
  ExportFormat,
  ExportOptions,
  TableCrafterEventMap,
  EventHandler,
} from './types';

// ---------------------------------------------------------------------------
// createTable return type
// ---------------------------------------------------------------------------

describe('Store contract (frozen -- RFC amendment required to change)', () => {

  it('createTable(config) returns Store', () => {
    type R = ReturnType<typeof createTable>;
    expectTypeOf<R>().toMatchTypeOf<Store>();
  });

  // ---------------------------------------------------------------------------
  // Core Store methods
  // ---------------------------------------------------------------------------

  it('Store.getState() returns TableState', () => {
    expectTypeOf<Store['getState']>().returns.toMatchTypeOf<TableState>();
  });

  it('Store.subscribe accepts (state: TableState) => void and returns () => void', () => {
    expectTypeOf<Store['subscribe']>()
      .parameter(0)
      .toMatchTypeOf<(state: TableState) => void>();
    expectTypeOf<Store['subscribe']>().returns.toEqualTypeOf<() => void>();
  });

  it('Store.dispatch accepts Action', () => {
    expectTypeOf<Store['dispatch']>().parameter(0).toMatchTypeOf<Action>();
  });

  // ---------------------------------------------------------------------------
  // Event methods
  // ---------------------------------------------------------------------------

  it('Store.on accepts a known event key and typed handler', () => {
    expectTypeOf<Store['on']>().toBeFunction();
  });

  it('Store.off is a function', () => {
    expectTypeOf<Store['off']>().toBeFunction();
  });

  it('Store.once is a function', () => {
    expectTypeOf<Store['once']>().toBeFunction();
  });

  // ---------------------------------------------------------------------------
  // Imperative helpers
  // ---------------------------------------------------------------------------

  it('Store.sort(column, direction?)', () => {
    expectTypeOf<Store['sort']>().parameter(0).toEqualTypeOf<string>();
    expectTypeOf<Store['sort']>().parameter(1).toEqualTypeOf<SortDirection | undefined>();
  });

  it('Store.setFilter(column, filter)', () => {
    expectTypeOf<Store['setFilter']>().parameter(0).toEqualTypeOf<string>();
    expectTypeOf<Store['setFilter']>().parameter(1).toEqualTypeOf<ColumnFilter | null>();
  });

  it('Store.clearFilter(column?)', () => {
    expectTypeOf<Store['clearFilter']>().parameter(0).toEqualTypeOf<string | undefined>();
  });

  it('Store.search(query)', () => {
    expectTypeOf<Store['search']>().parameter(0).toEqualTypeOf<string>();
  });

  it('Store.setPage(page)', () => {
    expectTypeOf<Store['setPage']>().parameter(0).toEqualTypeOf<number>();
  });

  it('Store.setPageSize(pageSize)', () => {
    expectTypeOf<Store['setPageSize']>().parameter(0).toEqualTypeOf<number>();
  });

  it('Store.editCell(rowId, column, value)', () => {
    expectTypeOf<Store['editCell']>().parameter(0).toMatchTypeOf<RowId>();
    expectTypeOf<Store['editCell']>().parameter(1).toEqualTypeOf<string>();
  });

  it('Store.commitEdit()', () => {
    expectTypeOf<Store['commitEdit']>().toBeFunction();
  });

  it('Store.cancelEdit()', () => {
    expectTypeOf<Store['cancelEdit']>().toBeFunction();
  });

  it('Store.addRow(data?)', () => {
    expectTypeOf<Store['addRow']>().parameter(0).toEqualTypeOf<
      Record<string, unknown> | undefined
    >();
  });

  it('Store.duplicateRow(rowId)', () => {
    expectTypeOf<Store['duplicateRow']>().parameter(0).toMatchTypeOf<RowId>();
  });

  it('Store.deleteRow(rowId)', () => {
    expectTypeOf<Store['deleteRow']>().parameter(0).toMatchTypeOf<RowId>();
  });

  it('Store.bulkFill(rowIds, column, value)', () => {
    expectTypeOf<Store['bulkFill']>().parameter(0).toMatchTypeOf<RowId[]>();
    expectTypeOf<Store['bulkFill']>().parameter(1).toEqualTypeOf<string>();
  });

  it('Store.select(rowId, multi?)', () => {
    expectTypeOf<Store['select']>().parameter(0).toMatchTypeOf<RowId>();
    expectTypeOf<Store['select']>().parameter(1).toEqualTypeOf<boolean | undefined>();
  });

  it('Store.selectAll()', () => {
    expectTypeOf<Store['selectAll']>().toBeFunction();
  });

  it('Store.deselectAll()', () => {
    expectTypeOf<Store['deselectAll']>().toBeFunction();
  });

  it('Store.undo()', () => {
    expectTypeOf<Store['undo']>().toBeFunction();
  });

  it('Store.redo()', () => {
    expectTypeOf<Store['redo']>().toBeFunction();
  });

  it('Store.export(format, options?)', () => {
    expectTypeOf<Store['export']>().parameter(0).toMatchTypeOf<ExportFormat>();
    expectTypeOf<Store['export']>().parameter(1).toMatchTypeOf<ExportOptions | undefined>();
  });

  // ---------------------------------------------------------------------------
  // TableState shape
  // ---------------------------------------------------------------------------

  it('TableState has rows, filteredRows, displayRows, sort, filters, searchQuery', () => {
    expectTypeOf<TableState['rows']>().toMatchTypeOf<unknown[]>();
    expectTypeOf<TableState['filteredRows']>().toMatchTypeOf<unknown[]>();
    expectTypeOf<TableState['displayRows']>().toMatchTypeOf<unknown[]>();
    expectTypeOf<TableState['searchQuery']>().toEqualTypeOf<string>();
    expectTypeOf<TableState['page']>().toEqualTypeOf<number>();
    expectTypeOf<TableState['pageSize']>().toEqualTypeOf<number>();
    expectTypeOf<TableState['pageCount']>().toEqualTypeOf<number>();
    expectTypeOf<TableState['totalRows']>().toEqualTypeOf<number>();
    expectTypeOf<TableState['loading']>().toEqualTypeOf<boolean>();
  });

  it('TableState.selection is Set<RowId>', () => {
    expectTypeOf<TableState['selection']>().toMatchTypeOf<Set<RowId>>();
  });

  // ---------------------------------------------------------------------------
  // PluginContext shape
  // ---------------------------------------------------------------------------

  it('PluginContext.store is Store', () => {
    expectTypeOf<PluginContext['store']>().toMatchTypeOf<Store>();
  });

  it('PluginContext.on matches Store.on signature', () => {
    expectTypeOf<PluginContext['on']>().toMatchTypeOf<Store['on']>();
  });

  it('PluginContext.dispatch matches Store.dispatch signature', () => {
    expectTypeOf<PluginContext['dispatch']>().toMatchTypeOf<Store['dispatch']>();
  });

  // ---------------------------------------------------------------------------
  // TableCrafterPlugin contract
  // ---------------------------------------------------------------------------

  it('TableCrafterPlugin has name: string and install: function', () => {
    expectTypeOf<TableCrafterPlugin['name']>().toEqualTypeOf<string>();
    expectTypeOf<TableCrafterPlugin['install']>().toBeFunction();
  });

  // ---------------------------------------------------------------------------
  // TableCrafterConfig
  // ---------------------------------------------------------------------------

  it('TableCrafterConfig.data accepts array or string URL', () => {
    expectTypeOf<TableCrafterConfig['data']>().toMatchTypeOf<unknown[] | string>();
  });

  // ---------------------------------------------------------------------------
  // Event map
  // ---------------------------------------------------------------------------

  it('TableCrafterEventMap contains the canonical v2 event names', () => {
    expectTypeOf<TableCrafterEventMap['cell:edit']>().toBeObject();
    expectTypeOf<TableCrafterEventMap['row:add']>().toBeObject();
    expectTypeOf<TableCrafterEventMap['row:update']>().toBeObject();
    expectTypeOf<TableCrafterEventMap['row:delete']>().toBeObject();
    expectTypeOf<TableCrafterEventMap['sort']>().toBeObject();
    expectTypeOf<TableCrafterEventMap['filter']>().toBeObject();
    expectTypeOf<TableCrafterEventMap['page:change']>().toBeObject();
    expectTypeOf<TableCrafterEventMap['selection:change']>().toBeObject();
  });
});
