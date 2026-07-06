/**
 * editing/diff.test.ts
 *
 * Tests for the edit diff descriptor.
 */

import { describe, it, expect } from 'vitest';
import { buildEditDiff, formatDiffBadge } from './diff';

describe('buildEditDiff', () => {
  it('changed = false when values are identical primitives', () => {
    const d = buildEditDiff('hello', 'hello');
    expect(d.changed).toBe(false);
  });

  it('changed = true when values differ', () => {
    const d = buildEditDiff('old', 'new');
    expect(d.changed).toBe(true);
  });

  it('stores oldValue and newValue', () => {
    const d = buildEditDiff('foo', 'bar');
    expect(d.oldValue).toBe('foo');
    expect(d.newValue).toBe('bar');
  });

  it('badge is empty when unchanged', () => {
    const d = buildEditDiff(42, 42);
    expect(d.badge).toBe('');
  });

  it('badge says "was: X" when changed', () => {
    const d = buildEditDiff('Alice', 'Bob');
    expect(d.badge).toBe('was: Alice');
  });

  it('null → null is unchanged', () => {
    const d = buildEditDiff(null, null);
    expect(d.changed).toBe(false);
  });

  it('null → undefined is unchanged (both nullish)', () => {
    const d = buildEditDiff(null, undefined);
    expect(d.changed).toBe(false);
  });

  it('null → "something" is changed', () => {
    const d = buildEditDiff(null, 'something');
    expect(d.changed).toBe(true);
    expect(d.badge).toBe('was: (empty)');
  });

  it('"" (empty string) shows "(empty)" in badge', () => {
    const d = buildEditDiff('', 'filled');
    expect(d.badge).toBe('was: (empty)');
  });

  it('boolean false shows "No" in badge', () => {
    const d = buildEditDiff(false, true);
    expect(d.badge).toBe('was: No');
  });

  it('boolean true shows "Yes" in badge', () => {
    const d = buildEditDiff(true, false);
    expect(d.badge).toBe('was: Yes');
  });

  it('arrays compared deeply — same content is unchanged', () => {
    const d = buildEditDiff(['a', 'b'], ['a', 'b']);
    expect(d.changed).toBe(false);
  });

  it('arrays compared deeply — different content is changed', () => {
    const d = buildEditDiff(['a', 'b'], ['a', 'c']);
    expect(d.changed).toBe(true);
  });

  it('empty array shows "(empty)" in badge', () => {
    const d = buildEditDiff([], ['a', 'b']);
    expect(d.badge).toBe('was: (empty)');
  });

  it('array badge joins values', () => {
    const d = buildEditDiff(['x', 'y'], []);
    expect(d.badge).toBe('was: x, y');
  });
});

describe('formatDiffBadge', () => {
  it('returns empty string for unchanged diff', () => {
    const d = buildEditDiff(5, 5);
    expect(formatDiffBadge(d)).toBe('');
  });

  it('returns badge text for changed diff', () => {
    const d = buildEditDiff('old text', 'new text');
    expect(formatDiffBadge(d)).toBe('was: old text');
  });
});
