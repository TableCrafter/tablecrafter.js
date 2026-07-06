/**
 * editing/editing.test.ts
 *
 * Tests for the editing lifecycle functions: startCellEdit, commitCellEdit,
 * cancelCellEdit, addRow, duplicateRow, bulkFill, nextCellPosition.
 * Ported from relevant v2 Jest test cases and extended for v3.
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
import type { TableState, EditCellPayload, BulkFillPayload } from '../core/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeState(overrides?: Partial<TableState>): TableState {
  return {
    // ids deliberately do not collide with array indices so id-lookup and
    // index-fallback resolution are unambiguous in tests
    rows: [
      { id: 101, name: 'Alice', role: 'admin' },
      { id: 102, name: 'Bob',   role: 'user'  },
      { id: 103, name: 'Carol', role: 'user'  },
    ],
    filteredRows: [],
    sortedRows: [],
    displayRows: [],
    sort: null,
    filters: {},
    searchQuery: '',
    searchAst: null,
    page: 1,
    pageSize: 25,
    pageCount: 1,
    totalRows: 3,
    selection: new Set(),
    editingCell: null,
    loading: false,
    error: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Exports check
// ---------------------------------------------------------------------------

describe('editing module exports', () => {
  it('exports startCellEdit', () => expect(typeof startCellEdit).toBe('function'));
  it('exports commitCellEdit', () => expect(typeof commitCellEdit).toBe('function'));
  it('exports cancelCellEdit', () => expect(typeof cancelCellEdit).toBe('function'));
  it('exports addRow', () => expect(typeof addRow).toBe('function'));
  it('exports duplicateRow', () => expect(typeof duplicateRow).toBe('function'));
  it('exports bulkFill', () => expect(typeof bulkFill).toBe('function'));
  it('exports nextCellPosition', () => expect(typeof nextCellPosition).toBe('function'));
});

// ---------------------------------------------------------------------------
// startCellEdit
// ---------------------------------------------------------------------------

describe('startCellEdit', () => {
  it('returns an editingCell with the correct rowId and column', () => {
    const payload: EditCellPayload = { rowId: 101, column: 'name', value: 'Alice' };
    const result = startCellEdit(makeState(), payload);
    expect(result.editingCell?.rowId).toBe(101);
    expect(result.editingCell?.column).toBe('name');
  });

  it('records the original value from the row', () => {
    const payload: EditCellPayload = { rowId: 101, column: 'name', value: 'Alice' };
    const result = startCellEdit(makeState(), payload);
    expect(result.editingCell?.originalValue).toBe('Alice');
  });

  it('resolves by id field (rowId = 102 → row with id: 102)', () => {
    const payload: EditCellPayload = { rowId: 102, column: 'name', value: '' };
    const result = startCellEdit(makeState(), payload);
    expect(result.editingCell?.rowId).toBe(102);
    expect(result.editingCell?.originalValue).toBe('Bob');
  });

  it('resolves by numeric index fallback and canonicalises rowId to the id field', () => {
    // rowId 0 matches no id → falls back to index 0 (Alice, id 101)
    const payload: EditCellPayload = { rowId: 0, column: 'name', value: '' };
    const result = startCellEdit(makeState(), payload);
    expect(result.editingCell?.rowId).toBe(101);
    expect(result.editingCell?.originalValue).toBe('Alice');
  });

  it('returns editingCell: null when rowId does not resolve', () => {
    const payload: EditCellPayload = { rowId: 999, column: 'name', value: '' };
    const result = startCellEdit(makeState(), payload);
    expect(result.editingCell).toBeNull();
  });

  it('originalValue is undefined for a non-existent column', () => {
    const payload: EditCellPayload = { rowId: 0, column: 'nonexistent', value: '' };
    const result = startCellEdit(makeState(), payload);
    expect(result.editingCell?.originalValue).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// commitCellEdit
// ---------------------------------------------------------------------------

describe('commitCellEdit', () => {
  function makeEditingState() {
    return makeState({
      editingCell: {
        rowId: 101,
        column: 'name',
        originalValue: 'Alice',
      },
    });
  }

  it('returns editingCell: null', () => {
    const result = commitCellEdit(makeEditingState(), 'Alice Updated');
    expect(result.editingCell).toBeNull();
  });

  it('applies the new value to the correct row', () => {
    const result = commitCellEdit(makeEditingState(), 'Alice Updated');
    const row = result.rows[0] as { name: string };
    expect(row.name).toBe('Alice Updated');
  });

  it('does not modify other rows', () => {
    const result = commitCellEdit(makeEditingState(), 'Alice Updated');
    const bob = result.rows[1] as { name: string };
    expect(bob.name).toBe('Bob');
  });

  it('returns an undoAction (SET_ROWS)', () => {
    const result = commitCellEdit(makeEditingState(), 'Alice Updated');
    expect(result.undoAction.type).toBe('SET_ROWS');
  });

  it('undoAction contains the pre-commit rows', () => {
    const state = makeEditingState();
    const result = commitCellEdit(state, 'Alice Updated');
    const undoPayload = (result.undoAction as { type: 'SET_ROWS'; payload: { rows: unknown[] } }).payload;
    // The undo rows should still have the original 'Alice'
    const origRow = undoPayload.rows[0] as { name: string };
    expect(origRow.name).toBe('Alice');
  });

  it('handles no editingCell gracefully', () => {
    const state = makeState(); // editingCell = null
    const result = commitCellEdit(state, 'something');
    expect(result.editingCell).toBeNull();
    expect(result.rows).toHaveLength(3);
  });

  it('preserves other fields on the updated row', () => {
    const result = commitCellEdit(makeEditingState(), 'Alice Updated');
    const row = result.rows[0] as { id: number; name: string; role: string };
    expect(row.id).toBe(101);
    expect(row.role).toBe('admin');
  });
});

// ---------------------------------------------------------------------------
// cancelCellEdit
// ---------------------------------------------------------------------------

describe('cancelCellEdit', () => {
  it('returns editingCell: null', () => {
    const state = makeState({
      editingCell: { rowId: 0, column: 'name', originalValue: 'Alice' },
    });
    const result = cancelCellEdit(state);
    expect(result.editingCell).toBeNull();
  });

  it('returns null even when no edit was active', () => {
    const result = cancelCellEdit(makeState());
    expect(result.editingCell).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// addRow
// ---------------------------------------------------------------------------

describe('addRow', () => {
  it('increases rows count by 1', () => {
    const result = addRow(makeState());
    expect(result.rows).toHaveLength(4);
  });

  it('appends an empty row when no data is provided', () => {
    const result = addRow(makeState());
    const last = result.rows[3] as Record<string, unknown>;
    expect(Object.keys(last)).toHaveLength(0);
  });

  it('appends the provided data as a new row', () => {
    const result = addRow(makeState(), { id: 99, name: 'Dana', role: 'user' });
    const last = result.rows[3] as { id: number; name: string };
    expect(last.id).toBe(99);
    expect(last.name).toBe('Dana');
  });

  it('does not mutate the original state', () => {
    const state = makeState();
    addRow(state);
    expect(state.rows).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// duplicateRow
// ---------------------------------------------------------------------------

describe('duplicateRow', () => {
  it('increases rows count by 1', () => {
    const result = duplicateRow(makeState(), 0);
    expect(result.rows).toHaveLength(4);
  });

  it('inserts clone immediately after source', () => {
    const result = duplicateRow(makeState(), 0);
    const clone = result.rows[1] as { name: string };
    expect(clone.name).toBe('Alice');
  });

  it('drops the id field from the clone', () => {
    const result = duplicateRow(makeState(), 0);
    const clone = result.rows[1] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(clone, 'id')).toBe(false);
  });

  it('copies other fields', () => {
    const result = duplicateRow(makeState(), 0);
    const clone = result.rows[1] as { role: string };
    expect(clone.role).toBe('admin');
  });

  it('does not modify the original state', () => {
    const state = makeState();
    duplicateRow(state, 0);
    expect(state.rows).toHaveLength(3);
  });

  it('returns original rows when rowId does not resolve', () => {
    const state = makeState();
    const result = duplicateRow(state, 999);
    expect(result.rows).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// bulkFill
// ---------------------------------------------------------------------------

describe('bulkFill', () => {
  it('applies value to specified rows', () => {
    const payload: BulkFillPayload = { rowIds: [0, 1], column: 'role', value: 'moderator' };
    const result = bulkFill(makeState(), payload);
    expect((result.rows[0] as { role: string }).role).toBe('moderator');
    expect((result.rows[1] as { role: string }).role).toBe('moderator');
  });

  it('does not change rows not in rowIds', () => {
    const payload: BulkFillPayload = { rowIds: [0], column: 'role', value: 'moderator' };
    const result = bulkFill(makeState(), payload);
    expect((result.rows[1] as { role: string }).role).toBe('user');
    expect((result.rows[2] as { role: string }).role).toBe('user');
  });

  it('returns original rows for empty rowIds', () => {
    const state = makeState();
    const payload: BulkFillPayload = { rowIds: [], column: 'role', value: 'x' };
    const result = bulkFill(state, payload);
    expect(result.rows).toHaveLength(3);
    expect(result.rows).toStrictEqual(state.rows);
  });

  it('ignores unresolvable rowIds', () => {
    const payload: BulkFillPayload = { rowIds: [999], column: 'role', value: 'x' };
    const result = bulkFill(makeState(), payload);
    expect(result.rows).toHaveLength(3);
  });

  it('preserves other fields on updated rows', () => {
    const payload: BulkFillPayload = { rowIds: [101], column: 'role', value: 'manager' };
    const result = bulkFill(makeState(), payload);
    const row = result.rows[0] as { id: number; name: string };
    expect(row.id).toBe(101);
    expect(row.name).toBe('Alice');
  });

  it('does not mutate the original state', () => {
    const state = makeState();
    const payload: BulkFillPayload = { rowIds: [0], column: 'role', value: 'manager' };
    bulkFill(state, payload);
    expect((state.rows[0] as { role: string }).role).toBe('admin');
  });
});

// ---------------------------------------------------------------------------
// nextCellPosition
// ---------------------------------------------------------------------------

describe('nextCellPosition', () => {
  const bounds = { rows: 5, cols: 4 };

  it('up decrements rowIndex', () => {
    const r = nextCellPosition({ rowIndex: 2, colIndex: 1 }, 'up', bounds);
    expect(r).toEqual({ rowIndex: 1, colIndex: 1 });
  });

  it('up clamps at row 0', () => {
    const r = nextCellPosition({ rowIndex: 0, colIndex: 2 }, 'up', bounds);
    expect(r).toEqual({ rowIndex: 0, colIndex: 2 });
  });

  it('down increments rowIndex', () => {
    const r = nextCellPosition({ rowIndex: 2, colIndex: 1 }, 'down', bounds);
    expect(r).toEqual({ rowIndex: 3, colIndex: 1 });
  });

  it('down clamps at last row', () => {
    const r = nextCellPosition({ rowIndex: 4, colIndex: 1 }, 'down', bounds);
    expect(r).toEqual({ rowIndex: 4, colIndex: 1 });
  });

  it('left decrements colIndex', () => {
    const r = nextCellPosition({ rowIndex: 1, colIndex: 2 }, 'left', bounds);
    expect(r).toEqual({ rowIndex: 1, colIndex: 1 });
  });

  it('left clamps at col 0', () => {
    const r = nextCellPosition({ rowIndex: 1, colIndex: 0 }, 'left', bounds);
    expect(r).toEqual({ rowIndex: 1, colIndex: 0 });
  });

  it('right increments colIndex', () => {
    const r = nextCellPosition({ rowIndex: 1, colIndex: 1 }, 'right', bounds);
    expect(r).toEqual({ rowIndex: 1, colIndex: 2 });
  });

  it('right clamps at last col', () => {
    const r = nextCellPosition({ rowIndex: 1, colIndex: 3 }, 'right', bounds);
    expect(r).toEqual({ rowIndex: 1, colIndex: 3 });
  });

  it('tab advances to next column', () => {
    const r = nextCellPosition({ rowIndex: 1, colIndex: 1 }, 'tab', bounds);
    expect(r).toEqual({ rowIndex: 1, colIndex: 2 });
  });

  it('tab wraps to next row at end of row', () => {
    const r = nextCellPosition({ rowIndex: 1, colIndex: 3 }, 'tab', bounds);
    expect(r).toEqual({ rowIndex: 2, colIndex: 0 });
  });

  it('tab stays at last cell when at end', () => {
    const r = nextCellPosition({ rowIndex: 4, colIndex: 3 }, 'tab', bounds);
    expect(r).toEqual({ rowIndex: 4, colIndex: 3 });
  });

  it('shiftTab moves to previous column', () => {
    const r = nextCellPosition({ rowIndex: 1, colIndex: 2 }, 'shiftTab', bounds);
    expect(r).toEqual({ rowIndex: 1, colIndex: 1 });
  });

  it('shiftTab wraps to previous row last column', () => {
    const r = nextCellPosition({ rowIndex: 2, colIndex: 0 }, 'shiftTab', bounds);
    expect(r).toEqual({ rowIndex: 1, colIndex: 3 });
  });

  it('shiftTab stays at first cell when at beginning', () => {
    const r = nextCellPosition({ rowIndex: 0, colIndex: 0 }, 'shiftTab', bounds);
    expect(r).toEqual({ rowIndex: 0, colIndex: 0 });
  });

  it('returns current position unchanged for zero-row bounds', () => {
    const current = { rowIndex: 0, colIndex: 0 };
    const r = nextCellPosition(current, 'down', { rows: 0, cols: 0 });
    expect(r).toEqual(current);
  });
});
