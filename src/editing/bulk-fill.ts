/**
 * editing/bulk-fill.ts
 *
 * Bulk-fill preview computation ("N rows -> value" diff).
 *
 * Computes before/after diffs for a bulk-fill operation without touching the
 * data store.  The UI renders this preview so the user can confirm before
 * committing.
 *
 * This module is pure: no store references, no DOM.
 */

import type { RowId } from '../core/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single row's before/after entry in the bulk-fill preview. */
export interface BulkFillDiffEntry {
  /** Row identifier (id field value or numeric index). */
  rowId: RowId;
  /** Current value in this row for the target column. */
  currentValue: unknown;
  /** Value that will be written on commit. */
  newValue: unknown;
  /** True when newValue differs from currentValue. */
  willChange: boolean;
}

/** Full bulk-fill preview result. */
export interface BulkFillPreview {
  /** Column key being filled. */
  column: string;
  /** The value to be written into all targeted rows. */
  newValue: unknown;
  /** Per-row diff entries (only rows that were successfully resolved). */
  entries: BulkFillDiffEntry[];
  /** How many rows will actually change. */
  changeCount: number;
  /** How many rows already equal newValue (no-op). */
  noopCount: number;
}

// ---------------------------------------------------------------------------
// valuesEqual
// ---------------------------------------------------------------------------

/**
 * Determine whether two cell values are equal for no-op detection.
 * Handles primitives, arrays, and plain objects via JSON fallback.
 *
 * @example
 *   valuesEqual(1, 1)           // true
 *   valuesEqual('a', 'a')       // true
 *   valuesEqual([1,2], [1,2])   // true
 *   valuesEqual(null, undefined) // false
 *   valuesEqual([1,2], [2,1])   // false
 */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// computeBulkFillPreview
// ---------------------------------------------------------------------------

/**
 * Compute a bulk-fill preview diff.
 *
 * Resolves each rowId against the rows array (by id field or numeric index)
 * and builds a BulkFillDiffEntry for each resolved row.  Rows that cannot be
 * resolved are silently skipped (consistent with v2 doBulkFill behavior).
 *
 * @param rows     - The full rows array.
 * @param rowIds   - IDs of rows to be bulk-filled.
 * @param column   - The column key to fill.
 * @param newValue - The value to write.
 * @param idKey    - The field used as the row identifier.  Default: 'id'.
 *
 * @example
 *   computeBulkFillPreview(
 *     [{ id: 1, status: 'active' }, { id: 2, status: 'active' }],
 *     [1, 2],
 *     'status',
 *     'inactive'
 *   )
 *   // { column: 'status', newValue: 'inactive', changeCount: 2, noopCount: 0, entries: [...] }
 */
export function computeBulkFillPreview(
  rows: unknown[],
  rowIds: RowId[],
  column: string,
  newValue: unknown,
  idKey = 'id'
): BulkFillPreview {
  const entries: BulkFillDiffEntry[] = [];

  for (const rowId of rowIds) {
    let found: unknown = undefined;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (typeof r === 'object' && r !== null) {
        const rec = r as Record<string, unknown>;
        const rid = rec[idKey];
        if (
          (typeof rid === 'string' || typeof rid === 'number') &&
          rid === rowId
        ) {
          found = r;
          break;
        }
      }
      // Numeric-index identity fallback (matches core resolveRow behavior).
      if (typeof rowId === 'number' && i === rowId) {
        found = r;
        break;
      }
    }

    if (found === undefined) continue;

    const currentValue =
      typeof found === 'object' && found !== null
        ? (found as Record<string, unknown>)[column]
        : undefined;

    const willChange = !valuesEqual(currentValue, newValue);
    entries.push({ rowId, currentValue, newValue, willChange });
  }

  const changeCount = entries.filter((e) => e.willChange).length;
  const noopCount = entries.length - changeCount;

  return { column, newValue, entries, changeCount, noopCount };
}
