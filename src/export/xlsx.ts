/**
 * export/xlsx.ts
 *
 * Excel (xlsx) export via the optional `xlsx` peer dependency.
 * Dynamically imported to avoid bundling the peer dep.
 * Throws a descriptive error if the peer is not installed.
 * Phase 0: typed stub.
 */

import type { TableState, TableCrafterColumn, ExportOptions } from '../core/types';

/**
 * Export the current display rows to an xlsx file and trigger download.
 * Requires the `xlsx` package to be installed as a peer dependency.
 *
 * @throws if the `xlsx` package is not installed.
 */
export async function downloadXlsx(
  _state: TableState,
  _columns: TableCrafterColumn[],
  _options?: ExportOptions & { sheetName?: string | undefined }
): Promise<void> {
  throw new Error('downloadXlsx: not implemented -- Phase 2');
}
