/**
 * export/xlsx.ts
 *
 * Excel (xlsx) export via the optional `xlsx` peer dependency.
 *
 * The `xlsx` package is dynamically imported inside the handler so it is never
 * bundled when the peer is absent.  If the peer is not installed, a clear
 * actionable error is thrown.
 *
 * DOM policy: DOM-touching (calls triggerDownload for Blob/anchor download).
 */

import type { TableState, TableCrafterColumn, ExportOptions } from '../core/types';
import type { ExportHandler } from '../core/state';
import { resolveFilename } from './filename';
import { triggerDownload } from './dom-download';

// ---------------------------------------------------------------------------
// Minimal typing for the xlsx peer dep (avoids a dev-dep install)
// ---------------------------------------------------------------------------

interface XlsxUtils {
  aoa_to_sheet(data: unknown[][]): object;
  book_new(): object;
  book_append_sheet(wb: object, ws: object, name: string): void;
}

interface XlsxLib {
  utils: XlsxUtils;
  // xlsx.write with type:'array' returns Uint8Array<ArrayBuffer> at runtime;
  // typed as ArrayBuffer to stay within BlobPart's accepted union.
  write(wb: object, opts: { type: 'array'; bookType: 'xlsx' }): ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ExtColumn = TableCrafterColumn & { exportable?: boolean | undefined };

function isExportable(col: TableCrafterColumn): boolean {
  if (col.hidden === true) return false;
  if ((col as ExtColumn).exportable === false) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Export function
// ---------------------------------------------------------------------------

/**
 * Export the current filtered rows to an xlsx file and trigger a browser download.
 *
 * Requires the `xlsx` package:
 *   npm install xlsx
 *
 * @throws {Error} if the `xlsx` package is not installed.
 */
export async function downloadXlsx(
  state: TableState,
  columns: TableCrafterColumn[],
  options?: ExportOptions & { sheetName?: string | undefined }
): Promise<void> {
  let xlsx: XlsxLib;
  try {
    // Dynamic import of optional peer dep.
    // @ts-expect-error -- 'xlsx' is an optional peer dep; absent from node_modules until installed.
    xlsx = (await import('xlsx')) as unknown as XlsxLib;
  } catch {
    throw new Error(
      'TableCrafter: install the "xlsx" package to use Excel export  →  npm install xlsx'
    );
  }

  const cols = columns.filter(isExportable);
  const sheetName = options?.sheetName ?? 'Sheet1';

  const headerRow = cols.map((c) => c.label ?? c.key);
  const dataRows = state.filteredRows.map((row) => {
    const r = row as Record<string, unknown>;
    return cols.map((c) => {
      const v = r[c.key];
      return v === null || v === undefined ? '' : v;
    });
  });

  const ws = xlsx.utils.aoa_to_sheet([headerRow, ...dataRows]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, sheetName);

  const buf = xlsx.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const filename = resolveFilename(options?.filename ?? 'export-{date}.xlsx');
  triggerDownload(blob, filename);
}

// ---------------------------------------------------------------------------
// Store registration
// ---------------------------------------------------------------------------

const xlsxHandler: ExportHandler = (state, options, columns) =>
  downloadXlsx(
    state,
    columns,
    options as ExportOptions & { sheetName?: string | undefined }
  );

/**
 * Register the xlsx exporter with a store.
 *
 * @example
 *   import { register } from 'tablecrafter/export/xlsx';
 *   register(store);
 *   store.export('xlsx');  // throws if xlsx peer not installed
 */
export function register(store: {
  registerExportFormat(format: string, handler: ExportHandler): void;
}): void {
  store.registerExportFormat('xlsx', xlsxHandler);
}
