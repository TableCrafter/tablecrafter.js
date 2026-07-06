import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCsvAdapter,
  parseCSV,
  parseCSVWithErrors,
  tokenizeCSV,
} from './csv';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('adapters/csv: parseCSV basic (ported from v2 csv-import.test.js)', () => {
  // ported from v2: plain comma-separated values + header -> array of objects
  it('plain comma-separated values + header -> array of objects', () => {
    const { rows, errors } = parseCSVWithErrors('a,b,c\n1,2,3\n4,5,6');
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { a: '1', b: '2', c: '3' },
      { a: '4', b: '5', c: '6' },
    ]);
  });

  // ported from v2: header: false -> array of arrays (tokenizeCSV is that path)
  it('tokenizeCSV returns raw array-of-arrays (v2 header:false path)', () => {
    expect(tokenizeCSV('1,2,3\n4,5,6')).toEqual([
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
  });

  // ported from v2: custom delimiter
  it('custom delimiter', () => {
    expect(parseCSV('a;b;c\n1;2;3', { delimiter: ';' })).toEqual([
      { a: '1', b: '2', c: '3' },
    ]);
  });

  // ported from v2: TSV via tab delimiter
  it('TSV via tab delimiter', () => {
    expect(parseCSV('a\tb\tc\n1\t2\t3', { delimiter: '\t' })).toEqual([
      { a: '1', b: '2', c: '3' },
    ]);
  });
});

describe('adapters/csv: quoted fields (ported from v2 csv-import.test.js)', () => {
  // ported from v2: embedded comma inside quoted value
  it('embedded comma inside quoted value', () => {
    expect(parseCSV('a,b\n"hello, world",2')).toEqual([
      { a: 'hello, world', b: '2' },
    ]);
  });

  // ported from v2: embedded newline inside quoted value (multiline field)
  it('embedded newline inside quoted value', () => {
    expect(parseCSV('a,b\n"line1\nline2",2')).toEqual([
      { a: 'line1\nline2', b: '2' },
    ]);
  });

  // ported from v2: "" inside quoted value -> literal "
  it('escaped "" inside quoted value -> literal quote', () => {
    expect(parseCSV('a,b\n"she said ""hi""",2')).toEqual([
      { a: 'she said "hi"', b: '2' },
    ]);
  });

  // ported from v2: mixed quoted and unquoted fields on the same row
  it('mixed quoted and unquoted fields on the same row', () => {
    expect(parseCSV('a,b,c\n1,"with, comma",3')).toEqual([
      { a: '1', b: 'with, comma', c: '3' },
    ]);
  });
});

describe('adapters/csv: RFC-4180 edge cases', () => {
  it('empty fields are preserved as empty strings', () => {
    expect(parseCSV('a,b,c\n1,,3\n,,')).toEqual([
      { a: '1', b: '', c: '3' },
      { a: '', b: '', c: '' },
    ]);
  });

  // ported from v2: handles \r\n line endings
  it('handles CRLF line endings', () => {
    expect(parseCSV('a,b\r\n1,2\r\n3,4')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  it('handles bare \\r line endings', () => {
    expect(parseCSV('a,b\r1,2')).toEqual([{ a: '1', b: '2' }]);
  });

  it('trailing newline does not create a phantom row', () => {
    expect(parseCSV('a,b\n1,2\n')).toEqual([{ a: '1', b: '2' }]);
  });

  // ported from v2: empty input yields rows: []
  it('empty and whitespace-only input yield []', () => {
    expect(parseCSV('')).toEqual([]);
    expect(parseCSV('   ')).toEqual([]);
  });

  it('quoted multiline field spanning CRLF', () => {
    expect(parseCSV('a,b\r\n"x\r\ny",2')).toEqual([{ a: 'x\ny', b: '2' }]);
  });
});

describe('adapters/csv: error reporting (ported from v2 csv-import.test.js)', () => {
  // ported from v2: a line with too many / too few fields surfaces in errors
  // but does not throw
  it('mismatched field counts surface in errors with 1-based line numbers', () => {
    const { rows, errors } = parseCSVWithErrors('a,b,c\n1,2,3\n1,2\n4,5,6');
    expect(errors).toEqual([expect.objectContaining({ line: 3 })]);
    expect(rows).toEqual([
      { a: '1', b: '2', c: '3' },
      { a: '4', b: '5', c: '6' },
    ]);
  });

  it('parseCSV silently skips malformed rows', () => {
    expect(parseCSV('a,b\n1\n2,3')).toEqual([{ a: '2', b: '3' }]);
  });
});

describe('adapters/csv: createCsvAdapter loader', () => {
  function textResponse(text: string, init?: { ok?: boolean; status?: number }) {
    return {
      ok: init?.ok ?? true,
      status: init?.status ?? 200,
      text: async () => text,
    };
  }

  it('fetches the source URL and parses the CSV body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse('a,b\n1,2'));
    vi.stubGlobal('fetch', fetchMock);
    const rows = await createCsvAdapter()('https://x.test/data.csv');
    expect(rows).toEqual([{ a: '1', b: '2' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://x.test/data.csv',
      expect.any(Object)
    );
  });

  it('passes the delimiter option through to the parser', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(textResponse('a;b\n1;2')));
    const rows = await createCsvAdapter({ delimiter: ';' })('u');
    expect(rows).toEqual([{ a: '1', b: '2' }]);
  });

  it('throws on non-ok responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(textResponse('', { ok: false, status: 404 }))
    );
    await expect(createCsvAdapter()('u')).rejects.toThrow(
      'HTTP error! status: 404'
    );
  });

  it('forwards the abort signal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse('a\n1'));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    await createCsvAdapter()('u', controller.signal);
    expect(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).signal
    ).toBe(controller.signal);
  });
});
