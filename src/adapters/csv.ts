/**
 * adapters/csv.ts
 *
 * RFC-4180 CSV parsing + a fetch loader.
 *
 * `parseCSV` is a faithful port of v2's `TableCrafter.prototype.parseCSV`
 * state machine: quoted fields may contain the delimiter, newlines, and
 * escaped `""` quotes; `\r\n` / `\r` line endings are normalised; rows whose
 * field count does not match the header are skipped (surfaced via
 * {@link parseCSVWithErrors}) instead of throwing.
 */

import type { DataLoader } from '../core/state';

export interface ParseCsvOptions {
  /** Delimiter character (default `','`). */
  delimiter?: string | undefined;
}

export interface CsvParseError {
  /** 1-based line number in the source text (header is line 1). */
  line: number;
  message: string;
}

/**
 * Tokenise CSV text into raw rows of fields (header row included).
 *
 * Ported from v2 parseCSV's inner state machine; this is the
 * `{ header: false }` code path of v2 (`rows` as array-of-arrays).
 */
export function tokenizeCSV(text: string, delimiter = ','): string[][] {
  const normalised = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  if (!normalised || !normalised.trim()) return [];

  const rawRows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < normalised.length) {
    const ch = normalised[i];
    if (inQuotes) {
      if (ch === '"') {
        if (normalised[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rawRows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rawRows.push(row);
  }
  return rawRows;
}

/**
 * Parse CSV text (first row = header) into row objects, collecting
 * per-line errors for rows whose field count mismatches the header.
 *
 * This mirrors v2 `parseCSV(text, { header: true })` exactly, including the
 * `{ rows, errors }` result shape and 1-based error line numbers.
 */
export function parseCSVWithErrors(
  text: string,
  options?: ParseCsvOptions
): { rows: Record<string, string>[]; errors: CsvParseError[] } {
  const rawRows = tokenizeCSV(text, options?.delimiter ?? ',');
  const errors: CsvParseError[] = [];
  if (rawRows.length === 0) return { rows: [], errors };

  const header = rawRows[0] as string[];
  const dataRows = rawRows.slice(1);
  const out: Record<string, string>[] = [];
  for (let r = 0; r < dataRows.length; r++) {
    const fields = dataRows[r] as string[];
    if (fields.length !== header.length) {
      errors.push({
        line: r + 2,
        message: `expected ${header.length} fields, got ${fields.length}`,
      });
      continue;
    }
    const obj: Record<string, string> = {};
    for (let h = 0; h < header.length; h++) {
      obj[header[h] as string] = fields[h] as string;
    }
    out.push(obj);
  }
  return { rows: out, errors };
}

/**
 * Pure RFC-4180 CSV parser: header row + data rows to an array of
 * `Record<string, string>` objects.  Malformed rows are silently skipped;
 * use {@link parseCSVWithErrors} when you need the error report.
 */
export function parseCSV(
  text: string,
  options?: ParseCsvOptions
): Record<string, string>[] {
  return parseCSVWithErrors(text, options).rows;
}

/**
 * camelCase alias for backward compat with the Phase 0 stub and existing
 * test imports (`import { parseCsv } from './csv'`).
 * @see parseCSV
 */
export const parseCsv = parseCSV;

export interface CsvAdapterOptions extends ParseCsvOptions {
  /** Additional fetch options (headers, credentials, ...). */
  fetchOptions?: RequestInit | undefined;
}

/**
 * Create a {@link DataLoader} that fetches the `source` URL as text and
 * parses it as CSV.  The store's abort signal is forwarded to `fetch`.
 */
export function createCsvAdapter(options: CsvAdapterOptions = {}): DataLoader {
  return async (source, signal) => {
    const init: RequestInit = { ...options.fetchOptions };
    if (signal) init.signal = signal;
    const response = await fetch(source, init);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();
    return parseCSV(text, options);
  };
}
