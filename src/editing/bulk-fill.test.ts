/**
 * editing/bulk-fill.test.ts
 *
 * Vitest unit tests for computeBulkFillPreview and valuesEqual.
 */

import { describe, it, expect } from 'vitest';
import { computeBulkFillPreview, valuesEqual } from './bulk-fill';

// ---------------------------------------------------------------------------
// valuesEqual
// ---------------------------------------------------------------------------

describe('valuesEqual', () => {
  it('primitive equality: same strings', () => {
    expect(valuesEqual('a', 'a')).toBe(true);
  });

  it('primitive equality: same numbers', () => {
    expect(valuesEqual(42, 42)).toBe(true);
  });

  it('primitive equality: same booleans', () => {
    expect(valuesEqual(true, true)).toBe(true);
  });

  it('primitive inequality: different strings', () => {
    expect(valuesEqual('a', 'b')).toBe(false);
  });

  it('null === null', () => {
    expect(valuesEqual(null, null)).toBe(true);
  });

  it('null !== undefined', () => {
    expect(valuesEqual(null, undefined)).toBe(false);
  });

  it('undefined !== null', () => {
    expect(valuesEqual(undefined, null)).toBe(false);
  });

  it('same array reference', () => {
    const arr = [1, 2, 3];
    expect(valuesEqual(arr, arr)).toBe(true);
  });

  it('equal arrays by value', () => {
    expect(valuesEqual([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it('unequal arrays', () => {
    expect(valuesEqual([1, 2], [2, 1])).toBe(false);
  });

  it('arrays of different lengths', () => {
    expect(valuesEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it('equal objects by JSON', () => {
    expect(valuesEqual({ a: 1 }, { a: 1 })).toBe(true);
  });

  it('unequal objects', () => {
    expect(valuesEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('type mismatch: number vs string', () => {
    expect(valuesEqual(1, '1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeBulkFillPreview
// ---------------------------------------------------------------------------

describe('computeBulkFillPreview', () => {
  const rows = [
    { id: 1, status: 'active', role: 'admin' },
    { id: 2, status: 'active', role: 'user' },
    { id: 3, status: 'inactive', role: 'user' },
  ];

  it('reports changeCount for rows that differ', () => {
    const preview = computeBulkFillPreview(rows, [1, 2, 3], 'status', 'inactive');
    // row 3 is already 'inactive' -> no change; rows 1 and 2 will change
    expect(preview.changeCount).toBe(2);
    expect(preview.noopCount).toBe(1);
  });

  it('entries length matches resolved rowIds count', () => {
    const preview = computeBulkFillPreview(rows, [1, 2], 'status', 'inactive');
    expect(preview.entries).toHaveLength(2);
  });

  it('entry.willChange is true when value changes', () => {
    const preview = computeBulkFillPreview(rows, [1], 'status', 'inactive');
    expect(preview.entries[0]!.willChange).toBe(true);
  });

  it('entry.willChange is false when value is already the same', () => {
    const preview = computeBulkFillPreview(rows, [3], 'status', 'inactive');
    expect(preview.entries[0]!.willChange).toBe(false);
  });

  it('entry.currentValue captures before value', () => {
    const preview = computeBulkFillPreview(rows, [1], 'status', 'inactive');
    expect(preview.entries[0]!.currentValue).toBe('active');
  });

  it('entry.newValue is the fill value', () => {
    const preview = computeBulkFillPreview(rows, [1], 'status', 'NEW');
    expect(preview.entries[0]!.newValue).toBe('NEW');
  });

  it('skips unresolved rowIds silently', () => {
    const preview = computeBulkFillPreview(rows, [999], 'status', 'x');
    expect(preview.entries).toHaveLength(0);
    expect(preview.changeCount).toBe(0);
  });

  it('noopCount is 0 when all rows change', () => {
    const preview = computeBulkFillPreview(rows, [1, 2, 3], 'status', 'pending');
    expect(preview.noopCount).toBe(0);
    expect(preview.changeCount).toBe(3);
  });

  it('changeCount is 0 when no rows change', () => {
    const preview = computeBulkFillPreview(rows, [1, 2], 'status', 'active');
    expect(preview.changeCount).toBe(0);
    expect(preview.noopCount).toBe(2);
  });

  it('resolves rows by numeric index when no id field', () => {
    const noIdRows = [
      { value: 'a' },
      { value: 'b' },
    ];
    const preview = computeBulkFillPreview(noIdRows, [0, 1], 'value', 'x');
    expect(preview.entries).toHaveLength(2);
  });

  it('column and newValue are present on the result', () => {
    const preview = computeBulkFillPreview(rows, [1], 'role', 'guest');
    expect(preview.column).toBe('role');
    expect(preview.newValue).toBe('guest');
  });

  it('handles array newValue equality check', () => {
    const arrayRows = [{ id: 1, tags: ['a', 'b'] }];
    // same array value -> noopCount = 1
    const preview = computeBulkFillPreview(arrayRows, [1], 'tags', ['a', 'b']);
    expect(preview.noopCount).toBe(1);
    expect(preview.changeCount).toBe(0);
  });

  it('handles empty rowIds', () => {
    const preview = computeBulkFillPreview(rows, [], 'status', 'x');
    expect(preview.entries).toHaveLength(0);
    expect(preview.changeCount).toBe(0);
    expect(preview.noopCount).toBe(0);
  });
});
