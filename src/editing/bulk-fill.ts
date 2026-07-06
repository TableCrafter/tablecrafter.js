/**
 * editing/bulk-fill.ts
 *
 * Bulk-fill preview computation.
 * "N rows → value" diff: calculates what would change if a single value
 * were applied across a set of rows for one column, without mutating anything.
 *
 * All functions are pure; no DOM access.
 */

import type { RowId } from '../core/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The change description for a single row in a bulk-fill operation. */
export interface BulkFillChange {
  rowId: RowId;
  /** Row index within the original rows array. */
  rowIndex: number;
  /** The value currently stored in the cell. */
  oldValue: unknown;
  /** The value that would be written. */
  newValue: unknown;
  /** Whether old and new values actually differ (skipped rows have changed = false). */
  willChange: boolean;
}

/**
 * Preview of a bulk-fill operation.
 * Produced by computeBulkFillPreview; nothing is mutated until the caller
 * applies the result to state.
 */
export interface BulkFillPreview {
  /** One entry per rowId in the payload. */
  changes: BulkFillChange[];
  /** Number of rows that will actually change. */
  affectedCount: number;
  /** Total rows in the payload (including no-ops). */
  totalCount: number;
  /** The column that will be updated. */
  column: string;
  /** The value that will be written to every affected cell. */
  newValue: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function resolveRowIndex(rows: unknown[], rowId: RowId): number {
  // id-field lookup first (matches state.ts resolveRow priority)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (isRecord(row) && Object.prototype.hasOwnProperty.call(row, 'id')) {
      const id = row['id'];
      if ((typeof id === 'string' || typeof id === 'number') && id === rowId) {
        return i;
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
    return rowId;
  }
  return -1;
}

function rowIdOf(row: unknown, index: number): RowId {
  if (isRecord(row) && Object.prototype.hasOwnProperty.call(row, 'id')) {
    const id = row['id'];
    if (typeof id === 'string' || typeof id === 'number') return id;
  }
  return index;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a bulk-fill preview without mutating anything.
 *
 * @param rows    Current rows from TableState.
 * @param rowIds  The set of row IDs to fill.
 * @param column  The column key to update.
 * @param value   The value to write.
 */
export function computeBulkFillPreview(
  rows: unknown[],
  rowIds: RowId[],
  column: string,
  value: unknown
): BulkFillPreview {
  const changes: BulkFillChange[] = [];
  let affectedCount = 0;

  for (const rowId of rowIds) {
    const index = resolveRowIndex(rows, rowId);
    const row = index >= 0 ? rows[index] : undefined;

    if (index < 0 || row === undefined) {
      // rowId did not resolve — record a no-op entry
      changes.push({
        rowId,
        rowIndex: -1,
        oldValue: undefined,
        newValue: value,
        willChange: false,
      });
      continue;
    }

    const oldValue = isRecord(row) ? row[column] : undefined;
    const willChange = oldValue !== value;

    if (willChange) affectedCount++;

    changes.push({
      rowId: rowIdOf(row, index),
      rowIndex: index,
      oldValue,
      newValue: value,
      willChange,
    });
  }

  return {
    changes,
    affectedCount,
    totalCount: rowIds.length,
    column,
    newValue: value,
  };
}

/**
 * Apply a bulk-fill preview to a rows array.
 * Returns a new array; the original is not mutated.
 * Only entries where willChange = true are applied.
 */
export function applyBulkFill(
  rows: unknown[],
  preview: BulkFillPreview
): unknown[] {
  const copy = rows.map((r) => (isRecord(r) ? { ...r } : r));
  for (const change of preview.changes) {
    if (!change.willChange || change.rowIndex < 0) continue;
    const row = copy[change.rowIndex];
    if (isRecord(row)) {
      row[preview.column] = preview.newValue;
    }
  }
  return copy;
}
