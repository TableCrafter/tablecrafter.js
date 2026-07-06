/**
 * cells/sparkline.ts
 *
 * Sparkline cell renderer.  Renders an array of numbers as an inline SVG
 * line chart suitable for embedding in a table cell.
 * Phase 0: typed stub.
 */

import type { CellRendererFn, TableCrafterColumn } from '../core/types';

export const renderSparkline: CellRendererFn = (
  _value: unknown,
  _row: unknown,
  _column: TableCrafterColumn
): string | HTMLElement => {
  throw new Error('renderSparkline: not implemented -- Phase 2');
};
