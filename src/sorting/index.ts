/**
 * sorting/index.ts
 *
 * Multi-column sort engine for TableCrafter v3.
 *
 * Pure functions: no DOM access, no side effects, no store imports.
 * Consumed by the renderer (getSortBadges) and optionally wired into
 * the store via store.setComparator() for type-aware column comparisons.
 *
 * Key design decisions (see docs/RFC-v3-amendments.md):
 * - sort state is SortState[] (ordered priority list), not SortState | null
 * - null / undefined values always sort last regardless of direction
 * - numeric strings, ISO date strings, and booleans each get type-aware compare
 * - localeCompare is used for string comparison (locale-aware)
 * - composite comparator applies original-index tie-break for stability
 */

import type {
  TableState,
  SortState,
  SortDirection,
  SortPayload,
  SortOptions,
} from '../core/types';

import type { Comparator } from '../core/state';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** ISO 8601 date prefix: YYYY-MM-DD (date-only or datetime). */
const _ISO = /^\d{4}-\d{2}-\d{2}/;

/** Three-way numeric compare. */
function _num(x: number, y: number): number {
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Read a cell value off an arbitrary row shape. */
function _cell(row: unknown, column: string): unknown {
  return (row as Record<string, unknown> | null | undefined)?.[column];
}

/**
 * Type-aware comparison of two non-null, non-undefined values.
 * Returns negative / zero / positive for ascending order.
 * Handles: booleans, numbers (and numeric strings), ISO date strings,
 * then general strings via localeCompare.
 */
function _cmpNonNull(a: unknown, b: unknown, locale?: string | undefined): number {
  if (a === b) return 0;
  // Booleans: false < true
  if (typeof a === 'boolean' && typeof b === 'boolean') return a ? 1 : -1;
  // Both numbers
  if (typeof a === 'number' && typeof b === 'number') return _num(a, b);
  // String path: convert both to string for numeric, date, and locale compare
  const sa = String(a);
  const sb = String(b);
  const na = Number(sa);
  const nb = Number(sb);
  // Numeric strings (includes "10" > "9" fix); NaN self-compare check
  if (sa.trim() && sb.trim() && na === na && nb === nb) return _num(na, nb);
  // ISO date strings
  if (_ISO.test(sa) && _ISO.test(sb)) {
    const da = Date.parse(sa);
    const db = Date.parse(sb);
    if (da === da && db === db) return _num(da, db);
  }
  return sa.localeCompare(sb, locale);
}

// ---------------------------------------------------------------------------
// Public comparison API
// ---------------------------------------------------------------------------

/**
 * Type-aware comparison of two values with explicit direction.
 *
 * - null / undefined values always sort last regardless of direction
 * - Numeric strings, ISO date strings, and booleans each receive appropriate
 *   type coercion before comparison
 * - Non-null strings are compared with localeCompare (locale-aware)
 *
 * Returns a negative number when `a` should appear before `b` in the
 * sorted output, positive when after, zero when equal.
 */
export function compareValues(
  a: unknown,
  b: unknown,
  direction: SortDirection,
  locale?: string | undefined
): number {
  // Null/undefined always last regardless of direction.
  const an = a == null;
  const bn = b == null;
  if (an || bn) return an && bn ? 0 : an ? 1 : -1;
  const cmp = _cmpNonNull(a, b, locale);
  // `cmp &&` guard keeps equal results at exactly 0 (never -0).
  return cmp && direction === 'desc' ? -cmp : cmp;
}

// ---------------------------------------------------------------------------
// Sort-state derivation
// ---------------------------------------------------------------------------

/**
 * Derive the next SortState[] from a current sort list and a new request.
 *
 * Without append (default):
 *   - Single matching key without explicit direction: toggles (asc ↔ desc).
 *   - Otherwise: replaces the list with a single key.
 *
 * With append:
 *   - Existing key: toggle or apply the explicit direction in-place.
 *   - New key: push to the end of the priority list.
 *
 * Matches v2 `sort(field, options)` semantics.
 */
export function nextSortState(
  current: SortState[],
  column: string,
  direction?: SortDirection | undefined,
  opts?: SortOptions | undefined
): SortState[] {
  if (opts?.append === true) {
    const idx = current.findIndex((s) => s.column === column);
    if (idx >= 0) {
      const prev = current[idx]!.direction;
      return current.map((s, i) =>
        i === idx
          ? { column: s.column, direction: direction ?? (prev === 'asc' ? 'desc' : 'asc') }
          : s
      );
    }
    return [...current, { column, direction: direction ?? 'asc' }];
  }
  const primary = current[0];
  if (!direction && primary && primary.column === column && current.length === 1) {
    return [{ column, direction: primary.direction === 'asc' ? 'desc' : 'asc' }];
  }
  return [{ column, direction: direction ?? 'asc' }];
}

// ---------------------------------------------------------------------------
// Composite comparator factory (module-private)
// ---------------------------------------------------------------------------

function _composite(
  sortKeys: SortState[],
  comparators: ReadonlyMap<string, Comparator>,
  locale?: string | undefined
): (a: { row: unknown; idx: number }, b: { row: unknown; idx: number }) => number {
  return (a, b) => {
    for (const key of sortKeys) {
      const av = _cell(a.row, key.column);
      const bv = _cell(b.row, key.column);
      const custom = comparators.get(key.column);
      let r: number;
      if (custom) {
        const base = custom(av, bv, a.row, b.row);
        r = key.direction === 'desc' ? -base : base;
      } else {
        r = compareValues(av, bv, key.direction, locale);
      }
      if (r !== 0) return r;
    }
    return a.idx - b.idx; // stable tie-break
  };
}

// ---------------------------------------------------------------------------
// sortRows -- pure sort over a row array
// ---------------------------------------------------------------------------

/**
 * Sort a row array by the given sort keys using type-aware comparisons.
 *
 * Returns a new array; does not mutate `rows`.
 *
 * @param rows        The row array to sort (typically state.filteredRows).
 * @param sortKeys    Ordered sort priority list.
 * @param comparators Per-column custom Comparator map (direction-agnostic).
 * @param locale      Optional BCP 47 locale string for string collation.
 */
export function sortRows(
  rows: unknown[],
  sortKeys: SortState[],
  comparators?: ReadonlyMap<string, Comparator> | undefined,
  locale?: string | undefined
): unknown[] {
  if (sortKeys.length === 0) return rows.slice();
  const cmp = _composite(sortKeys, comparators ?? new Map(), locale);
  const indexed = rows.map((row, idx) => ({ row, idx }));
  indexed.sort(cmp);
  return indexed.map((e) => e.row);
}

// ---------------------------------------------------------------------------
// applySort -- pure (state, action) => partial state
// ---------------------------------------------------------------------------

/**
 * Pure sort reducer: given full table state and a SORT action payload,
 * returns the updated sort, sortedRows, and displayRows slices.
 */
export function applySort(
  state: TableState,
  payload: SortPayload
): Pick<TableState, 'sort' | 'sortedRows' | 'displayRows'> {
  const newSort = nextSortState(state.sort, payload.column, payload.direction, payload.opts);
  const sorted = sortRows(state.filteredRows, newSort);
  const start = (state.page - 1) * state.pageSize;
  const displayRows =
    state.pageSize <= 0 ? sorted : sorted.slice(start, start + state.pageSize);
  return { sort: newSort, sortedRows: sorted, displayRows };
}

// ---------------------------------------------------------------------------
// getSortBadges -- renderer helper
// ---------------------------------------------------------------------------

/**
 * Return a map of column key → sort priority number (1-based) for all
 * currently active sort keys.  Columns not in the sort list are absent.
 *
 * Usage in the renderer:
 *   const badges = getSortBadges(state);
 *   // badges['name'] === 1, badges['age'] === 2  (for a two-key sort)
 */
export function getSortBadges(state: TableState): Record<string, number> {
  const out: Record<string, number> = {};
  state.sort.forEach((k, i) => {
    out[k.column] = i + 1;
  });
  return out;
}
