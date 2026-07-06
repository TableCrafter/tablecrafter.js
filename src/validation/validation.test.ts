/**
 * src/validation/validation.test.ts
 *
 * Comprehensive vitest tests for the v3 validation module.
 * Covers all 13 built-in rules with v2 edge-case parity.
 * Equivalence proof against the v2 Jest suites:
 *   test/validation-builtin-rules.test.js
 *   test/validation-date-rule.test.js
 *   test/validation-phone-unique.test.js
 */

import { describe, it, expect } from 'vitest';
import {
  ruleRequired,
  ruleEmail,
  ruleUrl,
  ruleMinLength,
  ruleMaxLength,
  ruleMin,
  ruleMax,
  rulePattern,
  rulePhone,
  ruleUnique,
  ruleDate,
  ruleOneOf,
  ruleNotOneOf,
  ruleCustom,
  evalRule,
  validateCell,
  buildValidator,
  MSG_REQUIRED,
  MSG_EMAIL,
  MSG_URL,
  MSG_MIN_LENGTH,
  MSG_MAX_LENGTH,
  MSG_MIN,
  MSG_MAX,
  MSG_PATTERN,
  MSG_PHONE,
  MSG_UNIQUE,
  MSG_DATE,
  MSG_DATE_MIN,
  MSG_DATE_MAX,
  MSG_ONE_OF,
  MSG_NOT_ONE_OF,
  MSG_CUSTOM,
  type MessageResolver,
  type ValidationRuleExtended,
  type ValidationRuleTypeExtended,
} from './index';
import type { TableCrafterColumn } from '../core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function col(key = 'value', extra: Partial<TableCrafterColumn> = {}): TableCrafterColumn {
  return { key, ...extra };
}

function rule(type: ValidationRuleTypeExtended, value?: unknown, message?: string): ValidationRuleExtended {
  return { type, value, ...(message !== undefined ? { message } : {}) };
}

/** Build a column config with extended validation rules (casts away the narrow core type). */
function colV(key: string, validation: ValidationRuleExtended[]): TableCrafterColumn {
  return { key, validation: validation as unknown as import('../core/types').ValidationRule[] };
}

// ---------------------------------------------------------------------------
// 1. required
// ---------------------------------------------------------------------------

describe('ruleRequired', () => {
  it('returns null when value is present', () => {
    expect(ruleRequired('hello', rule('required', true))).toBeNull();
    expect(ruleRequired(0, rule('required', true))).toBeNull();
    expect(ruleRequired(false, rule('required', true))).toBeNull();
  });

  it('returns default message for null', () => {
    expect(ruleRequired(null, rule('required', true))).toBe(MSG_REQUIRED);
  });

  it('returns default message for undefined', () => {
    expect(ruleRequired(undefined, rule('required', true))).toBe(MSG_REQUIRED);
  });

  it('returns default message for empty string', () => {
    expect(ruleRequired('', rule('required', true))).toBe(MSG_REQUIRED);
  });

  it('returns null when rule.value is falsy (rule disabled)', () => {
    expect(ruleRequired('', rule('required', false))).toBeNull();
  });

  it('honours custom message override', () => {
    expect(ruleRequired('', rule('required', true, 'Name is required'))).toBe('Name is required');
  });

  it('passes custom resolver', () => {
    const resolver: MessageResolver = (k) => `[${k}]`;
    expect(ruleRequired('', rule('required', true), resolver)).toBe(`[${MSG_REQUIRED}]`);
  });
});

// ---------------------------------------------------------------------------
// 2. email
// ---------------------------------------------------------------------------

describe('ruleEmail', () => {
  it('accepts valid email addresses', () => {
    expect(ruleEmail('alice@example.com', rule('email', true))).toBeNull();
    expect(ruleEmail('a+tag@sub.domain.co.uk', rule('email', true))).toBeNull();
  });

  it('rejects malformed email addresses', () => {
    expect(ruleEmail('notanemail', rule('email', true))).toBe(MSG_EMAIL);
    expect(ruleEmail('missing@domain', rule('email', true))).not.toBeNull();
    expect(ruleEmail('@nodomain.com', rule('email', true))).not.toBeNull();
  });

  it('skips validation on empty value', () => {
    expect(ruleEmail('', rule('email', true))).toBeNull();
    expect(ruleEmail(null, rule('email', true))).toBeNull();
    expect(ruleEmail(undefined, rule('email', true))).toBeNull();
  });

  it('honours custom message', () => {
    expect(ruleEmail('bad', rule('email', true, 'invalid email'))).toBe('invalid email');
  });
});

// ---------------------------------------------------------------------------
// 3. url
// ---------------------------------------------------------------------------

describe('ruleUrl', () => {
  it('accepts well-formed http(s) URLs', () => {
    expect(ruleUrl('https://example.com', rule('url', true))).toBeNull();
    expect(ruleUrl('http://example.com/path?q=1#x', rule('url', true))).toBeNull();
    expect(ruleUrl('https://sub.example.co.uk:8080/a/b', rule('url', true))).toBeNull();
  });

  it('rejects malformed URLs', () => {
    expect(ruleUrl('not a url', rule('url', true))).toBe(MSG_URL);
    expect(ruleUrl('example.com', rule('url', true))).not.toBeNull();
    expect(ruleUrl('ftp://example.com', rule('url', true))).not.toBeNull();
    expect(ruleUrl('http://', rule('url', true))).not.toBeNull();
  });

  it('skips validation on empty value', () => {
    expect(ruleUrl('', rule('url', true))).toBeNull();
    expect(ruleUrl(null, rule('url', true))).toBeNull();
  });

  it('honours custom message', () => {
    expect(ruleUrl('nope', rule('url', true, 'must be a link'))).toBe('must be a link');
  });
});

// ---------------------------------------------------------------------------
// 4. minLength
// ---------------------------------------------------------------------------

describe('ruleMinLength', () => {
  it('returns null when length >= min', () => {
    expect(ruleMinLength('hello', rule('minLength', 5))).toBeNull();
    expect(ruleMinLength('hi', rule('minLength', 2))).toBeNull();
  });

  it('returns message when length < min', () => {
    const r = ruleMinLength('hi', rule('minLength', 5));
    expect(r).toContain('5');
  });

  it('default message contains the min value', () => {
    const r = ruleMinLength('ab', rule('minLength', 10));
    expect(r).toBe(MSG_MIN_LENGTH.replace('{min}', '10'));
  });

  it('skips on empty value', () => {
    expect(ruleMinLength('', rule('minLength', 3))).toBeNull();
  });

  it('honours custom message', () => {
    expect(ruleMinLength('a', rule('minLength', 5, 'too short'))).toBe('too short');
  });
});

// ---------------------------------------------------------------------------
// 5. maxLength
// ---------------------------------------------------------------------------

describe('ruleMaxLength', () => {
  it('returns null when length <= max', () => {
    expect(ruleMaxLength('hello', rule('maxLength', 10))).toBeNull();
    expect(ruleMaxLength('hi', rule('maxLength', 2))).toBeNull();
  });

  it('returns message when length > max', () => {
    const r = ruleMaxLength('toolongvalue', rule('maxLength', 5));
    expect(r).toContain('5');
  });

  it('skips on empty value', () => {
    expect(ruleMaxLength('', rule('maxLength', 3))).toBeNull();
  });

  it('honours custom message', () => {
    expect(ruleMaxLength('toolong', rule('maxLength', 3, 'too long'))).toBe('too long');
  });
});

// ---------------------------------------------------------------------------
// 6. min
// ---------------------------------------------------------------------------

describe('ruleMin', () => {
  it('returns null when value >= min', () => {
    expect(ruleMin(10, rule('min', 5))).toBeNull();
    expect(ruleMin(5, rule('min', 5))).toBeNull();
    expect(ruleMin('10', rule('min', 5))).toBeNull();
  });

  it('returns message when value < min', () => {
    const r = ruleMin(3, rule('min', 5));
    expect(r).toContain('5');
  });

  it('skips on empty value', () => {
    expect(ruleMin('', rule('min', 5))).toBeNull();
    expect(ruleMin(null, rule('min', 5))).toBeNull();
  });

  it('skips on non-numeric value (NaN guard)', () => {
    expect(ruleMin('abc', rule('min', 5))).toBeNull();
  });

  it('honours custom message', () => {
    expect(ruleMin(1, rule('min', 5, 'too small'))).toBe('too small');
  });
});

// ---------------------------------------------------------------------------
// 7. max
// ---------------------------------------------------------------------------

describe('ruleMax', () => {
  it('returns null when value <= max', () => {
    expect(ruleMax(3, rule('max', 5))).toBeNull();
    expect(ruleMax(5, rule('max', 5))).toBeNull();
  });

  it('returns message when value > max', () => {
    const r = ruleMax(100, rule('max', 10));
    expect(r).toContain('10');
  });

  it('skips on empty value', () => {
    expect(ruleMax('', rule('max', 5))).toBeNull();
  });

  it('honours custom message', () => {
    expect(ruleMax(999, rule('max', 10, 'too big'))).toBe('too big');
  });
});

// ---------------------------------------------------------------------------
// 8. pattern
// ---------------------------------------------------------------------------

describe('rulePattern', () => {
  it('returns null when value matches the pattern', () => {
    expect(rulePattern('abc123', rule('pattern', '^[a-z0-9]+$'))).toBeNull();
  });

  it('returns message when value does not match', () => {
    const r = rulePattern('ABC!', rule('pattern', '^[a-z0-9]+$'));
    expect(r).toBe(MSG_PATTERN);
  });

  it('skips on empty value', () => {
    expect(rulePattern('', rule('pattern', '^\\d+$'))).toBeNull();
  });

  it('honours custom message', () => {
    expect(rulePattern('bad', rule('pattern', '^good$', 'wrong format'))).toBe('wrong format');
  });
});

// ---------------------------------------------------------------------------
// 9. phone
// ---------------------------------------------------------------------------

describe('rulePhone (E.164 default)', () => {
  it('accepts well-formed E.164 numbers', () => {
    expect(rulePhone('+14155552671', rule('phone', true))).toBeNull();
    expect(rulePhone('+442071838750', rule('phone', true))).toBeNull();
    expect(rulePhone('14155552671', rule('phone', true))).toBeNull();
  });

  it('rejects malformed numbers', () => {
    // E.164 forbids leading 0
    expect(rulePhone('0123456789', rule('phone', true))).not.toBeNull();
    expect(rulePhone('+', rule('phone', true))).not.toBeNull();
    expect(rulePhone('abc', rule('phone', true))).not.toBeNull();
    // > 15 digits
    expect(rulePhone('+1234567890123456', rule('phone', true))).not.toBeNull();
  });

  it('explicit "E.164" behaves the same as true', () => {
    expect(rulePhone('+14155552671', rule('phone', 'E.164'))).toBeNull();
    expect(rulePhone('0123456789', rule('phone', 'E.164'))).not.toBeNull();
  });

  it('skips on empty value', () => {
    expect(rulePhone('', rule('phone', true))).toBeNull();
    expect(rulePhone(null, rule('phone', true))).toBeNull();
  });

  it('returns default message on failure', () => {
    expect(rulePhone('abc', rule('phone', true))).toBe(MSG_PHONE);
  });

  it('honours custom message', () => {
    expect(rulePhone('abc', rule('phone', true, 'bad phone'))).toBe('bad phone');
  });
});

describe('rulePhone (permissive)', () => {
  it('accepts numbers with separators, parentheses, and country codes', () => {
    expect(rulePhone('(415) 555-2671', rule('phone', 'permissive'))).toBeNull();
    expect(rulePhone('+1 415-555-2671', rule('phone', 'permissive'))).toBeNull();
    expect(rulePhone('415.555.2671', rule('phone', 'permissive'))).toBeNull();
  });

  it('still rejects clearly non-phone strings', () => {
    expect(rulePhone('hello', rule('phone', 'permissive'))).not.toBeNull();
    expect(rulePhone('12', rule('phone', 'permissive'))).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 10. unique
// ---------------------------------------------------------------------------

describe('ruleUnique', () => {
  const column = col('value');
  const rows = [{ value: 'alpha' }, { value: 'beta' }];

  it('accepts values not present elsewhere', () => {
    const ctx = { column, row: { value: 'gamma' }, allRows: rows };
    expect(ruleUnique('gamma', rule('unique', true), ctx)).toBeNull();
  });

  it('rejects values that already appear in another row', () => {
    const ctx = { column, row: { value: 'alpha-new' }, allRows: rows };
    expect(ruleUnique('alpha', rule('unique', true), ctx)).toBe(MSG_UNIQUE);
  });

  it('does not count the row being edited as a duplicate of itself', () => {
    const ctx = { column, row: rows[0], allRows: rows };
    expect(ruleUnique('alpha', rule('unique', true), ctx)).toBeNull();
  });

  it('case-insensitive when { caseInsensitive: true }', () => {
    const ciRows = [{ value: 'Alpha' }];
    const ctx = { column, row: { value: 'alpha' }, allRows: ciRows };
    expect(ruleUnique('alpha', rule('unique', { caseInsensitive: true }), ctx)).not.toBeNull();
  });

  it('case-sensitive by default', () => {
    const ciRows = [{ value: 'Alpha' }];
    const ctx = { column, row: { value: 'alpha' }, allRows: ciRows };
    expect(ruleUnique('alpha', rule('unique', true), ctx)).toBeNull();
  });

  it('skips on empty value', () => {
    const ctx = { column, row: {}, allRows: rows };
    expect(ruleUnique('', rule('unique', true), ctx)).toBeNull();
  });

  it('honours custom message', () => {
    const ctx = { column, row: { value: 'new' }, allRows: rows };
    expect(ruleUnique('alpha', rule('unique', true, 'must be unique'), ctx)).toBe('must be unique');
  });
});

// ---------------------------------------------------------------------------
// 11. date
// ---------------------------------------------------------------------------

describe('ruleDate', () => {
  it('accepts ISO date strings', () => {
    expect(ruleDate('2026-04-28', rule('date', true))).toBeNull();
    expect(ruleDate('2024-02-29', rule('date', true))).toBeNull(); // leap year
  });

  it('accepts Date instances', () => {
    expect(ruleDate(new Date(), rule('date', true))).toBeNull();
  });

  it('accepts ISO datetimes', () => {
    expect(ruleDate('2026-04-28T12:00:00Z', rule('date', true))).toBeNull();
  });

  it('rejects unparseable dates', () => {
    expect(ruleDate('not a date', rule('date', true))).toBe(MSG_DATE);
  });

  it('skips on empty value', () => {
    expect(ruleDate('', rule('date', true))).toBeNull();
    expect(ruleDate(null, rule('date', true))).toBeNull();
  });

  describe('min bound', () => {
    it('rejects dates earlier than min', () => {
      const r = ruleDate('2025-12-31', rule('date', { min: '2026-01-01' }));
      expect(r).toMatch(/2026-01-01|after/i);
    });

    it('accepts dates equal to min', () => {
      expect(ruleDate('2026-01-01', rule('date', { min: '2026-01-01' }))).toBeNull();
    });

    it('accepts dates after min', () => {
      expect(ruleDate('2026-02-01', rule('date', { min: '2026-01-01' }))).toBeNull();
    });
  });

  describe('max bound', () => {
    it('rejects dates after max', () => {
      const r = ruleDate('2027-01-01', rule('date', { max: '2026-12-31' }));
      expect(r).toMatch(/2026-12-31|before/i);
    });

    it('accepts dates equal to max', () => {
      expect(ruleDate('2026-12-31', rule('date', { max: '2026-12-31' }))).toBeNull();
    });
  });

  describe('combined min + max', () => {
    it('only dates inside the inclusive range pass', () => {
      const opts = { min: '2026-01-01', max: '2026-12-31' };
      expect(ruleDate('2025-12-31', rule('date', opts))).not.toBeNull();
      expect(ruleDate('2026-01-01', rule('date', opts))).toBeNull();
      expect(ruleDate('2026-06-15', rule('date', opts))).toBeNull();
      expect(ruleDate('2026-12-31', rule('date', opts))).toBeNull();
      expect(ruleDate('2027-01-01', rule('date', opts))).not.toBeNull();
    });
  });

  it('honours custom message on parse failure', () => {
    expect(ruleDate('bad', rule('date', true, 'not a date'))).toBe('not a date');
  });
});

// ---------------------------------------------------------------------------
// 12. oneOf
// ---------------------------------------------------------------------------

describe('ruleOneOf', () => {
  it('accepts values present in the allowed list', () => {
    expect(ruleOneOf('draft', rule('oneOf', ['draft', 'published', 'archived']))).toBeNull();
    expect(ruleOneOf('published', rule('oneOf', ['draft', 'published']))).toBeNull();
  });

  it('rejects values outside the allowed list', () => {
    const r = ruleOneOf('pending', rule('oneOf', ['draft', 'published']));
    expect(r).not.toBeNull();
    expect(r).toMatch(/draft|published|allowed/i);
  });

  it('handles numeric and mixed-type lists', () => {
    expect(ruleOneOf(2, rule('oneOf', [1, 2, 3]))).toBeNull();
    expect(ruleOneOf(4, rule('oneOf', [1, 2, 3]))).not.toBeNull();
  });

  it('skips on empty value', () => {
    expect(ruleOneOf('', rule('oneOf', ['a', 'b']))).toBeNull();
    expect(ruleOneOf(null, rule('oneOf', ['a', 'b']))).toBeNull();
  });

  it('default message includes allowed values', () => {
    const r = ruleOneOf('x', rule('oneOf', ['a', 'b']));
    expect(r).toContain('a');
    expect(r).toContain('b');
  });

  it('honours custom message', () => {
    expect(ruleOneOf('x', rule('oneOf', ['a'], 'pick one'))).toBe('pick one');
  });
});

// ---------------------------------------------------------------------------
// 13. notOneOf
// ---------------------------------------------------------------------------

describe('ruleNotOneOf', () => {
  it('accepts values not in the disallowed list', () => {
    expect(ruleNotOneOf('editor', rule('notOneOf', ['admin', 'root']))).toBeNull();
  });

  it('rejects values present in the disallowed list', () => {
    const r = ruleNotOneOf('admin', rule('notOneOf', ['admin', 'root']));
    expect(r).toBe(MSG_NOT_ONE_OF);
  });

  it('skips on empty value', () => {
    expect(ruleNotOneOf('', rule('notOneOf', ['admin']))).toBeNull();
  });

  it('honours custom message', () => {
    expect(ruleNotOneOf('admin', rule('notOneOf', ['admin'], 'not allowed'))).toBe('not allowed');
  });
});

// ---------------------------------------------------------------------------
// 14. custom
// ---------------------------------------------------------------------------

describe('ruleCustom', () => {
  const column = col('value');

  it('returns null when validate() returns true', () => {
    const r: ValidationRuleExtended = { type: 'custom', validate: () => true };
    expect(ruleCustom('anything', r, { column, row: {} })).toBeNull();
  });

  it('returns the string when validate() returns a string', () => {
    const r: ValidationRuleExtended = { type: 'custom', validate: () => 'custom error' };
    expect(ruleCustom('anything', r, { column, row: {} })).toBe('custom error');
  });

  it('returns default message when validate() returns false', () => {
    const r: ValidationRuleExtended = { type: 'custom', validate: () => false };
    expect(ruleCustom('anything', r, { column, row: {} })).toBe(MSG_CUSTOM);
  });

  it('uses rule.message when validate() returns non-true non-string', () => {
    const r: ValidationRuleExtended = { type: 'custom', validate: () => false, message: 'my msg' };
    expect(ruleCustom('anything', r, { column, row: {} })).toBe('my msg');
  });

  it('catches thrown errors and returns default message', () => {
    const r: ValidationRuleExtended = { type: 'custom', validate: () => { throw new Error('boom'); } };
    expect(ruleCustom('anything', r, { column, row: {} })).toBe(MSG_CUSTOM);
  });

  it('returns null when validate is not a function', () => {
    const r: ValidationRuleExtended = { type: 'custom' };
    expect(ruleCustom('anything', r, { column, row: {} })).toBeNull();
  });

  it('receives value, and is called (row access pattern)', () => {
    const received: unknown[] = [];
    const r: ValidationRuleExtended = {
      type: 'custom',
      validate: (v) => { received.push(v); return true; }
    };
    ruleCustom('testval', r, { column, row: { value: 'testval' } });
    expect(received).toEqual(['testval']);
  });
});

// ---------------------------------------------------------------------------
// evalRule -- dispatch tests
// ---------------------------------------------------------------------------

describe('evalRule', () => {
  const column = col('x');
  const ctx = { rows: [], column, row: {} };

  it('dispatches required', () => {
    expect(evalRule('', rule('required', true), ctx)).toBe(MSG_REQUIRED);
    expect(evalRule('hi', rule('required', true), ctx)).toBeNull();
  });

  it('dispatches email', () => {
    expect(evalRule('bad', rule('email', true), ctx)).toBe(MSG_EMAIL);
  });

  it('dispatches url', () => {
    expect(evalRule('nope', rule('url', true), ctx)).toBe(MSG_URL);
  });

  it('dispatches minLength', () => {
    expect(evalRule('ab', rule('minLength', 5), ctx)).not.toBeNull();
  });

  it('dispatches maxLength', () => {
    expect(evalRule('toolong', rule('maxLength', 3), ctx)).not.toBeNull();
  });

  it('dispatches min', () => {
    expect(evalRule(1, rule('min', 5), ctx)).not.toBeNull();
  });

  it('dispatches max', () => {
    expect(evalRule(100, rule('max', 10), ctx)).not.toBeNull();
  });

  it('dispatches pattern', () => {
    expect(evalRule('ABC', rule('pattern', '^[a-z]+$'), ctx)).toBe(MSG_PATTERN);
  });

  it('dispatches phone', () => {
    expect(evalRule('abc', rule('phone', true), ctx)).toBe(MSG_PHONE);
  });

  it('dispatches unique', () => {
    const rows = [{ x: 'taken' }];
    expect(evalRule('taken', rule('unique', true), { rows, column, row: {} })).toBe(MSG_UNIQUE);
    expect(evalRule('free', rule('unique', true), { rows, column, row: {} })).toBeNull();
  });

  it('dispatches date', () => {
    expect(evalRule('not a date', rule('date', true), ctx)).toBe(MSG_DATE);
    expect(evalRule('2026-01-01', rule('date', true), ctx)).toBeNull();
  });

  it('dispatches oneOf', () => {
    expect(evalRule('x', rule('oneOf', ['a', 'b']), ctx)).not.toBeNull();
    expect(evalRule('a', rule('oneOf', ['a', 'b']), ctx)).toBeNull();
  });

  it('dispatches notOneOf', () => {
    expect(evalRule('admin', rule('notOneOf', ['admin']), ctx)).not.toBeNull();
    expect(evalRule('user', rule('notOneOf', ['admin']), ctx)).toBeNull();
  });

  it('dispatches custom', () => {
    const r: ValidationRuleExtended = { type: 'custom', validate: () => 'fail' };
    expect(evalRule('v', r, ctx)).toBe('fail');
  });

  it('returns null for unknown rule type', () => {
    // Cast to bypass TS for the runtime guard
    expect(evalRule('v', { type: 'unknown' as never }, ctx)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateCell -- multi-rule column
// ---------------------------------------------------------------------------

describe('validateCell', () => {
  it('returns valid: true when no rules', () => {
    const result = validateCell('anything', col('v'), {}, []);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('collects all errors (not just first)', () => {
    const c = colV('v', [rule('minLength', 10), rule('pattern', '^[A-Z]+$')]);
    const result = validateCell('hi', c, {}, []);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });

  it('required fails and short-circuits: no further rules run', () => {
    const c = colV('v', [rule('required', true), rule('email', true)]);
    const result = validateCell('', c, {}, []);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/required/i);
  });

  it('empty + not-required: skips format rules (v2 parity)', () => {
    const c = colV('v', [rule('email', true)]);
    expect(validateCell('', c, {}, [])).toEqual({ valid: true, errors: [] });
    expect(validateCell(null, c, {}, [])).toEqual({ valid: true, errors: [] });
  });

  it('passes allRows for unique rule', () => {
    const rows = [{ v: 'taken' }];
    const c = colV('v', [rule('unique', true)]);
    expect(validateCell('taken', c, {}, rows).valid).toBe(false);
    expect(validateCell('free', c, {}, rows).valid).toBe(true);
  });

  it('required + url: empty fails required only (v2 parity)', () => {
    const c = colV('v', [rule('required', true), rule('url', true)]);
    const r = validateCell('', c, {}, []);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/required/i);
  });

  it('required + url: malformed fails url after required passes', () => {
    const c = colV('v', [rule('required', true), rule('url', true)]);
    const r = validateCell('nope', c, {}, []);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/url/i);
  });

  it('accepts custom MessageResolver', () => {
    const resolver: MessageResolver = (k) => `CUSTOM:${k}`;
    const c = colV('v', [rule('email', true)]);
    const r = validateCell('bad', c, {}, [], resolver);
    expect(r.errors[0]).toBe(`CUSTOM:${MSG_EMAIL}`);
  });
});

// ---------------------------------------------------------------------------
// buildValidator -- Validator seam integration
// ---------------------------------------------------------------------------

describe('buildValidator', () => {
  it('returns a Validator function', () => {
    const v = buildValidator([]);
    expect(typeof v).toBe('function');
  });

  it('returns valid for a column with no rules', () => {
    const v = buildValidator([col('name')]);
    const result = v('Alice', col('name'), {}, []);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('runs rules from the column config', () => {
    const columns = [colV('email', [rule('required', true), rule('email', true)])];
    const v = buildValidator(columns);
    // empty -> required
    expect(v('', columns[0]!, {}, []).valid).toBe(false);
    // bad email
    expect(v('notanemail', columns[0]!, {}, []).valid).toBe(false);
    // good email
    expect(v('a@b.com', columns[0]!, {}, []).valid).toBe(true);
  });

  it('passes through unique allRows context', () => {
    const columns = [colV('name', [rule('unique', true)])];
    const v = buildValidator(columns);
    const allRows = [{ name: 'Alice' }];
    expect(v('Alice', columns[0]!, { name: 'Bob' }, allRows).valid).toBe(false);
    expect(v('Bob', columns[0]!, { name: 'Bob' }, allRows).valid).toBe(true);
  });

  it('accepts custom MessageResolver', () => {
    const resolver: MessageResolver = () => 'CUSTOM_ERROR';
    const columns = [colV('v', [rule('required', true)])];
    const v = buildValidator(columns, resolver);
    const result = v('', columns[0]!, {}, []);
    expect(result.errors[0]).toBe('CUSTOM_ERROR');
  });

  it('produces a result assignable to ValidationResult shape', () => {
    const v = buildValidator([]);
    const result = v(42, col('n'), {}, []);
    expect(typeof result.valid).toBe('boolean');
    expect(Array.isArray(result.errors)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Message keys -- all exported and unique
// ---------------------------------------------------------------------------

describe('message key exports', () => {
  const keys = [
    MSG_REQUIRED, MSG_EMAIL, MSG_URL, MSG_MIN_LENGTH, MSG_MAX_LENGTH,
    MSG_MIN, MSG_MAX, MSG_PATTERN, MSG_PHONE, MSG_UNIQUE, MSG_DATE,
    MSG_DATE_MIN, MSG_DATE_MAX, MSG_ONE_OF, MSG_NOT_ONE_OF, MSG_CUSTOM,
  ];

  it('exports 16 distinct message key constants', () => {
    expect(new Set(keys).size).toBe(16);
  });

  it('all keys are non-empty strings', () => {
    for (const k of keys) {
      expect(typeof k).toBe('string');
      expect(k.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Cross-rule interplay (v2 equivalence proofs)
// ---------------------------------------------------------------------------

describe('cross-rule interplay (v2 parity)', () => {
  it('phone + required: empty -> required only', () => {
    const c = colV('v', [rule('required', true), rule('phone', true)]);
    const r = validateCell('', c, {}, []);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/required/i);
  });

  it('oneOf + required: empty -> required only', () => {
    const c = colV('v', [rule('required', true), rule('oneOf', ['a', 'b'])]);
    const r = validateCell('', c, {}, []);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/required/i);
  });

  it('date + required: empty -> required only', () => {
    const c = colV('v', [rule('required', true), rule('date', true)]);
    const r = validateCell('', c, {}, []);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/required/i);
  });

  it('url + required: empty -> required only (v2 parity)', () => {
    const c = colV('v', [rule('required', true), rule('url', true)]);
    const r = validateCell('', c, {}, []);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/required/i);
  });

  it('multiple format rules accumulate errors on a non-empty bad value', () => {
    const c = colV('v', [
      rule('email', true),
      rule('minLength', 100),
      rule('pattern', '^NEVER$'),
    ]);
    const r = validateCell('bad', c, {}, []);
    expect(r.errors.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// MessageResolver token substitution
// ---------------------------------------------------------------------------

describe('MessageResolver token substitution (default resolver)', () => {
  it('substitutes {min} in minLength message', () => {
    const r = ruleMinLength('ab', rule('minLength', 7));
    expect(r).toBe('Minimum length is 7 characters');
  });

  it('substitutes {max} in maxLength message', () => {
    const r = ruleMaxLength('toolong!!', rule('maxLength', 3));
    expect(r).toBe('Maximum length is 3 characters');
  });

  it('substitutes {min} in min message', () => {
    const r = ruleMin(1, rule('min', 10));
    expect(r).toBe('Minimum value is 10');
  });

  it('substitutes {max} in max message', () => {
    const r = ruleMax(99, rule('max', 10));
    expect(r).toBe('Maximum value is 10');
  });

  it('substitutes {allowed} in oneOf message', () => {
    const r = ruleOneOf('x', rule('oneOf', ['alpha', 'beta']));
    expect(r).toContain('alpha');
    expect(r).toContain('beta');
  });

  it('substitutes {min} in dateMin message', () => {
    const r = ruleDate('2020-01-01', rule('date', { min: '2026-01-01' }));
    expect(r).toContain('2026-01-01');
  });

  it('substitutes {max} in dateMax message', () => {
    const r = ruleDate('2030-01-01', rule('date', { max: '2026-12-31' }));
    expect(r).toContain('2026-12-31');
  });
});
