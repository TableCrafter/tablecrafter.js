/**
 * export/json.ts
 *
 * JSON export — column-projected, pretty-printed.
 *
 * DOM policy:
 *   - toJson()       — pure string builder, no DOM, headlessly testable.
 *   - downloadJson() — DOM-touching (delegates to dom-download.ts).
 *   - register()     — convenience to wire the format into a store.
 *
 * Column filtering mirrors csv.ts (hidden:true and exportable:false excluded).
 * Data source: state.filteredRows (all filtered rows, not the current page).
 */

import type { TableState, TableCrafterColumn, ExportOptions } from '../core/types';
import type { ExportHandler } from '../core/state';
import { resolveFilename } from './filename';
import { triggerDownload } from './dom-download';

// ---------------------------------------------------------------------------
// Helpers
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

// ---------------------------------------------------------------------------
// Pure builder
// ---------------------------------------------------------------------------

/**
 * Serialise the current filtered rows to a JSON string.
 *
 * Each row is projected onto the exportable columns: only those keys appear
 * in the output objects.  The result is a JSON array, pretty-printed with
 * 2-space indentation.
 */
export function toJson(
  state: TableState,
  columns: TableCrafterColumn[],
  _options?: ExportOptions
): string {
  const cols = exportCols(columns);

  const projected = state.filteredRows.map((row) => {
    const r = row as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const col of cols) {
      out[col.key] = r[col.key] ?? null;
    }
    return out;
  });

  return JSON.stringify(projected, null, 2);
}

// ---------------------------------------------------------------------------
// DOM-touching download
// ---------------------------------------------------------------------------

/**
 * Build a JSON string and trigger a browser file download.
 *
 * The filename defaults to `export-{date}.json`; supports `{table}` and
 * `{date}` tokens.
 *
 * DOM-touching: calls triggerDownload() from dom-download.ts.
 */
export function downloadJson(
  state: TableState,
  columns: TableCrafterColumn[],
  options?: ExportOptions
): void {
  const json = toJson(state, columns, options);
  const filename = resolveFilename(options?.filename ?? 'export-{date}.json');
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  triggerDownload(blob, filename);
}

// ---------------------------------------------------------------------------
// Store registration
// ---------------------------------------------------------------------------

const jsonHandler: ExportHandler = (state, options, columns) => {
  downloadJson(state, columns, options);
};

/**
 * Register the JSON exporter with a store.
 *
 * @example
 *   import { register } from 'tablecrafter/export/json';
 *   register(store);
 *   store.export('json');
 */
export function register(store: {
  registerExportFormat(format: string, handler: ExportHandler): void;
}): void {
  store.registerExportFormat('json', jsonHandler);
}
