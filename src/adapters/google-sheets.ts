/**
 * adapters/google-sheets.ts
 *
 * Google Sheets adapter (parity #336).
 *
 * ## PUBLIC SHEETS ONLY
 *
 * This adapter works exclusively with sheets shared as
 * **"Anyone with the link can view"** (or published to the web).  It rewrites
 * the browser share URL to the sheet's unauthenticated `gviz` CSV export
 * endpoint -- there is NO OAuth, NO API key, and NO support for private
 * sheets.  A private sheet returns an HTML login page (non-2xx or non-CSV),
 * which surfaces as a load error.
 *
 * Flow: share URL -> {@link toGvizCsvUrl} -> fetch CSV -> {@link parseCSV}.
 */

import type { DataLoader } from '../core/state';
import { parseCSV } from './csv';

export interface GoogleSheetsAdapterOptions {
  /** Numeric worksheet gid.  Overrides any `gid` present in the share URL. */
  gid?: string | number | undefined;
  /** Worksheet name (used instead of gid when provided). */
  sheet?: string | undefined;
  /** Additional fetch options (headers, credentials, ...). */
  fetchOptions?: RequestInit | undefined;
}

const SHEET_ID_RE = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
const GID_RE = /[#?&]gid=(\d+)/;

/**
 * Transform a public Google Sheets share URL into its `gviz` CSV export URL.
 *
 * PUBLIC SHEETS ONLY -- see the module JSDoc.
 *
 * - `https://docs.google.com/spreadsheets/d/<ID>/edit#gid=123` becomes
 *   `https://docs.google.com/spreadsheets/d/<ID>/gviz/tq?tqx=out:csv&gid=123`
 * - A `gid` in either the hash or the query string is preserved.
 * - URLs that are already `gviz` or `/export?format=csv` URLs pass through
 *   unchanged.
 *
 * @throws Error when the URL does not contain a spreadsheet ID.
 */
export function toGvizCsvUrl(
  shareUrl: string,
  options?: Pick<GoogleSheetsAdapterOptions, 'gid' | 'sheet'>
): string {
  // Already an export/gviz URL: pass through untouched.
  if (/\/gviz\/tq|[/?]export\?/.test(shareUrl)) return shareUrl;

  const idMatch = SHEET_ID_RE.exec(shareUrl);
  if (!idMatch) {
    throw new Error(
      `createGoogleSheetsAdapter: not a Google Sheets URL: ${shareUrl}`
    );
  }
  const id = idMatch[1] as string;

  let url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`;
  if (options?.sheet !== undefined) {
    url += `&sheet=${encodeURIComponent(options.sheet)}`;
  } else {
    const gid = options?.gid ?? GID_RE.exec(shareUrl)?.[1];
    if (gid !== undefined) url += `&gid=${gid}`;
  }
  return url;
}

/**
 * Create a {@link DataLoader} whose `source` is a public Google Sheets share
 * URL.  The URL is rewritten to the CSV export endpoint, fetched (with the
 * store's abort signal forwarded), and parsed via the RFC-4180 parser.
 *
 * PUBLIC SHEETS ONLY -- the sheet must be shared as "Anyone with the link
 * can view"; private sheets are not supported by this adapter.
 */
export function createGoogleSheetsAdapter(
  options: GoogleSheetsAdapterOptions = {}
): DataLoader {
  return async (source, signal) => {
    const url = toGvizCsvUrl(source, options);
    const init: RequestInit = { ...options.fetchOptions };
    if (signal) init.signal = signal;
    const response = await fetch(url, init);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();
    return parseCSV(text);
  };
}
