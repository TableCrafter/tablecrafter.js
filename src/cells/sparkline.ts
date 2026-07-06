/**
 * cells/sparkline.ts
 *
 * Sparkline cell renderer.  Renders an array of numbers as an inline SVG
 * line chart (polyline) suitable for embedding in a table cell.
 *
 * v3 policy: produces an SVG markup string — no document.createElementNS.
 * The SVG path data is computed from the numeric array and embedded as a
 * string in a SparklineDescriptor.
 */

import type { CellRendererFn, TableCrafterColumn } from '../core/types';
import type { SparklineDescriptor } from './descriptors';

/** Sparkline renderer options (attached to TableCrafterColumn as `column.sparkline`). */
export interface SparklineOptions {
  width?: number | undefined;
  height?: number | undefined;
  stroke?: string | undefined;
}

type ColumnWithSparkline = TableCrafterColumn & { sparkline?: SparklineOptions };

/**
 * Produce a typed SparklineDescriptor from a numeric array.
 * Ported exactly from v2 renderSparkline (point math, midpoint for single
 * values, flat midline for all-equal series).
 *
 * Returns null when values is not a non-empty array of finite numbers.
 */
export function sparklineDescriptor(
  values: unknown,
  options?: SparklineOptions
): SparklineDescriptor | null {
  if (!Array.isArray(values) || values.length === 0) return null;

  const numeric = (values as unknown[]).filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v)
  );
  if (numeric.length === 0) return null;

  const opts = options ?? {};
  const width = typeof opts.width === 'number' ? opts.width : 80;
  const height = typeof opts.height === 'number' ? opts.height : 24;
  const stroke = typeof opts.stroke === 'string' ? opts.stroke : 'currentColor';

  let min = Infinity;
  let max = -Infinity;
  for (const v of numeric) {
    if (v < min) min = v;
    if (v > max) max = v;
  }

  const n = numeric.length;
  const range = max - min;

  const points = numeric
    .map((v, i) => {
      const x = n === 1 ? 0 : (i / (n - 1)) * width;
      const y = range === 0 ? height / 2 : height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return {
    kind: 'sparkline',
    width,
    height,
    stroke,
    points,
    viewBox: `0 0 ${width} ${height}`,
  };
}

/**
 * CellRendererFn-compatible wrapper.
 * Returns an SVG markup string.
 */
export const renderSparkline: CellRendererFn = (
  value: unknown,
  _row: unknown,
  column: TableCrafterColumn
): string => {
  const col = column as ColumnWithSparkline;
  const desc = sparklineDescriptor(value, col.sparkline);
  if (!desc) return '';

  return (
    `<svg class="tc-sparkline" ` +
    `width="${desc.width}" height="${desc.height}" ` +
    `viewBox="${desc.viewBox}" preserveAspectRatio="none" ` +
    `aria-hidden="true">` +
    `<polyline fill="none" stroke="${desc.stroke}" stroke-width="1" ` +
    `points="${desc.points}"/>` +
    `</svg>`
  );
};
