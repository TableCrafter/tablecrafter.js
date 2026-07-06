/**
 * editing/editing.test.ts
 *
 * Vitest unit tests for the editing/index.ts functions:
 *   startCellEdit, commitCellEdit, cancelCellEdit,
 *   addRow, duplicateRow, bulkFill, nextCellPosition.
 */

import { describe, it, expect } from 'vitest';
import {
  startCellEdit,
  commitCellEdit,
  cancelCellEdit,
  addRow,
  duplicateRow,
  bulkFill,
  nextCellPosition,
} from './index';
import type { TableState, EditingCell } from '../core/types';

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<TableState> = {}): TableState {
  const rows = overrides.rows ?? [
    { id: 1, name: 'Alice', role: 'admin' },
    { id: 2, name: 'Bob', role: 'user' },
  ];
  return {
    rows,
    filteredRows: rows,
    sortedRows: rows,
    displayRows: rows,
    sort: null,
    filters: {},
    searchQuery: '',
    searchAst: null,
    page: 1,
    pageSize: 25,
    pageCount: 1,
    totalRows: rows.length,
    selection: new Set(),
    editingCell: null,
    loading: false,
    error: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// export presence (original stub tests preserved)
// ---------------------------------------------------------------------------

describe('editing module exports', () => {
  it('exports startCellEdit', () => {
    expect(typeof startCellEdit).toBe('function');
  });

  it('exports commitCellEdit', () => {
    expect(typeof commitCellEdit).toBe('function');
  });

  it('exports cancelCellEdit', () => {
    expect(typeof cancelCellEdit).toBe('function');
  });

  it('exports addRow', () => {
    expect(typeof addRow).toBe('function');
  });

  it('exports duplicateRow', () => {
    expect(typeof duplicateRow).toBe('function');
  });

  it('exports bulkFill', () => {
    expect(typeof bulkFill).toBe('function');
  });

  it('exports nextCellPosition', () => {
    expect(typeof nextCellPosition).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// startCellEdit
// ---------------------------------------------------------------------------

describe('startCellEdit', () => {
  it('returns editingCell with rowId, column, originalValue', () => {
    const state = makeState();
    const result = startCellEdit(state, { rowId: 1, column: 'name', value: 'Alice' });
    expect(result.editingCell.rowId).toBe(1);
    expect(result.editingCell.column).toBe('name');
    expect(result.editingCell.originalValue).toBe('Alice');
  });

  it('captures null when column value is absent', () => {
    const state = makeState({
      rows: [{ id: 1, name: 'Alice' }],
    });
    const result = startCellEdit(state, { rowId: 1, column: 'nonexistent', value: '' });
    expect(result.editingCell.originalValue).toBeUndefined();
  });

  it('resolves row by id field', () => {
    const state = makeState();
    const result = startCellEdit(state, { rowId: 2, column: 'role', value: 'user' });
    expect(result.editingCell.rowId).toBe(2);
  });

  it('throws RangeError when row is not found', () => {
    const state = makeState();
    expect(() =>
      startCellEdit(state, { rowId: 999, column: 'name', value: '' })
    ).toThrow(RangeError);
  });

  it('resolves row by numeric index when no id field', () => {
    const state = makeState({ rows: [{ name: 'X' }, { name: 'Y' }] });
    const result = startCellEdit(state, { rowId: 1, column: 'name', value: 'Y' });
    expect(result.editingCell.column).toBe('name');
    expect(result.editingCell.originalValue).toBe('Y');
  });
});

// ---------------------------------------------------------------------------
// commitCellEdit
// ---------------------------------------------------------------------------

describe('commitCellEdit', () => {
  it('returns null editingCell', () => {
    const ec: EditingCell = { rowId: 1, column: 'name', originalValue: 'Alice' };
    const state = makeState({ editingCell: ec });
    const { editingCell } = commitCellEdit(state, 'Bob');
    expect(editingCell).toBeNull();
  });

  it('returns updated rows with new value', () => {
    const ec: EditingCell = { rowId: 1, column: 'name', originalValue: 'Alice' };
    const state = makeState({ editingCell: ec });
    const { rows } = commitCellEdit(state, 'Bob');
    const row = (rows as Array<Record<string, unknown>>).find((r) => r['id'] === 1);
    expect(row?.['name']).toBe('Bob');
  });

  it('does not mutate the original state rows', () => {
    const ec: EditingCell = { rowId: 1, column: 'name', originalValue: 'Alice' };
    const state = makeState({ editingCell: ec });
    const originalFirst = (state.rows[0] as Record<string, unknown>)['name'];
    commitCellEdit(state, 'Bob');
    expect((state.rows[0] as Record<string, unknown>)['name']).toBe(originalFirst);
  });

  it('returns a SET_ROWS undoAction with the pre-edit snapshot', () => {
    const ec: EditingCell = { rowId: 1, column: 'name', originalValue: 'Alice' };
    const state = makeState({ editingCell: ec });
    const { undoAction } = commitCellEdit(state, 'Bob');
    expect(undoAction.type).toBe('SET_ROWS');
    if (undoAction.type === 'SET_ROWS') {
      const snapshotFirst = (undoAction.payload.rows[0] as Record<string, unknown>)['name'];
      expect(snapshotFirst).toBe('Alice');
    }
  });

  it('returns current rows unchanged when no editingCell', () => {
    const state = makeState({ editingCell: null });
    const { rows } = commitCellEdit(state, 'ignored');
    expect(rows).toBe(state.rows);
  });
});

// ---------------------------------------------------------------------------
// cancelCellEdit
// ---------------------------------------------------------------------------

describe('cancelCellEdit', () => {
  it('returns null editingCell', () => {
    const ec: EditingCell = { rowId: 1, column: 'name', originalValue: 'Alice' };
    const state = makeState({ editingCell: ec });
    expect(cancelCellEdit(state).editingCell).toBeNull();
  });

  it('works when editingCell is already null', () => {
    const state = makeState({ editingCell: null });
    expect(cancelCellEdit(state).editingCell).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// addRow
// ---------------------------------------------------------------------------

describe('addRow', () => {
  it('appends a new empty row', () => {
    const state = makeState();
    const { rows } = addRow(state);
    expect(rows.length).toBe(state.rows.length + 1);
  });

  it('appends row with provided data', () => {
    const state = makeState();
    const { rows } = addRow(state, { name: 'Charlie', role: 'editor' });
    const last = rows[rows.length - 1] as Record<string, unknown>;
    expect(last['name']).toBe('Charlie');
    expect(last['role']).toBe('editor');
  });

  it('does not mutate the original rows array', () => {
    const state = makeState();
    const original = state.rows.length;
    addRow(state);
    expect(state.rows.length).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// duplicateRow
// ---------------------------------------------------------------------------

describe('duplicateRow', () => {
  it('increases rows count by 1', () => {
    const state = makeState();
    const { rows } = duplicateRow(state, 1);
    expect(rows.length).toBe(state.rows.length + 1);
  });

  it('inserts duplicate immediately after source row', () => {
    const state = makeState();
    const { rows } = duplicateRow(state, 1);
    const inserted = rows[1] as Record<string, unknown>;
    expect(inserted['name']).toBe('Alice');
  });

  it('drops "id" from duplicate', () => {
    const state = makeState();
    const { rows } = duplicateRow(state, 1);
    const inserted = rows[1] as Record<string, unknown>;
    expect(inserted).not.toHaveProperty('id');
  });

  it('returns same rows when rowId not found', () => {
    const state = makeState();
    const { rows } = duplicateRow(state, 999);
    expect(rows.length).toBe(state.rows.length);
  });

  it('does not mutate original rows array', () => {
    const state = makeState();
    const original = state.rows.length;
    duplicateRow(state, 1);
    expect(state.rows.length).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// bulkFill
// ---------------------------------------------------------------------------

describe('bulkFill', () => {
  it('fills specified column on targeted rows', () => {
    const state = makeState();
    const { rows } = bulkFill(state, {
      rowIds: [1, 2],
      column: 'role',
      value: 'guest',
    });
    const r = rows as Array<Record<string, unknown>>;
    expect(r[0]!['role']).toBe('guest');
    expect(r[1]!['role']).toBe('guest');
  });

  it('leaves non-targeted rows unchanged', () => {
    const state = makeState({
      rows: [
        { id: 1, role: 'admin' },
        { id: 2, role: 'user' },
        { id: 3, role: 'user' },
      ],
    });
    const { rows } = bulkFill(state, {
      rowIds: [1],
      column: 'role',
      value: 'guest',
    });
    const r = rows as Array<Record<string, unknown>>;
    expect(r[1]!['role']).toBe('user');
    expect(r[2]!['role']).toBe('user');
  });

  it('does not mutate the original rows', () => {
    const state = makeState();
    const originalRole = (state.rows[0]! as Record<string, unknown>)['role'];
    bulkFill(state, { rowIds: [1], column: 'role', value: 'guest' });
    expect((state.rows[0]! as Record<string, unknown>)['role']).toBe(originalRole);
  });

  it('returns same rows for empty rowIds', () => {
    const state = makeState();
    const { rows } = bulkFill(state, { rowIds: [], column: 'role', value: 'x' });
    expect(rows).toBe(state.rows);
  });

  it('silently skips unresolved rowIds', () => {
    const state = makeState();
    const { rows } = bulkFill(state, {
      rowIds: [999, 1],
      column: 'role',
      value: 'guest',
    });
    const r = rows as Array<Record<string, unknown>>;
    expect(r[0]!['role']).toBe('guest');
    expect(rows.length).toBe(state.rows.length);
  });
});

// ---------------------------------------------------------------------------
// nextCellPosition
// ---------------------------------------------------------------------------

describe('nextCellPosition', () => {
  const bounds = { rows: 4, cols: 3 };

  it('down increments rowIndex', () => {
    const pos = nextCellPosition({ rowIndex: 0, colIndex: 0 }, 'down', bounds);
    expect(pos).toEqual({ rowIndex: 1, colIndex: 0 });
  });

  it('up decrements rowIndex', () => {
    const pos = nextCellPosition({ rowIndex: 2, colIndex: 0 }, 'up', bounds);
    expect(pos).toEqual({ rowIndex: 1, colIndex: 0 });
  });

  it('right increments colIndex', () => {
    const pos = nextCellPosition({ rowIndex: 0, colIndex: 0 }, 'right', bounds);
    expect(pos).toEqual({ rowIndex: 0, colIndex: 1 });
  });

  it('left decrements colIndex', () => {
    const pos = nextCellPosition({ rowIndex: 0, colIndex: 2 }, 'left', bounds);
    expect(pos).toEqual({ rowIndex: 0, colIndex: 1 });
  });

  it('down clamps at last row', () => {
    const pos = nextCellPosition({ rowIndex: 3, colIndex: 0 }, 'down', bounds);
    expect(pos).toEqual({ rowIndex: 3, colIndex: 0 });
  });

  it('up clamps at row 0', () => {
    const pos = nextCellPosition({ rowIndex: 0, colIndex: 0 }, 'up', bounds);
    expect(pos).toEqual({ rowIndex: 0, colIndex: 0 });
  });

  it('right at end of row wraps to start of next row', () => {
    const pos = nextCellPosition({ rowIndex: 0, colIndex: 2 }, 'right', bounds);
    expect(pos).toEqual({ rowIndex: 1, colIndex: 0 });
  });

  it('right at last cell stays (no wrap past last row)', () => {
    const pos = nextCellPosition({ rowIndex: 3, colIndex: 2 }, 'right', bounds);
    expect(pos).toEqual({ rowIndex: 3, colIndex: 2 });
  });

  it('left at start of row wraps to end of prev row', () => {
    const pos = nextCellPosition({ rowIndex: 1, colIndex: 0 }, 'left', bounds);
    expect(pos).toEqual({ rowIndex: 0, colIndex: 2 });
  });

  it('left at first cell stays', () => {
    const pos = nextCellPosition({ rowIndex: 0, colIndex: 0 }, 'left', bounds);
    expect(pos).toEqual({ rowIndex: 0, colIndex: 0 });
  });

  it('tab behaves like right', () => {
    const pos = nextCellPosition({ rowIndex: 0, colIndex: 1 }, 'tab', bounds);
    expect(pos).toEqual({ rowIndex: 0, colIndex: 2 });
  });

  it('shiftTab behaves like left', () => {
    const pos = nextCellPosition({ rowIndex: 1, colIndex: 0 }, 'shiftTab', bounds);
    expect(pos).toEqual({ rowIndex: 0, colIndex: 2 });
  });

  it('zero bounds returns same position', () => {
    const pos = nextCellPosition({ rowIndex: 0, colIndex: 0 }, 'down', { rows: 0, cols: 0 });
    expect(pos).toEqual({ rowIndex: 0, colIndex: 0 });
  });
});
