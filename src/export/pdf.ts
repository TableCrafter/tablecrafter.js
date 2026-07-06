/**
 * export/pdf.ts
 *
 * PDF export via the optional `jspdf` and `jspdf-autotable` peer dependencies.
 *
 * Both packages are dynamically imported inside the handler so they are never
 * bundled when the peers are absent.  A clear actionable error is thrown if
 * either package is missing.
 *
 * DOM policy: DOM-touching (calls triggerDownload for Blob/anchor download).
 */

import type { TableState, TableCrafterColumn, ExportOptions } from '../core/types';
import type { ExportHandler } from '../core/state';
import { resolveFilename } from './filename';
import { triggerDownload } from './dom-download';

// ---------------------------------------------------------------------------
// Minimal typing for jspdf peer deps
// ---------------------------------------------------------------------------

interface JsPDFDoc {
  output(type: 'arraybuffer'): ArrayBuffer;
}

type JsPDFConstructor = new (opts?: {
  orientation?: 'portrait' | 'landscape';
}) => JsPDFDoc;

type AutoTableFn = (doc: JsPDFDoc, opts: {
  head: string[][];
  body: string[][];
}) => void;

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
 * Export the current filtered rows to a PDF file and trigger a browser download.
 *
 * Requires both peer packages:
 *   npm install jspdf jspdf-autotable
 *
 * @throws {Error} if `jspdf` or `jspdf-autotable` is not installed.
 */
export async function downloadPdf(
  state: TableState,
  columns: TableCrafterColumn[],
  options?: ExportOptions & { orientation?: 'portrait' | 'landscape' | undefined }
): Promise<void> {
  let JsPDF: JsPDFConstructor;
  let autoTable: AutoTableFn;

  try {
    // @ts-expect-error -- 'jspdf' is an optional peer dep; absent from node_modules until installed.
    const mod = (await import('jspdf')) as
      | { jsPDF: JsPDFConstructor }
      | { default: JsPDFConstructor };
    JsPDF =
      ('jsPDF' in mod ? mod.jsPDF : undefined) ??
      (mod as { default: JsPDFConstructor }).default;
  } catch {
    throw new Error(
      'TableCrafter: install "jspdf" and "jspdf-autotable" to use PDF export  →  npm install jspdf jspdf-autotable'
    );
  }

  try {
    // @ts-expect-error -- 'jspdf-autotable' is an optional peer dep; absent from node_modules until installed.
    const atMod = (await import('jspdf-autotable')) as
      | { default: AutoTableFn }
      | AutoTableFn;
    autoTable =
      (typeof atMod === 'function' ? atMod : undefined) ??
      ('default' in atMod ? atMod.default : undefined) ??
      (() => { throw new Error('TableCrafter: jspdf-autotable default export not found'); })();
  } catch (err) {
    if (err instanceof Error && err.message.includes('TableCrafter')) throw err;
    throw new Error(
      'TableCrafter: install "jspdf" and "jspdf-autotable" to use PDF export  →  npm install jspdf jspdf-autotable'
    );
  }

  const cols = columns.filter(isExportable);
  const head = [cols.map((c) => String(c.label ?? c.key))];
  const body = state.filteredRows.map((row) => {
    const r = row as Record<string, unknown>;
    return cols.map((c) => {
      const v = r[c.key];
      return v === null || v === undefined ? '' : String(v);
    });
  });

  const doc = new JsPDF({
    orientation: options?.orientation ?? 'portrait',
  });
  autoTable(doc, { head, body });

  const buf = doc.output('arraybuffer');
  const blob = new Blob([buf], { type: 'application/pdf' });
  const filename = resolveFilename(options?.filename ?? 'export-{date}.pdf');
  triggerDownload(blob, filename);
}

// ---------------------------------------------------------------------------
// Store registration
// ---------------------------------------------------------------------------

const pdfHandler: ExportHandler = (state, options, columns) =>
  downloadPdf(
    state,
    columns,
    options as ExportOptions & { orientation?: 'portrait' | 'landscape' }
  );

/**
 * Register the PDF exporter with a store.
 *
 * @example
 *   import { register } from 'tablecrafter/export/pdf';
 *   register(store);
 *   store.export('pdf');  // throws if jspdf peers not installed
 */
export function register(store: {
  registerExportFormat(format: string, handler: ExportHandler): void;
}): void {
  store.registerExportFormat('pdf', pdfHandler);
}
