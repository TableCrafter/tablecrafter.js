/**
 * export/csv.ts
 *
 * CSV export.  Serialises the current display rows to RFC 4180 CSV and
 * triggers a browser download.  Supports custom filename tokens.
 * Phase 0: typed stub.
 */

import type { TableState, TableCrafterColumn, ExportOptions } from '../core/types';

/**
 * Serialise rows to a CSV string.
 * Respects column visibility (hidden columns are excluded by default).
 */
export function toCsv(
  _state: TableState,
  _columns: TableCrafterColumn[],
  _options?: ExportOptions
): string {
  throw new Error('toCsv: not implemented -- Phase 2');
}

/**
 * Trigger a browser file download of the serialised CSV.
 */
export function downloadCsv(
  _state: TableState,
  _columns: TableCrafterColumn[],
  _options?: ExportOptions
): void {
  throw new Error('downloadCsv: not implemented -- Phase 2');
}
