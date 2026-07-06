/**
 * export/pdf.ts
 *
 * PDF export via the optional `jspdf` and `jspdf-autotable` peer dependencies.
 * Dynamically imported to avoid bundling the peer deps.
 * Throws a descriptive error if the peers are not installed.
 * Phase 0: typed stub.
 */

import type { TableState, TableCrafterColumn, ExportOptions } from '../core/types';

/**
 * Export the current display rows to a PDF file and trigger download.
 * Requires `jspdf` and `jspdf-autotable` to be installed as peer dependencies.
 *
 * @throws if the `jspdf` or `jspdf-autotable` packages are not installed.
 */
export async function downloadPdf(
  _state: TableState,
  _columns: TableCrafterColumn[],
  _options?: ExportOptions & { orientation?: 'portrait' | 'landscape' | undefined }
): Promise<void> {
  throw new Error('downloadPdf: not implemented -- Phase 2');
}
