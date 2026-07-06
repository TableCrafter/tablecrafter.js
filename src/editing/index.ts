/**
 * editing/index.ts
 *
 * Edit lifecycle, add / duplicate / bulk-fill, and keyboard grid navigation.
 * Handles the 14 cell editor types (text, number, date, select, checkbox,
 * badge, progress, sparkline, link, star, conditional, and more).
 * Phase 0: typed stub.
 */

import type {
  TableState,
  EditCellPayload,
  BulkFillPayload,
  RowId,
  Action,
} from '../core/types';

/** Result of starting a cell edit. */
export interface EditStartResult {
  editingCell: TableState['editingCell'];
}

/**
 * Begin editing a cell.  Returns partial state with the editingCell set.
 */
export function startCellEdit(
  _state: TableState,
  _payload: EditCellPayload
): EditStartResult {
  throw new Error('startCellEdit: not implemented -- Phase 2');
}

/**
 * Commit the current cell edit.  Validates, updates the row, emits events,
 * and pushes the inverse action onto the undo stack.
 * Returns the action to dispatch for the undo history.
 */
export function commitCellEdit(_state: TableState): {
  rows: unknown[];
  editingCell: null;
  undoAction: Action;
} {
  throw new Error('commitCellEdit: not implemented -- Phase 2');
}

/**
 * Cancel the current cell edit without persisting changes.
 */
export function cancelCellEdit(
  _state: TableState
): { editingCell: null } {
  throw new Error('cancelCellEdit: not implemented -- Phase 2');
}

/**
 * Append a new blank row (or row from provided data) to the dataset.
 */
export function addRow(
  _state: TableState,
  _data?: Record<string, unknown>
): { rows: unknown[] } {
  throw new Error('addRow: not implemented -- Phase 2');
}

/**
 * Duplicate an existing row by ID.
 */
export function duplicateRow(
  _state: TableState,
  _rowId: RowId
): { rows: unknown[] } {
  throw new Error('duplicateRow: not implemented -- Phase 2');
}

/**
 * Apply a single value to a specific column across multiple rows.
 */
export function bulkFill(
  _state: TableState,
  _payload: BulkFillPayload
): { rows: unknown[] } {
  throw new Error('bulkFill: not implemented -- Phase 2');
}

/**
 * Compute the next focusable cell position given a keyboard direction.
 * Used by the renderer to implement grid keyboard navigation.
 */
export function nextCellPosition(
  _current: { rowIndex: number; colIndex: number },
  _direction: 'up' | 'down' | 'left' | 'right' | 'tab' | 'shiftTab',
  _bounds: { rows: number; cols: number }
): { rowIndex: number; colIndex: number } {
  throw new Error('nextCellPosition: not implemented -- Phase 2');
}
