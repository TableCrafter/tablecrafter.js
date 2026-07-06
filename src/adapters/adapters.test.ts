import { describe, it, expect } from 'vitest';
import * as inline from './inline';
import * as json from './json';
import * as csv from './csv';
import * as googleSheets from './google-sheets';
import * as xml from './xml';
import * as paginationLink from './pagination-link';

describe('adapters modules', () => {
  it('inline adapter loads and exports createInlineAdapter', () => {
    expect(typeof inline.createInlineAdapter).toBe('function');
  });

  it('json adapter loads and exports createJsonAdapter', () => {
    expect(typeof json.createJsonAdapter).toBe('function');
  });

  it('csv adapter loads and exports createCsvAdapter + parseCsv', () => {
    expect(typeof csv.createCsvAdapter).toBe('function');
    expect(typeof csv.parseCsv).toBe('function');
  });

  it('google-sheets adapter loads and exports createGoogleSheetsAdapter', () => {
    expect(typeof googleSheets.createGoogleSheetsAdapter).toBe('function');
  });

  it('xml adapter loads and exports createXmlAdapter', () => {
    expect(typeof xml.createXmlAdapter).toBe('function');
  });

  it('pagination-link adapter loads and exports createPaginationLinkAdapter + parseLinkHeader', () => {
    expect(typeof paginationLink.createPaginationLinkAdapter).toBe('function');
    expect(typeof paginationLink.parseLinkHeader).toBe('function');
  });
});
