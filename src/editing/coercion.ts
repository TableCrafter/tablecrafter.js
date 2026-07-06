/**
 * editing/coercion.ts
 *
 * Pure per-type value coercion functions.
 * Ports v2 semantics from src/tablecrafter.js exactly.
 *
 * v2 references:
 *   - createTextEditor:      value = currentValue || ''
 *   - createTextareaEditor:  value = currentValue || ''
 *   - createNumberEditor:    value = currentValue || ''
 *   - createEmailEditor:     value = currentValue || ''
 *   - createDateEditor:      date.toISOString().split('T')[0]
 *   - createDateTimeEditor:  localDate.toISOString().slice(0, 16) (offset-corrected)
 *   - createSelectEditor:    value = string
 *   - createMultiSelectEditor: currentValue.split(',') || []
 *   - createCheckboxEditor:  isTruthy(currentValue)
 *   - createRadioEditor:     selected option value or ''
 *   - createFileEditor:      filename string or currentValue
 *   - createUrlEditor:       value = currentValue || ''
 *   - createColorEditor:     value = currentValue || '#000000'
 *   - createRangeEditor:     value = currentValue || column.min || 0
 */

// ---------------------------------------------------------------------------
// isTruthy
// ---------------------------------------------------------------------------

/**
 * Determine if a value is "truthy" for checkbox purposes.
 * Ports v2 TableCrafter.isTruthy() exactly.
 *
 * @example
 *   isTruthy(true)    // true
 *   isTruthy('yes')   // true
 *   isTruthy('1')     // true
 *   isTruthy('on')    // true
 *   isTruthy(1)       // true
 *   isTruthy(0)       // false
 *   isTruthy('')      // false
 *   isTruthy(null)    // false
 */
export function isTruthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }
  if (typeof value === 'number') return value !== 0;
  return false;
}

// ---------------------------------------------------------------------------
// Text / textarea
// ---------------------------------------------------------------------------

/**
 * Coerce to a string, returning '' for null/undefined.
 * Used by: text, textarea, file, radio (for stored value).
 */
export function coerceText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

// ---------------------------------------------------------------------------
// Email / URL
// ---------------------------------------------------------------------------

/**
 * Coerce to string and trim leading/trailing whitespace.
 * Used by: email, url (canonical stored form should have no stray spaces).
 */
export function coerceTrimmed(value: unknown): string {
  return coerceText(value).trim();
}

// ---------------------------------------------------------------------------
// Number
// ---------------------------------------------------------------------------

/**
 * Coerce to a number.  Returns null for empty / unparseable values.
 *
 * v2 number input stores whatever the element.value is, which is a string;
 * the canonical stored type for number columns is number.  Null is returned
 * instead of NaN to keep downstream comparisons clean.
 *
 * @example
 *   coerceNumber('42')    // 42
 *   coerceNumber(3.14)    // 3.14
 *   coerceNumber('')      // null
 *   coerceNumber(null)    // null
 *   coerceNumber('abc')   // null
 */
export function coerceNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Date
// ---------------------------------------------------------------------------

/**
 * Coerce a date value to a YYYY-MM-DD ISO string.
 *
 * v2 createDateEditor normalizes via `date.toISOString().split('T')[0]`.
 * Any Date instance or string parseable by `new Date()` is accepted.
 * Returns null for unparseable input.
 *
 * @example
 *   coerceDate('2024-03-15T00:00:00Z')  // '2024-03-15'
 *   coerceDate(new Date('2024-06-01'))   // '2024-06-01'
 *   coerceDate('')                       // null
 *   coerceDate('not-a-date')             // null
 */
export function coerceDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0] ?? null;
}

// ---------------------------------------------------------------------------
// Datetime
// ---------------------------------------------------------------------------

/**
 * Coerce a datetime value to the YYYY-MM-DDTHH:mm format used by
 * `<input type="datetime-local">`.
 *
 * v2 createDateTimeEditor corrects for the local timezone offset:
 *   `const localDate = new Date(date.getTime() - (offset * 60 * 1000));`
 *   `input.value = localDate.toISOString().slice(0, 16);`
 *
 * Returns null for unparseable input.
 *
 * @example
 *   coerceDatetime('2024-06-15T10:30:00Z')  // '2024-06-15T10:30' (UTC offset 0)
 *   coerceDatetime('')                       // null
 */
export function coerceDatetime(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  // Replicate v2 offset correction to get local datetime string.
  const offsetMs = d.getTimezoneOffset() * 60 * 1000;
  const localDate = new Date(d.getTime() - offsetMs);
  return localDate.toISOString().slice(0, 16);
}

// ---------------------------------------------------------------------------
// Checkbox
// ---------------------------------------------------------------------------

/**
 * Coerce to boolean from the stored cell value via isTruthy.
 * The editor's checked state is always boolean; isTruthy handles legacy
 * string-encoded booleans like '1', 'yes', 'true', 'on'.
 */
export function coerceCheckbox(value: unknown): boolean {
  return isTruthy(value);
}

// ---------------------------------------------------------------------------
// Multiselect
// ---------------------------------------------------------------------------

/**
 * Coerce to an array of strings (multiselect).
 *
 * v2 createMultiSelectEditor splits: `currentValue.split(',')` when the
 * stored value is not already an array.
 *
 * @example
 *   coerceMultiselect(['a', 'b'])      // ['a', 'b']
 *   coerceMultiselect('a,b,c')         // ['a', 'b', 'c']
 *   coerceMultiselect('  a , b ')      // ['a', 'b']
 *   coerceMultiselect(null)            // []
 *   coerceMultiselect('')              // []
 */
export function coerceMultiselect(value: unknown): string[] {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value.map((v) => String(v));
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

/**
 * Coerce a color value to a lowercase hex string.
 * Defaults to '#000000' when the input is empty or not a 6-digit hex color.
 *
 * v2 createColorEditor: `input.value = currentValue || '#000000'`.
 * The canonical stored form is lowercase hex.
 *
 * @example
 *   coerceColor('#FF3300')    // '#ff3300'
 *   coerceColor('#ff3300')    // '#ff3300'
 *   coerceColor(null)         // '#000000'
 *   coerceColor('')           // '#000000'
 *   coerceColor('red')        // '#000000' (not a valid 6-digit hex)
 */
export function coerceColor(value: unknown): string {
  if (value === null || value === undefined || value === '') return '#000000';
  const str = String(value).trim();
  return /^#[0-9a-f]{6}$/i.test(str) ? str.toLowerCase() : '#000000';
}

// ---------------------------------------------------------------------------
// Range
// ---------------------------------------------------------------------------

/**
 * Coerce a range value to a number.
 *
 * v2 createRangeEditor getValue() returns element.value, which is a string.
 * We serialize that string back to a number; 0 is the fallback for empty/NaN.
 *
 * @example
 *   coerceRange('50')    // 50
 *   coerceRange(75)      // 75
 *   coerceRange('')      // 0
 *   coerceRange(null)    // 0
 *   coerceRange('abc')   // 0
 */
export function coerceRange(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isNaN(n) ? 0 : n;
}
