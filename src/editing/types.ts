/**
 * editing/types.ts
 *
 * Typed editor descriptor shapes for all 14 built-in editor types (+ lookup).
 * These are pure data objects -- no DOM.  The render/dom module converts them
 * into actual input elements by reading these descriptors.
 *
 * Complement to cells/descriptors.ts (which owns render-side read descriptors).
 * The editor registry here is the write-side equivalent: which input kind to
 * create, how to coerce values, and where to source options.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** All first-class editor type identifiers (14 v2 types + lookup). */
export type EditorType =
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

/**
 * HTML input kind the renderer should materialize.
 * Maps 1-to-1 to the `type` attribute for <input>, or to the tag name for
 * textarea/select.
 */
export type InputKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'date'
  | 'datetime-local'
  | 'select'
  | 'select-multiple'
  | 'checkbox'
  | 'radio'
  | 'file'
  | 'url'
  | 'color'
  | 'range';

// ---------------------------------------------------------------------------
// Options sources (select / multiselect / radio / lookup)
// ---------------------------------------------------------------------------

/** A single option in a select, multiselect, radio, or lookup editor. */
export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Options source: static list or async fetch with cache.
 *
 * Static: the renderer uses the pre-built options array.
 * Async:  the renderer calls fetch() once on mount; the function is
 *         responsible for caching (see buildLookupOptionsSource in registry.ts).
 */
export type OptionsSource =
  | { kind: 'static'; options: SelectOption[] }
  | {
      kind: 'async';
      /**
       * Fetch options for the editor.  Implementations MUST cache internally
       * so repeated renderer calls do not fire redundant network requests.
       * AbortSignal is passed when available so in-flight requests can be
       * cancelled on editor close.
       */
      fetch: (signal?: AbortSignal) => Promise<SelectOption[]>;
    };

// ---------------------------------------------------------------------------
// Constraint hints
// ---------------------------------------------------------------------------

/**
 * Renderer hint constraints.
 * The renderer applies these as HTML attributes; the descriptor stays DOM-free.
 * All fields are optional.
 */
export interface EditorConstraints {
  min?: number | string | undefined;
  max?: number | string | undefined;
  step?: number | string | undefined;
  maxLength?: number | undefined;
  placeholder?: string | undefined;
  /** For file editors: MIME-type accept string (e.g. "image/*"). */
  accept?: string | undefined;
  /** For file editors: allow multiple file selection. */
  multiple?: boolean | undefined;
  /** For textarea editors: number of visible rows. */
  rows?: number | undefined;
}

// ---------------------------------------------------------------------------
// EditorDescriptor
// ---------------------------------------------------------------------------

/**
 * Editor descriptor -- pure data shape handed to the renderer.
 * The renderer creates the corresponding input element from this descriptor.
 *
 * Coercion contract:
 *   parse(stored)      -- stored value -> editor display value (open)
 *   serialize(editor)  -- editor value -> canonical stored value (commit)
 */
export interface EditorDescriptor {
  /** Editor type identifier (matches v2 cellType name). */
  type: EditorType;
  /** HTML input kind the renderer should create. */
  inputKind: InputKind;
  /**
   * Convert a stored cell value to the editor's display value.
   * Called when opening the editor (before the renderer mounts the input).
   */
  parse(stored: unknown): unknown;
  /**
   * Convert the editor's current value back to the canonical stored value.
   * Called on commit/save after the user closes the editor.
   */
  serialize(editorValue: unknown): unknown;
  /**
   * Optional options source (for select, multiselect, radio, lookup).
   * Absent for value-only editors (text, number, date, checkbox, etc.).
   */
  optionsSource?: OptionsSource | undefined;
  /**
   * Optional constraint hints for the renderer.
   * The renderer applies these as HTML attributes without reading the DOM.
   */
  constraints?: EditorConstraints | undefined;
}

// ---------------------------------------------------------------------------
// EditorRegistry
// ---------------------------------------------------------------------------

/** The editor descriptor registry interface. */
export interface EditorRegistry {
  /** Register a named editor descriptor.  Overwrites any prior registration. */
  register(type: EditorType | string, descriptor: EditorDescriptor): void;
  /** Retrieve a descriptor by type name.  Returns undefined if not found. */
  get(type: EditorType | string): EditorDescriptor | undefined;
  /** Return all registered type names. */
  keys(): string[];
}
