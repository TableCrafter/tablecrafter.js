/**
 * validation/index.ts
 *
 * v3 validation module.  Ports all v2 built-in rules as pure, typed rule
 * functions and exposes a buildValidator() factory that produces a Validator
 * for the core/state.ts seam.
 *
 * Rules ported from the v2 monolith (src/tablecrafter.js validateField):
 *   required, email, url, minLength, maxLength, min, max, pattern,
 *   phone (E.164 / permissive dual mode), unique (cross-data, case-insensitive
 *   option), date (min/max bounds), oneOf, notOneOf, custom(value,row,field)
 *
 * i18n design: message keys are plain strings.  Callers may supply a
 * MessageResolver to replace them; the default resolver returns the key
 * unchanged (opt-in translation without coupling to any i18n module).
 */

import type {
  ValidationRuleType,
  ValidationRule,
  ValidationResult,
  TableCrafterColumn,
} from '../core/types';
import type { Validator } from '../core/state';

// ---------------------------------------------------------------------------
// Extended rule types
//
// The Phase 0/1 core/types.ts ValidationRuleType union does not yet include
// 'email', 'url', or 'notOneOf' (v2 rules that pre-date the RFC split).  We
// extend the union locally so the validation module is self-contained and the
// type-checker is satisfied without touching core/types.ts.
// ---------------------------------------------------------------------------

/** All rule type identifiers recognised by this module. */
export type ValidationRuleTypeExtended =
  | ValidationRuleType
  | 'email'
  | 'url'
  | 'notOneOf';

/**
 * Extended validation rule that includes the extra rule types owned by this
 * module.  Assignable to the core ValidationRule where the base type is used;
 * cast with `as ValidationRuleExtended` when reading rules from column configs
 * at runtime.
 */
export interface ValidationRuleExtended extends Omit<ValidationRule, 'type'> {
  type: ValidationRuleTypeExtended;
}

// ---------------------------------------------------------------------------
// Message resolver hook
// ---------------------------------------------------------------------------

/**
 * Resolves a message key to a displayable string.  Replace with your i18n
 * adapter; the default implementation returns the key as-is.
 */
export type MessageResolver = (key: string, params?: Record<string, unknown>) => string;

/** Default pass-through resolver — returns the key with simple token substitution. */
function defaultResolver(key: string, params?: Record<string, unknown>): string {
  if (!params) return key;
  return Object.entries(params).reduce<string>(
    (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
    key
  );
}

// ---------------------------------------------------------------------------
// Built-in message keys (i18n anchors)
// ---------------------------------------------------------------------------

export const MSG_REQUIRED   = 'This field is required';
export const MSG_EMAIL      = 'Please enter a valid email address';
export const MSG_URL        = 'Please enter a valid URL';
export const MSG_MIN_LENGTH = 'Minimum length is {min} characters';
export const MSG_MAX_LENGTH = 'Maximum length is {max} characters';
export const MSG_MIN        = 'Minimum value is {min}';
export const MSG_MAX        = 'Maximum value is {max}';
export const MSG_PATTERN    = 'Please enter a valid format';
export const MSG_PHONE      = 'Please enter a valid phone number';
export const MSG_UNIQUE     = 'Value must be unique';
export const MSG_DATE       = 'Please enter a valid date';
export const MSG_DATE_MIN   = 'Date must be on or after {min}';
export const MSG_DATE_MAX   = 'Date must be on or before {max}';
export const MSG_ONE_OF     = 'Value must be one of {allowed}';
export const MSG_NOT_ONE_OF = 'Value is not allowed';
export const MSG_CUSTOM     = 'Validation failed';

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function coerceString(value: unknown): string {
  return String(value);
}

// ---------------------------------------------------------------------------
// Rule functions — each returns an error string or null
// ---------------------------------------------------------------------------

/** required: value must not be null / undefined / empty string. */
export function ruleRequired(
  value: unknown,
  rule: ValidationRuleExtended,
  resolver: MessageResolver = defaultResolver
): string | null {
  if (!rule.value) return null; // rule disabled
  if (isEmpty(value)) {
    return rule.message ?? resolver(MSG_REQUIRED);
  }
  return null;
}

/** email: must match a basic RFC-5322 shape. */
export function ruleEmail(
  value: unknown,
  rule: ValidationRuleExtended,
  resolver: MessageResolver = defaultResolver
): string | null {
  if (isEmpty(value)) return null;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_RE.test(coerceString(value))) {
    return rule.message ?? resolver(MSG_EMAIL);
  }
  return null;
}

/** url: must start with http(s):// and have at least one dot in the host. */
export function ruleUrl(
  value: unknown,
  rule: ValidationRuleExtended,
  resolver: MessageResolver = defaultResolver
): string | null {
  if (isEmpty(value)) return null;
  const URL_RE = /^https?:\/\/[^\s.]+\.[^\s]+$/;
  if (!URL_RE.test(coerceString(value))) {
    return rule.message ?? resolver(MSG_URL);
  }
  return null;
}

/** minLength: string length must be >= rule.value. */
export function ruleMinLength(
  value: unknown,
  rule: ValidationRuleExtended,
  resolver: MessageResolver = defaultResolver
): string | null {
  if (isEmpty(value)) return null;
  const min = Number(rule.value);
  if (coerceString(value).length < min) {
    return rule.message ?? resolver(MSG_MIN_LENGTH, { min });
  }
  return null;
}

/** maxLength: string length must be <= rule.value. */
export function ruleMaxLength(
  value: unknown,
  rule: ValidationRuleExtended,
  resolver: MessageResolver = defaultResolver
): string | null {
  if (isEmpty(value)) return null;
  const max = Number(rule.value);
  if (coerceString(value).length > max) {
    return rule.message ?? resolver(MSG_MAX_LENGTH, { max });
  }
  return null;
}

/** min: numeric value must be >= rule.value. */
export function ruleMin(
  value: unknown,
  rule: ValidationRuleExtended,
  resolver: MessageResolver = defaultResolver
): string | null {
  if (isEmpty(value)) return null;
  const num = parseFloat(coerceString(value));
  const min = Number(rule.value);
  if (!isNaN(num) && num < min) {
    return rule.message ?? resolver(MSG_MIN, { min });
  }
  return null;
}

/** max: numeric value must be <= rule.value. */
export function ruleMax(
  value: unknown,
  rule: ValidationRuleExtended,
  resolver: MessageResolver = defaultResolver
): string | null {
  if (isEmpty(value)) return null;
  const num = parseFloat(coerceString(value));
  const max = Number(rule.value);
  if (!isNaN(num) && num > max) {
    return rule.message ?? resolver(MSG_MAX, { max });
  }
  return null;
}

/** pattern: value must match the provided RegExp source string. */
export function rulePattern(
  value: unknown,
  rule: ValidationRuleExtended,
  resolver: MessageResolver = defaultResolver
): string | null {
  if (isEmpty(value)) return null;
  const src = coerceString(rule.value);
  const re = new RegExp(src);
  if (!re.test(coerceString(value))) {
    return rule.message ?? resolver(MSG_PATTERN);
  }
  return null;
}

/**
 * phone: dual mode.
 *   - `true` / `"E.164"` — ITU-T E.164: optional leading +, first digit 1-9,
 *     total digits 2–15.
 *   - `"permissive"` — strips common separators (spaces, dots, dashes,
 *     parentheses, +) and requires 7–15 remaining digits.
 */
export function rulePhone(
  value: unknown,
  rule: ValidationRuleExtended,
  resolver: MessageResolver = defaultResolver
): string | null {
  if (isEmpty(value)) return null;
  const mode = rule.value === 'permissive' ? 'permissive' : 'E.164';
  const str = coerceString(value);
  let ok: boolean;
  if (mode === 'permissive') {
    const digits = str.replace(/[\s().+\-]/g, '');
    ok = /^\d{7,15}$/.test(digits);
  } else {
    // E.164: optional +, first non-zero digit, 1-14 more digits (2-15 total)
    ok = /^\+?[1-9]\d{1,14}$/.test(str);
  }
  if (!ok) {
    return rule.message ?? resolver(MSG_PHONE);
  }
  return null;
}

/**
 * unique: the value must not already exist in allRows (excluding the current
 * row reference).
 *
 * rule.value shape:
 *   `true`                  — exact-match uniqueness check
 *   `{ caseInsensitive: true }` — case-insensitive match
 */
export function ruleUnique(
  value: unknown,
  rule: ValidationRuleExtended,
  context: { column: TableCrafterColumn; row: unknown; allRows: unknown[] },
  resolver: MessageResolver = defaultResolver
): string | null {
  if (isEmpty(value)) return null;
  const opts = (typeof rule.value === 'object' && rule.value !== null) ? rule.value as Record<string, unknown> : {};
  const ci = opts['caseInsensitive'] === true;
  const norm = (v: unknown): unknown =>
    ci && typeof v === 'string' ? v.toLowerCase() : v;
  const key = context.column.key;
  const target = norm(value);
  const dupe = context.allRows.some((other) => {
    if (other === context.row) return false;
    if (typeof other !== 'object' || other === null) return false;
    const cell = (other as Record<string, unknown>)[key];
    return norm(cell) === target;
  });
  if (dupe) {
    return rule.message ?? resolver(MSG_UNIQUE);
  }
  return null;
}

/**
 * date: value must be parseable as a Date.  rule.value may carry min/max
 * ISO-string bounds.
 *
 * rule.value shape:
 *   `true`              — parse only, no bounds
 *   `{ min?: string; max?: string }` — inclusive bounds
 */
export function ruleDate(
  value: unknown,
  rule: ValidationRuleExtended,
  resolver: MessageResolver = defaultResolver
): string | null {
  if (isEmpty(value)) return null;
  const parsed: Date = value instanceof Date ? value : new Date(coerceString(value));
  if (Number.isNaN(parsed.getTime())) {
    return rule.message ?? resolver(MSG_DATE);
  }
  const opts =
    typeof rule.value === 'object' && rule.value !== null
      ? (rule.value as { min?: string; max?: string })
      : {};
  if (opts.min) {
    const minDate = new Date(opts.min);
    if (!Number.isNaN(minDate.getTime()) && parsed < minDate) {
      return rule.message ?? resolver(MSG_DATE_MIN, { min: opts.min });
    }
  }
  if (opts.max) {
    const maxDate = new Date(opts.max);
    if (!Number.isNaN(maxDate.getTime()) && parsed > maxDate) {
      return rule.message ?? resolver(MSG_DATE_MAX, { max: opts.max });
    }
  }
  return null;
}

/**
 * oneOf: value must be strictly present in the allowed list.
 * rule.value is the allowed array.
 */
export function ruleOneOf(
  value: unknown,
  rule: ValidationRuleExtended,
  resolver: MessageResolver = defaultResolver
): string | null {
  if (isEmpty(value)) return null;
  const allowed = Array.isArray(rule.value) ? rule.value : [];
  if (!allowed.includes(value)) {
    const allowedStr = allowed.join(', ');
    return rule.message ?? resolver(MSG_ONE_OF, { allowed: allowedStr });
  }
  return null;
}

/**
 * notOneOf: value must NOT be present in the disallowed list.
 * rule.value is the disallowed array.
 */
export function ruleNotOneOf(
  value: unknown,
  rule: ValidationRuleExtended,
  resolver: MessageResolver = defaultResolver
): string | null {
  if (isEmpty(value)) return null;
  const disallowed = Array.isArray(rule.value) ? rule.value : [];
  if (disallowed.includes(value)) {
    const disallowedStr = disallowed.join(', ');
    return rule.message ?? resolver(MSG_NOT_ONE_OF, { disallowed: disallowedStr });
  }
  return null;
}

/**
 * custom: rule.validate is a user-supplied function.
 *   - return `true` → passes
 *   - return a string → that string is the error message
 *   - return anything else → falls back to rule.message or MSG_CUSTOM
 *   - throws → treated as failure with MSG_CUSTOM
 */
export function ruleCustom(
  value: unknown,
  rule: ValidationRuleExtended,
  context: { column: TableCrafterColumn; row: unknown },
  resolver: MessageResolver = defaultResolver
): string | null {
  if (typeof rule.validate !== 'function') return null;
  try {
    const result = rule.validate(value);
    if (result === true) return null;
    if (typeof result === 'string') return result;
    return rule.message ?? resolver(MSG_CUSTOM);
  } catch {
    return rule.message ?? resolver(MSG_CUSTOM);
  }
}

// ---------------------------------------------------------------------------
// evalRule — evaluate a single ValidationRule
// ---------------------------------------------------------------------------

/**
 * Evaluate one ValidationRule against a value.
 * Returns the error string, or null if the value passes.
 */
export function evalRule(
  value: unknown,
  rule: ValidationRuleExtended,
  context: { rows: unknown[]; column: TableCrafterColumn; row: unknown },
  resolver: MessageResolver = defaultResolver
): string | null {
  switch (rule.type) {
    case 'required':
      return ruleRequired(value, rule, resolver);
    case 'email':
      return ruleEmail(value, rule, resolver);
    case 'url':
      return ruleUrl(value, rule, resolver);
    case 'minLength':
      return ruleMinLength(value, rule, resolver);
    case 'maxLength':
      return ruleMaxLength(value, rule, resolver);
    case 'min':
      return ruleMin(value, rule, resolver);
    case 'max':
      return ruleMax(value, rule, resolver);
    case 'pattern':
      return rulePattern(value, rule, resolver);
    case 'phone':
      return rulePhone(value, rule, resolver);
    case 'unique':
      return ruleUnique(value, rule, { column: context.column, row: context.row, allRows: context.rows }, resolver);
    case 'date':
      return ruleDate(value, rule, resolver);
    case 'oneOf':
      return ruleOneOf(value, rule, resolver);
    case 'notOneOf':
      return ruleNotOneOf(value, rule, resolver);
    case 'custom':
      return ruleCustom(value, rule, { column: context.column, row: context.row }, resolver);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// validateCell — run all column rules
// ---------------------------------------------------------------------------

/**
 * Run all validation rules defined on a column against a proposed value.
 * Passes allRows for unique-constraint checking.
 *
 * Short-circuits after the required rule so format-style rules never run
 * against an empty value (v2 parity).
 */
export function validateCell(
  value: unknown,
  column: TableCrafterColumn,
  row: unknown,
  allRows: unknown[],
  resolver: MessageResolver = defaultResolver
): ValidationResult {
  // Cast to extended rule type: column.validation is typed as ValidationRule[]
  // (core/types.ts); at runtime rules may carry email/url/notOneOf types added
  // by this module, so we widen the type here for the switch in evalRule.
  const rules = (column.validation ?? []) as ValidationRuleExtended[];
  const errors: string[] = [];

  for (const rule of rules) {
    // If required fails, stop immediately (v2 parity)
    if (rule.type === 'required') {
      const err = evalRule(value, rule, { rows: allRows, column, row }, resolver);
      if (err !== null) {
        errors.push(err);
        return { valid: false, errors };
      }
      continue;
    }
    // Skip format rules when value is empty (v2 parity)
    if (isEmpty(value)) continue;

    const err = evalRule(value, rule, { rows: allRows, column, row }, resolver);
    if (err !== null) {
      errors.push(err);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// buildValidator — factory for the core/state.ts Validator seam
// ---------------------------------------------------------------------------

/**
 * Build a Validator function for the store seam from an array of column
 * configs.  The returned Validator is called by the store on COMMIT_EDIT.
 *
 * @param columns  — Full column config array; rules come from column.validation
 * @param resolver — Optional i18n resolver (defaults to identity)
 */
export function buildValidator(
  columns: TableCrafterColumn[],
  resolver: MessageResolver = defaultResolver
): Validator {
  return function validator(
    value: unknown,
    column: TableCrafterColumn,
    row: unknown,
    allRows: unknown[]
  ): ValidationResult {
    // Find the matching column config (by key) to pick up its validation rules
    const col = columns.find((c) => c.key === column.key) ?? column;
    return validateCell(value, col, row, allRows, resolver);
  };
}
