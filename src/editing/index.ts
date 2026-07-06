/**
 * editing/index.ts
 *
 * v3 editing module -- pure state-reducer helpers + re-exports.
 *
 * Scope (from RFC section 8, T2.4):
 *   - Editor type definitions and the edit-adjacent pure logic.
 *   - Pure state-reducer functions (startCellEdit, commitCellEdit, cancelCellEdit,
 *     addRow, duplicateRow, bulkFill, nextCellPosition).
 *   - Re-exports from the sub-modules: coercion, registry, duplicate, bulk-fill, diff.
 *
 * The core/state.ts store owns the mutable edit session + undo/redo history.
 * These functions are the pure reducer equivalents that the store can optionally
 * delegate to, and that external consumers can compose without importing the store.
 *
 * ZERO DOM access anywhere in this module.
 */

import type {
  TableState,
  EditCellPayload,
  BulkFillPayload,
  RowId,
  Action,
  EditingCell,
} from '../core/types';

// ---------------------------------------------------------------------------
// Re-exports -- editing sub-modules
// ---------------------------------------------------------------------------

export type {
  EditorType,
  InputKind,
  SelectOption,
  OptionsSource,
  EditorConstraints,
  EditorDescriptor,
  EditorRegistry,
} from './types';

export {
  isTruthy,
  coerceText,
  coerceTrimmed,
  coerceNumber,
  coerceDate,
  coerceDatetime,
  coerceCheckbox,
  coerceMultiselect,
  coerceColor,
  coerceRange,
} from './coercion';

export {
  BUILT_IN_EDITOR_TYPES,
  createEditorRegistry,
  buildLookupDescriptor,
  buildLookupOptionsSource,
} from './registry';
export type { BuiltInEditorType, LookupConfig, AsyncOptionsSource } from './registry';

export { buildDuplicatePayload } from './duplicate';
export type { DuplicateOptions, DuplicatePayload } from './duplicate';

export { computeBulkFillPreview, valuesEqual } from './bulk-fill';
export type { BulkFillDiffEntry, BulkFillPreview } from './bulk-fill';

export { computeCellDiff, formatValueForBadge } from './diff';
export type { CellValueDiff } from './diff';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function rowIdOf(row: unknown, index: number): RowId {
  if (isRecord(row) && Object.prototype.hasOwnProperty.call(row, 'id')) {
    const id = row['id'];
    if (typeof id === 'string' || typeof id === 'number') return id;
  }
  return index;
}

function resolveRow(
  rows: unknown[],
  rowId: RowId
): { row: unknown; index: number } | null {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (isRecord(row) && Object.prototype.hasOwnProperty.call(row, 'id')) {
      const id = row['id'];
      if ((typeof id === 'string' || typeof id === 'number') && id === rowId) {
        return { row, index: i };
      }
    }
  }
  if (
    typeof rowId === 'number' &&
    Number.isInteger(rowId) &&
    rowId >= 0 &&
    rowId < rows.length
  ) {
    return { row: rows[rowId], index: rowId };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Edit lifecycle result types
// ---------------------------------------------------------------------------

/** Result of starting a cell edit. */
export interface EditStartResult {
  editingCell: EditingCell;
}

// ---------------------------------------------------------------------------
// startCellEdit
// ---------------------------------------------------------------------------

/**
 * Begin editing a cell.
 * Returns the new editingCell state; the store merges this into its state.
 *
 * @param state   - Current table state.
 * @param payload - Which cell to edit and the initial pending value.
 */
export function startCellEdit(
  state: TableState,
  payload: EditCellPayload
): EditStartResult {
  const found = resolveRow(state.rows, payload.rowId);
  if (!found) {
    // Row not found: keep any existing edit session by returning current value.
    if (state.editingCell) {
      return { editingCell: state.editingCell };
    }
    throw new RangeError(
      `startCellEdit: row "${String(payload.rowId)}" not found`
    );
  }
  const originalValue = isRecord(found.row)
    ? found.row[payload.column]
    : undefined;

  return {
    editingCell: {
      rowId: rowIdOf(found.row, found.index),
      column: payload.column,
      originalValue,
    },
  };
}

// ---------------------------------------------------------------------------
// commitCellEdit
// ---------------------------------------------------------------------------

/**
 * Commit the current cell edit.
 *
 * Returns:
 *   - `rows`: the updated row array (mutated shallow copy of current rows).
 *   - `editingCell`: null (clears the edit session).
 *   - `undoAction`: a SET_ROWS action carrying the pre-edit snapshot so the
 *     undo stack can restore it.
 *
 * Validation is the responsibility of the caller (the store runs its Validator
 * seam before calling this).  commitCellEdit does NOT validate.
 *
 * @param state      - Current table state.  Must have editingCell set.
 * @param pendingValue - The value to write into the row.
 */
export function commitCellEdit(
  state: TableState,
  pendingValue: unknown
): { rows: unknown[]; editingCell: null; undoAction: Action } {
  if (!state.editingCell) {
    return {
      rows: state.rows,
      editingCell: null,
      undoAction: { type: 'SET_ROWS', payload: { rows: state.rows } },
    };
  }

  const session = state.editingCell;
  const found = resolveRow(state.rows, session.rowId);

  if (!found || !isRecord(found.row)) {
    return {
      rows: state.rows,
      editingCell: null,
      undoAction: { type: 'SET_ROWS', payload: { rows: state.rows } },
    };
  }

  // Snapshot rows for undo BEFORE applying the change.
  const snapshot = state.rows.map((r) => (isRecord(r) ? { ...r } : r));

  // Apply the update to a shallow-copied rows array.
  const newRows = state.rows.map((r, i) => {
    if (i === found.index && isRecord(r)) {
      return { ...r, [session.column]: pendingValue };
    }
    return r;
  });

  const undoAction: Action = {
    type: 'SET_ROWS',
    payload: { rows: snapshot },
  };

  return { rows: newRows, editingCell: null, undoAction };
}

// ---------------------------------------------------------------------------
// cancelCellEdit
// ---------------------------------------------------------------------------

/**
 * Cancel the current cell edit without persisting changes.
 */
export function cancelCellEdit(
  _state: TableState
): { editingCell: null } {
  return { editingCell: null };
}

// ---------------------------------------------------------------------------
// addRow
// ---------------------------------------------------------------------------

/**
 * Append a new blank row (or a row from provided data) to the dataset.
 * Returns the updated rows array.
 */
export function addRow(
  state: TableState,
  data?: Record<string, unknown>
): { rows: unknown[] } {
  const row: Record<string, unknown> = { ...(data ?? {}) };
  return { rows: [...state.rows, row] };
}

// ---------------------------------------------------------------------------
// duplicateRow
// ---------------------------------------------------------------------------

/**
 * Duplicate an existing row by ID.
 * The duplicate is inserted immediately after the source row.
 * The 'id' field is dropped from the duplicate (matches v2 behavior).
 */
export function duplicateRow(
  state: TableState,
  rowId: RowId
): { rows: unknown[] } {
  const found = resolveRow(state.rows, rowId);
  if (!found) return { rows: state.rows };

  const clone: Record<string, unknown> = isRecord(found.row)
    ? { ...found.row }
    : {};
  // Drop id so the clone gets a fresh index-based identity (v2 parity).
  if ('id' in clone) delete clone['id'];

  const newRows = [
    ...state.rows.slice(0, found.index + 1),
    clone,
    ...state.rows.slice(found.index + 1),
  ];

  return { rows: newRows };
}

// ---------------------------------------------------------------------------
// bulkFill
// ---------------------------------------------------------------------------

/**
 * Apply a single value to a specific column across multiple rows.
 * Returns the updated rows array.
 */
export function bulkFill(
  state: TableState,
  payload: BulkFillPayload
): { rows: unknown[] } {
  if (!Array.isArray(payload.rowIds) || payload.rowIds.length === 0) {
    return { rows: state.rows };
  }

  // Build index set for fast lookup.
  const targetIndices = new Set<number>();
  for (const rowId of payload.rowIds) {
    const found = resolveRow(state.rows, rowId);
    if (found !== null && isRecord(found.row)) {
      targetIndices.add(found.index);
    }
  }

  if (targetIndices.size === 0) return { rows: state.rows };

  const newRows = state.rows.map((r, i) => {
    if (targetIndices.has(i) && isRecord(r)) {
      return { ...r, [payload.column]: payload.value };
    }
    return r;
  });

  return { rows: newRows };
}

// ---------------------------------------------------------------------------
// nextCellPosition
// ---------------------------------------------------------------------------

/**
 * Compute the next focusable cell position given a keyboard direction.
 * Used by the renderer to implement ARIA grid keyboard navigation.
 *
 * Navigation rules:
 *   up        -- rowIndex - 1, clamp at 0
 *   down      -- rowIndex + 1, clamp at rows - 1
 *   left      -- colIndex - 1; wraps to end of prev row
 *   right     -- colIndex + 1; wraps to start of next row
 *   tab       -- same as right
 *   shiftTab  -- same as left
 *
 * @param current   - Current cell position (0-based).
 * @param direction - Arrow key direction.
 * @param bounds    - Grid dimensions (rows and cols counts).
 */
export function nextCellPosition(
  current: { rowIndex: number; colIndex: number },
  direction: 'up' | 'down' | 'left' | 'right' | 'tab' | 'shiftTab',
  bounds: { rows: number; cols: number }
): { rowIndex: number; colIndex: number } {
  const { rows, cols } = bounds;
  let { rowIndex, colIndex } = current;

  if (rows <= 0 || cols <= 0) return { rowIndex, colIndex };

  switch (direction) {
    case 'up':
      rowIndex = Math.max(0, rowIndex - 1);
      break;
    case 'down':
      rowIndex = Math.min(rows - 1, rowIndex + 1);
      break;
    case 'left':
    case 'shiftTab':
      if (colIndex > 0) {
        colIndex -= 1;
      } else if (rowIndex > 0) {
        rowIndex -= 1;
        colIndex = cols - 1;
      }
      break;
    case 'right':
    case 'tab':
      if (colIndex < cols - 1) {
        colIndex += 1;
      } else if (rowIndex < rows - 1) {
        rowIndex += 1;
        colIndex = 0;
      }
      break;
  }

  return { rowIndex, colIndex };
}
