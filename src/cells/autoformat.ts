/**
 * cells/autoformat.ts
 *
 * Value-type detection helpers for the auto-format cell renderer.
 * All functions are pure predicates / classifiers — no DOM, no side effects.
 *
 * Detection order (per v2 detectDataType parity):
 *   1. boolean (native boolean or 'true'/'false' strings)
 *   2. email
 *   3. image URL  (http/https + image extension)
 *   4. url        (http/https, non-image)
 *   5. ISO date   (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss[.sss][Z])
 *   6. text       (fallback)
 */

export type AutoFormatType =
  | 'boolean'
  | 'email'
  | 'image'
  | 'url'
  | 'date'
  | 'text';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;
const IMAGE_EXT_RE = /\.(jpg|jpeg|png|gif|webp|svg|avif|bmp|ico)(\?.*)?$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z?)?$/;

/** Return true when value is boolean-ish. */
export function isBoolean(value: unknown): boolean {
  return (
    typeof value === 'boolean' ||
    value === 'true' ||
    value === 'false' ||
    value === 1 ||
    value === 0 ||
    value === '1' ||
    value === '0'
  );
}

/** Return true when string value looks like an email address. */
export function isEmail(value: unknown): boolean {
  return typeof value === 'string' && EMAIL_RE.test(value);
}

/** Return true when string value is an http/https URL pointing at a raster image. */
export function isImageUrl(value: unknown): boolean {
  return typeof value === 'string' && URL_RE.test(value) && IMAGE_EXT_RE.test(value);
}

/** Return true when string value is an http/https URL (non-image). */
export function isUrl(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    URL_RE.test(value) &&
    !IMAGE_EXT_RE.test(value)
  );
}

/** Return true when string value is a valid ISO-8601 date string. */
export function isIsoDate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

/**
 * Classify a raw value into an AutoFormatType.
 * Returns 'text' for null/undefined, objects, numbers without a special
 * meaning, etc. The caller decides what to render for the 'text' case.
 */
export function detectAutoFormat(value: unknown): AutoFormatType {
  if (value === null || value === undefined) return 'text';
  if (isBoolean(value)) return 'boolean';
  if (typeof value === 'string') {
    if (isEmail(value)) return 'email';
    if (isImageUrl(value)) return 'image';
    if (isUrl(value)) return 'url';
    if (isIsoDate(value)) return 'date';
  }
  return 'text';
}
