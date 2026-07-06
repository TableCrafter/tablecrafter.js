/**
 * cells/progress.ts
 *
 * Progress bar cell renderer.  Renders a numeric value as an inline progress
 * bar using a configurable max (default 100).
 *
 * v3 policy: produces an HTML string — no document.createElement.
 */

import type { CellRendererFn, TableCrafterColumn } from '../core/types';
import type { ProgressDescriptor } from './descriptors';

/** Progress renderer options (attached to TableCrafterColumn as `column.progress`). */
export interface ProgressOptions {
  /** Maximum value.  Defaults to 100. */
  max?: number | undefined;
}

type ColumnWithProgress = TableCrafterColumn & { progress?: ProgressOptions };

/**
 * Produce a typed ProgressDescriptor.
 * Returns null for non-numeric or null/undefined values.
 */
export function progressDescriptor(
  value: unknown,
  _row: unknown,
  column: TableCrafterColumn
): ProgressDescriptor | null {
  if (value === null || value === undefined) return null;

  const num = Number(value);
  if (Number.isNaN(num)) return null;

  const col = column as ColumnWithProgress;
  const max =
    col.progress && typeof col.progress.max === 'number' ? col.progress.max : 100;

  let pct = max > 0 ? (num / max) * 100 : 0;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;

  return {
    kind: 'progress',
    pct,
    ariaLabel: `${num} of ${max}`,
  };
}

/**
 * CellRendererFn-compatible wrapper.
 * Returns an HTML string.
 */
export const renderProgress: CellRendererFn = (
  value: unknown,
  row: unknown,
  column: TableCrafterColumn
): string => {
  const desc = progressDescriptor(value, row, column);
  if (!desc) return '';

  return (
    `<div class="tc-progress">` +
    `<div class="tc-progress-fill" style="width:${desc.pct}%" ` +
    `aria-label="${desc.ariaLabel}"></div>` +
    `</div>`
  );
};
