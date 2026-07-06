/**
 * editing/duplicate.test.ts
 *
 * Tests for the duplicate-row payload builder.
 */

import { describe, it, expect } from 'vitest';
import { buildDuplicatePayload, applyDuplicate } from './duplicate';

// ids deliberately do not collide with array indices so id-lookup and
// index-fallback resolution are unambiguous in tests
const rows = [
  { id: 101, name: 'Alice', role: 'admin' },
  { id: 102, name: 'Bob',   role: 'user'  },
  { id: 103, name: 'Carol', role: 'user'  },
];

describe('buildDuplicatePayload', () => {
  it('returns null for a rowId that does not exist', () => {
    expect(buildDuplicatePayload(rows, 999)).toBeNull();
    expect(buildDuplicatePayload(rows, 'nonexistent')).toBeNull();
  });

  it('returns a payload for a valid numeric index', () => {
    const p = buildDuplicatePayload(rows, 0);
    expect(p).not.toBeNull();
  });

  it('clones the row fields', () => {
    const p = buildDuplicatePayload(rows, 0);
    expect(p?.row.name).toBe('Alice');
    expect(p?.row.role).toBe('admin');
  });

  it('drops the id field by default', () => {
    const p = buildDuplicatePayload(rows, 0);
    expect(Object.prototype.hasOwnProperty.call(p?.row, 'id')).toBe(false);
  });

  it('insertAfterIndex is the source index', () => {
    expect(buildDuplicatePayload(rows, 0)?.insertAfterIndex).toBe(0);
    expect(buildDuplicatePayload(rows, 1)?.insertAfterIndex).toBe(1);
    expect(buildDuplicatePayload(rows, 2)?.insertAfterIndex).toBe(2);
  });

  it('resolves by string id field', () => {
    const stringIdRows = [
      { id: 'abc', name: 'Dave' },
      { id: 'def', name: 'Eve'  },
    ];
    const p = buildDuplicatePayload(stringIdRows, 'abc');
    expect(p).not.toBeNull();
    expect(p?.row.name).toBe('Dave');
  });

  it('respects custom lockFields option', () => {
    const p = buildDuplicatePayload(rows, 0, { lockFields: ['id', 'role'] });
    expect(Object.prototype.hasOwnProperty.call(p?.row, 'id')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(p?.row, 'role')).toBe(false);
    expect(p?.row.name).toBe('Alice');
  });

  it('with empty lockFields, copies everything including id', () => {
    const p = buildDuplicatePayload(rows, 0, { lockFields: [] });
    expect(p?.row.id).toBe(101);
    expect(p?.row.name).toBe('Alice');
  });

  it('resolves by numeric id field before index fallback', () => {
    const p = buildDuplicatePayload(rows, 102);
    expect(p).not.toBeNull();
    expect(p?.row.name).toBe('Bob');
    expect(p?.insertAfterIndex).toBe(1);
  });

  it('does not mutate the source row', () => {
    buildDuplicatePayload(rows, 0);
    expect(rows[0]?.id).toBe(101);
  });

  it('returns null for non-object row', () => {
    const primitiveRows: unknown[] = ['a', 'b'];
    const p = buildDuplicatePayload(primitiveRows, 0);
    expect(p).toBeNull();
  });
});

describe('applyDuplicate', () => {
  it('inserts the clone immediately after the source', () => {
    const p = buildDuplicatePayload(rows, 1); // Bob at index 1
    expect(p).not.toBeNull();
    const newRows = applyDuplicate(rows, p!);
    expect(newRows).toHaveLength(4);
    // index 2 should be the clone of Bob
    const clone = newRows[2] as { name: string };
    expect(clone.name).toBe('Bob');
    // original Bob still at index 1
    const original = newRows[1] as { name: string };
    expect(original.name).toBe('Bob');
  });

  it('does not mutate the original rows array', () => {
    const p = buildDuplicatePayload(rows, 0)!;
    applyDuplicate(rows, p);
    expect(rows).toHaveLength(3);
  });

  it('inserts at the end when source is the last row', () => {
    const p = buildDuplicatePayload(rows, 2)!; // Carol at index 2
    const newRows = applyDuplicate(rows, p);
    expect(newRows).toHaveLength(4);
    const last = newRows[3] as { name: string };
    expect(last.name).toBe('Carol');
  });

  it('inserts at index 1 when source is the first row', () => {
    const p = buildDuplicatePayload(rows, 0)!;
    const newRows = applyDuplicate(rows, p);
    expect(newRows).toHaveLength(4);
    const second = newRows[1] as { name: string };
    expect(second.name).toBe('Alice');
    expect(Object.prototype.hasOwnProperty.call(second, 'id')).toBe(false);
  });
});
