/**
 * editing/types.ts
 *
 * Editor type registry — typed descriptors for all 14 built-in editor kinds
 * (text, textarea, number, email, date, datetime, select, multiselect,
 * checkbox, radio, file, url, color, range) plus the async lookup kind.
 *
 * NO DOM.  The renderer reads these descriptors and materialises inputs.
 * Coercion implementations live in coercion.ts; this module owns the type
 * contracts and the registry factory.
 *
 * Scope boundary vs cells/ (see src/cells/registry.ts + descriptors.ts):
 *   - cells/ owns DISPLAY renderers (badge, progress, sparkline, link, star,
 *     heatmap, conditional) — how a cell looks in VIEW mode.
 *   - editing/ owns EDITOR input descriptors (text, number, select, ...) —
 *     what input the renderer materialises in EDIT mode.
 *   The two registries are complementary and share no type names.
 *
 * Scope boundary vs validation/ (src/validation/index.ts):
 *   - validation/ owns rule validation (required, email, pattern, ...).
 *   - editing/coercion.ts owns per-editor-type VALUE coercion only.
 */

// ---------------------------------------------------------------------------
// Editor kind
// ---------------------------------------------------------------------------

/**
 * All recognised editor kinds.  14 v2 types + async lookup = 15 total.
 */
export type EditorKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'date'
  | 'datetime'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'radio'
  | 'file'
  | 'url'
  | 'color'
  | 'range'
  | 'lookup';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** A single option entry for select / multiselect / radio editors. */
export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Async lookup options source with per-instance cache.
 * Callers check the cache before invoking load().
 */
export interface LookupOptionsSource {
  /**
   * Load options for a given key (field name or derived cache key).
   */
  load(key: string): Promise<SelectOption[]>;
  /** Mutable cache; populated by the renderer after the first load. */
  cache: Map<string, SelectOption[]>;
}

// ---------------------------------------------------------------------------
// Per-kind metadata
// ---------------------------------------------------------------------------

export interface TextMeta {
  maxLength?: number | undefined;
  placeholder?: string | undefined;
  /** textarea only */
  rows?: number | undefined;
  /** text only — hint that this is single-line */
  multiline?: boolean | undefined;
}

export interface NumberMeta {
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  precision?: number | undefined;
}

export interface RangeMeta {
  min: number;
  max: number;
  step: number;
}

export interface FileMeta {
  accept?: string | undefined;
  multiple?: boolean | undefined;
}

export interface ColorMeta {
  /** Output format: 'hex' (default) or 'rgb'. */
  format?: 'hex' | 'rgb' | undefined;
}

// ---------------------------------------------------------------------------
// Descriptor
// ---------------------------------------------------------------------------

/**
 * A fully-typed descriptor for one editor kind.
 *
 * T is the logical value type that this editor works with.
 * The renderer reads the descriptor and creates the appropriate input element.
 */
export interface EditorDescriptor<T = unknown> {
  /** The input kind the renderer should materialise. */
  kind: EditorKind;
  /**
   * Coerce a raw unknown cell value to the editor's internal type T.
   * Called when the editor is opened with the current stored value.
   */
  coerce(raw: unknown): T;
  /**
   * Parse the string value produced by the renderer's input element.
   */
  parse(input: string): T;
  /**
   * Serialise the stored value T to a string for display in view mode.
   */
  serialize(value: T): string;
  /** Static options list for select / multiselect / radio. */
  options?: SelectOption[] | undefined;
  /**
   * Async options source for 'lookup' (and optionally select/multiselect
   * backed by a remote list).
   */
  lookupSource?: LookupOptionsSource | undefined;
  /** Kind-specific metadata (bounds, accept, etc.). */
  meta?: TextMeta | NumberMeta | RangeMeta | FileMeta | ColorMeta | undefined;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Map from EditorKind to its descriptor.
 * Consumers can extend this by setting additional entries.
 */
export type EditorRegistry = Map<EditorKind, EditorDescriptor<unknown>>;

// ---------------------------------------------------------------------------
// Registry factory
// ---------------------------------------------------------------------------

import {
  coerceText,
  coerceTextarea,
  coerceNumber,
  coerceEmail,
  coerceDate,
  coerceDatetime,
  coerceSelect,
  coerceMultiselect,
  coerceCheckbox,
  coerceRadio,
  coerceFile,
  coerceUrl,
  coerceColor,
  coerceRange,
  coerceLookup,
} from './coercion';

/**
 * Create a fresh EditorRegistry pre-populated with all 15 built-in
 * descriptors (14 v2 types + lookup).
 *
 * Consumers typically hold one registry per application instance and add
 * custom entries via `registry.set(kind, descriptor)`.
 */
export function createEditorRegistry(): EditorRegistry {
  const registry: EditorRegistry = new Map();

  const textMeta: TextMeta = { multiline: false };
  registry.set('text', {
    kind: 'text',
    coerce: coerceText,
    parse: (s: string) => s,
    serialize: (v: unknown) => (v == null ? '' : String(v)),
    meta: textMeta,
  });

  const textareaMeta: TextMeta = { rows: 3 };
  registry.set('textarea', {
    kind: 'textarea',
    coerce: coerceTextarea,
    parse: (s: string) => s,
    serialize: (v: unknown) => (v == null ? '' : String(v)),
    meta: textareaMeta,
  });

  const numberMeta: NumberMeta = { precision: 2 };
  registry.set('number', {
    kind: 'number',
    coerce: coerceNumber,
    parse: (s: string) => {
      const n = parseFloat(s);
      return isNaN(n) ? null : n;
    },
    serialize: (v: unknown) => (v == null ? '' : String(v)),
    meta: numberMeta,
  });

  registry.set('email', {
    kind: 'email',
    coerce: coerceEmail,
    parse: (s: string) => s,
    serialize: (v: unknown) => (v == null ? '' : String(v)),
  });

  registry.set('date', {
    kind: 'date',
    coerce: coerceDate,
    parse: (s: string) => s, // stays as ISO date string
    serialize: (v: unknown) => (v == null ? '' : String(v)),
  });

  registry.set('datetime', {
    kind: 'datetime',
    coerce: coerceDatetime,
    parse: (s: string) => s, // stays as ISO datetime string
    serialize: (v: unknown) => (v == null ? '' : String(v)),
  });

  registry.set('select', {
    kind: 'select',
    coerce: coerceSelect,
    parse: (s: string) => s,
    serialize: (v: unknown) => (v == null ? '' : String(v)),
    options: [],
  });

  registry.set('multiselect', {
    kind: 'multiselect',
    coerce: coerceMultiselect,
    parse: (s: string) => (s === '' ? [] : s.split(',')),
    serialize: (v: unknown) => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v)),
    options: [],
  });

  registry.set('checkbox', {
    kind: 'checkbox',
    coerce: coerceCheckbox,
    parse: (s: string) => s === 'true' || s === '1' || s === 'on' || s === 'yes',
    serialize: (v: unknown) => (coerceCheckbox(v) ? 'Yes' : 'No'),
  });

  registry.set('radio', {
    kind: 'radio',
    coerce: coerceRadio,
    parse: (s: string) => s,
    serialize: (v: unknown) => (v == null ? '' : String(v)),
    options: [],
  });

  const fileMeta: FileMeta = { accept: '*/*', multiple: false };
  registry.set('file', {
    kind: 'file',
    coerce: coerceFile,
    parse: (s: string) => s,
    serialize: (v: unknown) => (v == null ? '' : String(v)),
    meta: fileMeta,
  });

  registry.set('url', {
    kind: 'url',
    coerce: coerceUrl,
    parse: (s: string) => s,
    serialize: (v: unknown) => (v == null ? '' : String(v)),
  });

  const colorMeta: ColorMeta = { format: 'hex' };
  registry.set('color', {
    kind: 'color',
    coerce: coerceColor,
    parse: (s: string) => (/^#[0-9a-f]{6}$/i.test(s) ? s : '#000000'),
    serialize: (v: unknown) => (v == null ? '' : String(v)),
    meta: colorMeta,
  });

  const rangeMeta: RangeMeta = { min: 0, max: 100, step: 1 };
  registry.set('range', {
    kind: 'range',
    coerce: coerceRange,
    parse: (s: string) => {
      const n = parseFloat(s);
      return isNaN(n) ? 0 : n;
    },
    serialize: (v: unknown) => (v == null ? '0' : String(v)),
    meta: rangeMeta,
  });

  registry.set('lookup', {
    kind: 'lookup',
    coerce: coerceLookup,
    parse: (s: string) => s,
    serialize: (v: unknown) => (v == null ? '' : String(v)),
    lookupSource: {
      load: async (_key: string) => [],
      cache: new Map<string, SelectOption[]>(),
    },
  });

  return registry;
}
