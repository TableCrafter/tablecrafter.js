/**
 * editing/duplicate.ts
 *
 * Duplicate-row payload builder with field locking exclusions.
 *
 * A "locked" field is one that should NOT be copied from the source row when
 * duplicating.  Common locked fields: primary key (`id`), auto-generated
 * timestamps, computed columns, and any field explicitly marked as locked.
 *
 * Mirrors v2 doDuplicateRow behavior (deletes 'id' before splicing), extended
 * with an opt-in excludeReadOnly mode for columns with editable: false.
 *
 * This module is pure: no store references, no DOM.
 */

import type { TableCrafterColumn } from '../core/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for buildDuplicatePayload. */
export interface DuplicateOptions {
  /**
   * Field keys to exclude from the duplicate.
   * Defaults to ['id'] to match v2 doDuplicateRow semantics (the duplicate
   * gets a fresh index-based identity because its 'id' is dropped).
   */
  lockedFields?: string[] | undefined;
  /**
   * When true, also exclude columns whose `editable` flag is explicitly false.
   * Default: false (v2 parity).
   */
  excludeReadOnly?: boolean | undefined;
}

/** The payload returned by buildDuplicatePayload. */
export interface DuplicatePayload {
  /** The new row object with locked fields omitted, ready to insert. */
  row: Record<string, unknown>;
  /** The field keys that were excluded from the duplicate. */
  excluded: string[];
}

// ---------------------------------------------------------------------------
// buildDuplicatePayload
// ---------------------------------------------------------------------------

/**
 * Build the row payload for a duplicate-row operation.
 *
 * All fields from the source row are shallow-copied, except those that match
 * `lockedFields` or (optionally) read-only columns.
 *
 * @param source   - The row to duplicate.
 * @param columns  - Column config array (consulted when excludeReadOnly is true).
 * @param options  - Exclusion options.
 *
 * @example
 *   buildDuplicatePayload({ id: 5, name: 'Alice', role: 'admin' })
 *   // { row: { name: 'Alice', role: 'admin' }, excluded: ['id'] }
 *
 *   buildDuplicatePayload(
 *     { id: 5, name: 'Alice', createdAt: '2024-01-01' },
 *     [],
 *     { lockedFields: ['id', 'createdAt'] }
 *   )
 *   // { row: { name: 'Alice' }, excluded: ['id', 'createdAt'] }
 */
export function buildDuplicatePayload(
  source: unknown,
  columns: TableCrafterColumn[] = [],
  options: DuplicateOptions = {}
): DuplicatePayload {
  const lockedFields = options.lockedFields ?? ['id'];
  const excludeReadOnly = options.excludeReadOnly ?? false;

  // Build the exclusion set.
  const excluded = new Set<string>(lockedFields);

  if (excludeReadOnly) {
    for (const col of columns) {
      if (col.editable === false) {
        excluded.add(col.key);
      }
    }
  }

  const row: Record<string, unknown> = {};

  if (
    typeof source === 'object' &&
    source !== null &&
    !Array.isArray(source)
  ) {
    for (const [key, value] of Object.entries(
      source as Record<string, unknown>
    )) {
      if (!excluded.has(key)) {
        row[key] = value;
      }
    }
  }

  return { row, excluded: Array.from(excluded) };
}
