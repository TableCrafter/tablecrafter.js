/**
 * permissions/index.ts
 *
 * Role-based permission checks for TableCrafter v3.
 *
 * Three layers:
 *  1. `createPermissions(config)` — stateful factory (per-action role lists,
 *     wildcard '*', ownOnly row-level ownership, per-column advisory).
 *  2. `canEditCell` / `canViewCell` — pure stateless column-level helpers.
 *  3. `isOwnRow` — pure stateless row-ownership predicate.
 *
 * ADVISORY NOTE (issue #338): per-column role checks (`canEditColumn`,
 * `visibleColumns`, `canEditCell`, `canViewCell`) are client-side hints only.
 * The server MUST enforce column-level access as the source of truth.
 *
 * No DOM references anywhere in this module.
 */

import type { TableCrafterColumn, RowId } from '../core/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** List of role strings for one action. '*' grants access to everyone. */
export type ActionRoles = string[];

/**
 * Configuration for a `createPermissions` factory.
 *
 * Per-action role lists default to `['*']` (allow all) when omitted.
 */
export interface PermissionsConfig {
  /**
   * Master switch.  When `false` every `hasPermission` call returns `true`
   * regardless of roles.  Defaults to `true`.
   */
  enabled?: boolean | undefined;
  /** Roles allowed to view rows. */
  view?: ActionRoles | undefined;
  /** Roles allowed to edit rows. */
  edit?: ActionRoles | undefined;
  /** Roles allowed to delete rows. */
  delete?: ActionRoles | undefined;
  /** Roles allowed to create rows. */
  create?: ActionRoles | undefined;
  /**
   * When `true`, row-level actions additionally require the current user to
   * own the row.  Ownership is determined by matching `row.user_id` or
   * `row.created_by` against `currentUser.id`.
   *
   * The ownOnly check is **skipped** when the action's role list contains
   * `'*'` (wildcard already granted full access).
   */
  ownOnly?: boolean | undefined;
}

/** Identity object for the currently authenticated user. */
export interface CurrentUser {
  id: RowId;
  roles: string[];
}

/** Object returned by `createPermissions(config)`. */
export interface PermissionsHandle {
  /** Set (or replace) the currently logged-in user context. */
  setCurrentUser(user: CurrentUser): void;

  /**
   * Return `true` if the current user may perform `action`.
   *
   * - Pass `row` to enable the `ownOnly` ownership check.
   * - Without a current user set, returns `false` for all non-wildcard actions.
   */
  hasPermission(action: string, row?: unknown): boolean;

  /**
   * Filter `rows` to only those the current user is allowed to view.
   *
   * Equivalent to v2's `getPermissionFilteredData()`:
   * - Returns all rows when `enabled` is false or `ownOnly` is false.
   * - Otherwise delegates to `hasPermission('view', row)` per row.
   */
  filterRows(rows: unknown[]): unknown[];

  /**
   * Return `true` if the current user's roles satisfy
   * `column.permission.editableBy`.
   *
   * Advisory client-side check (issue #338). Server enforces truth.
   */
  canEditColumn(column: TableCrafterColumn): boolean;

  /**
   * Return only columns the current user is allowed to view, based on
   * `column.permission.visibleTo`.
   *
   * Advisory client-side check (issue #338). Server enforces truth.
   */
  visibleColumns(columns: TableCrafterColumn[]): TableCrafterColumn[];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a stateful permissions context for one table instance.
 *
 * @example
 * ```ts
 * const perms = createPermissions({
 *   view: ['*'],
 *   edit: ['admin', 'editor'],
 *   delete: ['admin'],
 *   create: ['admin', 'editor'],
 *   ownOnly: true,
 * });
 * perms.setCurrentUser({ id: 42, roles: ['editor'] });
 * perms.hasPermission('edit');             // true
 * perms.hasPermission('delete');           // false
 * perms.hasPermission('edit', row);        // true only if row.user_id === 42
 * perms.filterRows(rows);                  // rows owned by user 42
 * ```
 */
export function createPermissions(config: PermissionsConfig = {}): PermissionsHandle {
  let currentUser: CurrentUser | null = null;

  const enabled = config.enabled !== false;

  /** Return the allowed role list for a given action (view/edit/delete/create). */
  function rolesFor(action: string): ActionRoles {
    switch (action) {
      case 'view':   return config.view   ?? ['*'];
      case 'edit':   return config.edit   ?? ['*'];
      case 'delete': return config.delete ?? ['*'];
      case 'create': return config.create ?? ['*'];
      default:       return [];
    }
  }

  const handle: PermissionsHandle = {
    setCurrentUser(user: CurrentUser): void {
      currentUser = user;
    },

    hasPermission(action: string, row?: unknown): boolean {
      if (!enabled) return true;

      const allowed = rolesFor(action);

      // Wildcard bypasses all further checks including ownOnly.
      if (allowed.includes('*')) return true;

      // No authenticated user → deny all non-wildcard actions.
      if (currentUser === null) return false;

      // Role membership check.
      const hasRole = currentUser.roles.some(r => allowed.includes(r));
      if (!hasRole) return false;

      // ownOnly row-level ownership check (runs only after role passed).
      if (config.ownOnly === true && row !== undefined && row !== null) {
        const entry = row as Record<string, unknown>;
        const uid = currentUser.id;
        return entry['user_id'] === uid || entry['created_by'] === uid;
      }

      return true;
    },

    filterRows(rows: unknown[]): unknown[] {
      if (!enabled || config.ownOnly !== true) return rows;
      return rows.filter(row => handle.hasPermission('view', row));
    },

    canEditColumn(column: TableCrafterColumn): boolean {
      const editableBy = column.permission?.editableBy;
      if (!editableBy || editableBy.length === 0) return true;
      if (editableBy.includes('*')) return true;
      if (currentUser === null) return false;
      return currentUser.roles.some(r => editableBy.includes(r));
    },

    visibleColumns(columns: TableCrafterColumn[]): TableCrafterColumn[] {
      return columns.filter(col => {
        const visibleTo = col.permission?.visibleTo;
        if (!visibleTo || visibleTo.length === 0) return true;
        if (visibleTo.includes('*')) return true;
        if (currentUser === null) return false;
        return currentUser.roles.some(r => visibleTo.includes(r));
      });
    },
  };

  return handle;
}

// ---------------------------------------------------------------------------
// Pure standalone helpers
// ---------------------------------------------------------------------------

/**
 * Pure predicate: can a user with `role` edit `column`?
 *
 * Reads `column.permission.editableBy`.  No current-user state required.
 * Advisory client-side check; server enforces truth (issue #338).
 *
 * @param column - Column definition.
 * @param role   - Single role string to test.  Omit to test anonymous access.
 */
export function canEditCell(
  column: TableCrafterColumn,
  role?: string
): boolean {
  const editableBy = column.permission?.editableBy;
  if (!editableBy || editableBy.length === 0) return true;
  if (editableBy.includes('*')) return true;
  if (role === undefined) return false;
  return editableBy.includes(role);
}

/**
 * Pure predicate: can a user with `role` view `column`?
 *
 * Reads `column.permission.visibleTo`.  No current-user state required.
 * Advisory client-side check; server enforces truth (issue #338).
 *
 * @param column - Column definition.
 * @param role   - Single role string to test.  Omit to test anonymous access.
 */
export function canViewCell(
  column: TableCrafterColumn,
  role?: string
): boolean {
  const visibleTo = column.permission?.visibleTo;
  if (!visibleTo || visibleTo.length === 0) return true;
  if (visibleTo.includes('*')) return true;
  if (role === undefined) return false;
  return visibleTo.includes(role);
}

/**
 * Pure predicate: does `row` belong to `userId`?
 *
 * Checks `row.user_id` and `row.created_by` by default.
 * Pass `ownerField` to check a single custom field instead of both defaults.
 *
 * @param row        - Data row object.
 * @param userId     - The user's ID to match against.
 * @param ownerField - Optional override: single field to check for ownership.
 */
export function isOwnRow(
  row: unknown,
  userId: RowId,
  ownerField?: string
): boolean {
  if (row === null || typeof row !== 'object') return false;
  const entry = row as Record<string, unknown>;
  if (ownerField !== undefined) {
    return entry[ownerField] === userId;
  }
  return entry['user_id'] === userId || entry['created_by'] === userId;
}
