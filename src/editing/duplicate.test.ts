/**
 * editing/duplicate.test.ts
 *
 * Vitest unit tests for buildDuplicatePayload.
 */

import { describe, it, expect } from 'vitest';
import { buildDuplicatePayload } from './duplicate';
import type { TableCrafterColumn } from '../core/types';

describe('buildDuplicatePayload', () => {
  // ---------------------------------------------------------------------------
  // Default behavior
  // ---------------------------------------------------------------------------

  it('copies all fields except "id" by default', () => {
    const source = { id: 5, name: 'Alice', role: 'admin' };
    const { row, excluded } = buildDuplicatePayload(source);
    expect(row).toEqual({ name: 'Alice', role: 'admin' });
    expect(excluded).toContain('id');
  });

  it('"id" field is in excluded list', () => {
    const source = { id: 1, name: 'Bob' };
    const { excluded } = buildDuplicatePayload(source);
    expect(excluded).toContain('id');
  });

  it('row does not contain "id" when source has one', () => {
    const source = { id: 42, value: 'hello' };
    const { row } = buildDuplicatePayload(source);
    expect(row).not.toHaveProperty('id');
  });

  it('row contains all non-id fields', () => {
    const source = { id: 1, a: 'A', b: 'B', c: 'C' };
    const { row } = buildDuplicatePayload(source);
    expect(row).toEqual({ a: 'A', b: 'B', c: 'C' });
  });

  // ---------------------------------------------------------------------------
  // Custom lockedFields
  // ---------------------------------------------------------------------------

  it('excludes custom locked fields', () => {
    const source = { id: 1, name: 'Alice', createdAt: '2024-01-01' };
    const { row, excluded } = buildDuplicatePayload(source, [], {
      lockedFields: ['id', 'createdAt'],
    });
    expect(row).toEqual({ name: 'Alice' });
    expect(excluded).toContain('createdAt');
  });

  it('lockedFields: empty array locks nothing', () => {
    const source = { id: 5, name: 'Bob' };
    const { row } = buildDuplicatePayload(source, [], { lockedFields: [] });
    expect(row).toHaveProperty('id', 5);
    expect(row).toHaveProperty('name', 'Bob');
  });

  it('lockedFields overrides default (no "id" exclusion when not in list)', () => {
    const source = { id: 5, name: 'Carol', ts: '2024' };
    const { row } = buildDuplicatePayload(source, [], {
      lockedFields: ['ts'],
    });
    // id is NOT locked because lockedFields replaces the default
    expect(row).toHaveProperty('id', 5);
    expect(row).not.toHaveProperty('ts');
  });

  // ---------------------------------------------------------------------------
  // excludeReadOnly
  // ---------------------------------------------------------------------------

  it('excludeReadOnly: false does not exclude editable:false columns', () => {
    const columns: TableCrafterColumn[] = [
      { key: 'name', editable: true },
      { key: 'computed', editable: false },
    ];
    const source = { id: 1, name: 'Dave', computed: 'X' };
    const { row } = buildDuplicatePayload(source, columns, {
      excludeReadOnly: false,
    });
    expect(row).toHaveProperty('computed', 'X');
  });

  it('excludeReadOnly: true excludes editable:false columns', () => {
    const columns: TableCrafterColumn[] = [
      { key: 'name', editable: true },
      { key: 'computed', editable: false },
    ];
    const source = { id: 1, name: 'Dave', computed: 'X' };
    const { row, excluded } = buildDuplicatePayload(source, columns, {
      excludeReadOnly: true,
    });
    expect(row).not.toHaveProperty('computed');
    expect(excluded).toContain('computed');
  });

  it('excludeReadOnly: does not exclude columns with editable:true', () => {
    const columns: TableCrafterColumn[] = [
      { key: 'name', editable: true },
    ];
    const source = { id: 1, name: 'Eve' };
    const { row } = buildDuplicatePayload(source, columns, {
      excludeReadOnly: true,
    });
    expect(row).toHaveProperty('name', 'Eve');
  });

  it('excludeReadOnly: does not exclude columns with no editable flag set', () => {
    const columns: TableCrafterColumn[] = [
      { key: 'note' }, // editable is undefined
    ];
    const source = { id: 1, note: 'hello' };
    const { row } = buildDuplicatePayload(source, columns, {
      excludeReadOnly: true,
    });
    expect(row).toHaveProperty('note', 'hello');
  });

  // ---------------------------------------------------------------------------
  // Non-object sources
  // ---------------------------------------------------------------------------

  it('non-object source returns empty row', () => {
    const { row } = buildDuplicatePayload('not-an-object');
    expect(row).toEqual({});
  });

  it('null source returns empty row', () => {
    const { row } = buildDuplicatePayload(null);
    expect(row).toEqual({});
  });

  it('array source returns empty row', () => {
    const { row } = buildDuplicatePayload([1, 2, 3]);
    expect(row).toEqual({});
  });

  // ---------------------------------------------------------------------------
  // Shallow copy
  // ---------------------------------------------------------------------------

  it('does not mutate the source row', () => {
    const source = { id: 1, name: 'Frank' };
    buildDuplicatePayload(source);
    expect(source).toHaveProperty('id', 1);
  });

  it('nested objects are shallow-copied (not deep)', () => {
    const nested = { x: 1 };
    const source = { id: 1, meta: nested };
    const { row } = buildDuplicatePayload(source);
    expect(row['meta']).toBe(nested); // same reference
  });
});
