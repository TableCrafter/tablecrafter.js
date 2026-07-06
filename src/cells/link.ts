/**
 * cells/link.ts
 *
 * Link cell renderer.  Renders a value as a clickable anchor tag with
 * configurable href template and target.
 * Phase 0: typed stub.
 */

import type { CellRendererFn, TableCrafterColumn } from '../core/types';

export const renderLink: CellRendererFn = (
  _value: unknown,
  _row: unknown,
  _column: TableCrafterColumn
): string | HTMLElement => {
  throw new Error('renderLink: not implemented -- Phase 2');
};
