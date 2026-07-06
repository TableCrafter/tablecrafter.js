import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DataLoader } from '../core/state';
import { createTable } from '../core/state';
import * as inline from './inline';
import * as json from './json';
import * as csv from './csv';
import * as googleSheets from './google-sheets';
import * as xml from './xml';
import * as paginationLink from './pagination-link';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('adapters modules: surface', () => {
  it('inline adapter exports createInlineAdapter', () => {
    expect(typeof inline.createInlineAdapter).toBe('function');
  });

  it('json adapter exports createJsonAdapter + extractByPath', () => {
    expect(typeof json.createJsonAdapter).toBe('function');
    expect(typeof json.extractByPath).toBe('function');
  });

  it('csv adapter exports createCsvAdapter + parseCSV (and parseCsv alias)', () => {
    expect(typeof csv.createCsvAdapter).toBe('function');
    expect(typeof csv.parseCSV).toBe('function');
    expect(csv.parseCsv).toBe(csv.parseCSV);
  });

  it('google-sheets adapter exports createGoogleSheetsAdapter + toGvizCsvUrl', () => {
    expect(typeof googleSheets.createGoogleSheetsAdapter).toBe('function');
    expect(typeof googleSheets.toGvizCsvUrl).toBe('function');
  });

  it('xml adapter exports createXmlAdapter + extractXmlRows', () => {
    expect(typeof xml.createXmlAdapter).toBe('function');
    expect(typeof xml.extractXmlRows).toBe('function');
  });

  it('pagination-link adapter exports createPaginationLinkAdapter + parseLinkHeader', () => {
    expect(typeof paginationLink.createPaginationLinkAdapter).toBe('function');
    expect(typeof paginationLink.parseLinkHeader).toBe('function');
  });

  it('every factory produces a DataLoader-shaped (source, signal?) => Promise fn', () => {
    const loaders: DataLoader[] = [
      inline.createInlineAdapter([]),
      json.createJsonAdapter(),
      csv.createCsvAdapter(),
      googleSheets.createGoogleSheetsAdapter(),
      xml.createXmlAdapter({ rowElement: 'row' }),
      paginationLink.createPaginationLinkAdapter(),
    ];
    for (const loader of loaders) {
      expect(typeof loader).toBe('function');
      expect(loader.length).toBeLessThanOrEqual(2);
    }
  });
});

describe('adapters: store integration via setLoader', () => {
  it('store.load() routes the configured source through a registered adapter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'name,role\nAda,eng\nGrace,adm',
      })
    );
    const store = createTable({ data: 'https://x.test/people.csv', columns: [] });
    store.setLoader(csv.createCsvAdapter());
    await store.load();
    expect(store.getState().rows).toEqual([
      { name: 'Ada', role: 'eng' },
      { name: 'Grace', role: 'adm' },
    ]);
  });

  it('adapter errors surface as store error state, not exceptions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => null })
    );
    const store = createTable({ data: 'https://x.test/rows.json', columns: [] });
    store.setLoader(json.createJsonAdapter());
    await store.load();
    expect(store.getState().error).toBe('HTTP error! status: 500');
  });
});
