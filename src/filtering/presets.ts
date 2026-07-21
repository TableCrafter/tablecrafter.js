/**
 * filtering/presets.ts
 *
 * Saved filter presets, persisted to a Storage (localStorage by default) under
 * a key scoped to the table id. Pure back-end for the preset UI (#337); the
 * renderer and wrapper call these methods, never touch Storage directly.
 */

import type { ColumnFilter } from '../core/types';

/** A snapshot of column filters, as stored in `TableState.filters`. */
export type FilterState = Record<string, ColumnFilter>;

export interface PresetStore {
  /** Save (or overwrite) a named preset. */
  save(name: string, filters: FilterState): void;
  /** Load a preset's filter state, or null if it does not exist. */
  load(name: string): FilterState | null;
  /** Names of all saved presets, in insertion order. */
  list(): string[];
  /** Remove a preset. */
  remove(name: string): void;
}

const KEY_PREFIX = 'tablecrafter:presets:';

/** In-memory Storage fallback for non-browser / SSR contexts. */
function memoryStorage(): Storage {
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

function defaultStorage(): Storage {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  return memoryStorage();
}

export function createPresetStore(
  tableId: string,
  storage: Storage = defaultStorage()
): PresetStore {
  const key = `${KEY_PREFIX}${tableId}`;

  function read(): Record<string, FilterState> {
    try {
      const raw = storage.getItem(key);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function write(all: Record<string, FilterState>): void {
    storage.setItem(key, JSON.stringify(all));
  }

  return {
    save(name, filters) {
      const all = read();
      all[name] = filters;
      write(all);
    },
    load(name) {
      return read()[name] ?? null;
    },
    list() {
      return Object.keys(read());
    },
    remove(name) {
      const all = read();
      delete all[name];
      write(all);
    },
  };
}
