/**
 * Tests for i18n.formats.formatNumber / formatDate hooks and distinct aggregation.
 * Implements the acceptance criteria from issue #327.
 */

const TableCrafter = require('../src/tablecrafter');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTable(config) {
  document.body.innerHTML = '<div id="t"></div>';
  return new TableCrafter('#t', config);
}

function makeNumericTable(formats) {
  return makeTable({
    columns: [{ field: 'value', type: 'number' }],
    data: [{ value: 1234567.89 }],
    i18n: { locale: 'en', formats }
  });
}

function makeDateTable(formats) {
  return makeTable({
    columns: [{ field: 'created', type: 'date' }],
    data: [{ created: '2024-03-15' }],
    i18n: { locale: 'en', formats }
  });
}

// ---------------------------------------------------------------------------
// i18n.formats.formatNumber — Intl options object
// ---------------------------------------------------------------------------

describe('i18n.formats.formatNumber: Intl options object', () => {
  test('formatValue applies Intl.NumberFormat with the resolved locale when formatNumber is an options object', () => {
    const table = makeNumericTable({
      formatNumber: { style: 'currency', currency: 'USD' }
    });
    const result = table.formatValue(1234.5, 'number');
    // Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(1234.5)
    const expected = new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(1234.5);
    expect(result).toBe(expected);
  });

  test('passes the resolved locale (not undefined) to Intl.NumberFormat', () => {
    const table = makeNumericTable({ formatNumber: { minimumFractionDigits: 2 } });
    const result = table.formatValue(42, 'number');
    const expected = new Intl.NumberFormat('en', { minimumFractionDigits: 2 }).format(42);
    expect(result).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// i18n.formats.formatNumber — custom function
// ---------------------------------------------------------------------------

describe('i18n.formats.formatNumber: custom function', () => {
  test('calls formatNumber(value, locale) and uses the return value', () => {
    const fn = jest.fn((value, locale) => `${locale}:${value}`);
    const table = makeNumericTable({ formatNumber: fn });
    const result = table.formatValue(99, 'number');
    expect(fn).toHaveBeenCalledWith(99, 'en');
    expect(result).toBe('en:99');
  });

  test('formatNumber function receives the numeric value, not a string', () => {
    const received = [];
    const table = makeNumericTable({
      formatNumber: (v) => { received.push(v); return String(v); }
    });
    table.formatValue(7.5, 'number');
    expect(typeof received[0]).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// i18n.formats.formatDate
// ---------------------------------------------------------------------------

describe('i18n.formats.formatDate', () => {
  test('calls formatDate(value, locale) and uses the return value for date type', () => {
    const fn = jest.fn(() => 'March 15, 2024');
    const table = makeDateTable({ formatDate: fn });
    const result = table.formatValue('2024-03-15', 'date');
    expect(fn).toHaveBeenCalledWith('2024-03-15', 'en');
    expect(result).toBe('March 15, 2024');
  });

  test('calls formatDate for datetime type', () => {
    const fn = jest.fn(() => '2024-03-15 09:00');
    const table = makeTable({
      columns: [{ field: 'ts', type: 'datetime' }],
      data: [{ ts: '2024-03-15T09:00:00Z' }],
      i18n: { locale: 'fr', formats: { formatDate: fn } }
    });
    const result = table.formatValue('2024-03-15T09:00:00Z', 'datetime');
    expect(fn).toHaveBeenCalledWith('2024-03-15T09:00:00Z', 'fr');
    expect(result).toBe('2024-03-15 09:00');
  });
});

// ---------------------------------------------------------------------------
// distinct aggregation
// ---------------------------------------------------------------------------

describe('distinct aggregation', () => {
  test('returns the count of unique non-null values', () => {
    const table = makeTable({
      columns: [{ field: 'status', aggregate: 'distinct' }],
      data: [
        { status: 'active' },
        { status: 'inactive' },
        { status: 'active' },
        { status: 'active' }
      ]
    });
    expect(table.getAggregates().status).toBe(2);
  });

  test('ignores null values when counting distinct', () => {
    const table = makeTable({
      columns: [{ field: 'tag', aggregate: 'distinct' }],
      data: [
        { tag: 'a' },
        { tag: null },
        { tag: 'b' },
        { tag: null },
        { tag: 'a' }
      ]
    });
    // null ignored, 'a' and 'b' = 2 distinct
    expect(table.getAggregates().tag).toBe(2);
  });

  test('distinct on numeric values works correctly', () => {
    const table = makeTable({
      columns: [{ field: 'score', aggregate: 'distinct' }],
      data: [
        { score: 10 },
        { score: 20 },
        { score: 10 },
        { score: 30 }
      ]
    });
    expect(table.getAggregates().score).toBe(3);
  });

  test('distinct on all-same values returns 1', () => {
    const table = makeTable({
      columns: [{ field: 'cat', aggregate: 'distinct' }],
      data: [{ cat: 'X' }, { cat: 'X' }, { cat: 'X' }]
    });
    expect(table.getAggregates().cat).toBe(1);
  });

  test('distinct on all-null column returns 0', () => {
    const table = makeTable({
      columns: [{ field: 'empty', aggregate: 'distinct' }],
      data: [{ empty: null }, { empty: null }]
    });
    expect(table.getAggregates().empty).toBe(0);
  });

  test('distinct appears in getAggregates() output shape', () => {
    const table = makeTable({
      columns: [
        { field: 'id' },
        { field: 'region', aggregate: 'distinct' },
        { field: 'value', aggregate: 'sum' }
      ],
      data: [
        { id: 1, region: 'north', value: 10 },
        { id: 2, region: 'south', value: 20 },
        { id: 3, region: 'north', value: 30 }
      ]
    });
    const agg = table.getAggregates();
    expect(Object.keys(agg)).toEqual(['region', 'value']);
    expect(agg.region).toBe(2);
    expect(agg.value).toBe(60);
  });

  test('aggregate() one-shot helper works for distinct', () => {
    const table = makeTable({
      columns: [{ field: 'cat', aggregate: 'distinct' }],
      data: [{ cat: 'a' }, { cat: 'b' }, { cat: 'a' }]
    });
    expect(table.aggregate('cat')).toBe(2);
    expect(table.aggregate('cat', 'distinct')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Backward compatibility: i18n.formats absent or empty
// ---------------------------------------------------------------------------

describe('backward compatibility: i18n.formats absent', () => {
  test('formatValue for number type falls back to toString() when no formats configured', () => {
    const table = makeTable({
      columns: [{ field: 'n', type: 'number' }],
      data: [{ n: 42 }]
    });
    // No i18n configured at all — should not throw, should return a string
    const result = table.formatValue(42, 'number');
    expect(result).toBe('42');
  });

  test('formatValue for date type falls back to built-in locale string when no formatDate', () => {
    const table = makeTable({
      columns: [{ field: 'd', type: 'date' }],
      data: [{ d: '2024-01-01' }]
    });
    const result = table.formatValue('2024-01-01', 'date');
    // Should return a locale-formatted string (not throw, not return raw value)
    expect(typeof result).toBe('string');
    expect(result).not.toBe('');
  });

  test('formatValue for date type falls back gracefully when i18n.formats is empty object', () => {
    const table = makeTable({
      columns: [{ field: 'd', type: 'date' }],
      data: [{ d: '2024-01-01' }],
      i18n: { locale: 'en', formats: {} }
    });
    const result = table.formatValue('2024-01-01', 'date');
    expect(typeof result).toBe('string');
    expect(result).not.toBe('');
  });

  test('formatNumber absent: number cells render without error', () => {
    const table = makeTable({
      columns: [{ field: 'n', type: 'number' }],
      data: [{ n: 100 }],
      i18n: { locale: 'en', formats: { formatDate: () => 'x' } }
    });
    expect(() => table.formatValue(100, 'number')).not.toThrow();
  });
});
