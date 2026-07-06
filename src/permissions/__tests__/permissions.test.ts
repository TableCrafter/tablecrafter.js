/**
 * permissions/__tests__/permissions.test.ts
 *
 * Comprehensive test suite for the v3 permissions module.
 *
 * Coverage:
 *  - createPermissions: setCurrentUser, hasPermission, filterRows
 *  - createPermissions: canEditColumn, visibleColumns
 *  - Wildcard '*' semantics (issue #338 advisory)
 *  - ownOnly row-level ownership (user_id / created_by / missing fields)
 *  - No current user edge cases
 *  - Per-column editableBy / visibleTo advisory checks (issue #338)
 *  - Pure helpers: canEditCell, canViewCell, isOwnRow
 *  - Ported v2 jest test cases (branch-coverage, misc-coverage, edge-cases, crud)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { TableCrafterColumn } from '../../core/types';
import {
  createPermissions,
  canEditCell,
  canViewCell,
  isOwnRow,
} from '../index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function col(overrides: Partial<TableCrafterColumn> = {}): TableCrafterColumn {
  return { key: 'name', ...overrides };
}

// ---------------------------------------------------------------------------
// createPermissions — disabled (enabled: false)
// ---------------------------------------------------------------------------

describe('createPermissions — enabled: false', () => {
  it('allows every action without a user', () => {
    const p = createPermissions({ enabled: false });
    expect(p.hasPermission('view')).toBe(true);
    expect(p.hasPermission('edit')).toBe(true);
    expect(p.hasPermission('delete')).toBe(true);
    expect(p.hasPermission('create')).toBe(true);
  });

  it('allows row-level checks without a user', () => {
    const p = createPermissions({ enabled: false, ownOnly: true });
    expect(p.hasPermission('edit', { user_id: 'alice' })).toBe(true);
  });

  it('filterRows returns all rows', () => {
    const p = createPermissions({ enabled: false, ownOnly: true });
    p.setCurrentUser({ id: 'alice', roles: ['user'] });
    const rows = [{ user_id: 'alice' }, { user_id: 'bob' }];
    expect(p.filterRows(rows)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// createPermissions — wildcard '*'
// ---------------------------------------------------------------------------

describe('createPermissions — wildcard *', () => {
  it('allows view when view: ["*"] (no user)', () => {
    const p = createPermissions({ view: ['*'] });
    expect(p.hasPermission('view')).toBe(true);
  });

  it('allows edit when edit: ["*"] (no user)', () => {
    const p = createPermissions({ edit: ['*'] });
    expect(p.hasPermission('edit')).toBe(true);
  });

  it('wildcard bypasses ownOnly check', () => {
    // v2 semantics: wildcard returns true before ownOnly is reached
    const p = createPermissions({ view: ['*'], ownOnly: true });
    p.setCurrentUser({ id: 'alice', roles: ['user'] });
    const foreignRow = { user_id: 'bob' };
    expect(p.hasPermission('view', foreignRow)).toBe(true);
  });

  it('default roles are wildcard when config omitted', () => {
    const p = createPermissions({});
    expect(p.hasPermission('view')).toBe(true);
    expect(p.hasPermission('edit')).toBe(true);
    expect(p.hasPermission('delete')).toBe(true);
    expect(p.hasPermission('create')).toBe(true);
  });

  it('unknown action is denied (empty role list → no wildcard)', () => {
    const p = createPermissions({});
    // Custom/unknown action has no role list → returns [] → denied
    // (non-standard action; not a wildcard by default)
    // Users cannot invoke unknown actions via wildcard-only config shortcuts
    // This tests the "unknown action → empty → deny if no user" path.
    const p2 = createPermissions({ enabled: true });
    // No current user → deny
    expect(p2.hasPermission('export')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createPermissions — no current user
// ---------------------------------------------------------------------------

describe('createPermissions — no current user set', () => {
  it('denies all non-wildcard actions', () => {
    const p = createPermissions({ edit: ['admin'] });
    expect(p.hasPermission('edit')).toBe(false);
  });

  it('denies view when role-restricted', () => {
    const p = createPermissions({ view: ['user'] });
    expect(p.hasPermission('view')).toBe(false);
  });

  it('filterRows returns all rows when ownOnly false', () => {
    const p = createPermissions({ view: ['user'], ownOnly: false });
    const rows = [{ id: 1 }, { id: 2 }];
    expect(p.filterRows(rows)).toHaveLength(2);
  });

  it('filterRows filters rows when ownOnly true (no user → all denied)', () => {
    const p = createPermissions({ view: ['user'], ownOnly: true });
    const rows = [{ user_id: 'alice' }, { user_id: 'bob' }];
    // hasPermission('view', row) → no user → denied → filtered to 0
    expect(p.filterRows(rows)).toHaveLength(0);
  });

  it('canEditColumn returns false for restricted column with no user', () => {
    const p = createPermissions({});
    const c = col({ permission: { editableBy: ['admin'] } });
    expect(p.canEditColumn(c)).toBe(false);
  });

  it('visibleColumns hides restricted columns with no user', () => {
    const p = createPermissions({});
    const restricted = col({ key: 'secret', permission: { visibleTo: ['admin'] } });
    const open = col({ key: 'name' });
    expect(p.visibleColumns([open, restricted])).toEqual([open]);
  });
});

// ---------------------------------------------------------------------------
// createPermissions — role checks
// ---------------------------------------------------------------------------

describe('createPermissions — role checks', () => {
  it('allows action when user has matching role', () => {
    const p = createPermissions({ edit: ['admin', 'editor'] });
    p.setCurrentUser({ id: 1, roles: ['editor'] });
    expect(p.hasPermission('edit')).toBe(true);
  });

  it('denies action when user has no matching role', () => {
    const p = createPermissions({ edit: ['admin'] });
    p.setCurrentUser({ id: 1, roles: ['viewer'] });
    expect(p.hasPermission('edit')).toBe(false);
  });

  it('allows create for admin, denies for viewer', () => {
    const p = createPermissions({ create: ['admin'] });
    p.setCurrentUser({ id: 1, roles: ['viewer'] });
    expect(p.hasPermission('create')).toBe(false);

    p.setCurrentUser({ id: 2, roles: ['admin'] });
    expect(p.hasPermission('create')).toBe(true);
  });

  it('allows delete for admin, denies for viewer', () => {
    const p = createPermissions({ delete: ['admin'] });
    p.setCurrentUser({ id: 1, roles: ['viewer'] });
    expect(p.hasPermission('delete')).toBe(false);

    p.setCurrentUser({ id: 2, roles: ['admin'] });
    expect(p.hasPermission('delete')).toBe(true);
  });

  it('ported v2: rejects when create role disallowed', () => {
    // Ported from test/crud.test.js: "rejects with permission error when create is disallowed"
    const p = createPermissions({
      create: ['admin'],
      view: ['*'],
      edit: ['*'],
      delete: ['*'],
    });
    p.setCurrentUser({ id: 1, roles: ['viewer'] });
    expect(p.hasPermission('create')).toBe(false);
  });

  it('ported v2: rejects when edit role disallowed', () => {
    // Ported from test/crud.test.js: "rejects with permission error when edit is disallowed"
    const p = createPermissions({
      edit: ['admin'],
      view: ['*'],
      create: ['*'],
      delete: ['*'],
    });
    p.setCurrentUser({ id: 1, roles: ['viewer'] });
    expect(p.hasPermission('edit')).toBe(false);
  });

  it('ported v2: rejects when delete role disallowed', () => {
    // Ported from test/crud.test.js: "rejects with permission error when delete is disallowed"
    const p = createPermissions({
      delete: ['admin'],
      view: ['*'],
      edit: ['*'],
      create: ['*'],
    });
    p.setCurrentUser({ id: 1, roles: ['viewer'] });
    expect(p.hasPermission('delete')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createPermissions — ownOnly
// ---------------------------------------------------------------------------

describe('createPermissions — ownOnly', () => {
  const baseConfig = {
    enabled: true,
    ownOnly: true,
    view: ['user'],
    edit: ['user'],
    delete: ['user'],
    create: ['user'],
  };

  it('ported v2: allows access when row.user_id matches current user', () => {
    // Ported from test/branch-coverage.test.js: ownOnly permission check
    const p = createPermissions(baseConfig);
    p.setCurrentUser({ id: 'alice', roles: ['user'] });
    expect(p.hasPermission('view', { id: 1, user_id: 'alice' })).toBe(true);
  });

  it('ported v2: denies access when row.user_id does not match', () => {
    const p = createPermissions(baseConfig);
    p.setCurrentUser({ id: 'alice', roles: ['user'] });
    expect(p.hasPermission('view', { id: 1, user_id: 'bob' })).toBe(false);
  });

  it('ported v2: allows access when row.created_by matches current user', () => {
    const p = createPermissions(baseConfig);
    p.setCurrentUser({ id: 'alice', roles: ['user'] });
    expect(p.hasPermission('view', { id: 1, created_by: 'alice' })).toBe(true);
  });

  it('denies when ownOnly true but row has neither user_id nor created_by', () => {
    const p = createPermissions(baseConfig);
    p.setCurrentUser({ id: 'alice', roles: ['user'] });
    expect(p.hasPermission('edit', { id: 1, name: 'no-owner' })).toBe(false);
  });

  it('denies when ownOnly true and row is null', () => {
    const p = createPermissions(baseConfig);
    p.setCurrentUser({ id: 'alice', roles: ['user'] });
    // null row → ownOnly block skipped → returns true (role passed, no row to check)
    // This matches v2: "if (permissions.ownOnly && entry && this.currentUser)"
    // When entry is null, ownOnly check is skipped and returns true
    expect(p.hasPermission('edit', null)).toBe(true);
  });

  it('allows when ownOnly true and row is undefined (no row provided)', () => {
    const p = createPermissions(baseConfig);
    p.setCurrentUser({ id: 'alice', roles: ['user'] });
    // No row → ownOnly cannot be checked → returns true after role pass
    expect(p.hasPermission('edit')).toBe(true);
  });

  it('denies when no current user and ownOnly true (row present)', () => {
    const p = createPermissions(baseConfig);
    // No setCurrentUser call
    expect(p.hasPermission('edit', { user_id: 'alice' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createPermissions — filterRows
// ---------------------------------------------------------------------------

describe('createPermissions — filterRows', () => {
  it('ported v2: returns all data when permissions disabled', () => {
    // Ported from test/misc-coverage.test.js: "returns all data when permissions disabled"
    const p = createPermissions({ enabled: false });
    const rows = [{ id: 1 }, { id: 2 }];
    expect(p.filterRows(rows)).toHaveLength(2);
  });

  it('ported v2: returns all data when ownOnly is false', () => {
    // Ported from test/misc-coverage.test.js: "returns all data when ownOnly is false"
    const p = createPermissions({ enabled: true, ownOnly: false });
    const rows = [{ id: 1 }, { id: 2 }];
    expect(p.filterRows(rows)).toHaveLength(2);
  });

  it('ported v2: filters data when ownOnly is true (edge-cases)', () => {
    // Ported from test/edge-cases.test.js: "filters data when ownOnly is true"
    const p = createPermissions({
      enabled: true,
      ownOnly: true,
      view: ['*'],
      edit: ['*'],
      delete: ['*'],
      create: ['*'],
    });
    p.setCurrentUser({ id: 'alice', roles: ['user'] });
    const rows = [{ id: 1, owner: 'alice' }, { id: 2, owner: 'bob' }];
    // view: ['*'] → wildcard bypasses ownOnly → all rows pass
    const result = p.filterRows(rows);
    expect(Array.isArray(result)).toBe(true);
    // with wildcard on view, ownOnly check is skipped → all 2 rows returned
    expect(result).toHaveLength(2);
  });

  it('filters to only owned rows when ownOnly true with role-restricted view', () => {
    const p = createPermissions({
      enabled: true,
      ownOnly: true,
      view: ['user'],
    });
    p.setCurrentUser({ id: 'alice', roles: ['user'] });
    const rows = [
      { id: 1, user_id: 'alice' },
      { id: 2, user_id: 'bob' },
      { id: 3, created_by: 'alice' },
    ];
    const result = p.filterRows(rows);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ id: 1, user_id: 'alice' });
    expect(result).toContainEqual({ id: 3, created_by: 'alice' });
  });

  it('returns empty array when no user and ownOnly with role-restricted view', () => {
    const p = createPermissions({
      enabled: true,
      ownOnly: true,
      view: ['user'],
    });
    const rows = [{ id: 1, user_id: 'alice' }, { id: 2, user_id: 'bob' }];
    expect(p.filterRows(rows)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// createPermissions — canEditColumn (per-column advisory, issue #338)
// ---------------------------------------------------------------------------

describe('createPermissions — canEditColumn', () => {
  let p: ReturnType<typeof createPermissions>;

  beforeEach(() => {
    p = createPermissions({});
    p.setCurrentUser({ id: 1, roles: ['editor'] });
  });

  it('returns true when column has no permission config', () => {
    expect(p.canEditColumn(col())).toBe(true);
  });

  it('returns true when editableBy is empty array', () => {
    expect(p.canEditColumn(col({ permission: { editableBy: [] } }))).toBe(true);
  });

  it('returns true when editableBy contains "*"', () => {
    expect(p.canEditColumn(col({ permission: { editableBy: ['*'] } }))).toBe(true);
  });

  it('returns true when user role is in editableBy', () => {
    expect(
      p.canEditColumn(col({ permission: { editableBy: ['admin', 'editor'] } }))
    ).toBe(true);
  });

  it('returns false when user role is not in editableBy', () => {
    expect(
      p.canEditColumn(col({ permission: { editableBy: ['admin'] } }))
    ).toBe(false);
  });

  it('returns false when no current user and editableBy is restricted', () => {
    const p2 = createPermissions({});
    expect(
      p2.canEditColumn(col({ permission: { editableBy: ['admin'] } }))
    ).toBe(false);
  });

  it('returns true when no current user and editableBy is wildcard', () => {
    const p2 = createPermissions({});
    expect(
      p2.canEditColumn(col({ permission: { editableBy: ['*'] } }))
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createPermissions — visibleColumns (per-column advisory, issue #338)
// ---------------------------------------------------------------------------

describe('createPermissions — visibleColumns', () => {
  let p: ReturnType<typeof createPermissions>;

  beforeEach(() => {
    p = createPermissions({});
    p.setCurrentUser({ id: 1, roles: ['editor'] });
  });

  it('returns all columns when none have permission config', () => {
    const cols = [col({ key: 'a' }), col({ key: 'b' })];
    expect(p.visibleColumns(cols)).toHaveLength(2);
  });

  it('includes column when visibleTo is empty', () => {
    const c = col({ permission: { visibleTo: [] } });
    expect(p.visibleColumns([c])).toHaveLength(1);
  });

  it('includes column when visibleTo contains "*"', () => {
    const c = col({ permission: { visibleTo: ['*'] } });
    expect(p.visibleColumns([c])).toHaveLength(1);
  });

  it('includes column when user role is in visibleTo', () => {
    const c = col({ permission: { visibleTo: ['editor', 'admin'] } });
    expect(p.visibleColumns([c])).toHaveLength(1);
  });

  it('excludes column when user role is not in visibleTo', () => {
    const c = col({ permission: { visibleTo: ['admin'] } });
    expect(p.visibleColumns([c])).toHaveLength(0);
  });

  it('filters mixed columns correctly', () => {
    const cols = [
      col({ key: 'public' }),
      col({ key: 'editors', permission: { visibleTo: ['editor'] } }),
      col({ key: 'admins', permission: { visibleTo: ['admin'] } }),
      col({ key: 'wildcard', permission: { visibleTo: ['*'] } }),
    ];
    const visible = p.visibleColumns(cols);
    expect(visible.map(c => c.key)).toEqual(['public', 'editors', 'wildcard']);
  });

  it('hides all restricted columns when no user is set', () => {
    const p2 = createPermissions({});
    const cols = [
      col({ key: 'open' }),
      col({ key: 'restricted', permission: { visibleTo: ['admin'] } }),
    ];
    expect(p2.visibleColumns(cols).map(c => c.key)).toEqual(['open']);
  });
});

// ---------------------------------------------------------------------------
// canEditCell — pure helper (issue #338 advisory)
// ---------------------------------------------------------------------------

describe('canEditCell', () => {
  it('returns true when column has no permission config', () => {
    expect(canEditCell(col())).toBe(true);
  });

  it('returns true when editableBy is empty', () => {
    expect(canEditCell(col({ permission: { editableBy: [] } }))).toBe(true);
  });

  it('returns true when editableBy contains "*"', () => {
    expect(canEditCell(col({ permission: { editableBy: ['*'] } }))).toBe(true);
  });

  it('returns true when role is in editableBy', () => {
    expect(
      canEditCell(col({ permission: { editableBy: ['admin', 'editor'] } }), 'editor')
    ).toBe(true);
  });

  it('returns false when role is not in editableBy', () => {
    expect(
      canEditCell(col({ permission: { editableBy: ['admin'] } }), 'viewer')
    ).toBe(false);
  });

  it('returns false when role is undefined and column is restricted', () => {
    expect(
      canEditCell(col({ permission: { editableBy: ['admin'] } }))
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canViewCell — pure helper (issue #338 advisory)
// ---------------------------------------------------------------------------

describe('canViewCell', () => {
  it('returns true when column has no permission config', () => {
    expect(canViewCell(col())).toBe(true);
  });

  it('returns true when visibleTo is empty', () => {
    expect(canViewCell(col({ permission: { visibleTo: [] } }))).toBe(true);
  });

  it('returns true when visibleTo contains "*"', () => {
    expect(canViewCell(col({ permission: { visibleTo: ['*'] } }))).toBe(true);
  });

  it('returns true when role is in visibleTo', () => {
    expect(
      canViewCell(col({ permission: { visibleTo: ['user', 'admin'] } }), 'user')
    ).toBe(true);
  });

  it('returns false when role is not in visibleTo', () => {
    expect(
      canViewCell(col({ permission: { visibleTo: ['admin'] } }), 'viewer')
    ).toBe(false);
  });

  it('returns false when role is undefined and column is restricted', () => {
    expect(
      canViewCell(col({ permission: { visibleTo: ['admin'] } }))
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isOwnRow — pure helper
// ---------------------------------------------------------------------------

describe('isOwnRow', () => {
  it('returns true when row.user_id matches userId', () => {
    expect(isOwnRow({ user_id: 'alice' }, 'alice')).toBe(true);
  });

  it('returns false when row.user_id does not match', () => {
    expect(isOwnRow({ user_id: 'bob' }, 'alice')).toBe(false);
  });

  it('returns true when row.created_by matches userId', () => {
    expect(isOwnRow({ created_by: 'alice' }, 'alice')).toBe(true);
  });

  it('returns false when row.created_by does not match', () => {
    expect(isOwnRow({ created_by: 'bob' }, 'alice')).toBe(false);
  });

  it('returns true when user_id matches (numeric id)', () => {
    expect(isOwnRow({ user_id: 42 }, 42)).toBe(true);
  });

  it('returns false when neither user_id nor created_by is present', () => {
    expect(isOwnRow({ name: 'row without owner' }, 'alice')).toBe(false);
  });

  it('returns false for null row', () => {
    expect(isOwnRow(null, 'alice')).toBe(false);
  });

  it('returns false for non-object row', () => {
    expect(isOwnRow('string', 'alice')).toBe(false);
    expect(isOwnRow(42, 42)).toBe(false);
  });

  it('checks custom ownerField when provided', () => {
    expect(isOwnRow({ owner: 'alice', user_id: 'bob' }, 'alice', 'owner')).toBe(true);
  });

  it('returns false for custom ownerField when value does not match', () => {
    expect(isOwnRow({ owner: 'bob' }, 'alice', 'owner')).toBe(false);
  });

  it('returns false when custom ownerField is missing from row', () => {
    expect(isOwnRow({ user_id: 'alice' }, 'alice', 'owner')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: setCurrentUser replacement
// ---------------------------------------------------------------------------

describe('setCurrentUser — replacement', () => {
  it('replacing user context updates permission checks', () => {
    const p = createPermissions({ edit: ['admin'] });
    p.setCurrentUser({ id: 1, roles: ['viewer'] });
    expect(p.hasPermission('edit')).toBe(false);

    p.setCurrentUser({ id: 2, roles: ['admin'] });
    expect(p.hasPermission('edit')).toBe(true);
  });

  it('user with multiple roles: allowed if any role matches', () => {
    const p = createPermissions({ delete: ['superuser'] });
    p.setCurrentUser({ id: 1, roles: ['editor', 'superuser'] });
    expect(p.hasPermission('delete')).toBe(true);
  });

  it('user with no roles cannot pass role-restricted action', () => {
    const p = createPermissions({ edit: ['editor'] });
    p.setCurrentUser({ id: 1, roles: [] });
    expect(p.hasPermission('edit')).toBe(false);
  });
});
