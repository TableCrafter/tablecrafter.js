/**
 * export/print.ts
 *
 * Print export.  Opens the table in a new window formatted for printing
 * and calls window.print().  Supports filename tokens in the document title.
 * Phase 0: typed stub.
 */

import type { TableState, TableCrafterColumn, ExportOptions } from '../core/types';

/**
 * Open a print-formatted page and trigger the browser print dialog.
 */
export function printTable(
  _state: TableState,
  _columns: TableCrafterColumn[],
  _options?: ExportOptions & { title?: string | undefined }
): void {
  throw new Error('printTable: not implemented -- Phase 2');
}

/**
 * Generate the raw HTML string for the print view (useful for testing).
 */
export function toPrintHtml(
  _state: TableState,
  _columns: TableCrafterColumn[],
  _title?: string
): string {
  throw new Error('toPrintHtml: not implemented -- Phase 2');
}
