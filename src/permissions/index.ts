/**
 * permissions/index.ts
 *
 * Role-based permission checks for editable, ownOnly, and per-column advisories.
 * Permissions are enforced at the store level and surfaced as read-only cell
 * state to the renderer.  No DOM references.
 * Phase 0: typed stub.
 */

import type { TableCrafterColumn, RowId } from '../core/types';

/**
 * Return true if the current user role may edit the given column cell.
 */
export function canEditCell(
  _column: TableCrafterColumn,
  _role?: string
): boolean {
  throw new Error('canEditCell: not implemented -- Phase 2');
}

/**
 * Return true if the current user may view the given column cell.
 */
export function canViewCell(
  _column: TableCrafterColumn,
  _role?: string
): boolean {
  throw new Error('canViewCell: not implemented -- Phase 2');
}

/**
 * Return true if the given row belongs to the current user.
 * Used to implement the "ownOnly" editing restriction.
 */
export function isOwnRow(
  _row: unknown,
  _userId: RowId,
  _ownerField?: string
): boolean {
  throw new Error('isOwnRow: not implemented -- Phase 2');
}
