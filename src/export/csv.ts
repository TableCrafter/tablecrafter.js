/**
 * export/csv.ts
 *
 * RFC 4180 CSV export with injection-safe quoting.
 *
 * DOM policy:
 *   - toCsv()       — pure string builder, no DOM, headlessly testable.
 *   - downloadCsv() — DOM-touching (delegates to dom-download.ts).
 *   - register()    — convenience to wire the format into a store.
 *
 * Column filtering:
 *   - hidden: true       → excluded
 *   - exportable: false  → excluded (v2 parity; duck-typed at runtime)
 *
 * Data source:
 *   state.filteredRows is used (all filtered rows, not the current page).
 *   This means users export exactly the rows they are looking at, across
 *   all pages.
 */

import type { TableState, TableCrafterColumn, ExportOptions } from '../core/types';
import type { ExportHandler } from '../core/state';
import { resolveFilename } from './filename';
import { triggerDownload } from './dom-download';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Duck-typed extended column shape for v2-compat exportable flag. */
type ExtColumn = TableCrafterColumn & { exportable?: boolean | undefined };

function isExportable(col: TableCrafterColumn): boolean {
  if (col.hidden === true) return false;
  if ((col as ExtColumn).exportable === false) return false;
  return true;
}

function exportCols(columns: TableCrafterColumn[]): TableCrafterColumn[] {
  return columns.filter(isExportable);
}

/**
 * RFC 4180 field serialiser.
 *
 * Rules:
 *   - null / undefined → ""
 *   - Pure numeric strings are left unquoted (v2 parity, valid per RFC 4180)
 *   - Any field containing `"`, `,`, CR, or LF is wrapped in double-quotes
 *     with internal double-quotes doubled — this is the injection-safe step.
 *   - All other text strings are quoted for safety.
 */
function quoteField(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }
  const s = String(value);
  // Fields that must be quoted per RFC 4180
  if (
    s.includes('"') ||
    s.includes(',') ||
    s.includes('\r') ||
    s.includes('\n')
  ) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  // Pure numbers are left bare (RFC 4180 allows unquoted fields)
  if (s !== '' && !Number.isNaN(Number(s))) {
    return s;
  }
  // All other text is quoted so downstream parsers treat them as strings
  return '"' + s + '"';
}

// ---------------------------------------------------------------------------
// Pure builder
// ---------------------------------------------------------------------------

/**
 * Serialise the current filtered rows to an RFC 4180 CSV string.
 *
 * The returned string uses CRLF line endings as required by RFC 4180.
 * Column headers use the column `label` if set, otherwise `key`.
 */
export function toCsv(
  state: TableState,
  columns: TableCrafterColumn[],
  _options?: ExportOptions
): string {
  const cols = exportCols(columns);
  if (cols.length === 0) return '';

  const header = cols.map((c) => quoteField(c.label ?? c.key)).join(',');

  const dataRows = state.filteredRows.map((row) => {
    const r = row as Record<string, unknown>;
    return cols.map((c) => quoteField(r[c.key])).join(',');
  });

  return [header, ...dataRows].join('\r\n');
}

// ---------------------------------------------------------------------------
// DOM-touching download
// ---------------------------------------------------------------------------

/**
 * Build a CSV string and trigger a browser file download.
 *
 * The filename defaults to `export-{date}.csv`.  Use the `filename` option
 * to override; the value supports `{table}` and `{date}` tokens.
 *
 * DOM-touching: calls triggerDownload() from dom-download.ts.
 */
export function downloadCsv(
  state: TableState,
  columns: TableCrafterColumn[],
  options?: ExportOptions
): void {
  const csv = toCsv(state, columns, options);
  const filename = resolveFilename(options?.filename ?? 'export-{date}.csv');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

// ---------------------------------------------------------------------------
// Store registration
// ---------------------------------------------------------------------------

const csvHandler: ExportHandler = (state, options, columns) => {
  downloadCsv(state, columns, options);
};

/**
 * Register the CSV exporter with a store.
 *
 * @example
 *   import { register } from 'tablecrafter/export/csv';
 *   register(store);
 *   store.export('csv');
 */
export function register(store: {
  registerExportFormat(format: string, handler: ExportHandler): void;
}): void {
  store.registerExportFormat('csv', csvHandler);
}
