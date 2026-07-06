/**
 * filtering.test.ts
 *
 * Tests for filtering/index.ts:
 * - detectFilterType  (auto-detection from values)
 * - detectFilterOperator  (default operator per column type)
 * - testFilter  (low-level row predicate)
 * - applyFilter / clearFilter  (pure state reducers)
 * - composeEngines  (engine composition)
 */

import { describe, it, expect } from 'vitest';
import {
  detectFilterType,
  detectFilterOperator,
  isDateValue,
  isNumericValue,
  testFilter,
  applyFilter,
  clearFilter,
  composeEngines,
  createGrammarEngine,
} from './index';
import type { TableState, TableCrafterColumn } from '../core/types';

// ---------------------------------------------------------------------------
// isDateValue / isNumericValue helpers
// ---------------------------------------------------------------------------

describe('isDateValue', () => {
  it('accepts YYYY-MM-DD', () => expect(isDateValue('2024-01-15')).toBe(true));
  it('accepts MM/DD/YYYY', () => expect(isDateValue('01/15/2024')).toBe(true));
  it('accepts MM-DD-YYYY', () => expect(isDateValue('01-15-2024')).toBe(true));
  it('accepts ISO datetime', () => expect(isDateValue('2024-01-15T12:00:00')).toBe(true));
  it('rejects plain numbers', () => expect(isDateValue('12345')).toBe(false));
  it('rejects short strings', () => expect(isDateValue('abc')).toBe(false));
  it('rejects empty string', () => expect(isDateValue('')).toBe(false));
});

describe('isNumericValue', () => {
  it('accepts integer strings', () => expect(isNumericValue('42')).toBe(true));
  it('accepts decimal strings', () => expect(isNumericValue('3.14')).toBe(true));
  it('accepts negative values', () => expect(isNumericValue('-7')).toBe(true));
  it('rejects non-numeric', () => expect(isNumericValue('abc')).toBe(false));
  it('rejects empty string', () => expect(isNumericValue('')).toBe(false));
});

// ---------------------------------------------------------------------------
// detectFilterType (v2 detectFilterTypes() equivalence)
// ---------------------------------------------------------------------------

describe('detectFilterType: date detection', () => {
  it('all ISO dates → date', () => {
    expect(detectFilterType(['2024-01-01', '2024-06-15', '2023-12-31'])).toBe('date');
  });

  it('mixed date strings → date', () => {
    expect(detectFilterType(['01/01/2024', '12/31/2023'])).toBe('date');
  });

  it('skips date detection for id-like fields', () => {
    // v2 skips date for sku|id|ref|code|serial|part even with date-shaped values
    expect(detectFilterType(['2024-01-01'], 'record_id')).not.toBe('date');
  });
});

describe('detectFilterType: number detection', () => {
  it('all numerics → number', () => {
    expect(detectFilterType(['1', '2', '3', '10', '100'])).toBe('number');
  });

  it('mixed types with one non-numeric → not number', () => {
    expect(detectFilterType(['1', '2', 'three'])).not.toBe('number');
  });
});

describe('detectFilterType: multiselect detection', () => {
  it('low cardinality (≤20 unique, ≥2) → multiselect', () => {
    expect(detectFilterType(['open', 'closed', 'pending', 'open', 'closed'])).toBe('multiselect');
  });

  it('skips multiselect for name-like field names', () => {
    // v2 skips multiselect for name|email|title|desc|phone|address|subject
    const values = ['A', 'B', 'C', 'A', 'B', 'C'];
    expect(detectFilterType(values, 'full_name')).toBe('text');
  });

  it('high cardinality (>20 unique) → text', () => {
    const values = Array.from({ length: 25 }, (_, i) => `item${i}`);
    expect(detectFilterType(values)).toBe('text');
  });

  it('cardinality of 1 (all same) → text (not multiselect)', () => {
    expect(detectFilterType(['active', 'active', 'active'])).toBe('text');
  });
});

describe('detectFilterType: text fallback', () => {
  it('empty values array → text', () => {
    expect(detectFilterType([])).toBe('text');
  });

  it('all null/undefined values → text', () => {
    expect(detectFilterType([null, undefined, ''])).toBe('text');
  });

  it('free-text field name suppresses multiselect → text', () => {
    // Low-cardinality values would be multiselect, but 'description' matches
    // the v2 free-text identifier pattern (name|email|title|desc|...)
    expect(
      detectFilterType(['hello world', 'foo bar baz', 'another long text'], 'description')
    ).toBe('text');
  });

  it('low-cardinality unnamed column → multiselect (v2 default)', () => {
    // Without a field name there is no free-text guard; 2-20 unique values
    // auto-detect as multiselect, matching v2 detectFilterTypes()
    expect(detectFilterType(['hello world', 'foo bar baz', 'another long text'])).toBe(
      'multiselect'
    );
  });
});

// ---------------------------------------------------------------------------
// detectFilterOperator
// ---------------------------------------------------------------------------

describe('detectFilterOperator', () => {
  const col = (type?: TableCrafterColumn['type']): TableCrafterColumn => ({
    key: 'test',
    type,
  });

  it('select → in', () => expect(detectFilterOperator(col('select'))).toBe('in'));
  it('checkbox → in', () => expect(detectFilterOperator(col('checkbox'))).toBe('in'));
  it('number → eq', () => expect(detectFilterOperator(col('number'))).toBe('eq'));
  it('date → eq', () => expect(detectFilterOperator(col('date'))).toBe('eq'));
  it('text → contains', () => expect(detectFilterOperator(col('text'))).toBe('contains'));
  it('undefined type → contains', () => expect(detectFilterOperator(col())).toBe('contains'));
});

// ---------------------------------------------------------------------------
// testFilter (low-level predicate)
// ---------------------------------------------------------------------------

describe('testFilter', () => {
  const row = { name: 'Alice', age: 30, status: 'active' };

  it('eq: exact value match', () => {
    expect(testFilter(row, 'age', { operator: 'eq', value: 30 })).toBe(true);
    expect(testFilter(row, 'age', { operator: 'eq', value: 31 })).toBe(false);
  });

  it('neq: not equal', () => {
    expect(testFilter(row, 'age', { operator: 'neq', value: 31 })).toBe(true);
    expect(testFilter(row, 'age', { operator: 'neq', value: 30 })).toBe(false);
  });

  it('contains: substring (case-insensitive)', () => {
    expect(testFilter(row, 'status', { operator: 'contains', value: 'ACT' })).toBe(true);
    expect(testFilter(row, 'status', { operator: 'contains', value: 'xyz' })).toBe(false);
  });

  it('notContains', () => {
    expect(testFilter(row, 'status', { operator: 'notContains', value: 'xyz' })).toBe(true);
    expect(testFilter(row, 'status', { operator: 'notContains', value: 'act' })).toBe(false);
  });

  it('startsWith', () => {
    expect(testFilter(row, 'name', { operator: 'startsWith', value: 'Al' })).toBe(true);
    expect(testFilter(row, 'name', { operator: 'startsWith', value: 'Bo' })).toBe(false);
  });

  it('endsWith', () => {
    expect(testFilter(row, 'name', { operator: 'endsWith', value: 'ice' })).toBe(true);
    expect(testFilter(row, 'name', { operator: 'endsWith', value: 'ob' })).toBe(false);
  });

  it('gt / gte / lt / lte numeric', () => {
    expect(testFilter(row, 'age', { operator: 'gt', value: 29 })).toBe(true);
    expect(testFilter(row, 'age', { operator: 'gt', value: 30 })).toBe(false);
    expect(testFilter(row, 'age', { operator: 'gte', value: 30 })).toBe(true);
    expect(testFilter(row, 'age', { operator: 'lt', value: 31 })).toBe(true);
    expect(testFilter(row, 'age', { operator: 'lte', value: 30 })).toBe(true);
  });

  it('gt / lt string fallback when non-numeric', () => {
    // Falls back to string comparison
    expect(testFilter({ x: 'b' }, 'x', { operator: 'gt', value: 'a' })).toBe(true);
    expect(testFilter({ x: 'a' }, 'x', { operator: 'lt', value: 'b' })).toBe(true);
  });

  it('in: value in array', () => {
    expect(testFilter(row, 'status', { operator: 'in', value: ['active', 'pending'] })).toBe(true);
    expect(testFilter(row, 'status', { operator: 'in', value: ['pending'] })).toBe(false);
  });

  it('notIn', () => {
    expect(testFilter(row, 'status', { operator: 'notIn', value: ['pending'] })).toBe(true);
    expect(testFilter(row, 'status', { operator: 'notIn', value: ['active'] })).toBe(false);
  });

  it('empty / notEmpty', () => {
    expect(testFilter({ x: '' }, 'x', { operator: 'empty', value: null })).toBe(true);
    expect(testFilter({ x: 'v' }, 'x', { operator: 'empty', value: null })).toBe(false);
    expect(testFilter({ x: 'v' }, 'x', { operator: 'notEmpty', value: null })).toBe(true);
    expect(testFilter({ x: null }, 'x', { operator: 'notEmpty', value: null })).toBe(false);
  });

  it('non-object row → cell is undefined', () => {
    expect(testFilter('string-row', 'name', { operator: 'empty', value: null })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// applyFilter / clearFilter (pure state reducers)
// ---------------------------------------------------------------------------

/** Minimal TableState fixture. */
function makeState(overrides: Partial<TableState> = {}): TableState {
  const rows = [
    { id: 1, name: 'Alice', status: 'active' },
    { id: 2, name: 'Bob',   status: 'inactive' },
    { id: 3, name: 'Carol', status: 'active' },
  ];
  return {
    rows,
    filteredRows: rows.slice(),
    sortedRows: rows.slice(),
    displayRows: rows.slice(),
    sort: null,
    filters: {},
    searchQuery: '',
    searchAst: null,
    page: 1,
    pageSize: 25,
    pageCount: 1,
    totalRows: rows.length,
    selection: new Set(),
    editingCell: null,
    loading: false,
    error: null,
    ...overrides,
  };
}

describe('applyFilter', () => {
  it('adds a filter and recomputes filteredRows', () => {
    const state = makeState();
    const result = applyFilter(state, {
      column: 'status',
      filter: { operator: 'eq', value: 'active' },
    });
    expect(result.filteredRows).toHaveLength(2);
    expect((result.filteredRows as Array<{ name: string }>).map((r) => r.name)).toEqual(['Alice', 'Carol']);
  });

  it('passing filter=null clears that column filter', () => {
    const state = makeState({
      filters: { status: { operator: 'eq', value: 'active' } },
    });
    const result = applyFilter(state, { column: 'status', filter: null });
    expect(result.filters.status).toBeUndefined();
    expect(result.filteredRows).toHaveLength(3);
  });

  it('computes correct pagination metadata', () => {
    const state = makeState({ pageSize: 2 });
    const result = applyFilter(state, {
      column: 'status',
      filter: { operator: 'eq', value: 'active' },
    });
    expect(result.totalRows).toBe(2);
    expect(result.pageCount).toBe(1);
  });

  it('page is clamped to valid range after filter', () => {
    const state = makeState({ page: 5, pageSize: 1 });
    const result = applyFilter(state, {
      column: 'status',
      filter: { operator: 'eq', value: 'active' },
    });
    // 2 matching rows, page 2 max with pageSize=1; page was 5 → clamped to 2
    expect(result.page).toBeLessThanOrEqual(result.pageCount);
  });

  it('stacks multiple filters', () => {
    const state = makeState({
      filters: { status: { operator: 'eq', value: 'active' } },
    });
    const result = applyFilter(state, {
      column: 'name',
      filter: { operator: 'contains', value: 'ali' },
    });
    expect(result.filteredRows).toHaveLength(1);
    expect((result.filteredRows[0] as { name: string }).name).toBe('Alice');
  });
});

describe('clearFilter', () => {
  it('clears a specific column filter', () => {
    const state = makeState({
      filters: {
        status: { operator: 'eq', value: 'active' },
        name:   { operator: 'contains', value: 'ali' },
      },
    });
    const result = clearFilter(state, 'status');
    expect(result.filters.status).toBeUndefined();
    expect(result.filters.name).toBeDefined();
  });

  it('clears all filters when column is undefined', () => {
    const state = makeState({
      filters: {
        status: { operator: 'eq', value: 'active' },
        name:   { operator: 'contains', value: 'ali' },
      },
    });
    const result = clearFilter(state);
    expect(Object.keys(result.filters)).toHaveLength(0);
    expect(result.filteredRows).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// composeEngines
// ---------------------------------------------------------------------------

describe('composeEngines', () => {
  it('no engines → identity (matches everything)', () => {
    const engine = composeEngines();
    expect(engine.match({}, null, [])).toBe(true);
    expect(engine.parse('anything')).toBeNull();
  });

  it('single engine → returned unchanged', () => {
    const g = createGrammarEngine();
    const composed = composeEngines(g);
    // same parse result
    expect(JSON.stringify(composed.parse('foo'))).toBe(JSON.stringify(g.parse('foo')));
  });

  it('two engines both must match (AND semantics)', () => {
    const allow: import('../core/state').SearchEngine = {
      parse: () => null,
      match: () => true,
    };
    const deny: import('../core/state').SearchEngine = {
      parse: () => null,
      match: () => false,
    };
    const both = composeEngines(allow, deny);
    expect(both.match({}, null, [])).toBe(false);

    const bothAllow = composeEngines(allow, allow);
    expect(bothAllow.match({}, null, [])).toBe(true);
  });

  it('first engine parse is used', () => {
    const g = createGrammarEngine();
    const noop: import('../core/state').SearchEngine = {
      parse: () => ({ kind: 'term', value: 'NOOP' }),
      match: () => true,
    };
    const composed = composeEngines(g, noop);
    expect(JSON.stringify(composed.parse('foo'))).toBe(JSON.stringify(g.parse('foo')));
  });
});
