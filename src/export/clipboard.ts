/**
 * export/clipboard.ts
 *
 * TSV (tab-separated values) string builder for clipboard export.
 *
 * Pure: no DOM access.  The actual clipboard write (navigator.clipboard.writeText)
 * is renderer territory — this module only builds the string.
 */

import type { TableState, TableCrafterColumn } from '../core/types';

/** Columns with hidden:true or exportable:false are excluded. */
function isExportable(col: TableCrafterColumn): boolean {
  if (col.hidden === true) return false;
  const ext = col as TableCrafterColumn & { exportable?: boolean | undefined };
  if (ext.exportable === false) return false;
  return true;
}

/**
 * Serialise the current filtered rows as a tab-separated string suitable
 * for pasting into a spreadsheet.
 *
 * Tabs within cell values are replaced with spaces so the field structure
 * is not corrupted.  Newlines within values are replaced with a space.
 *
 * Uses state.filteredRows (all filtered rows, not paginated).
 */
export function toTsv(
  state: TableState,
  columns: TableCrafterColumn[]
): string {
  const cols = columns.filter(isExportable);
  if (cols.length === 0) return '';

  function sanitize(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[\t\r\n]/g, ' ');
  }

  const header = cols.map((c) => sanitize(c.label ?? c.key)).join('\t');
  const dataRows = state.filteredRows.map((row) => {
    const r = row as Record<string, unknown>;
    return cols.map((c) => sanitize(r[c.key])).join('\t');
  });

  return [header, ...dataRows].join('\n');
}
