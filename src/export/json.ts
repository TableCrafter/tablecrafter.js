/**
 * export/json.ts
 *
 * JSON export.  Serialises the current display rows to JSON and
 * triggers a browser download.
 * Phase 0: typed stub.
 */

import type { TableState, TableCrafterColumn, ExportOptions } from '../core/types';

/**
 * Serialise rows to a JSON string (pretty-printed).
 */
export function toJson(
  _state: TableState,
  _columns: TableCrafterColumn[],
  _options?: ExportOptions
): string {
  throw new Error('toJson: not implemented -- Phase 2');
}

/**
 * Trigger a browser file download of the serialised JSON.
 */
export function downloadJson(
  _state: TableState,
  _columns: TableCrafterColumn[],
  _options?: ExportOptions
): void {
  throw new Error('downloadJson: not implemented -- Phase 2');
}
