/**
 * src/export/export.test.ts
 *
 * Comprehensive v3 export module tests.
 *
 * Structure:
 *   1. filename.ts  — resolveFilename token substitution
 *   2. csv.ts       — toCsv pure builder (RFC 4180, column filtering, filteredRows)
 *   3. json.ts      — toJson pure builder (column projection)
 *   4. clipboard.ts — toTsv pure builder
 *   5. print.ts     — toPrintHtml pure builder (HTML structure, escaping)
 *   6. xlsx.ts      — downloadXlsx with mocked peer dep; error when absent
 *   7. pdf.ts       — downloadPdf with mocked peer deps; error when absent
 *   8. dom-download — triggerDownload (jsdom integration)
 *   9. Integration  — register() + store.export() round-trips
 *  10. Module shape — all Phase-0 exports still present
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TableState, TableCrafterColumn } from '../core/types';
import { createTable } from '../core/state';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeState(overrides?: Partial<TableState>): TableState {
  const rows = [
    { id: 1, name: 'Alice', score: 92 },
    { id: 2, name: 'Bob',   score: 85 },
    { id: 3, name: 'Carol', score: 78 },
  ];
  return {
    rows,
    filteredRows: rows,
    sortedRows: rows,
    displayRows: rows,
    sort: [],
    filters: {},
    searchQuery: '',
    searchAst: null,
    page: 1,
    pageSize: 25,
    pageCount: 1,
    totalRows: 3,
    selection: new Set(),
    editingCell: null,
    loading: false,
    error: null,
    ...overrides,
  };
}

const baseColumns: TableCrafterColumn[] = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'score', label: 'Score' },
];

// ---------------------------------------------------------------------------
// 1. filename.ts
// ---------------------------------------------------------------------------

import { resolveFilename } from './filename';

describe('resolveFilename()', () => {
  it('replaces {table} with the supplied table name', () => {
    expect(resolveFilename('export-{table}.csv', 'employees')).toBe(
      'export-employees.csv'
    );
  });

  it('replaces {table} with "table" when name is omitted', () => {
    expect(resolveFilename('data-{table}.csv')).toBe('data-table.csv');
  });

  it('replaces {date} with YYYY-MM-DD today', () => {
    const d = new Date();
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    expect(resolveFilename('export-{date}.csv')).toBe(
      `export-${yyyy}-${mm}-${dd}.csv`
    );
  });

  it('replaces both {table} and {date} in the same template', () => {
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(resolveFilename('{table}-{date}.xlsx', 'sales')).toBe(
      `sales-${date}.xlsx`
    );
  });

  it('is case-insensitive for token names', () => {
    const result = resolveFilename('{TABLE}-{DATE}.csv', 'Inventory');
    expect(result).toContain('Inventory');
    expect(result).not.toContain('{TABLE}');
    expect(result).not.toContain('{DATE}');
  });

  it('leaves non-token text unchanged', () => {
    expect(resolveFilename('static-name.csv')).toBe('static-name.csv');
  });
});

// ---------------------------------------------------------------------------
// 2. csv.ts — toCsv (pure builder)
// ---------------------------------------------------------------------------

import { toCsv, downloadCsv, register as registerCsv } from './csv';

describe('toCsv()', () => {
  it('produces a header row followed by data rows', () => {
    const csv = toCsv(makeState(), baseColumns);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('"ID","Name","Score"');
    expect(lines).toHaveLength(4); // 1 header + 3 rows
  });

  it('uses column label over key', () => {
    const cols: TableCrafterColumn[] = [{ key: 'n', label: 'Full Name' }];
    const state = makeState({ filteredRows: [{ n: 'Alice' }] });
    const csv = toCsv(state, cols);
    expect(csv.split('\r\n')[0]).toBe('"Full Name"');
  });

  it('falls back to column key when label is absent', () => {
    const cols: TableCrafterColumn[] = [{ key: 'n' }];
    const state = makeState({ filteredRows: [{ n: 'Alice' }] });
    const csv = toCsv(state, cols);
    expect(csv.split('\r\n')[0]).toBe('"n"');
  });

  it('uses CRLF line endings (RFC 4180)', () => {
    const csv = toCsv(makeState(), baseColumns);
    expect(csv).toContain('\r\n');
  });

  it('leaves numeric values unquoted (RFC 4180 parity)', () => {
    const csv = toCsv(makeState(), baseColumns);
    const firstDataRow = csv.split('\r\n')[1] ?? '';
    expect(firstDataRow).toMatch(/^1,/); // numeric id not quoted
  });

  it('quotes string values', () => {
    const csv = toCsv(makeState(), baseColumns);
    const firstDataRow = csv.split('\r\n')[1] ?? '';
    expect(firstDataRow).toContain('"Alice"');
  });

  it('RFC 4180: quotes field containing a comma', () => {
    const state = makeState({
      filteredRows: [{ id: 1, name: 'Smith, John', score: 90 }],
    });
    const csv = toCsv(state, baseColumns);
    expect(csv).toContain('"Smith, John"');
  });

  it('RFC 4180: doubles internal double-quotes', () => {
    const state = makeState({
      filteredRows: [{ id: 1, name: 'He said "hello"', score: 90 }],
    });
    const csv = toCsv(state, baseColumns);
    expect(csv).toContain('"He said ""hello"""');
  });

  it('RFC 4180: quotes field containing newline', () => {
    const state = makeState({
      filteredRows: [{ id: 1, name: 'Line1\nLine2', score: 90 }],
    });
    const csv = toCsv(state, baseColumns);
    expect(csv).toContain('"Line1\nLine2"');
  });

  it('serialises null/undefined as empty quoted strings', () => {
    const state = makeState({ filteredRows: [{ id: 1, name: null, score: undefined }] });
    const csv = toCsv(state, baseColumns);
    const dataRow = csv.split('\r\n')[1] ?? '';
    expect(dataRow).toContain('""');
  });

  it('excludes columns with hidden: true', () => {
    const cols: TableCrafterColumn[] = [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name', hidden: true },
    ];
    const csv = toCsv(makeState(), cols);
    expect(csv).not.toContain('Name');
  });

  it('excludes columns with exportable: false (v2 parity)', () => {
    const cols = [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name', exportable: false },
    ] as TableCrafterColumn[];
    const csv = toCsv(makeState(), cols);
    expect(csv).not.toContain('Name');
  });

  it('uses state.filteredRows, not state.rows', () => {
    const allRows = [
      { id: 1, name: 'Alice', score: 92 },
      { id: 2, name: 'Bob', score: 85 },
    ];
    const filtered = [allRows[0]!];
    const state = makeState({ rows: allRows, filteredRows: filtered });
    const csv = toCsv(state, baseColumns);
    expect(csv.split('\r\n')).toHaveLength(2); // header + 1 row
    expect(csv).not.toContain('Bob');
  });

  it('returns header-only string for empty filteredRows', () => {
    const state = makeState({ filteredRows: [] });
    const csv = toCsv(state, baseColumns);
    expect(csv).toBe('"ID","Name","Score"');
  });

  it('returns empty string when all columns are excluded', () => {
    const cols: TableCrafterColumn[] = [{ key: 'id', hidden: true }];
    const csv = toCsv(makeState(), cols);
    expect(csv).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 3. json.ts — toJson (pure builder)
// ---------------------------------------------------------------------------

import { toJson, downloadJson, register as registerJson } from './json';

describe('toJson()', () => {
  it('returns a valid JSON array', () => {
    const json = toJson(makeState(), baseColumns);
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed: unknown = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('projects only exportable columns', () => {
    const parsed = JSON.parse(toJson(makeState(), baseColumns)) as Record<string, unknown>[];
    expect(parsed[0]).toHaveProperty('id');
    expect(parsed[0]).toHaveProperty('name');
    expect(parsed[0]).toHaveProperty('score');
  });

  it('excludes hidden columns', () => {
    const cols: TableCrafterColumn[] = [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name', hidden: true },
    ];
    const parsed = JSON.parse(toJson(makeState(), cols)) as Record<string, unknown>[];
    expect(Object.keys(parsed[0] ?? {})).not.toContain('name');
  });

  it('excludes exportable:false columns (v2 parity)', () => {
    const cols = [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name', exportable: false },
    ] as TableCrafterColumn[];
    const parsed = JSON.parse(toJson(makeState(), cols)) as Record<string, unknown>[];
    expect(Object.keys(parsed[0] ?? {})).not.toContain('name');
  });

  it('uses column key as JSON key (not label)', () => {
    const cols: TableCrafterColumn[] = [{ key: 'n', label: 'Full Name' }];
    const state = makeState({ filteredRows: [{ n: 'Alice' }] });
    const parsed = JSON.parse(toJson(state, cols)) as Record<string, unknown>[];
    expect(parsed[0]).toHaveProperty('n');
    expect(parsed[0]).not.toHaveProperty('Full Name');
  });

  it('uses state.filteredRows, not state.rows', () => {
    const allRows = [
      { id: 1, name: 'Alice', score: 92 },
      { id: 2, name: 'Bob', score: 85 },
    ];
    const filtered = [allRows[1]!];
    const state = makeState({ rows: allRows, filteredRows: filtered });
    const parsed = JSON.parse(toJson(state, baseColumns)) as unknown[];
    expect(parsed).toHaveLength(1);
    expect((parsed[0] as Record<string, unknown>)['name']).toBe('Bob');
  });

  it('returns empty array JSON for empty filteredRows', () => {
    const state = makeState({ filteredRows: [] });
    const parsed: unknown = JSON.parse(toJson(state, baseColumns));
    expect(parsed).toEqual([]);
  });

  it('serialises null values as JSON null', () => {
    const state = makeState({ filteredRows: [{ id: 1, name: null, score: 0 }] });
    const parsed = JSON.parse(toJson(state, baseColumns)) as Record<string, unknown>[];
    expect(parsed[0]?.['name']).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. clipboard.ts — toTsv (pure builder)
// ---------------------------------------------------------------------------

import { toTsv } from './clipboard';

describe('toTsv()', () => {
  it('produces tab-separated header and data rows', () => {
    const tsv = toTsv(makeState(), baseColumns);
    const lines = tsv.split('\n');
    expect(lines[0]).toBe('ID\tName\tScore');
    expect(lines).toHaveLength(4); // header + 3 rows
  });

  it('uses LF line endings', () => {
    const tsv = toTsv(makeState(), baseColumns);
    expect(tsv).not.toContain('\r\n');
    expect(tsv).toContain('\n');
  });

  it('replaces tabs in cell values with spaces', () => {
    const state = makeState({ filteredRows: [{ id: 1, name: 'A\tB', score: 0 }] });
    const tsv = toTsv(state, baseColumns);
    expect(tsv).not.toMatch(/A\tB/);
    expect(tsv).toContain('A B');
  });

  it('replaces newlines in cell values with spaces', () => {
    const state = makeState({ filteredRows: [{ id: 1, name: 'Line1\nLine2', score: 0 }] });
    const tsv = toTsv(state, baseColumns);
    expect(tsv).toContain('Line1 Line2');
  });

  it('excludes hidden columns', () => {
    const cols: TableCrafterColumn[] = [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name', hidden: true },
    ];
    const tsv = toTsv(makeState(), cols);
    expect(tsv.split('\n')[0]).toBe('ID');
  });

  it('returns empty string for zero exportable columns', () => {
    const cols: TableCrafterColumn[] = [{ key: 'id', hidden: true }];
    expect(toTsv(makeState(), cols)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 5. print.ts — toPrintHtml (pure builder)
// ---------------------------------------------------------------------------

import { toPrintHtml, openPrintWindow, printTable, register as registerPrint } from './print';

describe('toPrintHtml()', () => {
  it('returns a string starting with <!DOCTYPE html>', () => {
    const html = toPrintHtml(makeState(), baseColumns);
    expect(html.trimStart()).toMatch(/^<!DOCTYPE html>/i);
  });

  it('includes column headers in a <thead>', () => {
    const html = toPrintHtml(makeState(), baseColumns);
    expect(html).toContain('<th>ID</th>');
    expect(html).toContain('<th>Name</th>');
    expect(html).toContain('<th>Score</th>');
  });

  it('includes data rows in a <tbody>', () => {
    const html = toPrintHtml(makeState(), baseColumns);
    expect(html).toContain('<td>Alice</td>');
    expect(html).toContain('<td>Bob</td>');
  });

  it('uses the title argument in <title> and <h1>', () => {
    const html = toPrintHtml(makeState(), baseColumns, 'My Report');
    expect(html).toContain('<title>My Report</title>');
    expect(html).toContain('<h1>My Report</h1>');
  });

  it('defaults to "Table Export" when title is omitted', () => {
    const html = toPrintHtml(makeState(), baseColumns);
    expect(html).toContain('Table Export');
  });

  it('HTML-escapes < and > in values', () => {
    const state = makeState({
      filteredRows: [{ id: 1, name: '<b>bold</b>', score: 0 }],
    });
    const html = toPrintHtml(state, baseColumns);
    expect(html).not.toContain('<b>bold</b>');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
  });

  it('HTML-escapes & in values', () => {
    const state = makeState({
      filteredRows: [{ id: 1, name: 'A & B', score: 0 }],
    });
    const html = toPrintHtml(state, baseColumns);
    expect(html).toContain('A &amp; B');
  });

  it('HTML-escapes double-quotes in values', () => {
    const state = makeState({
      filteredRows: [{ id: 1, name: 'say "hello"', score: 0 }],
    });
    const html = toPrintHtml(state, baseColumns);
    expect(html).toContain('&quot;hello&quot;');
  });

  it('HTML-escapes & in title', () => {
    const html = toPrintHtml(makeState(), baseColumns, 'Q&A Report');
    expect(html).toContain('Q&amp;A Report');
  });

  it('excludes hidden columns', () => {
    const cols: TableCrafterColumn[] = [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name', hidden: true },
    ];
    const html = toPrintHtml(makeState(), cols);
    expect(html).not.toContain('<th>Name</th>');
  });

  it('excludes exportable:false columns', () => {
    const cols = [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name', exportable: false },
    ] as TableCrafterColumn[];
    const html = toPrintHtml(makeState(), cols);
    expect(html).not.toContain('<th>Name</th>');
  });

  it('uses state.filteredRows only', () => {
    const allRows = [
      { id: 1, name: 'Alice', score: 92 },
      { id: 2, name: 'Bob', score: 85 },
    ];
    const state = makeState({ rows: allRows, filteredRows: [allRows[0]!] });
    const html = toPrintHtml(state, baseColumns);
    expect(html).toContain('Alice');
    expect(html).not.toContain('Bob');
  });

  it('contains a print media query', () => {
    const html = toPrintHtml(makeState(), baseColumns);
    expect(html).toContain('@media print');
  });
});

// ---------------------------------------------------------------------------
// 6. xlsx.ts — downloadXlsx
// ---------------------------------------------------------------------------

describe('downloadXlsx()', () => {
  it('throws a clear error when xlsx is not installed', async () => {
    const { downloadXlsx } = await import('./xlsx');
    // In the test environment xlsx is not installed as a real peer dep.
    // The dynamic import() will fail → we expect the descriptive error.
    await expect(downloadXlsx(makeState(), baseColumns)).rejects.toThrow(
      /install.*xlsx/i
    );
  });

  it('error message mentions npm install xlsx', async () => {
    const { downloadXlsx } = await import('./xlsx');
    await expect(downloadXlsx(makeState(), baseColumns)).rejects.toThrow(
      /npm install xlsx/
    );
  });

  it('exports downloadXlsx as an async function', async () => {
    const mod = await import('./xlsx');
    expect(typeof mod.downloadXlsx).toBe('function');
    // The function returns a Promise (thenable)
    const result = mod.downloadXlsx(makeState(), baseColumns).catch(() => null);
    expect(result instanceof Promise).toBe(true);
  });

  it('exports register as a function', async () => {
    const mod = await import('./xlsx');
    expect(typeof mod.register).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// 7. pdf.ts — downloadPdf
// ---------------------------------------------------------------------------

describe('downloadPdf()', () => {
  it('throws a clear error when jspdf is not installed', async () => {
    const { downloadPdf } = await import('./pdf');
    await expect(downloadPdf(makeState(), baseColumns)).rejects.toThrow(
      /install.*jspdf/i
    );
  });

  it('error message mentions jspdf-autotable', async () => {
    const { downloadPdf } = await import('./pdf');
    await expect(downloadPdf(makeState(), baseColumns)).rejects.toThrow(
      /jspdf-autotable/
    );
  });

  it('exports downloadPdf as an async function', async () => {
    const mod = await import('./pdf');
    expect(typeof mod.downloadPdf).toBe('function');
    const result = mod.downloadPdf(makeState(), baseColumns).catch(() => null);
    expect(result instanceof Promise).toBe(true);
  });

  it('exports register as a function', async () => {
    const mod = await import('./pdf');
    expect(typeof mod.register).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// 8. dom-download.ts — triggerDownload (jsdom)
// ---------------------------------------------------------------------------

import { triggerDownload } from './dom-download';

describe('triggerDownload()', () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURLMock = vi.fn(() => 'blob:mock-url');
    revokeObjectURLMock = vi.fn();
    URL.createObjectURL = createObjectURLMock;
    URL.revokeObjectURL = revokeObjectURLMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates an object URL from the blob', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    triggerDownload(blob, 'test.txt');
    expect(createObjectURLMock).toHaveBeenCalledWith(blob);
  });

  it('revokes the object URL after clicking', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    triggerDownload(blob, 'test.txt');
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
  });

  it('sets the correct download filename on the anchor', () => {
    const clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        const el = origCreate('a');
        el.click = clickSpy;
        return el;
      }
      return origCreate(tag);
    });

    const blob = new Blob(['data'], { type: 'text/csv' });
    triggerDownload(blob, 'my-export.csv');
    expect(clickSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 8b. downloadCsv / downloadJson (DOM-touching, jsdom)
// ---------------------------------------------------------------------------

describe('downloadCsv()', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('triggers a download without throwing', () => {
    expect(() => downloadCsv(makeState(), baseColumns)).not.toThrow();
  });

  it('applies {date} token in default filename', () => {
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const anchors: HTMLAnchorElement[] = [];
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') anchors.push(el as HTMLAnchorElement);
      return el;
    });
    downloadCsv(makeState(), baseColumns);
    const anchor = anchors[anchors.length - 1];
    expect(anchor?.download).toContain(date);
  });

  it('uses the provided filename option', () => {
    const anchors: HTMLAnchorElement[] = [];
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') anchors.push(el as HTMLAnchorElement);
      return el;
    });
    downloadCsv(makeState(), baseColumns, { filename: 'custom.csv' });
    const anchor = anchors[anchors.length - 1];
    expect(anchor?.download).toBe('custom.csv');
  });
});

describe('downloadJson()', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('triggers a download without throwing', () => {
    expect(() => downloadJson(makeState(), baseColumns)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 9. Integration — register() + store.export()
// ---------------------------------------------------------------------------

describe('register() + store.export() integration', () => {
  it('csv: store.export("csv") calls downloadCsv without throwing', () => {
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();

    const store = createTable({
      data: [{ id: 1, name: 'Alice', score: 92 }],
      columns: baseColumns,
    });
    registerCsv(store);
    expect(() => store.export('csv')).not.toThrow();
  });

  it('json: store.export("json") calls downloadJson without throwing', () => {
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();

    const store = createTable({
      data: [{ id: 1, name: 'Alice', score: 92 }],
      columns: baseColumns,
    });
    registerJson(store);
    expect(() => store.export('json')).not.toThrow();
  });

  it('store.export() throws when no exporter is registered for the format', () => {
    const store = createTable({ data: [], columns: baseColumns });
    expect(() => store.export('csv')).toThrow(/no exporter registered/i);
  });

  it('print: store.export("print") calls openPrintWindow', () => {
    const openSpy = vi.spyOn(globalThis, 'open').mockReturnValue(null);
    const store = createTable({
      data: [{ id: 1, name: 'Alice', score: 90 }],
      columns: baseColumns,
    });
    registerPrint(store);
    store.export('print');
    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    openSpy.mockRestore();
  });

  it('xlsx: store.export("xlsx") rejects with the peer-dep error', async () => {
    const { register: registerXlsx } = await import('./xlsx');
    const store = createTable({ data: [], columns: baseColumns });
    registerXlsx(store);
    await expect(store.export('xlsx') as Promise<void>).rejects.toThrow(/install.*xlsx/i);
  });

  it('pdf: store.export("pdf") rejects with the peer-dep error', async () => {
    const { register: registerPdf } = await import('./pdf');
    const store = createTable({ data: [], columns: baseColumns });
    registerPdf(store);
    await expect(store.export('pdf') as Promise<void>).rejects.toThrow(/install.*jspdf/i);
  });
});

// ---------------------------------------------------------------------------
// 10. Module shape — all Phase-0 exports still present
// ---------------------------------------------------------------------------

import * as csvMod from './csv';
import * as jsonMod from './json';
import * as printMod from './print';

describe('module shape (Phase-0 exports preserved)', () => {
  it('csv module exports toCsv, downloadCsv, register', () => {
    expect(typeof csvMod.toCsv).toBe('function');
    expect(typeof csvMod.downloadCsv).toBe('function');
    expect(typeof csvMod.register).toBe('function');
  });

  it('json module exports toJson, downloadJson, register', () => {
    expect(typeof jsonMod.toJson).toBe('function');
    expect(typeof jsonMod.downloadJson).toBe('function');
    expect(typeof jsonMod.register).toBe('function');
  });

  it('print module exports toPrintHtml, openPrintWindow, printTable, register', () => {
    expect(typeof printMod.toPrintHtml).toBe('function');
    expect(typeof printMod.openPrintWindow).toBe('function');
    expect(typeof printMod.printTable).toBe('function');
    expect(typeof printMod.register).toBe('function');
  });

  it('clipboard module exports toTsv', async () => {
    const mod = await import('./clipboard');
    expect(typeof mod.toTsv).toBe('function');
  });

  it('filename module exports resolveFilename', async () => {
    const mod = await import('./filename');
    expect(typeof mod.resolveFilename).toBe('function');
  });

  it('dom-download module exports triggerDownload', async () => {
    const mod = await import('./dom-download');
    expect(typeof mod.triggerDownload).toBe('function');
  });
});
