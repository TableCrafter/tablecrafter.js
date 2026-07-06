/**
 * adapters/google-sheets.ts
 *
 * Google Sheets adapter.  Fetches data via the Sheets v4 REST API using
 * a public API key or OAuth2 token.
 * Phase 0: typed stub.
 */

import type { DataAdapter } from './inline';

export interface GoogleSheetsAdapterOptions {
  /** The Sheets spreadsheet ID. */
  spreadsheetId: string;
  /** Sheet range in A1 notation (e.g. "Sheet1!A1:Z"). */
  range: string;
  /** Google API key (for public sheets). */
  apiKey?: string | undefined;
  /** OAuth2 access token (for private sheets). */
  accessToken?: string | undefined;
  /** Whether the first row contains headers (default: true). */
  headers?: boolean | undefined;
}

/**
 * Create a data adapter backed by a Google Sheets spreadsheet.
 */
export function createGoogleSheetsAdapter(
  _options: GoogleSheetsAdapterOptions
): DataAdapter {
  throw new Error('createGoogleSheetsAdapter: not implemented -- Phase 2');
}
