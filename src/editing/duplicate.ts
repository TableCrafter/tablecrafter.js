/**
 * editing/duplicate.ts
 *
 * Duplicate-row payload builder.
 * Produces a new row object that is a shallow copy of the source row with
 * certain fields excluded ("locked").  The renderer / store inserts the
 * payload as a new row immediately after the original.
 *
 * All functions are pure; no DOM access.
 */

import type { RowId } from '../core/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DuplicateOptions {
  /**
   * Fields that must NOT be copied into the duplicate.
   * Common use: lock 'id' so the duplicate gets a fresh identity.
   * Defaults to ['id'] when not supplied.
   */
  lockFields?: string[] | undefined;
}

export interface DuplicatePayload {
  /** The cloned row data (ready to pass to addRow / store). */
  row: Record<string, unknown>;
  /** Index immediately after the source — the suggested insert position. */
  insertAfterIndex: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function resolveRowIndex(rows: unknown[], rowId: RowId): number {
  // id-field lookup first (matches core/state.ts resolveRow priority)
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a duplicate payload from a row in the current dataset.
 *
 * @param rows    The current rows array from TableState.
 * @param rowId   The RowId of the row to duplicate.
 * @param options Field-locking options.  Defaults to locking 'id'.
 * @returns DuplicatePayload, or null when rowId does not resolve to a row.
 */
export function buildDuplicatePayload(
  rows: unknown[],
  rowId: RowId,
  options?: DuplicateOptions
): DuplicatePayload | null {
  const index = resolveRowIndex(rows, rowId);
  if (index < 0) return null;

  const source = rows[index];
  if (!isRecord(source)) return null;

  const lockFields: string[] =
    options?.lockFields !== undefined ? options.lockFields : ['id'];

  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!lockFields.includes(key)) {
      clone[key] = value;
    }
  }

  return {
    row: clone,
    insertAfterIndex: index,
  };
}

/**
 * Apply the duplicate payload to a rows array.
 * Returns a new array with the cloned row inserted immediately after the source.
 */
export function applyDuplicate(
  rows: unknown[],
  payload: DuplicatePayload
): unknown[] {
  const copy = [...rows];
  copy.splice(payload.insertAfterIndex + 1, 0, payload.row);
  return copy;
}
