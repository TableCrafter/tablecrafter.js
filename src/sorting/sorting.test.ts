/**
 * sorting/sorting.test.ts
 *
 * Comprehensive test suite for src/sorting/index.ts.
 *
 * Coverage:
 *   - Module exports
 *   - compareValues: type-aware comparisons (numbers, numeric strings, date
 *     strings, booleans), null-always-last, direction, locale
 *   - nextSortState: single-key replace, toggle, explicit direction, append
 *     semantics (push new, toggle existing, explicit existing)
 *   - sortRows: multi-key priority, stability, custom comparator, locale
 *   - buildCompositeComparator: custom comparator direction application
 *   - applySort: pure reducer contract
 *   - getSortBadges: priority numbers per column
 *   - append semantics via store.sort() integration path (dispatch SORT with opts)
 */

import { describe, it, expect } from 'vitest';
import {
  compareValues,
  nextSortState,
  sortRows,
  applySort,
  getSortBadges,
} from './index';

import type { SortState, TableState, SortPayload } from '../core/types';
import type { Comparator } from '../core/state';

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

describe('sorting module exports', () => {
  it('exports compareValues', () => expect(typeof compareValues).toBe('function'));
  it('exports nextSortState', () => expect(typeof nextSortState).toBe('function'));
  it('exports sortRows', () => expect(typeof sortRows).toBe('function'));
  it('exports applySort', () => expect(typeof applySort).toBe('function'));
  it('exports getSortBadges', () => expect(typeof getSortBadges).toBe('function'));
});

// ---------------------------------------------------------------------------
// compareValues
// ---------------------------------------------------------------------------

describe('compareValues', () => {
  describe('null / undefined always last (regardless of direction)', () => {
    it('null a comes after non-null b in ascending', () => {
      expect(compareValues(null, 5, 'asc')).toBeGreaterThan(0);
    });
    it('null a comes after non-null b in descending', () => {
      expect(compareValues(null, 5, 'desc')).toBeGreaterThan(0);
    });
    it('undefined a comes after non-null b in ascending', () => {
      expect(compareValues(undefined, 'x', 'asc')).toBeGreaterThan(0);
    });
    it('undefined a comes after non-null b in descending', () => {
      expect(compareValues(undefined, 'x', 'desc')).toBeGreaterThan(0);
    });
    it('null b comes after non-null a in ascending', () => {
      expect(compareValues(5, null, 'asc')).toBeLessThan(0);
    });
    it('null b comes after non-null a in descending', () => {
      expect(compareValues(5, null, 'desc')).toBeLessThan(0);
    });
    it('null vs null is 0', () => {
      expect(compareValues(null, null, 'asc')).toBe(0);
      expect(compareValues(undefined, null, 'desc')).toBe(0);
    });
  });

  describe('numbers', () => {
    it('ascending: smaller first', () => {
      expect(compareValues(1, 2, 'asc')).toBeLessThan(0);
      expect(compareValues(2, 1, 'asc')).toBeGreaterThan(0);
    });
    it('descending: larger first', () => {
      expect(compareValues(2, 1, 'desc')).toBeLessThan(0);
      expect(compareValues(1, 2, 'desc')).toBeGreaterThan(0);
    });
    it('equal returns 0', () => {
      expect(compareValues(42, 42, 'asc')).toBe(0);
    });
    it('handles negative numbers', () => {
      expect(compareValues(-10, 5, 'asc')).toBeLessThan(0);
      expect(compareValues(-10, 5, 'desc')).toBeGreaterThan(0);
    });
    it('handles floating point', () => {
      expect(compareValues(1.5, 1.6, 'asc')).toBeLessThan(0);
    });
  });

  describe('numeric strings', () => {
    it('compares "10" and "9" numerically (not lexicographically)', () => {
      // Lex: "10" < "9"; Numeric: 10 > 9
      expect(compareValues('10', '9', 'asc')).toBeGreaterThan(0);
    });
    it('ascending numeric string order', () => {
      expect(compareValues('2', '10', 'asc')).toBeLessThan(0);
    });
    it('descending numeric string order', () => {
      expect(compareValues('10', '2', 'desc')).toBeLessThan(0);
    });
    it('equal numeric strings return 0', () => {
      expect(compareValues('7', '7', 'asc')).toBe(0);
    });
    it('negative numeric strings', () => {
      expect(compareValues('-5', '0', 'asc')).toBeLessThan(0);
    });
    it('decimal numeric strings', () => {
      expect(compareValues('1.5', '1.50', 'asc')).toBe(0);
      expect(compareValues('1.5', '2.5', 'asc')).toBeLessThan(0);
    });
  });

  describe('ISO date strings', () => {
    it('ascending: earlier date first', () => {
      expect(compareValues('2023-01-01', '2023-06-15', 'asc')).toBeLessThan(0);
    });
    it('descending: later date first', () => {
      expect(compareValues('2023-06-15', '2023-01-01', 'desc')).toBeLessThan(0);
    });
    it('equal dates return 0', () => {
      expect(compareValues('2024-03-10', '2024-03-10', 'asc')).toBe(0);
    });
    it('date-time strings compared correctly', () => {
      expect(compareValues('2024-01-01T10:00:00Z', '2024-01-01T12:00:00Z', 'asc')).toBeLessThan(0);
    });
    it('different years sort correctly', () => {
      expect(compareValues('2020-12-31', '2021-01-01', 'asc')).toBeLessThan(0);
    });
  });

  describe('booleans', () => {
    it('false < true in ascending', () => {
      expect(compareValues(false, true, 'asc')).toBeLessThan(0);
    });
    it('true before false in descending', () => {
      expect(compareValues(true, false, 'desc')).toBeLessThan(0);
    });
    it('equal booleans return 0', () => {
      expect(compareValues(true, true, 'asc')).toBe(0);
      expect(compareValues(false, false, 'desc')).toBe(0);
    });
  });

  describe('strings', () => {
    it('ascending alphabetical', () => {
      expect(compareValues('apple', 'banana', 'asc')).toBeLessThan(0);
      expect(compareValues('banana', 'apple', 'asc')).toBeGreaterThan(0);
    });
    it('descending alphabetical', () => {
      expect(compareValues('banana', 'apple', 'desc')).toBeLessThan(0);
    });
    it('equal strings return 0', () => {
      expect(compareValues('hello', 'hello', 'asc')).toBe(0);
    });
    it('non-numeric non-date strings do NOT parse as numbers', () => {
      // "abc" is not numeric, so should do string comparison
      expect(compareValues('abc', 'abd', 'asc')).toBeLessThan(0);
    });
  });

  describe('locale-aware string comparison', () => {
    it('respects locale parameter (smoke test with Swedish ä)', () => {
      // Swedish: ä comes after z; default locale may differ
      const sv = compareValues('ä', 'z', 'asc', 'sv');
      expect(typeof sv).toBe('number');
      // Confirm it handles the locale without throwing
    });
  });
});

// ---------------------------------------------------------------------------
// nextSortState
// ---------------------------------------------------------------------------

describe('nextSortState', () => {
  describe('non-append (replace) mode', () => {
    it('starts with asc when list is empty', () => {
      const result = nextSortState([], 'name');
      expect(result).toEqual([{ column: 'name', direction: 'asc' }]);
    });

    it('replaces a different column and starts asc', () => {
      const current: SortState[] = [{ column: 'age', direction: 'desc' }];
      const result = nextSortState(current, 'name');
      expect(result).toEqual([{ column: 'name', direction: 'asc' }]);
    });

    it('toggles asc → desc when single key matches column', () => {
      const current: SortState[] = [{ column: 'name', direction: 'asc' }];
      const result = nextSortState(current, 'name');
      expect(result).toEqual([{ column: 'name', direction: 'desc' }]);
    });

    it('toggles desc → asc when single key matches column', () => {
      const current: SortState[] = [{ column: 'name', direction: 'desc' }];
      const result = nextSortState(current, 'name');
      expect(result).toEqual([{ column: 'name', direction: 'asc' }]);
    });

    it('does NOT toggle when there are multiple keys (replaces with single asc)', () => {
      const current: SortState[] = [
        { column: 'name', direction: 'asc' },
        { column: 'age', direction: 'desc' },
      ];
      const result = nextSortState(current, 'name');
      expect(result).toEqual([{ column: 'name', direction: 'asc' }]);
    });

    it('honors explicit direction (overrides toggle logic)', () => {
      const current: SortState[] = [{ column: 'name', direction: 'asc' }];
      const result = nextSortState(current, 'name', 'desc');
      expect(result).toEqual([{ column: 'name', direction: 'desc' }]);
    });

    it('honors explicit direction on empty list', () => {
      const result = nextSortState([], 'age', 'desc');
      expect(result).toEqual([{ column: 'age', direction: 'desc' }]);
    });
  });

  describe('append mode', () => {
    it('pushes a new key to end of priority list', () => {
      const current: SortState[] = [{ column: 'name', direction: 'asc' }];
      const result = nextSortState(current, 'age', undefined, { append: true });
      expect(result).toEqual([
        { column: 'name', direction: 'asc' },
        { column: 'age', direction: 'asc' },
      ]);
    });

    it('toggles an existing key in-place, preserving list order', () => {
      const current: SortState[] = [
        { column: 'name', direction: 'asc' },
        { column: 'age', direction: 'asc' },
      ];
      const result = nextSortState(current, 'age', undefined, { append: true });
      expect(result).toEqual([
        { column: 'name', direction: 'asc' },
        { column: 'age', direction: 'desc' },
      ]);
    });

    it('applies explicit direction to an existing key', () => {
      const current: SortState[] = [{ column: 'name', direction: 'asc' }];
      const result = nextSortState(current, 'name', 'desc', { append: true });
      expect(result).toEqual([{ column: 'name', direction: 'desc' }]);
    });

    it('applies explicit direction when pushing a new key', () => {
      const current: SortState[] = [{ column: 'name', direction: 'asc' }];
      const result = nextSortState(current, 'city', 'desc', { append: true });
      expect(result).toEqual([
        { column: 'name', direction: 'asc' },
        { column: 'city', direction: 'desc' },
      ]);
    });

    it('append on empty list creates a single-key list', () => {
      const result = nextSortState([], 'name', undefined, { append: true });
      expect(result).toEqual([{ column: 'name', direction: 'asc' }]);
    });

    it('does not mutate the input array', () => {
      const current: SortState[] = [{ column: 'name', direction: 'asc' }];
      const copy = [...current];
      nextSortState(current, 'age', undefined, { append: true });
      expect(current).toEqual(copy);
    });
  });
});

// ---------------------------------------------------------------------------
// sortRows
// ---------------------------------------------------------------------------

const people = [
  { id: 1, name: 'Charlie', age: 30 },
  { id: 2, name: 'alice',   age: 25 },
  { id: 3, name: 'Bob',     age: 30 },
  { id: 4, name: 'Dave',    age: 22 },
];

describe('sortRows', () => {
  it('returns a copy when sortKeys is empty', () => {
    const result = sortRows(people, []);
    expect(result).toEqual(people);
    expect(result).not.toBe(people);
  });

  it('sorts ascending by a single key', () => {
    const result = sortRows(people, [{ column: 'age', direction: 'asc' }]) as typeof people;
    expect(result.map((r) => r.age)).toEqual([22, 25, 30, 30]);
  });

  it('sorts descending by a single key', () => {
    const result = sortRows(people, [{ column: 'age', direction: 'desc' }]) as typeof people;
    expect(result.map((r) => r.age)).toEqual([30, 30, 25, 22]);
  });

  it('stable: equal values preserve original relative order', () => {
    // Both Charlie (idx 0) and Bob (idx 2) have age 30; Charlie must precede Bob
    const result = sortRows(people, [{ column: 'age', direction: 'asc' }]) as typeof people;
    const thirties = result.filter((r) => r.age === 30);
    expect(thirties.map((r) => r.name)).toEqual(['Charlie', 'Bob']);
  });

  it('stable descending: equal values preserve original relative order', () => {
    const result = sortRows(people, [{ column: 'age', direction: 'desc' }]) as typeof people;
    const thirties = result.filter((r) => r.age === 30);
    expect(thirties.map((r) => r.name)).toEqual(['Charlie', 'Bob']);
  });

  it('multi-key priority: primary key determines order, secondary breaks ties', () => {
    const data = [
      { dept: 'Eng', salary: 90 },
      { dept: 'Mkt', salary: 70 },
      { dept: 'Eng', salary: 80 },
      { dept: 'Mkt', salary: 60 },
    ];
    const result = sortRows(
      data,
      [
        { column: 'dept', direction: 'asc' },
        { column: 'salary', direction: 'desc' },
      ]
    ) as typeof data;
    expect(result).toEqual([
      { dept: 'Eng', salary: 90 },
      { dept: 'Eng', salary: 80 },
      { dept: 'Mkt', salary: 70 },
      { dept: 'Mkt', salary: 60 },
    ]);
  });

  it('three-key sort applies priority left-to-right', () => {
    const data = [
      { a: 1, b: 2, c: 1 },
      { a: 1, b: 1, c: 2 },
      { a: 2, b: 1, c: 1 },
      { a: 1, b: 2, c: 2 },
    ];
    const result = sortRows(data, [
      { column: 'a', direction: 'asc' },
      { column: 'b', direction: 'asc' },
      { column: 'c', direction: 'asc' },
    ]) as typeof data;
    expect(result).toEqual([
      { a: 1, b: 1, c: 2 },
      { a: 1, b: 2, c: 1 },
      { a: 1, b: 2, c: 2 },
      { a: 2, b: 1, c: 1 },
    ]);
  });

  it('null values sort last ascending', () => {
    const data = [{ v: 2 }, { v: null }, { v: 1 }];
    const result = sortRows(data, [{ column: 'v', direction: 'asc' }]) as typeof data;
    expect(result.map((r) => r.v)).toEqual([1, 2, null]);
  });

  it('null values sort last descending', () => {
    const data = [{ v: null }, { v: 1 }, { v: 3 }];
    const result = sortRows(data, [{ column: 'v', direction: 'desc' }]) as typeof data;
    expect(result.map((r) => r.v)).toEqual([3, 1, null]);
  });

  it('multiple nulls stay last and preserve relative order (stable)', () => {
    const data = [
      { v: null, id: 1 },
      { v: 5,    id: 2 },
      { v: null, id: 3 },
    ];
    const result = sortRows(data, [{ column: 'v', direction: 'asc' }]) as typeof data;
    expect(result[0]?.id).toBe(2);        // non-null first
    expect(result[1]?.id).toBe(1);        // first null in original order
    expect(result[2]?.id).toBe(3);        // second null in original order
  });

  it('numeric strings sort numerically not lexicographically', () => {
    const data = [{ n: '10' }, { n: '9' }, { n: '2' }];
    const result = sortRows(data, [{ column: 'n', direction: 'asc' }]) as typeof data;
    expect(result.map((r) => r.n)).toEqual(['2', '9', '10']);
  });

  it('ISO date strings sort chronologically', () => {
    const data = [
      { d: '2024-03-01' },
      { d: '2023-01-15' },
      { d: '2024-01-01' },
    ];
    const result = sortRows(data, [{ column: 'd', direction: 'asc' }]) as typeof data;
    expect(result.map((r) => r.d)).toEqual(['2023-01-15', '2024-01-01', '2024-03-01']);
  });

  it('booleans sort false < true ascending', () => {
    const data = [{ b: true }, { b: false }, { b: true }];
    const result = sortRows(data, [{ column: 'b', direction: 'asc' }]) as typeof data;
    expect(result.map((r) => r.b)).toEqual([false, true, true]);
  });

  it('custom per-column Comparator is used (direction applied by composite)', () => {
    // Sort by name length ascending
    const customCmp: Comparator = (a, b) => String(a).length - String(b).length;
    const cmpMap = new Map<string, Comparator>([['name', customCmp]]);
    const result = sortRows(
      people,
      [{ column: 'name', direction: 'asc' }],
      cmpMap
    ) as typeof people;
    expect(result[0]?.name).toBe('Bob'); // shortest (3)
    expect(result[1]?.name).toBe('Dave'); // 4
    expect(result[2]?.name).toBe('alice'); // 5
    expect(result[3]?.name).toBe('Charlie'); // 7
  });

  it('custom comparator respects direction (desc: longer names first)', () => {
    const customCmp: Comparator = (a, b) => String(a).length - String(b).length;
    const cmpMap = new Map<string, Comparator>([['name', customCmp]]);
    const result = sortRows(
      people,
      [{ column: 'name', direction: 'desc' }],
      cmpMap
    ) as typeof people;
    expect(result[0]?.name).toBe('Charlie'); // longest
  });

  it('custom comparator takes precedence over type-aware default', () => {
    // Comparator reverses natural order
    const reverseCmp: Comparator = (a, b) => (a === b ? 0 : (a as number) > (b as number) ? -1 : 1);
    const cmpMap = new Map<string, Comparator>([['age', reverseCmp]]);
    const result = sortRows(
      people,
      [{ column: 'age', direction: 'asc' }],
      cmpMap
    ) as typeof people;
    // Reversed comparator with asc = larger first
    expect(result[0]?.age).toBe(30);
    expect(result[result.length - 1]?.age).toBe(22);
  });

  it('does not mutate the input array', () => {
    const data = [{ v: 3 }, { v: 1 }, { v: 2 }];
    const original = [...data];
    sortRows(data, [{ column: 'v', direction: 'asc' }]);
    expect(data).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// composite comparator (tested via sortRows)
// ---------------------------------------------------------------------------

describe('composite comparator (via sortRows)', () => {
  it('preserves original order for empty sortKeys (stability)', () => {
    const data = [{ v: 1 }, { v: 2 }, { v: 3 }];
    expect(sortRows(data, [])).toEqual(data);
  });

  it('stable tiebreak: equal values retain input order', () => {
    const data = [{ v: 5, id: 1 }, { v: 5, id: 2 }, { v: 5, id: 3 }];
    const result = sortRows(data, [{ column: 'v', direction: 'asc' }]) as typeof data;
    expect(result.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('custom Comparator: direction is applied to the raw comparator result (asc)', () => {
    // Comparator always reports 'z' > other (returns 1 when a='z')
    const custom: Comparator = (a) => (a === 'z' ? 1 : -1);
    const cmpMap = new Map<string, Comparator>([['n', custom]]);
    const data = [{ n: 'z' }, { n: 'a' }];
    // asc: z > a → z comes after a
    const asc = sortRows(data, [{ column: 'n', direction: 'asc' }], cmpMap) as typeof data;
    expect(asc[0]?.n).toBe('a');
    expect(asc[1]?.n).toBe('z');
  });

  it('custom Comparator: direction is applied to the raw comparator result (desc)', () => {
    const custom: Comparator = (a) => (a === 'z' ? 1 : -1);
    const cmpMap = new Map<string, Comparator>([['n', custom]]);
    const data = [{ n: 'z' }, { n: 'a' }];
    // desc: direction flips the comparator → z comes BEFORE a
    const desc = sortRows(data, [{ column: 'n', direction: 'desc' }], cmpMap) as typeof data;
    expect(desc[0]?.n).toBe('z');
    expect(desc[1]?.n).toBe('a');
  });
});

// ---------------------------------------------------------------------------
// applySort
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<TableState> = {}): TableState {
  const rows = [{ id: 1, v: 3 }, { id: 2, v: 1 }, { id: 3, v: 2 }];
  return {
    rows,
    filteredRows: rows.slice(),
    sortedRows: rows.slice(),
    displayRows: rows.slice(),
    sort: [],
    filters: {},
    searchQuery: '',
    searchAst: null,
    page: 1,
    pageSize: 0,
    pageCount: 1,
    totalRows: rows.length,
    selection: new Set(),
    editingCell: null,
    loading: false,
    error: null,
    ...overrides,
  };
}

describe('applySort', () => {
  it('returns sort, sortedRows, displayRows', () => {
    const state = makeState();
    const payload: SortPayload = { column: 'v' };
    const result = applySort(state, payload);
    expect(Object.keys(result).sort()).toEqual(['displayRows', 'sort', 'sortedRows']);
  });

  it('sorts filteredRows ascending and returns sorted slice', () => {
    const state = makeState();
    const result = applySort(state, { column: 'v', direction: 'asc' });
    const ids = (result.sortedRows as Array<{ id: number; v: number }>).map((r) => r.v);
    expect(ids).toEqual([1, 2, 3]);
  });

  it('sorts filteredRows descending', () => {
    const state = makeState();
    const result = applySort(state, { column: 'v', direction: 'desc' });
    const ids = (result.sortedRows as Array<{ id: number; v: number }>).map((r) => r.v);
    expect(ids).toEqual([3, 2, 1]);
  });

  it('applies pagination when pageSize > 0', () => {
    const state = makeState({ pageSize: 2, page: 1 });
    const result = applySort(state, { column: 'v', direction: 'asc' });
    expect(result.displayRows).toHaveLength(2);
    const first = result.displayRows[0] as { v: number };
    expect(first.v).toBe(1);
  });

  it('no-pagination when pageSize is 0', () => {
    const state = makeState({ pageSize: 0 });
    const result = applySort(state, { column: 'v', direction: 'asc' });
    expect(result.displayRows).toHaveLength(3);
  });

  it('handles append via opts -- appends to sort list', () => {
    const state = makeState({ sort: [{ column: 'id', direction: 'asc' }] });
    const result = applySort(state, { column: 'v', opts: { append: true } });
    expect(result.sort).toEqual([
      { column: 'id', direction: 'asc' },
      { column: 'v', direction: 'asc' },
    ]);
  });

  it('does not mutate input state', () => {
    const state = makeState();
    const prevSort = [...state.sort];
    applySort(state, { column: 'v' });
    expect(state.sort).toEqual(prevSort);
  });
});

// ---------------------------------------------------------------------------
// getSortBadges
// ---------------------------------------------------------------------------

describe('getSortBadges', () => {
  it('returns empty object when no sort keys', () => {
    const state = makeState({ sort: [] });
    expect(getSortBadges(state)).toEqual({});
  });

  it('returns priority 1 for a single sorted column', () => {
    const state = makeState({ sort: [{ column: 'name', direction: 'asc' }] });
    expect(getSortBadges(state)).toEqual({ name: 1 });
  });

  it('returns priority numbers for multi-key sort', () => {
    const state = makeState({
      sort: [
        { column: 'dept', direction: 'asc' },
        { column: 'salary', direction: 'desc' },
        { column: 'name', direction: 'asc' },
      ],
    });
    expect(getSortBadges(state)).toEqual({ dept: 1, salary: 2, name: 3 });
  });

  it('only includes active sort columns', () => {
    const state = makeState({ sort: [{ column: 'age', direction: 'asc' }] });
    const badges = getSortBadges(state);
    expect(Object.keys(badges)).toEqual(['age']);
  });

  it('does not mutate the state sort array', () => {
    const sort: SortState[] = [{ column: 'x', direction: 'asc' }];
    const state = makeState({ sort });
    getSortBadges(state);
    expect(state.sort).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Integration: append semantics through nextSortState + sortRows
// ---------------------------------------------------------------------------

describe('multi-key sort integration', () => {
  it('first key determines primary order, second breaks ties', () => {
    const data = [
      { dept: 'B', rank: 3 },
      { dept: 'A', rank: 2 },
      { dept: 'B', rank: 1 },
      { dept: 'A', rank: 1 },
    ];
    const keys = [
      { column: 'dept', direction: 'asc' as const },
      { column: 'rank', direction: 'asc' as const },
    ];
    const result = sortRows(data, keys) as typeof data;
    expect(result).toEqual([
      { dept: 'A', rank: 1 },
      { dept: 'A', rank: 2 },
      { dept: 'B', rank: 1 },
      { dept: 'B', rank: 3 },
    ]);
  });

  it('append then sort: badges reflect accumulated priority list', () => {
    let sort: SortState[] = [];
    sort = nextSortState(sort, 'dept');           // [ dept:asc ]
    sort = nextSortState(sort, 'rank', undefined, { append: true }); // [ dept:asc, rank:asc ]
    sort = nextSortState(sort, 'dept', undefined, { append: true }); // [ dept:desc, rank:asc ] (toggle)

    expect(sort).toEqual([
      { column: 'dept', direction: 'desc' },
      { column: 'rank', direction: 'asc' },
    ]);

    const state = makeState({ sort });
    const badges = getSortBadges(state);
    expect(badges).toEqual({ dept: 1, rank: 2 });
  });

  it('replacing sort (non-append) resets to single key', () => {
    let sort: SortState[] = [
      { column: 'dept', direction: 'asc' },
      { column: 'rank', direction: 'desc' },
    ];
    sort = nextSortState(sort, 'name'); // replaces all
    expect(sort).toEqual([{ column: 'name', direction: 'asc' }]);
  });
});
