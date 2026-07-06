/**
 * editing/coercion.test.ts
 *
 * Tests for pure per-type value coercion.
 * Covers v2-compatible semantics plus edge cases for each EditorKind.
 */

import { describe, it, expect } from 'vitest';
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
  coerceForKind,
} from './coercion';

// ---------------------------------------------------------------------------
// coerceText / coerceTextarea
// ---------------------------------------------------------------------------

describe('coerceText', () => {
  it('returns empty string for null', () => expect(coerceText(null)).toBe(''));
  it('returns empty string for undefined', () => expect(coerceText(undefined)).toBe(''));
  it('returns the string as-is', () => expect(coerceText('hello')).toBe('hello'));
  it('converts number to string', () => expect(coerceText(42)).toBe('42'));
  it('converts boolean true to string', () => expect(coerceText(true)).toBe('true'));
  it('converts boolean false to string', () => expect(coerceText(false)).toBe('false'));
  it('converts object via toString', () => expect(typeof coerceText({})).toBe('string'));
});

describe('coerceTextarea', () => {
  it('same semantics as coerceText', () => {
    expect(coerceTextarea(null)).toBe('');
    expect(coerceTextarea('multiline\nvalue')).toBe('multiline\nvalue');
    expect(coerceTextarea(99)).toBe('99');
  });
});

// ---------------------------------------------------------------------------
// coerceNumber
// ---------------------------------------------------------------------------

describe('coerceNumber', () => {
  it('returns null for null', () => expect(coerceNumber(null)).toBeNull());
  it('returns null for undefined', () => expect(coerceNumber(undefined)).toBeNull());
  it('returns null for empty string', () => expect(coerceNumber('')).toBeNull());
  it('returns null for non-numeric string', () => expect(coerceNumber('abc')).toBeNull());
  it('returns null for NaN string', () => expect(coerceNumber('NaN')).toBeNull());
  it('passes through a valid number', () => expect(coerceNumber(42)).toBe(42));
  it('passes through negative number', () => expect(coerceNumber(-7.5)).toBe(-7.5));
  it('passes through zero', () => expect(coerceNumber(0)).toBe(0));
  it('parses a numeric string', () => expect(coerceNumber('3.14')).toBe(3.14));
  it('parses a negative numeric string', () => expect(coerceNumber('-100')).toBe(-100));
  it('handles leading whitespace in string', () => expect(coerceNumber('  5  ')).toBe(5));
  it('parses integer string', () => expect(coerceNumber('7')).toBe(7));
});

// ---------------------------------------------------------------------------
// coerceEmail
// ---------------------------------------------------------------------------

describe('coerceEmail', () => {
  it('returns empty string for null', () => expect(coerceEmail(null)).toBe(''));
  it('passes email string through', () => expect(coerceEmail('user@example.com')).toBe('user@example.com'));
  it('converts number to string', () => expect(coerceEmail(123)).toBe('123'));
});

// ---------------------------------------------------------------------------
// coerceDate
// ---------------------------------------------------------------------------

describe('coerceDate', () => {
  it('returns empty string for null', () => expect(coerceDate(null)).toBe(''));
  it('returns empty string for undefined', () => expect(coerceDate(undefined)).toBe(''));
  it('returns empty string for empty string', () => expect(coerceDate('')).toBe(''));
  it('returns empty string for invalid date string', () => expect(coerceDate('not-a-date')).toBe(''));
  it('formats a Date object to YYYY-MM-DD', () => {
    const result = coerceDate(new Date('2024-03-15T12:00:00Z'));
    expect(result).toBe('2024-03-15');
  });
  it('parses an ISO date string', () => {
    expect(coerceDate('2023-06-01')).toBe('2023-06-01');
  });
  it('parses a full ISO datetime string to date only', () => {
    const result = coerceDate('2024-01-20T10:30:00Z');
    expect(result).toBe('2024-01-20');
  });
  it('parses a year/month/day slash format', () => {
    const d = coerceDate('2023/04/10');
    // new Date('2023/04/10') should parse in most engines
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// coerceDatetime
// ---------------------------------------------------------------------------

describe('coerceDatetime', () => {
  it('returns empty string for null', () => expect(coerceDatetime(null)).toBe(''));
  it('returns empty string for undefined', () => expect(coerceDatetime(undefined)).toBe(''));
  it('returns empty string for empty string', () => expect(coerceDatetime('')).toBe(''));
  it('returns empty string for invalid date', () => expect(coerceDatetime('bad')).toBe(''));
  it('returns a YYYY-MM-DDTHH:mm string', () => {
    const result = coerceDatetime('2024-03-15T10:30:00Z');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
  it('result has exactly 16 characters', () => {
    const result = coerceDatetime('2024-06-01T08:00:00Z');
    expect(result).toHaveLength(16);
  });
  it('handles a Date object', () => {
    const d = new Date('2023-11-25T14:00:00Z');
    const result = coerceDatetime(d);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// coerceSelect
// ---------------------------------------------------------------------------

describe('coerceSelect', () => {
  it('returns empty string for null', () => expect(coerceSelect(null)).toBe(''));
  it('passes string through', () => expect(coerceSelect('option_a')).toBe('option_a'));
  it('converts number to string', () => expect(coerceSelect(3)).toBe('3'));
});

// ---------------------------------------------------------------------------
// coerceMultiselect
// ---------------------------------------------------------------------------

describe('coerceMultiselect', () => {
  it('returns empty array for null', () => expect(coerceMultiselect(null)).toEqual([]));
  it('returns empty array for undefined', () => expect(coerceMultiselect(undefined)).toEqual([]));
  it('returns empty array for empty string', () => expect(coerceMultiselect('')).toEqual([]));
  it('passes an array through (values stringified)', () => {
    expect(coerceMultiselect(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });
  it('splits a comma-separated string', () => {
    expect(coerceMultiselect('a,b,c')).toEqual(['a', 'b', 'c']);
  });
  it('trims whitespace from split parts', () => {
    expect(coerceMultiselect('a, b , c')).toEqual(['a', 'b', 'c']);
  });
  it('handles an array with numeric values', () => {
    expect(coerceMultiselect([1, 2, 3])).toEqual(['1', '2', '3']);
  });
  it('splits a single-element string', () => {
    expect(coerceMultiselect('single')).toEqual(['single']);
  });
});

// ---------------------------------------------------------------------------
// coerceCheckbox  (isTruthy v2 semantics)
// ---------------------------------------------------------------------------

describe('coerceCheckbox', () => {
  // boolean passthrough
  it('true → true', () => expect(coerceCheckbox(true)).toBe(true));
  it('false → false', () => expect(coerceCheckbox(false)).toBe(false));

  // string truthy values (case-insensitive)
  it('"true" → true', () => expect(coerceCheckbox('true')).toBe(true));
  it('"TRUE" → true', () => expect(coerceCheckbox('TRUE')).toBe(true));
  it('"1" → true', () => expect(coerceCheckbox('1')).toBe(true));
  it('"yes" → true', () => expect(coerceCheckbox('yes')).toBe(true));
  it('"YES" → true', () => expect(coerceCheckbox('YES')).toBe(true));
  it('"on" → true', () => expect(coerceCheckbox('on')).toBe(true));
  it('"ON" → true', () => expect(coerceCheckbox('ON')).toBe(true));

  // string falsy values
  it('"false" → false', () => expect(coerceCheckbox('false')).toBe(false));
  it('"0" → false', () => expect(coerceCheckbox('0')).toBe(false));
  it('"no" → false', () => expect(coerceCheckbox('no')).toBe(false));
  it('"off" → false', () => expect(coerceCheckbox('off')).toBe(false));
  it('"" → false', () => expect(coerceCheckbox('')).toBe(false));

  // number
  it('1 → true', () => expect(coerceCheckbox(1)).toBe(true));
  it('0 → false', () => expect(coerceCheckbox(0)).toBe(false));
  it('-1 → true', () => expect(coerceCheckbox(-1)).toBe(true));
  it('42 → true', () => expect(coerceCheckbox(42)).toBe(true));

  // other types
  it('null → false', () => expect(coerceCheckbox(null)).toBe(false));
  it('undefined → false', () => expect(coerceCheckbox(undefined)).toBe(false));
  it('object → false', () => expect(coerceCheckbox({})).toBe(false));
});

// ---------------------------------------------------------------------------
// coerceRadio
// ---------------------------------------------------------------------------

describe('coerceRadio', () => {
  it('returns empty string for null', () => expect(coerceRadio(null)).toBe(''));
  it('passes value through as string', () => expect(coerceRadio('option_b')).toBe('option_b'));
});

// ---------------------------------------------------------------------------
// coerceFile
// ---------------------------------------------------------------------------

describe('coerceFile', () => {
  it('returns empty string for null', () => expect(coerceFile(null)).toBe(''));
  it('passes filename string through', () => expect(coerceFile('report.pdf')).toBe('report.pdf'));
});

// ---------------------------------------------------------------------------
// coerceUrl
// ---------------------------------------------------------------------------

describe('coerceUrl', () => {
  it('returns empty string for null', () => expect(coerceUrl(null)).toBe(''));
  it('passes URL string through', () => expect(coerceUrl('https://example.com')).toBe('https://example.com'));
  it('passes URL without protocol through (no auto-prefix)', () => {
    expect(coerceUrl('example.com')).toBe('example.com');
  });
});

// ---------------------------------------------------------------------------
// coerceColor
// ---------------------------------------------------------------------------

describe('coerceColor', () => {
  it('returns #000000 for null', () => expect(coerceColor(null)).toBe('#000000'));
  it('returns #000000 for undefined', () => expect(coerceColor(undefined)).toBe('#000000'));
  it('returns #000000 for empty string', () => expect(coerceColor('')).toBe('#000000'));
  it('returns #000000 for non-hex string', () => expect(coerceColor('red')).toBe('#000000'));
  it('returns #000000 for invalid hex (too short)', () => expect(coerceColor('#fff')).toBe('#000000'));
  it('passes valid 6-digit lowercase hex through', () => expect(coerceColor('#aabbcc')).toBe('#aabbcc'));
  it('passes valid 6-digit uppercase hex through', () => expect(coerceColor('#AABBCC')).toBe('#AABBCC'));
  it('passes #000000 through', () => expect(coerceColor('#000000')).toBe('#000000'));
  it('passes #ffffff through', () => expect(coerceColor('#ffffff')).toBe('#ffffff'));
  it('handles leading/trailing whitespace', () => {
    expect(coerceColor('  #aabbcc  ')).toBe('#aabbcc');
  });
});

// ---------------------------------------------------------------------------
// coerceRange
// ---------------------------------------------------------------------------

describe('coerceRange', () => {
  it('returns 0 for null', () => expect(coerceRange(null)).toBe(0));
  it('returns 0 for undefined', () => expect(coerceRange(undefined)).toBe(0));
  it('returns 0 for empty string', () => expect(coerceRange('')).toBe(0));
  it('returns 0 for non-numeric string', () => expect(coerceRange('abc')).toBe(0));
  it('passes numeric value through', () => expect(coerceRange(42)).toBe(42));
  it('parses numeric string', () => expect(coerceRange('75')).toBe(75));
  it('parses float string', () => expect(coerceRange('3.5')).toBe(3.5));
  it('returns 0 for boolean false', () => expect(coerceRange(false)).toBe(0));
  it('passes 0 through', () => expect(coerceRange(0)).toBe(0));
});

// ---------------------------------------------------------------------------
// coerceLookup
// ---------------------------------------------------------------------------

describe('coerceLookup', () => {
  it('returns empty string for null', () => expect(coerceLookup(null)).toBe(''));
  it('passes ID string through', () => expect(coerceLookup('42')).toBe('42'));
  it('converts numeric ID to string', () => expect(coerceLookup(99)).toBe('99'));
});

// ---------------------------------------------------------------------------
// coerceForKind  (dispatcher)
// ---------------------------------------------------------------------------

describe('coerceForKind', () => {
  it('dispatches text', () => expect(coerceForKind('text', 'hello')).toBe('hello'));
  it('dispatches textarea', () => expect(coerceForKind('textarea', 'multi')).toBe('multi'));
  it('dispatches number', () => expect(coerceForKind('number', '3.14')).toBe(3.14));
  it('dispatches email', () => expect(coerceForKind('email', 'a@b.com')).toBe('a@b.com'));
  it('dispatches date', () => {
    const result = coerceForKind('date', '2024-01-01');
    expect(result).toBe('2024-01-01');
  });
  it('dispatches datetime', () => {
    const result = coerceForKind('datetime', '2024-01-01T10:00:00Z');
    expect(typeof result).toBe('string');
    expect(String(result)).toHaveLength(16);
  });
  it('dispatches select', () => expect(coerceForKind('select', 'opt')).toBe('opt'));
  it('dispatches multiselect', () => expect(coerceForKind('multiselect', 'a,b')).toEqual(['a', 'b']));
  it('dispatches checkbox true', () => expect(coerceForKind('checkbox', 'yes')).toBe(true));
  it('dispatches checkbox false', () => expect(coerceForKind('checkbox', null)).toBe(false));
  it('dispatches radio', () => expect(coerceForKind('radio', 'r1')).toBe('r1'));
  it('dispatches file', () => expect(coerceForKind('file', 'doc.pdf')).toBe('doc.pdf'));
  it('dispatches url', () => expect(coerceForKind('url', 'https://x.com')).toBe('https://x.com'));
  it('dispatches color', () => expect(coerceForKind('color', '#112233')).toBe('#112233'));
  it('dispatches range', () => expect(coerceForKind('range', 50)).toBe(50));
  it('dispatches lookup', () => expect(coerceForKind('lookup', '7')).toBe('7'));
});
