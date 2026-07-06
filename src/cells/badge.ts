/**
 * cells/badge.ts
 *
 * Badge cell renderer.  Renders a value as a coloured pill badge using a
 * configurable colour map or theme-default colours.
 * Phase 0: typed stub.
 */

import type { CellRendererFn, TableCrafterColumn } from '../core/types';

/** Badge renderer options (attached to TableCrafterColumn.rendererOptions). */
export interface BadgeOptions {
  /** Map of cell value to CSS colour or CSS variable. */
  colorMap?: Record<string, string> | undefined;
  /** Default colour for values not in colorMap. */
  defaultColor?: string | undefined;
}

/**
 * Render a value as a badge element.
 * Returns an HTMLElement -- usable directly in cell.innerHTML.
 */
export const renderBadge: CellRendererFn = (
  _value: unknown,
  _row: unknown,
  _column: TableCrafterColumn
): string | HTMLElement => {
  throw new Error('renderBadge: not implemented -- Phase 2');
};
