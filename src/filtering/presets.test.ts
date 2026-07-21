import { beforeEach, describe, expect, it } from 'vitest';

import type { ColumnFilter } from '../core/types';
import { createPresetStore } from './presets';
import { parseUrlFilters, serializeUrlFilters } from './url-filters';

/** Minimal in-memory Storage stand-in (jsdom has localStorage, but this keeps
 *  the tests isolated and lets us assert the exact persisted key). */
function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  } as Storage;
}

const f = (value: unknown): ColumnFilter => ({ operator: 'contains', value });

describe('createPresetStore (#337)', () => {
  let storage: Storage;
  beforeEach(() => {
    storage = memStorage();
  });

  it('persists a preset under a table-scoped key and lists it', () => {
    const store = createPresetStore('table-42', storage);
    store.save('Active', { status: f('active') });

    expect(store.list()).toEqual(['Active']);
    expect(storage.getItem('tablecrafter:presets:table-42')).toContain('Active');
  });

  it('loads a saved preset back as filter state', () => {
    const store = createPresetStore('t1', storage);
    store.save('Mine', { owner: f('alice'), status: f('open') });

    expect(store.load('Mine')).toEqual({ owner: f('alice'), status: f('open') });
    expect(store.load('missing')).toBeNull();
  });

  it('removes a preset from the list and storage', () => {
    const store = createPresetStore('t1', storage);
    store.save('A', { x: f('1') });
    store.save('B', { y: f('2') });

    store.remove('A');
    expect(store.list()).toEqual(['B']);
  });

  it('scopes presets per table id', () => {
    createPresetStore('t1', storage).save('P', { a: f('1') });
    expect(createPresetStore('t2', storage).list()).toEqual([]);
  });

  it('survives corrupt storage without throwing', () => {
    storage.setItem('tablecrafter:presets:t1', '{not json');
    const store = createPresetStore('t1', storage);
    expect(store.list()).toEqual([]);
  });
});

describe('URL filter params (#337)', () => {
  it('parses ?tc_{field}=value into contains filters', () => {
    expect(parseUrlFilters('?tc_status=active&tc_region=west&other=ignored')).toEqual({
      status: { operator: 'contains', value: 'active' },
      region: { operator: 'contains', value: 'west' },
    });
  });

  it('returns empty filters when no tc_ params present', () => {
    expect(parseUrlFilters('?page=2')).toEqual({});
  });

  it('serializes filters to tc_ params, preserving unrelated params', () => {
    const out = serializeUrlFilters({ status: f('active') }, '?page=2');
    const params = new URLSearchParams(out);
    expect(params.get('tc_status')).toBe('active');
    expect(params.get('page')).toBe('2');
  });

  it('drops stale tc_ params on re-serialize', () => {
    const out = serializeUrlFilters({ region: f('east') }, '?tc_status=active&page=1');
    const params = new URLSearchParams(out);
    expect(params.get('tc_status')).toBeNull();
    expect(params.get('tc_region')).toBe('east');
    expect(params.get('page')).toBe('1');
  });
});
