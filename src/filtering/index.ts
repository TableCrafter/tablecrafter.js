/**
 * filtering/index.ts
 *
 * Per-column filter reducer and auto-detection of filter type from column type.
 * Combines column filters with freetext search.  Pure functions.
 * Phase 0: typed stub.
 */

import type {
  TableState,
  FilterPayload,
  ColumnFilter,
  TableCrafterColumn,
} from '../core/types';

/**
 * Apply a column filter action to the state.
 * Passing filter: null clears the filter for that column.
 */
export function applyFilter(
  _state: TableState,
  _payload: FilterPayload
): Pick<TableState, 'filters' | 'filteredRows' | 'sortedRows' | 'displayRows' | 'page' | 'pageCount' | 'totalRows'> {
  throw new Error('applyFilter: not implemented -- Phase 2');
}

/**
 * Clear one or all column filters.
 * Pass undefined to clear all filters.
 */
export function clearFilter(
  _state: TableState,
  _column?: string
): Pick<TableState, 'filters' | 'filteredRows' | 'sortedRows' | 'displayRows' | 'page' | 'pageCount' | 'totalRows'> {
  throw new Error('clearFilter: not implemented -- Phase 2');
}

/**
 * Test a single row against a ColumnFilter.
 * Returns true if the row passes.
 */
export function testFilter(
  _row: unknown,
  _column: string,
  _filter: ColumnFilter
): boolean {
  throw new Error('testFilter: not implemented -- Phase 2');
}

/**
 * Auto-detect the appropriate default filter operator for a column type.
 */
export function detectFilterOperator(
  _column: TableCrafterColumn
): ColumnFilter['operator'] {
  throw new Error('detectFilterOperator: not implemented -- Phase 2');
}
