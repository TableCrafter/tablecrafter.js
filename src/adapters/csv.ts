/**
 * adapters/csv.ts
 *
 * CSV fetch adapter.  Fetches a CSV file from a URL, parses it, and exposes
 * the rows as the data source.  Filtering, sorting, and pagination happen
 * client-side after the initial fetch.
 * Phase 0: typed stub.
 */

import type { DataAdapter } from './inline';

export interface CsvAdapterOptions {
  /** URL of the CSV file to fetch. */
  url: string;
  /** Whether the first row contains headers (default: true). */
  headers?: boolean | undefined;
  /** Delimiter character (default: ','). */
  delimiter?: string | undefined;
  /** Column name to use as the row ID. */
  idColumn?: string | undefined;
}

/**
 * Create a data adapter that fetches and parses a remote CSV file.
 */
export function createCsvAdapter(_options: CsvAdapterOptions): DataAdapter {
  throw new Error('createCsvAdapter: not implemented -- Phase 2');
}

/**
 * Parse a raw CSV string into an array of row objects.
 * Exported separately for use in the CSV export tests.
 */
export function parseCsv(
  _raw: string,
  _options?: Pick<CsvAdapterOptions, 'headers' | 'delimiter'>
): Record<string, string>[] {
  throw new Error('parseCsv: not implemented -- Phase 2');
}
