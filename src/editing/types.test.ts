/**
 * editing/types.test.ts
 *
 * Tests for the editor type registry — all 15 kinds, descriptor contracts.
 */

import { describe, it, expect } from 'vitest';
import { createEditorRegistry } from './types';
import type { EditorKind } from './types';

const ALL_KINDS: EditorKind[] = [
  'text', 'textarea', 'number', 'email', 'date', 'datetime',
  'select', 'multiselect', 'checkbox', 'radio', 'file', 'url',
  'color', 'range', 'lookup',
];

describe('createEditorRegistry', () => {
  it('returns a Map', () => {
    expect(createEditorRegistry()).toBeInstanceOf(Map);
  });

  it('contains all 15 editor kinds', () => {
    const reg = createEditorRegistry();
    expect(reg.size).toBe(15);
    for (const kind of ALL_KINDS) {
      expect(reg.has(kind), `expected registry to have kind "${kind}"`).toBe(true);
    }
  });

  it('each descriptor has a matching kind field', () => {
    const reg = createEditorRegistry();
    for (const kind of ALL_KINDS) {
      const descriptor = reg.get(kind);
      expect(descriptor?.kind).toBe(kind);
    }
  });

  it('each descriptor has coerce, parse, serialize functions', () => {
    const reg = createEditorRegistry();
    for (const kind of ALL_KINDS) {
      const d = reg.get(kind);
      expect(typeof d?.coerce, `${kind}.coerce`).toBe('function');
      expect(typeof d?.parse, `${kind}.parse`).toBe('function');
      expect(typeof d?.serialize, `${kind}.serialize`).toBe('function');
    }
  });

  it('text descriptor serializes null to empty string', () => {
    const d = createEditorRegistry().get('text');
    expect(d?.serialize(null)).toBe('');
  });

  it('number descriptor coerce returns null for null', () => {
    const d = createEditorRegistry().get('number');
    expect(d?.coerce(null)).toBeNull();
  });

  it('number descriptor coerce returns number for numeric string', () => {
    const d = createEditorRegistry().get('number');
    expect(d?.coerce('42')).toBe(42);
  });

  it('number descriptor parse returns null for non-numeric', () => {
    const d = createEditorRegistry().get('number');
    expect(d?.parse('abc')).toBeNull();
  });

  it('checkbox descriptor coerce converts "yes" → true', () => {
    const d = createEditorRegistry().get('checkbox');
    expect(d?.coerce('yes')).toBe(true);
  });

  it('checkbox descriptor serialize converts true → "Yes"', () => {
    const d = createEditorRegistry().get('checkbox');
    expect(d?.serialize(true)).toBe('Yes');
    expect(d?.serialize(false)).toBe('No');
  });

  it('multiselect descriptor coerce splits comma string', () => {
    const d = createEditorRegistry().get('multiselect');
    expect(d?.coerce('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('multiselect descriptor serialize joins array with ", "', () => {
    const d = createEditorRegistry().get('multiselect');
    expect(d?.serialize(['a', 'b', 'c'])).toBe('a, b, c');
  });

  it('color descriptor coerce defaults to #000000', () => {
    const d = createEditorRegistry().get('color');
    expect(d?.coerce(null)).toBe('#000000');
    expect(d?.coerce('')).toBe('#000000');
  });

  it('color descriptor parse validates hex', () => {
    const d = createEditorRegistry().get('color');
    expect(d?.parse('#aabbcc')).toBe('#aabbcc');
    expect(d?.parse('notahex')).toBe('#000000');
  });

  it('range descriptor coerce returns 0 for null', () => {
    const d = createEditorRegistry().get('range');
    expect(d?.coerce(null)).toBe(0);
  });

  it('range descriptor has RangeMeta with min/max/step', () => {
    const d = createEditorRegistry().get('range');
    const meta = d?.meta as { min: number; max: number; step: number };
    expect(meta?.min).toBe(0);
    expect(meta?.max).toBe(100);
    expect(meta?.step).toBe(1);
  });

  it('lookup descriptor has a lookupSource with cache and load', () => {
    const d = createEditorRegistry().get('lookup');
    expect(d?.lookupSource?.cache).toBeInstanceOf(Map);
    expect(typeof d?.lookupSource?.load).toBe('function');
  });

  it('lookup descriptor lookupSource.load returns a Promise', async () => {
    const d = createEditorRegistry().get('lookup');
    const result = d?.lookupSource?.load('test_key');
    expect(result).toBeInstanceOf(Promise);
    const options = await result;
    expect(Array.isArray(options)).toBe(true);
  });

  it('select and multiselect and radio have options arrays', () => {
    const reg = createEditorRegistry();
    expect(Array.isArray(reg.get('select')?.options)).toBe(true);
    expect(Array.isArray(reg.get('multiselect')?.options)).toBe(true);
    expect(Array.isArray(reg.get('radio')?.options)).toBe(true);
  });

  it('fresh registries are independent instances', () => {
    const r1 = createEditorRegistry();
    const r2 = createEditorRegistry();
    // Mutate r1 — should not affect r2
    r1.delete('text');
    expect(r1.has('text')).toBe(false);
    expect(r2.has('text')).toBe(true);
  });
});
