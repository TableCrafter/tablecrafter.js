/**
 * cells/progress.ts
 *
 * Progress bar cell renderer.  Renders a numeric 0-100 value as a
 * <progress>-backed bar with configurable colour thresholds.
 * Phase 0: typed stub.
 */

import type { CellRendererFn, TableCrafterColumn } from '../core/types';

export const renderProgress: CellRendererFn = (
  _value: unknown,
  _row: unknown,
  _column: TableCrafterColumn
): string | HTMLElement => {
  throw new Error('renderProgress: not implemented -- Phase 2');
};
