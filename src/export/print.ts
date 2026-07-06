/**
 * export/print.ts
 *
 * Print export — builds a self-contained HTML document for printing.
 *
 * DOM policy:
 *   - toPrintHtml()    — pure HTML string builder, no DOM, headlessly testable.
 *   - openPrintWindow() — renderer-agnostic hook: opens a window and calls
 *                        window.print().  DOM-touching; the DOM layer calls this.
 *   - printTable()     — convenience that combines the two above.
 *   - register()       — wires 'print' into a store.
 *
 * Column filtering mirrors csv.ts (hidden:true and exportable:false excluded).
 * Data source: state.filteredRows (all filtered rows, not the current page).
 */

import type { TableState, TableCrafterColumn, ExportOptions } from '../core/types';
import type { ExportHandler } from '../core/state';
import { resolveFilename } from './filename';

// ---------------------------------------------------------------------------
// Helpers (pure)
// ---------------------------------------------------------------------------

type ExtColumn = TableCrafterColumn & { exportable?: boolean | undefined };

function isExportable(col: TableCrafterColumn): boolean {
  if (col.hidden === true) return false;
  if ((col as ExtColumn).exportable === false) return false;
  return true;
}

function exportCols(columns: TableCrafterColumn[]): TableCrafterColumn[] {
  return columns.filter(isExportable);
}

/** Minimal HTML entity escaping for document content. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Pure HTML builder
// ---------------------------------------------------------------------------

/**
 * Build a self-contained, printable HTML document string.
 *
 * The output is a complete <!DOCTYPE html> document containing a styled table.
 * All values are HTML-escaped.  The function never accesses document/window —
 * it is safe to call in Node/SSR and to test headlessly.
 */
export function toPrintHtml(
  state: TableState,
  columns: TableCrafterColumn[],
  title?: string
): string {
  const cols = exportCols(columns);
  const docTitle = escapeHtml(title ?? 'Table Export');

  const headerCells = cols
    .map((c) => `<th>${escapeHtml(String(c.label ?? c.key))}</th>`)
    .join('');

  const bodyRows = state.filteredRows
    .map((row) => {
      const r = row as Record<string, unknown>;
      const cells = cols
        .map((c) => {
          const v = r[c.key];
          const text = v === null || v === undefined ? '' : String(v);
          return `<td>${escapeHtml(text)}</td>`;
        })
        .join('');
      return `    <tr>${cells}</tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${docTitle}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 24px; }
    h1 { font-size: 1.25rem; margin-bottom: 12px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; font-size: 0.875rem; }
    th { background: #f0f0f0; font-weight: bold; }
    tr:nth-child(even) { background: #fafafa; }
    @media print {
      body { margin: 0; }
      @page { margin: 1.5cm; }
    }
  </style>
</head>
<body>
  <h1>${docTitle}</h1>
  <table>
    <thead>
      <tr>${headerCells}</tr>
    </thead>
    <tbody>
${bodyRows}
    </tbody>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// DOM-touching: print window hook
// ---------------------------------------------------------------------------

/**
 * Open a new browser window containing the given HTML and call window.print().
 *
 * This is the renderer-agnostic hook: the DOM layer (or the batteries wrapper)
 * calls this after building the HTML with toPrintHtml().  A no-op when window
 * is unavailable (SSR guard).
 */
export function openPrintWindow(html: string): void {
  if (typeof window === 'undefined') return;

  const w = window.open('', '_blank');
  if (!w) return; // popup blocked

  w.document.open();
  w.document.write(html);
  w.document.close();

  // Allow the new document to finish loading before printing.
  w.onload = () => {
    w.print();
  };
  // Fallback: call print() synchronously in case onload already fired
  // (same-origin documents can be ready before onload fires).
  w.print();
}

/**
 * Build the print HTML and open a print window.
 *
 * DOM-touching: calls openPrintWindow() which accesses window/document.
 *
 * The `title` option sets the document title and <h1>.  Falls back to the
 * `filename` option (tokens resolved) or the string "Table Export".
 */
export function printTable(
  state: TableState,
  columns: TableCrafterColumn[],
  options?: ExportOptions & { title?: string | undefined }
): void {
  const rawTitle =
    options?.title ??
    (options?.filename ? resolveFilename(options.filename) : undefined) ??
    'Table Export';
  openPrintWindow(toPrintHtml(state, columns, rawTitle));
}

// ---------------------------------------------------------------------------
// Store registration
// ---------------------------------------------------------------------------

const printHandler: ExportHandler = (state, options, columns) => {
  printTable(state, columns, options);
};

/**
 * Register the print exporter with a store.
 *
 * @example
 *   import { register } from 'tablecrafter/export/print';
 *   register(store);
 *   store.export('print');
 */
export function register(store: {
  registerExportFormat(format: string, handler: ExportHandler): void;
}): void {
  store.registerExportFormat('print', printHandler);
}
