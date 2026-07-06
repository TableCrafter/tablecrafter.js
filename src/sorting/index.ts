/**
 * sorting/index.ts
 *
 * Multi-column sort reducer and Intl.Collator-backed comparators.
 * Pure functions: (state, action) => state.  No DOM references.
 * Phase 0: typed stub.
 */

import type { TableState, SortPayload, SortState, SortDirection } from '../core/types';

/**
 * Apply a sort action to the state and return updated state.
 * Calling with the same column toggles the direction.
 */
export function applySort(
  _state: TableState,
  _payload: SortPayload
): Pick<TableState, 'sort' | 'sortedRows' | 'displayRows'> {
  throw new Error('applySort: not implemented -- Phase 2');
}

/**
 * Compare two values for a given direction using Intl.Collator for strings.
 */
export function compareValues(
  _a: unknown,
  _b: unknown,
  _direction: SortDirection,
  _locale?: string
): number {
  throw new Error('compareValues: not implemented -- Phase 2');
}

/**
 * Derive stable sort state from a current SortState and a new request.
 * Handles toggle logic (same column flips direction; new column resets to asc).
 */
export function nextSortState(
  _current: SortState | null,
  _column: string,
  _direction?: SortDirection
): SortState {
  throw new Error('nextSortState: not implemented -- Phase 2');
}
