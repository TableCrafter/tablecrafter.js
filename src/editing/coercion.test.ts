/**
 * editing/coercion.test.ts
 *
 * Vitest unit tests for all coercion functions.
 * Ports v2 cell-editors.test.js semantics, adding edge-case coverage per type.
 */

import { describe, it, expect } from 'vitest';
import {
  isTruthy,
  coerceText,
  coerceTrimmed,
  coerceNumber,
  coerceDate,
  coerceDatetime,
  coerceCheckbox,
  coerceMultiselect,
  coerceColor,
  coerceRange,
} from './coercion';

// ---------------------------------------------------------------------------
// isTruthy
// ---------------------------------------------------------------------------

describe('isTruthy', () => {
  it('true boolean returns true', () => {
    expect(isTruthy(true)).toBe(true);
  });

  it('false boolean returns false', () => {
    expect(isTruthy(false)).toBe(false);
  });

  it('"true" string returns true', () => {
    expect(isTruthy('true')).toBe(true);
  });

  it('"True" mixed-case returns true', () => {
    expect(isTruthy('True')).toBe(true);
  });

  it('"1" string returns true', () => {
    expect(isTruthy('1')).toBe(true);
  });

  it('"yes" returns true', () => {
    expect(isTruthy('yes')).toBe(true);
  });

  it('"YES" returns true', () => {
    expect(isTruthy('YES')).toBe(true);
  });

  it('"on" returns true', () => {
    expect(isTruthy('on')).toBe(true);
  });

  it('"false" returns false', () => {
    expect(isTruthy('false')).toBe(false);
  });

  it('"0" returns false', () => {
    expect(isTruthy('0')).toBe(false);
  });

  it('"no" returns false', () => {
    expect(isTruthy('no')).toBe(false);
  });

  it('empty string returns false', () => {
    expect(isTruthy('')).toBe(false);
  });

  it('numeric 1 returns true', () => {
    expect(isTruthy(1)).toBe(true);
  });

  it('numeric -1 returns true', () => {
    expect(isTruthy(-1)).toBe(true);
  });

  it('numeric 0 returns false', () => {
    expect(isTruthy(0)).toBe(false);
  });

  it('null returns false', () => {
    expect(isTruthy(null)).toBe(false);
  });

  it('undefined returns false', () => {
    expect(isTruthy(undefined)).toBe(false);
  });

  it('object returns false', () => {
    expect(isTruthy({})).toBe(false);
  });

  it('array returns false', () => {
    expect(isTruthy([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// coerceText
// ---------------------------------------------------------------------------

describe('coerceText', () => {
  it('returns string as-is', () => {
    expect(coerceText('hello')).toBe('hello');
  });

  it('converts number to string', () => {
    expect(coerceText(42)).toBe('42');
  });

  it('converts null to empty string', () => {
    expect(coerceText(null)).toBe('');
  });

  it('converts undefined to empty string', () => {
    expect(coerceText(undefined)).toBe('');
  });

  it('converts false to "false"', () => {
    expect(coerceText(false)).toBe('false');
  });

  it('converts 0 to "0"', () => {
    expect(coerceText(0)).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// coerceTrimmed
// ---------------------------------------------------------------------------

describe('coerceTrimmed', () => {
  it('trims leading whitespace', () => {
    expect(coerceTrimmed('  hello')).toBe('hello');
  });

  it('trims trailing whitespace', () => {
    expect(coerceTrimmed('hello  ')).toBe('hello');
  });

  it('trims both ends', () => {
    expect(coerceTrimmed('  hello  ')).toBe('hello');
  });

  it('returns empty string for null', () => {
    expect(coerceTrimmed(null)).toBe('');
  });

  it('preserves internal spaces', () => {
    expect(coerceTrimmed('hello world')).toBe('hello world');
  });
});

// ---------------------------------------------------------------------------
// coerceNumber
// ---------------------------------------------------------------------------

describe('coerceNumber', () => {
  it('returns integer number as-is', () => {
    expect(coerceNumber(42)).toBe(42);
  });

  it('returns float number as-is', () => {
    expect(coerceNumber(3.14)).toBe(3.14);
  });

  it('parses integer string', () => {
    expect(coerceNumber('42')).toBe(42);
  });

  it('parses float string', () => {
    expect(coerceNumber('3.14')).toBe(3.14);
  });

  it('parses negative string', () => {
    expect(coerceNumber('-10')).toBe(-10);
  });

  it('returns null for empty string', () => {
    expect(coerceNumber('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(coerceNumber(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(coerceNumber(undefined)).toBeNull();
  });

  it('returns null for non-numeric string', () => {
    expect(coerceNumber('abc')).toBeNull();
  });

  it('returns null for NaN', () => {
    expect(coerceNumber(NaN)).toBeNull();
  });

  it('returns 0 for "0"', () => {
    expect(coerceNumber('0')).toBe(0);
  });

  it('parses leading-digit strings (parseFloat behavior)', () => {
    // parseFloat('3px') = 3
    expect(coerceNumber('3px')).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// coerceDate
// ---------------------------------------------------------------------------

describe('coerceDate', () => {
  it('returns null for null', () => {
    expect(coerceDate(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(coerceDate(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(coerceDate('')).toBeNull();
  });

  it('returns null for invalid date string', () => {
    expect(coerceDate('not-a-date')).toBeNull();
  });

  it('normalizes ISO datetime string to YYYY-MM-DD', () => {
    expect(coerceDate('2024-03-15T00:00:00Z')).toBe('2024-03-15');
  });

  it('passes through YYYY-MM-DD string', () => {
    expect(coerceDate('2024-06-01')).toBe('2024-06-01');
  });

  it('accepts a Date instance', () => {
    const d = new Date('2024-01-01T00:00:00Z');
    expect(coerceDate(d)).toBe('2024-01-01');
  });

  it('normalizes date with time component', () => {
    // Date at midnight UTC
    const result = coerceDate('2023-12-25T00:00:00.000Z');
    expect(result).toBe('2023-12-25');
  });
});

// ---------------------------------------------------------------------------
// coerceDatetime
// ---------------------------------------------------------------------------

describe('coerceDatetime', () => {
  it('returns null for null', () => {
    expect(coerceDatetime(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(coerceDatetime(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(coerceDatetime('')).toBeNull();
  });

  it('returns null for invalid string', () => {
    expect(coerceDatetime('not-a-datetime')).toBeNull();
  });

  it('produces a 16-char YYYY-MM-DDTHH:mm string', () => {
    const result = coerceDatetime('2024-06-15T10:30:00Z');
    // Length should be 16 regardless of timezone (YYYY-MM-DDTHH:mm)
    expect(typeof result).toBe('string');
    expect(result!.length).toBe(16);
    expect(result!).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('accepts a Date instance', () => {
    const d = new Date('2024-06-15T10:30:00Z');
    const result = coerceDatetime(d);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// coerceCheckbox
// ---------------------------------------------------------------------------

describe('coerceCheckbox', () => {
  it('true returns true', () => {
    expect(coerceCheckbox(true)).toBe(true);
  });

  it('false returns false', () => {
    expect(coerceCheckbox(false)).toBe(false);
  });

  it('"true" returns true', () => {
    expect(coerceCheckbox('true')).toBe(true);
  });

  it('"1" returns true', () => {
    expect(coerceCheckbox('1')).toBe(true);
  });

  it('"yes" returns true', () => {
    expect(coerceCheckbox('yes')).toBe(true);
  });

  it('"on" returns true', () => {
    expect(coerceCheckbox('on')).toBe(true);
  });

  it('null returns false', () => {
    expect(coerceCheckbox(null)).toBe(false);
  });

  it('undefined returns false', () => {
    expect(coerceCheckbox(undefined)).toBe(false);
  });

  it('0 returns false', () => {
    expect(coerceCheckbox(0)).toBe(false);
  });

  it('1 returns true', () => {
    expect(coerceCheckbox(1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// coerceMultiselect
// ---------------------------------------------------------------------------

describe('coerceMultiselect', () => {
  it('returns empty array for null', () => {
    expect(coerceMultiselect(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(coerceMultiselect(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(coerceMultiselect('')).toEqual([]);
  });

  it('passes through string array', () => {
    expect(coerceMultiselect(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('splits comma-separated string', () => {
    expect(coerceMultiselect('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('trims spaces after splitting', () => {
    expect(coerceMultiselect('a, b , c')).toEqual(['a', 'b', 'c']);
  });

  it('filters empty tokens from split', () => {
    expect(coerceMultiselect(',a,,b,')).toEqual(['a', 'b']);
  });

  it('coerces array elements to strings', () => {
    expect(coerceMultiselect([1, 2, 3])).toEqual(['1', '2', '3']);
  });
});

// ---------------------------------------------------------------------------
// coerceColor
// ---------------------------------------------------------------------------

describe('coerceColor', () => {
  it('returns "#000000" for null', () => {
    expect(coerceColor(null)).toBe('#000000');
  });

  it('returns "#000000" for undefined', () => {
    expect(coerceColor(undefined)).toBe('#000000');
  });

  it('returns "#000000" for empty string', () => {
    expect(coerceColor('')).toBe('#000000');
  });

  it('returns "#000000" for non-hex string', () => {
    expect(coerceColor('red')).toBe('#000000');
  });

  it('lowercases a valid uppercase hex color', () => {
    expect(coerceColor('#FF3300')).toBe('#ff3300');
  });

  it('passes through already lowercase hex', () => {
    expect(coerceColor('#ff3300')).toBe('#ff3300');
  });

  it('returns "#000000" for 3-digit hex (invalid)', () => {
    expect(coerceColor('#f30')).toBe('#000000');
  });

  it('returns "#000000" for 8-digit hex (invalid for 6-digit check)', () => {
    expect(coerceColor('#ff330011')).toBe('#000000');
  });

  it('normalizes #000000 correctly', () => {
    expect(coerceColor('#000000')).toBe('#000000');
  });

  it('normalizes #ffffff correctly', () => {
    expect(coerceColor('#FFFFFF')).toBe('#ffffff');
  });
});

// ---------------------------------------------------------------------------
// coerceRange
// ---------------------------------------------------------------------------

describe('coerceRange', () => {
  it('returns 0 for null', () => {
    expect(coerceRange(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(coerceRange(undefined)).toBe(0);
  });

  it('returns 0 for empty string', () => {
    expect(coerceRange('')).toBe(0);
  });

  it('returns 0 for non-numeric string', () => {
    expect(coerceRange('abc')).toBe(0);
  });

  it('parses integer string', () => {
    expect(coerceRange('50')).toBe(50);
  });

  it('returns numeric value as-is', () => {
    expect(coerceRange(75)).toBe(75);
  });

  it('parses float string', () => {
    expect(coerceRange('3.5')).toBe(3.5);
  });

  it('returns 0 for NaN', () => {
    expect(coerceRange(NaN)).toBe(0);
  });

  it('handles negative values', () => {
    expect(coerceRange(-10)).toBe(-10);
  });
});
