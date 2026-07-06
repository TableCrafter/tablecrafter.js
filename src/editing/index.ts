/**
 * editing/index.ts
 *
 * Edit lifecycle, add / duplicate / bulk-fill, and keyboard grid navigation.
 * Pure functions of (state, …args) → partial state.  No DOM access.
 *
 * These functions are composable reducers.  The store (core/state.ts) calls
 * them on the relevant dispatch actions; consumers that manage their own state
 * may also call them directly.
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
// Internal helpers
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
  // By 'id' field first
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (
      isRecord(row) &&
      Object.prototype.hasOwnProperty.call(row, 'id')
    ) {
      const id = row['id'];
      if ((typeof id === 'string' || typeof id === 'number') && id === rowId) {
        return { row, index: i };
      }
    }
  }
  // Numeric index fallback
  if (
    typeof rowId === 'number' &&
    Number.isInteger(rowId) &&
    rowId >= 0 &&
    rowId < rows.length
  ) {
    const row = rows[rowId];
    if (row !== undefined) return { row, index: rowId };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Edit start result
// ---------------------------------------------------------------------------

/** Result of starting a cell edit. */
export interface EditStartResult {
  editingCell: TableState['editingCell'];
}

// ---------------------------------------------------------------------------
// startCellEdit
// ---------------------------------------------------------------------------

/**
 * Begin editing a cell.
 * Records the original value into editingCell for later rollback.
 * Does NOT apply any new value to rows; the caller commits or cancels.
 *
 * @param state   Current table state.
 * @param payload { rowId, column, value } — value is the editor's initial
 *                population (typically the current stored value).
 */
export function startCellEdit(
  state: TableState,
  payload: EditCellPayload
): EditStartResult {
  const found = resolveRow(state.rows, payload.rowId);
  if (!found) {
    return { editingCell: null };
  }

  const originalValue = isRecord(found.row) ? found.row[payload.column] : undefined;
  const editingCell: EditingCell = {
    rowId: rowIdOf(found.row, found.index),
    column: payload.column,
    originalValue,
  };

  return { editingCell };
}

// ---------------------------------------------------------------------------
// commitCellEdit
// ---------------------------------------------------------------------------

/**
 * Commit the current cell edit.
 * Applies newValue to the editing row, clears editingCell, and returns
 * an undo Action (SET_ROWS restoring pre-commit rows).
 *
 * @param state    Current table state (must have editingCell set).
 * @param newValue The value to write to the cell.
 */
export function commitCellEdit(
  state: TableState,
  newValue: unknown
): {
  rows: unknown[];
  editingCell: null;
  undoAction: Action;
} {
  const undoAction: Action = { type: 'SET_ROWS', payload: { rows: [...state.rows] } };

  if (!state.editingCell) {
    return { rows: state.rows, editingCell: null, undoAction };
  }

  const session = state.editingCell;
  const found = resolveRow(state.rows, session.rowId);

  if (!found || !isRecord(found.row)) {
    return { rows: state.rows, editingCell: null, undoAction };
  }

  // Build new rows with the updated cell
  const newRows = state.rows.map((r, idx) => {
    if (idx === found.index && isRecord(r)) {
      return { ...r, [session.column]: newValue };
    }
    return r;
  });

  return {
    rows: newRows,
    editingCell: null,
    undoAction,
  };
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
 * Append a new blank row (or row from provided data) to the dataset.
 */
export function addRow(
  state: TableState,
  data?: Record<string, unknown>
): { rows: unknown[] } {
  const newRow: Record<string, unknown> = data !== undefined ? { ...data } : {};
  return { rows: [...state.rows, newRow] };
}

// ---------------------------------------------------------------------------
// duplicateRow
// ---------------------------------------------------------------------------

/**
 * Duplicate an existing row by ID.
 * The duplicate is inserted immediately after the source row.
 * The 'id' field is omitted so the clone gets a fresh identity.
 */
export function duplicateRow(
  state: TableState,
  rowId: RowId
): { rows: unknown[] } {
  const found = resolveRow(state.rows, rowId);
  if (!found) return { rows: state.rows };

  const source = found.row;
  const clone: Record<string, unknown> = isRecord(source)
    ? Object.fromEntries(Object.entries(source).filter(([k]) => k !== 'id'))
    : {};

  const newRows = [...state.rows];
  newRows.splice(found.index + 1, 0, clone);
  return { rows: newRows };
}

// ---------------------------------------------------------------------------
// bulkFill
// ---------------------------------------------------------------------------

/**
 * Apply a single value to a specific column across multiple rows.
 * Only rows whose RowId resolves to an existing row are updated.
 */
export function bulkFill(
  state: TableState,
  payload: BulkFillPayload
): { rows: unknown[] } {
  if (payload.rowIds.length === 0) {
    return { rows: state.rows };
  }

  // Build a set of indices to update
  const targetIndices = new Set<number>();
  for (const rowId of payload.rowIds) {
    const found = resolveRow(state.rows, rowId);
    if (found !== null) {
      targetIndices.add(found.index);
    }
  }

  if (targetIndices.size === 0) return { rows: state.rows };

  const newRows = state.rows.map((r, idx) => {
    if (targetIndices.has(idx) && isRecord(r)) {
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
 * Used by the renderer to implement grid keyboard navigation.
 *
 * - up/down: move rowIndex, clamp to [0, rows - 1]
 * - left/right: move colIndex, clamp to [0, cols - 1]
 * - tab: advance right, wrap to the first column of the next row;
 *        stop at the last cell (no wrap beyond bounds)
 * - shiftTab: move left, wrap to the last column of the previous row;
 *        stop at the first cell
 */
export function nextCellPosition(
  current: { rowIndex: number; colIndex: number },
  direction: 'up' | 'down' | 'left' | 'right' | 'tab' | 'shiftTab',
  bounds: { rows: number; cols: number }
): { rowIndex: number; colIndex: number } {
  const { rowIndex, colIndex } = current;
  const { rows, cols } = bounds;

  if (rows <= 0 || cols <= 0) return current;

  switch (direction) {
    case 'up':
      return { rowIndex: Math.max(0, rowIndex - 1), colIndex };

    case 'down':
      return { rowIndex: Math.min(rows - 1, rowIndex + 1), colIndex };

    case 'left':
      return { rowIndex, colIndex: Math.max(0, colIndex - 1) };

    case 'right':
      return { rowIndex, colIndex: Math.min(cols - 1, colIndex + 1) };

    case 'tab': {
      if (colIndex < cols - 1) {
        return { rowIndex, colIndex: colIndex + 1 };
      }
      if (rowIndex < rows - 1) {
        return { rowIndex: rowIndex + 1, colIndex: 0 };
      }
      // Already at last cell
      return current;
    }

    case 'shiftTab': {
      if (colIndex > 0) {
        return { rowIndex, colIndex: colIndex - 1 };
      }
      if (rowIndex > 0) {
        return { rowIndex: rowIndex - 1, colIndex: cols - 1 };
      }
      // Already at first cell
      return current;
    }

    default: {
      const _exhaustive: never = direction;
      void _exhaustive;
      return current;
    }
  }
}

// ---------------------------------------------------------------------------
// EditorRegistry (Issue #366)
// ---------------------------------------------------------------------------

/** Descriptor for a named inline cell editor. */
export interface EditorDescriptor {
  /** Human-readable name shown in UI affordances. */
  label: string;
  /** The CellType this editor handles, if it maps 1:1 to a type. */
  cellType?: import('../core/types').CellType | undefined;
  /** Whether the editor requires a list of options (select-like). */
  hasOptions?: boolean | undefined;
  /** Whether the editor is multi-value (multiselect-like). */
  multiValue?: boolean | undefined;
}

/** Runtime registry mapping editor type names to their descriptors. */
export interface EditorRegistry {
  /**
   * Register a named editor descriptor.
   * Throws if name is already registered (duplicate guard).
   */
  register(name: string, descriptor: EditorDescriptor): void;
  /** Return the descriptor for a named editor, or undefined if not registered. */
  get(name: string): EditorDescriptor | undefined;
  /** Return a sorted list of all registered editor names. */
  keys(): string[];
}

/** Built-in editor names pre-registered in the default registry. */
const BUILT_IN_EDITORS: Array<[string, EditorDescriptor]> = [
  ['text',      { label: 'Text',      cellType: 'text' }],
  ['number',    { label: 'Number',    cellType: 'number' }],
  ['date',      { label: 'Date',      cellType: 'date' }],
  ['checkbox',  { label: 'Checkbox',  cellType: 'checkbox' }],
  ['boolean',   { label: 'Boolean',   cellType: 'boolean' }],
  ['select',    { label: 'Select',    cellType: 'select',  hasOptions: true }],
  ['star',      { label: 'Star',      cellType: 'star' }],
];

/**
 * Create a new EditorRegistry pre-populated with the built-in editors.
 * Each registry instance is independent; mutations do not affect others.
 */
export function createEditorRegistry(): EditorRegistry {
  const map = new Map<string, EditorDescriptor>(BUILT_IN_EDITORS);

  return {
    register(name: string, descriptor: EditorDescriptor): void {
      if (map.has(name)) {
        throw new Error(`EditorRegistry: editor "${name}" is already registered`);
      }
      map.set(name, { ...descriptor });
    },
    get(name: string): EditorDescriptor | undefined {
      return map.get(name);
    },
    keys(): string[] {
      return Array.from(map.keys()).sort();
    },
  };
}

/** Default shared registry. */
export const editorRegistry: EditorRegistry = createEditorRegistry();
