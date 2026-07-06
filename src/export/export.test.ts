import { describe, it, expect } from 'vitest';
import * as csv from './csv';
import * as json from './json';
import * as print from './print';
import * as xlsx from './xlsx';
import * as pdf from './pdf';

describe('export modules', () => {
  it('csv module loads and exports toCsv + downloadCsv', () => {
    expect(typeof csv.toCsv).toBe('function');
    expect(typeof csv.downloadCsv).toBe('function');
  });

  it('json module loads and exports toJson + downloadJson', () => {
    expect(typeof json.toJson).toBe('function');
    expect(typeof json.downloadJson).toBe('function');
  });

  it('print module loads and exports printTable + toPrintHtml', () => {
    expect(typeof print.printTable).toBe('function');
    expect(typeof print.toPrintHtml).toBe('function');
  });

  it('xlsx module loads and exports downloadXlsx', () => {
    expect(typeof xlsx.downloadXlsx).toBe('function');
  });

  it('pdf module loads and exports downloadPdf', () => {
    expect(typeof pdf.downloadPdf).toBe('function');
  });
});
