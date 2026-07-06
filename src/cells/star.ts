/**
 * cells/star.ts
 *
 * Star rating cell renderer.  Renders a 0-N numeric value as filled/empty
 * star icons.  Interactive in edit mode.
 * Phase 0: typed stub.
 */

import type { CellRendererFn, TableCrafterColumn } from '../core/types';

export const renderStar: CellRendererFn = (
  _value: unknown,
  _row: unknown,
  _column: TableCrafterColumn
): string | HTMLElement => {
  throw new Error('renderStar: not implemented -- Phase 2');
};
