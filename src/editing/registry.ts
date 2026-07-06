/**
 * editing/registry.ts
 *
 * Editor descriptor registry.  Complements cells/registry.ts (render side).
 * The editor registry maps editor type names to EditorDescriptor objects.
 *
 * Pre-populated with the 14 built-in types.  The lookup type is NOT
 * pre-registered because it requires a LookupConfig per column; use
 * buildLookupDescriptor() and register the result yourself.
 */

import type {
  EditorDescriptor,
  EditorRegistry,
  EditorType,
  SelectOption,
  OptionsSource,
} from './types';

/** The async variant of OptionsSource, returned by buildLookupOptionsSource. */
export type AsyncOptionsSource = Extract<OptionsSource, { kind: 'async' }>;
import {
  coerceText,
  coerceTrimmed,
  coerceNumber,
  coerceDate,
  coerceDatetime,
  coerceCheckbox,
  coerceMultiselect,
  coerceColor,
  coerceRange,
  isTruthy,
} from './coercion';

// ---------------------------------------------------------------------------
// Built-in editor type names
// ---------------------------------------------------------------------------

/** All built-in editor type names (the 14 v2 types). */
export const BUILT_IN_EDITOR_TYPES = [
  'text',
  'textarea',
  'number',
  'email',
  'date',
  'datetime',
  'select',
  'multiselect',
  'checkbox',
  'radio',
  'file',
  'url',
  'color',
  'range',
] as const;

export type BuiltInEditorType = (typeof BUILT_IN_EDITOR_TYPES)[number];

// ---------------------------------------------------------------------------
// Lookup options source
// ---------------------------------------------------------------------------

/**
 * Configuration for an async lookup options source.
 * Mirrors v2 column.lookup config shape.
 */
export interface LookupConfig {
  /** Static item array (bypasses fetch). */
  data?: unknown[] | undefined;
  /** URL to fetch a JSON array from. */
  url?: string | undefined;
  /** Key in each item to use as the option value.  Default: 'id'. */
  valueField?: string | undefined;
  /** Key in each item to use as the option label.  Default: 'name'. */
  displayField?: string | undefined;
  /** Filter items by property equality (applied after fetch). */
  filter?: Record<string, unknown> | undefined;
}

/**
 * Build an async OptionsSource for a lookup field.
 * The returned fetch function is memoized; the first successful call caches
 * the result and all subsequent calls return the cache without a network hit.
 * This replicates v2 lookupCache behavior (Map keyed by field+config JSON).
 *
 * @example
 *   const source = buildLookupOptionsSource({ url: '/api/categories' });
 *   const opts = await source.fetch(); // fetches once
 *   const again = await source.fetch(); // returns cached result
 */
export function buildLookupOptionsSource(config: LookupConfig): AsyncOptionsSource {
  let cached: SelectOption[] | null = null;
  const valueField = config.valueField ?? 'id';
  const displayField = config.displayField ?? 'name';

  const optionsSource: AsyncOptionsSource = {
    kind: 'async',
    fetch: async (signal?: AbortSignal): Promise<SelectOption[]> => {
      if (cached !== null) return cached;

      let raw: unknown[];

      if (config.data !== undefined) {
        raw = Array.isArray(config.data) ? config.data : [];
      } else if (config.url) {
        const f = (globalThis as { fetch?: typeof fetch }).fetch;
        if (typeof f !== 'function') {
          throw new Error(
            'TableCrafter lookup: no globalThis.fetch found; ' +
              'supply LookupConfig.data or assign a fetch polyfill'
          );
        }
        const res = await f(config.url, signal ? { signal } : undefined);
        const json: unknown = await res.json();
        raw = Array.isArray(json) ? json : [];
      } else {
        return [];
      }

      // Apply filter (v2 loadLookupData filter step)
      if (config.filter) {
        const filterEntries = Object.entries(config.filter);
        raw = raw.filter((item) => {
          if (typeof item !== 'object' || item === null) return false;
          return filterEntries.every(
            ([k, v]) => (item as Record<string, unknown>)[k] === v
          );
        });
      }

      cached = raw.map((item): SelectOption => {
        if (typeof item !== 'object' || item === null) {
          const s = String(item);
          return { value: s, label: s };
        }
        const rec = item as Record<string, unknown>;
        return {
          value: String(rec[valueField] ?? ''),
          label: String(rec[displayField] ?? rec[valueField] ?? ''),
        };
      });

      return cached;
    },
  };

  return optionsSource;
}

// ---------------------------------------------------------------------------
// Lookup descriptor factory
// ---------------------------------------------------------------------------

/**
 * Build an EditorDescriptor for a lookup field.
 * The resulting descriptor has an async OptionsSource with caching.
 *
 * @example
 *   const desc = buildLookupDescriptor({
 *     url: '/api/categories',
 *     valueField: 'id',
 *     displayField: 'name',
 *   });
 *   registry.register('myLookup', desc);
 */
export function buildLookupDescriptor(config: LookupConfig): EditorDescriptor {
  return {
    type: 'lookup',
    inputKind: 'select',
    parse: coerceText,
    serialize: coerceText,
    optionsSource: buildLookupOptionsSource(config),
  };
}

// ---------------------------------------------------------------------------
// Built-in descriptors
// ---------------------------------------------------------------------------

const textDescriptor: EditorDescriptor = {
  type: 'text',
  inputKind: 'text',
  parse: coerceText,
  serialize: coerceText,
};

const textareaDescriptor: EditorDescriptor = {
  type: 'textarea',
  inputKind: 'textarea',
  parse: coerceText,
  serialize: coerceText,
};

const numberDescriptor: EditorDescriptor = {
  type: 'number',
  inputKind: 'number',
  // parse: stored value -> string for <input type=number value=...>
  parse(stored: unknown): string {
    if (stored === null || stored === undefined || stored === '') return '';
    const n = typeof stored === 'number' ? stored : parseFloat(String(stored));
    return Number.isNaN(n) ? '' : String(n);
  },
  // serialize: string from input -> number (or null)
  serialize: coerceNumber,
};

const emailDescriptor: EditorDescriptor = {
  type: 'email',
  inputKind: 'email',
  parse: coerceText,
  serialize: coerceTrimmed,
};

const dateDescriptor: EditorDescriptor = {
  type: 'date',
  inputKind: 'date',
  // parse: stored -> YYYY-MM-DD for <input type=date>
  parse(stored: unknown): string {
    return coerceDate(stored) ?? '';
  },
  // serialize: YYYY-MM-DD string (or null for empty)
  serialize: coerceDate,
};

const datetimeDescriptor: EditorDescriptor = {
  type: 'datetime',
  inputKind: 'datetime-local',
  // parse: stored -> YYYY-MM-DDTHH:mm for <input type=datetime-local>
  parse(stored: unknown): string {
    return coerceDatetime(stored) ?? '';
  },
  // serialize: YYYY-MM-DDTHH:mm (or null for empty)
  serialize: coerceDatetime,
};

const selectDescriptor: EditorDescriptor = {
  type: 'select',
  inputKind: 'select',
  parse: coerceText,
  serialize: coerceText,
  optionsSource: { kind: 'static', options: [] },
};

const multiselectDescriptor: EditorDescriptor = {
  type: 'multiselect',
  inputKind: 'select-multiple',
  // parse: stored -> string[] (split comma-separated or wrap array)
  parse: coerceMultiselect,
  // serialize: string[] as-is
  serialize: coerceMultiselect,
  optionsSource: { kind: 'static', options: [] },
};

const checkboxDescriptor: EditorDescriptor = {
  type: 'checkbox',
  inputKind: 'checkbox',
  // parse: stored -> boolean via isTruthy
  parse(stored: unknown): boolean {
    return isTruthy(stored);
  },
  // serialize: boolean
  serialize: coerceCheckbox,
};

const radioDescriptor: EditorDescriptor = {
  type: 'radio',
  inputKind: 'radio',
  parse: coerceText,
  serialize: coerceText,
  optionsSource: { kind: 'static', options: [] },
};

const fileDescriptor: EditorDescriptor = {
  type: 'file',
  inputKind: 'file',
  // parse: pass through filename string
  parse: coerceText,
  // serialize: filename string (v2: getValue returns files[0].name or currentValue)
  serialize: coerceText,
};

const urlDescriptor: EditorDescriptor = {
  type: 'url',
  inputKind: 'url',
  parse: coerceText,
  serialize: coerceTrimmed,
};

const colorDescriptor: EditorDescriptor = {
  type: 'color',
  inputKind: 'color',
  // parse: normalize to lowercase hex, default '#000000'
  parse: coerceColor,
  // serialize: same normalization on commit
  serialize: coerceColor,
};

const rangeDescriptor: EditorDescriptor = {
  type: 'range',
  inputKind: 'range',
  // parse: convert stored number/string to string for <input type=range value=...>
  parse(stored: unknown): string {
    return String(coerceRange(stored));
  },
  // serialize: range element.value string -> number
  serialize: coerceRange,
};

// ---------------------------------------------------------------------------
// Registry factory
// ---------------------------------------------------------------------------

/**
 * Create a fresh editor descriptor registry pre-populated with the 14
 * built-in types.  The lookup type is NOT included -- use
 * buildLookupDescriptor() and register the result under a key of your choice.
 *
 * @example
 *   const registry = createEditorRegistry();
 *   registry.register('status', buildLookupDescriptor({ url: '/api/statuses' }));
 *   const desc = registry.get('number'); // returns numberDescriptor
 */
export function createEditorRegistry(): EditorRegistry {
  const map = new Map<string, EditorDescriptor>([
    ['text', textDescriptor],
    ['textarea', textareaDescriptor],
    ['number', numberDescriptor],
    ['email', emailDescriptor],
    ['date', dateDescriptor],
    ['datetime', datetimeDescriptor],
    ['select', selectDescriptor],
    ['multiselect', multiselectDescriptor],
    ['checkbox', checkboxDescriptor],
    ['radio', radioDescriptor],
    ['file', fileDescriptor],
    ['url', urlDescriptor],
    ['color', colorDescriptor],
    ['range', rangeDescriptor],
  ]);

  return {
    register(type: EditorType | string, descriptor: EditorDescriptor): void {
      if (typeof type !== 'string' || !type) {
        throw new TypeError('registerEditor: type must be a non-empty string');
      }
      map.set(type, descriptor);
    },

    get(type: EditorType | string): EditorDescriptor | undefined {
      return map.get(type);
    },

    keys(): string[] {
      return Array.from(map.keys());
    },
  };
}
