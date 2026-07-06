/**
 * editing/coercion.ts
 *
 * Pure per-type value coercion, ported exactly from v2 semantics.
 * All functions are free of side effects and DOM references.
 *
 * Naming: coerce<Kind>(raw: unknown): <LogicalType>
 *
 * v2 reference: TableCrafter.createTextEditor, createNumberEditor, isTruthy,
 * createDateEditor, createDateTimeEditor, createCheckboxEditor, etc. in
 * src/tablecrafter.js.
 */

import type { EditorKind } from './types';

// ---------------------------------------------------------------------------
// Text / textarea
// ---------------------------------------------------------------------------

/**
 * Coerce any value to a string for text / textarea editors.
 * v2: input.value = currentValue || ''
 */
export function coerceText(raw: unknown): string {
  if (raw == null) return '';
  return String(raw);
}

/** Same semantics as coerceText; textarea is just multiline text. */
export function coerceTextarea(raw: unknown): string {
  return coerceText(raw);
}

// ---------------------------------------------------------------------------
// Number
// ---------------------------------------------------------------------------

/**
 * Coerce to a number or null.
 * v2: input.value = currentValue || '' (empty string means "no value")
 * parse: parseFloat is used at save-time.
 */
export function coerceNumber(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const n = parseFloat(String(raw));
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

/**
 * v2: input.value = currentValue || ''
 */
export function coerceEmail(raw: unknown): string {
  return coerceText(raw);
}

// ---------------------------------------------------------------------------
// Date  (YYYY-MM-DD)
// ---------------------------------------------------------------------------

/**
 * Coerce any date-like value to an ISO YYYY-MM-DD string.
 * Returns '' for invalid / absent values.
 * v2: date.toISOString().split('T')[0]
 */
export function coerceDate(raw: unknown): string {
  if (raw == null || raw === '') return '';
  const d = raw instanceof Date ? raw : new Date(String(raw));
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0] ?? '';
}

// ---------------------------------------------------------------------------
// Datetime (YYYY-MM-DDTHH:mm — local time)
// ---------------------------------------------------------------------------

/**
 * Coerce to a local-time ISO datetime string suitable for <input type="datetime-local">.
 * v2: adjusts for timezone offset so the displayed value is in the user's
 * local time rather than UTC.
 */
export function coerceDatetime(raw: unknown): string {
  if (raw == null || raw === '') return '';
  const d = raw instanceof Date ? raw : new Date(String(raw));
  if (isNaN(d.getTime())) return '';
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

/**
 * Coerce to string for select editors.
 * v2: option.value === currentValue comparison (loose ==)
 */
export function coerceSelect(raw: unknown): string {
  if (raw == null) return '';
  return String(raw);
}

// ---------------------------------------------------------------------------
// Multiselect (array of strings)
// ---------------------------------------------------------------------------

/**
 * Coerce to an array of strings for multiselect editors.
 * v2 semantics:
 *   - Arrays are used as-is (values become strings)
 *   - Strings are split on ',' (trimmed)
 *   - null / undefined → empty array
 */
export function coerceMultiselect(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map(String);
  const str = String(raw);
  if (str === '') return [];
  return str.split(',').map((s) => s.trim());
}

// ---------------------------------------------------------------------------
// Checkbox (boolean)
// ---------------------------------------------------------------------------

/**
 * Truthy coercion for checkboxes, ported from v2's `isTruthy` method.
 *
 * v2 semantics:
 *   boolean  → as-is
 *   string   → 'true' | '1' | 'yes' | 'on' (case-insensitive)
 *   number   → value !== 0
 *   other    → false
 */
export function coerceCheckbox(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    return ['true', '1', 'yes', 'on'].includes(raw.toLowerCase());
  }
  if (typeof raw === 'number') return raw !== 0;
  return false;
}

// ---------------------------------------------------------------------------
// Radio
// ---------------------------------------------------------------------------

/** Coerce to string for radio editors (same as select). */
export function coerceRadio(raw: unknown): string {
  return coerceSelect(raw);
}

// ---------------------------------------------------------------------------
// File
// ---------------------------------------------------------------------------

/**
 * Coerce to a filename string.
 * v2: currentValue is treated as a filename string in the "current file" preview.
 */
export function coerceFile(raw: unknown): string {
  return coerceText(raw);
}

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------

/**
 * Coerce to a URL string.
 * v2: input.value = currentValue || ''
 */
export function coerceUrl(raw: unknown): string {
  return coerceText(raw);
}

// ---------------------------------------------------------------------------
// Color (hex string)
// ---------------------------------------------------------------------------

/**
 * Coerce to a hex colour string.
 * v2: input.value = currentValue || '#000000'
 * Falls back to '#000000' when the value is absent or not a valid hex colour.
 */
export function coerceColor(raw: unknown): string {
  if (raw == null || raw === '') return '#000000';
  const s = String(raw).trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  return '#000000';
}

// ---------------------------------------------------------------------------
// Range (number)
// ---------------------------------------------------------------------------

/**
 * Coerce to a number for range editors.
 * v2: range.value = currentValue || column.min || 0
 * Falls back to 0 when the value is absent or not parseable.
 */
export function coerceRange(raw: unknown): number {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') return raw;
  const n = parseFloat(String(raw));
  return isNaN(n) ? 0 : n;
}

// ---------------------------------------------------------------------------
// Lookup (ID string)
// ---------------------------------------------------------------------------

/**
 * Coerce to a string ID for lookup editors.
 * The value stored in the cell is the lookup key (e.g. '42'), not the display label.
 */
export function coerceLookup(raw: unknown): string {
  return coerceSelect(raw);
}

// ---------------------------------------------------------------------------
// Generic dispatcher
// ---------------------------------------------------------------------------

/**
 * Coerce a raw value for a given EditorKind.
 * Returns the coerced value as `unknown`; callers narrow to the expected type.
 */
export function coerceForKind(kind: EditorKind, raw: unknown): unknown {
  switch (kind) {
    case 'text':        return coerceText(raw);
    case 'textarea':    return coerceTextarea(raw);
    case 'number':      return coerceNumber(raw);
    case 'email':       return coerceEmail(raw);
    case 'date':        return coerceDate(raw);
    case 'datetime':    return coerceDatetime(raw);
    case 'select':      return coerceSelect(raw);
    case 'multiselect': return coerceMultiselect(raw);
    case 'checkbox':    return coerceCheckbox(raw);
    case 'radio':       return coerceRadio(raw);
    case 'file':        return coerceFile(raw);
    case 'url':         return coerceUrl(raw);
    case 'color':       return coerceColor(raw);
    case 'range':       return coerceRange(raw);
    case 'lookup':      return coerceLookup(raw);
    default: {
      // exhaustive check — TypeScript will warn if a new kind is not handled
      const _exhaustive: never = kind;
      return String(_exhaustive);
    }
  }
}
