/**
 * cells/star.ts
 *
 * Star rating cell renderer (parity #334 — new in v3, spec from the
 * WordPress plugin's star cell).
 *
 * Renders a numeric 0–N value as a row of filled (★) and empty (☆) star
 * characters.  Accessibility: the filled/total count is carried via
 * aria-label on the container span.
 *
 * v3 policy: produces an HTML string — no document.createElement.
 */

import type { CellRendererFn, TableCrafterColumn } from '../core/types';
import type { StarDescriptor } from './descriptors';

/** Star rating renderer options (attached to TableCrafterColumn as `column.star`). */
export interface StarOptions {
  /** Total stars in the scale.  Defaults to 5. */
  total?: number | undefined;
}

type ColumnWithStar = TableCrafterColumn & { star?: StarOptions };

/** Filled star character. */
const FILLED = '★'; // ★
/** Empty star character. */
const EMPTY = '☆'; // ☆

/**
 * Produce a typed StarDescriptor from a raw value + column config.
 * Returns null for null/undefined or non-numeric values.
 */
export function starDescriptor(
  value: unknown,
  _row: unknown,
  column: TableCrafterColumn
): StarDescriptor | null {
  if (value === null || value === undefined) return null;

  const num = Math.round(Number(value));
  if (!Number.isFinite(num)) return null;

  const col = column as ColumnWithStar;
  const total =
    col.star && typeof col.star.total === 'number' && col.star.total > 0
      ? col.star.total
      : 5;

  const filled = Math.min(Math.max(num, 0), total);

  return {
    kind: 'star',
    filled,
    total,
    ariaLabel: `${filled} out of ${total} stars`,
  };
}

/**
 * CellRendererFn-compatible wrapper.
 * Returns an HTML string containing unicode star characters.
 */
export const renderStar: CellRendererFn = (
  value: unknown,
  row: unknown,
  column: TableCrafterColumn
): string => {
  const desc = starDescriptor(value, row, column);
  if (!desc) return '';

  const stars =
    FILLED.repeat(desc.filled) + EMPTY.repeat(desc.total - desc.filled);

  return (
    `<span class="tc-star-rating" aria-label="${desc.ariaLabel}" role="img">` +
    `${stars}` +
    `</span>`
  );
};
