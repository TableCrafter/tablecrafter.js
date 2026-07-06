/**
 * editing/registry.test.ts
 *
 * Vitest unit tests for the editor descriptor registry and lookup support.
 * Ports v2 cell-editors.test.js + lookup.test.js semantics.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createEditorRegistry,
  BUILT_IN_EDITOR_TYPES,
  buildLookupDescriptor,
  buildLookupOptionsSource,
} from './registry';
import type { AsyncOptionsSource } from './registry';
import type { EditorDescriptor } from './types';

// ---------------------------------------------------------------------------
// createEditorRegistry -- presence of all 14 built-in types
// ---------------------------------------------------------------------------

describe('createEditorRegistry', () => {
  it('pre-populates all 14 built-in editor types', () => {
    const registry = createEditorRegistry();
    for (const type of BUILT_IN_EDITOR_TYPES) {
      expect(registry.get(type)).toBeDefined();
    }
  });

  it('returns undefined for unknown type', () => {
    const registry = createEditorRegistry();
    expect(registry.get('unknown-type')).toBeUndefined();
  });

  it('keys() includes all 14 built-in types', () => {
    const registry = createEditorRegistry();
    const keys = registry.keys();
    for (const type of BUILT_IN_EDITOR_TYPES) {
      expect(keys).toContain(type);
    }
    expect(keys.length).toBe(14);
  });

  it('register() overwrites existing entry', () => {
    const registry = createEditorRegistry();
    const custom: EditorDescriptor = {
      type: 'text',
      inputKind: 'text',
      parse: (v) => `custom:${String(v)}`,
      serialize: (v) => v,
    };
    registry.register('text', custom);
    expect(registry.get('text')).toBe(custom);
  });

  it('register() adds a new entry', () => {
    const registry = createEditorRegistry();
    const custom: EditorDescriptor = {
      type: 'text' as never,
      inputKind: 'text',
      parse: (v) => v,
      serialize: (v) => v,
    };
    registry.register('my-type', custom);
    expect(registry.get('my-type')).toBe(custom);
  });

  it('register() throws for empty type name', () => {
    const registry = createEditorRegistry();
    expect(() => registry.register('', {} as EditorDescriptor)).toThrow(TypeError);
  });

  it('each registry instance is independent', () => {
    const r1 = createEditorRegistry();
    const r2 = createEditorRegistry();
    const custom: EditorDescriptor = {
      type: 'text',
      inputKind: 'text',
      parse: (v) => v,
      serialize: (v) => v,
    };
    r1.register('only-in-r1', custom);
    expect(r1.get('only-in-r1')).toBeDefined();
    expect(r2.get('only-in-r1')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// text descriptor
// ---------------------------------------------------------------------------

describe('text descriptor', () => {
  const registry = createEditorRegistry();
  const desc = registry.get('text')!;

  it('inputKind is "text"', () => {
    expect(desc.inputKind).toBe('text');
  });

  it('parse: null -> empty string', () => {
    expect(desc.parse(null)).toBe('');
  });

  it('parse: string as-is', () => {
    expect(desc.parse('Alice')).toBe('Alice');
  });

  it('serialize: string as-is', () => {
    expect(desc.serialize('Alice')).toBe('Alice');
  });
});

// ---------------------------------------------------------------------------
// number descriptor
// ---------------------------------------------------------------------------

describe('number descriptor', () => {
  const registry = createEditorRegistry();
  const desc = registry.get('number')!;

  it('inputKind is "number"', () => {
    expect(desc.inputKind).toBe('number');
  });

  it('parse: converts number to string for input value', () => {
    expect(desc.parse(42)).toBe('42');
  });

  it('parse: null -> empty string', () => {
    expect(desc.parse(null)).toBe('');
  });

  it('serialize: parses string to number', () => {
    expect(desc.serialize('42')).toBe(42);
  });

  it('serialize: returns null for empty string', () => {
    expect(desc.serialize('')).toBeNull();
  });

  it('serialize: returns null for non-numeric', () => {
    expect(desc.serialize('abc')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// email descriptor
// ---------------------------------------------------------------------------

describe('email descriptor', () => {
  const registry = createEditorRegistry();
  const desc = registry.get('email')!;

  it('inputKind is "email"', () => {
    expect(desc.inputKind).toBe('email');
  });

  it('serialize trims whitespace', () => {
    expect(desc.serialize('  user@example.com  ')).toBe('user@example.com');
  });
});

// ---------------------------------------------------------------------------
// date descriptor
// ---------------------------------------------------------------------------

describe('date descriptor', () => {
  const registry = createEditorRegistry();
  const desc = registry.get('date')!;

  it('inputKind is "date"', () => {
    expect(desc.inputKind).toBe('date');
  });

  it('parse: normalizes ISO datetime to YYYY-MM-DD', () => {
    expect(desc.parse('2024-03-15T00:00:00Z')).toBe('2024-03-15');
  });

  it('parse: null -> empty string', () => {
    expect(desc.parse(null)).toBe('');
  });

  it('parse: invalid date -> empty string', () => {
    expect(desc.parse('not-a-date')).toBe('');
  });

  it('serialize: returns null for empty string', () => {
    expect(desc.serialize('')).toBeNull();
  });

  it('serialize: returns YYYY-MM-DD for valid date', () => {
    expect(desc.serialize('2024-03-15')).toBe('2024-03-15');
  });
});

// ---------------------------------------------------------------------------
// datetime descriptor
// ---------------------------------------------------------------------------

describe('datetime descriptor', () => {
  const registry = createEditorRegistry();
  const desc = registry.get('datetime')!;

  it('inputKind is "datetime-local"', () => {
    expect(desc.inputKind).toBe('datetime-local');
  });

  it('parse: null -> empty string', () => {
    expect(desc.parse(null)).toBe('');
  });

  it('parse: produces 16-char datetime-local string', () => {
    const result = desc.parse('2024-06-15T10:30:00Z');
    expect(typeof result).toBe('string');
    expect((result as string).length).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// select descriptor
// ---------------------------------------------------------------------------

describe('select descriptor', () => {
  const registry = createEditorRegistry();
  const desc = registry.get('select')!;

  it('inputKind is "select"', () => {
    expect(desc.inputKind).toBe('select');
  });

  it('has static optionsSource', () => {
    expect(desc.optionsSource?.kind).toBe('static');
  });

  it('parse/serialize are identity for strings', () => {
    expect(desc.parse('active')).toBe('active');
    expect(desc.serialize('active')).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// multiselect descriptor
// ---------------------------------------------------------------------------

describe('multiselect descriptor', () => {
  const registry = createEditorRegistry();
  const desc = registry.get('multiselect')!;

  it('inputKind is "select-multiple"', () => {
    expect(desc.inputKind).toBe('select-multiple');
  });

  it('parse: splits comma string to array', () => {
    expect(desc.parse('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('parse: passes through array', () => {
    expect(desc.parse(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('serialize: returns string array', () => {
    expect(desc.serialize(['x', 'y'])).toEqual(['x', 'y']);
  });
});

// ---------------------------------------------------------------------------
// checkbox descriptor
// ---------------------------------------------------------------------------

describe('checkbox descriptor', () => {
  const registry = createEditorRegistry();
  const desc = registry.get('checkbox')!;

  it('inputKind is "checkbox"', () => {
    expect(desc.inputKind).toBe('checkbox');
  });

  it('parse: "true" -> true', () => {
    expect(desc.parse('true')).toBe(true);
  });

  it('parse: "1" -> true', () => {
    expect(desc.parse('1')).toBe(true);
  });

  it('parse: null -> false', () => {
    expect(desc.parse(null)).toBe(false);
  });

  it('serialize: true -> true', () => {
    expect(desc.serialize(true)).toBe(true);
  });

  it('serialize: false -> false', () => {
    expect(desc.serialize(false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// radio descriptor
// ---------------------------------------------------------------------------

describe('radio descriptor', () => {
  const registry = createEditorRegistry();
  const desc = registry.get('radio')!;

  it('inputKind is "radio"', () => {
    expect(desc.inputKind).toBe('radio');
  });

  it('has static optionsSource', () => {
    expect(desc.optionsSource?.kind).toBe('static');
  });
});

// ---------------------------------------------------------------------------
// file descriptor
// ---------------------------------------------------------------------------

describe('file descriptor', () => {
  const registry = createEditorRegistry();
  const desc = registry.get('file')!;

  it('inputKind is "file"', () => {
    expect(desc.inputKind).toBe('file');
  });

  it('parse/serialize pass through filename strings', () => {
    expect(desc.parse('photo.jpg')).toBe('photo.jpg');
    expect(desc.serialize('photo.jpg')).toBe('photo.jpg');
  });
});

// ---------------------------------------------------------------------------
// url descriptor
// ---------------------------------------------------------------------------

describe('url descriptor', () => {
  const registry = createEditorRegistry();
  const desc = registry.get('url')!;

  it('inputKind is "url"', () => {
    expect(desc.inputKind).toBe('url');
  });

  it('serialize trims whitespace', () => {
    expect(desc.serialize('  https://example.com  ')).toBe('https://example.com');
  });
});

// ---------------------------------------------------------------------------
// color descriptor
// ---------------------------------------------------------------------------

describe('color descriptor', () => {
  const registry = createEditorRegistry();
  const desc = registry.get('color')!;

  it('inputKind is "color"', () => {
    expect(desc.inputKind).toBe('color');
  });

  it('parse: null -> "#000000"', () => {
    expect(desc.parse(null)).toBe('#000000');
  });

  it('parse: lowercases hex color', () => {
    expect(desc.parse('#FF3300')).toBe('#ff3300');
  });

  it('serialize: same normalization', () => {
    expect(desc.serialize('#AABBCC')).toBe('#aabbcc');
  });
});

// ---------------------------------------------------------------------------
// range descriptor
// ---------------------------------------------------------------------------

describe('range descriptor', () => {
  const registry = createEditorRegistry();
  const desc = registry.get('range')!;

  it('inputKind is "range"', () => {
    expect(desc.inputKind).toBe('range');
  });

  it('parse: converts number to string', () => {
    expect(desc.parse(50)).toBe('50');
  });

  it('parse: null -> "0"', () => {
    expect(desc.parse(null)).toBe('0');
  });

  it('serialize: parses string to number', () => {
    expect(desc.serialize('50')).toBe(50);
  });

  it('serialize: returns 0 for empty string', () => {
    expect(desc.serialize('')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildLookupOptionsSource
// ---------------------------------------------------------------------------

describe('buildLookupOptionsSource (static data)', () => {
  const ITEMS = [
    { id: '1', name: 'Electronics' },
    { id: '2', name: 'Books' },
    { id: '3', name: 'Clothing' },
  ];

  it('returns static data as SelectOption[]', async () => {
    const source: AsyncOptionsSource = buildLookupOptionsSource({ data: ITEMS });
    const opts = await source.fetch();
    expect(opts).toHaveLength(3);
    expect(opts[0]).toEqual({ value: '1', label: 'Electronics' });
    expect(opts[1]).toEqual({ value: '2', label: 'Books' });
  });

  it('caches result on second call', async () => {
    const source: AsyncOptionsSource = buildLookupOptionsSource({ data: ITEMS });
    const first = await source.fetch();
    const second = await source.fetch();
    expect(second).toBe(first); // same reference == cached
  });

  it('applies filter when provided', async () => {
    const source: AsyncOptionsSource = buildLookupOptionsSource({
      data: ITEMS,
      filter: { name: 'Books' },
    });
    const opts = await source.fetch();
    expect(opts).toHaveLength(1);
    expect(opts[0]!.label).toBe('Books');
  });

  it('respects custom valueField and displayField', async () => {
    const data = [{ code: 'US', country: 'United States' }];
    const source: AsyncOptionsSource = buildLookupOptionsSource({
      data,
      valueField: 'code',
      displayField: 'country',
    });
    const opts = await source.fetch();
    expect(opts[0]).toEqual({ value: 'US', label: 'United States' });
  });

  it('returns empty array when no data/url configured', async () => {
    const source: AsyncOptionsSource = buildLookupOptionsSource({});
    const opts = await source.fetch();
    expect(opts).toEqual([]);
  });
});

describe('buildLookupOptionsSource (URL fetch)', () => {
  const ITEMS = [{ id: '1', name: 'Foo' }];

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve(ITEMS),
      })
    );
  });

  it('fetches from URL and parses JSON', async () => {
    const source: AsyncOptionsSource = buildLookupOptionsSource({
      url: 'https://api.example.com/items',
    });
    const opts = await source.fetch();
    expect(opts).toHaveLength(1);
    expect(opts[0]!.value).toBe('1');
    expect(opts[0]!.label).toBe('Foo');
  });

  it('caches result from URL fetch', async () => {
    const source: AsyncOptionsSource = buildLookupOptionsSource({
      url: 'https://api.example.com/items',
    });
    const first = await source.fetch();
    const second = await source.fetch();
    // fetch() should have been called only once
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });
});

// ---------------------------------------------------------------------------
// buildLookupDescriptor
// ---------------------------------------------------------------------------

describe('buildLookupDescriptor', () => {
  it('returns a descriptor with type "lookup"', () => {
    const desc = buildLookupDescriptor({ data: [] });
    expect(desc.type).toBe('lookup');
  });

  it('inputKind is "select"', () => {
    const desc = buildLookupDescriptor({ data: [] });
    expect(desc.inputKind).toBe('select');
  });

  it('optionsSource is async kind', () => {
    const desc = buildLookupDescriptor({ data: [] });
    expect(desc.optionsSource?.kind).toBe('async');
  });

  it('can be registered in the editor registry', () => {
    const registry = createEditorRegistry();
    const desc = buildLookupDescriptor({
      data: [{ id: '1', name: 'Category A' }],
    });
    registry.register('category', desc);
    expect(registry.get('category')).toBe(desc);
  });
});
