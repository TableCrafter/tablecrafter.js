/**
 * cells/heatmap.ts
 *
 * Heatmap cell renderer.  Renders an array of numbers as an inline SVG
 * grid of rect elements coloured via a sequential palette between
 * minColor (low) and maxColor (high).
 *
 * Ported from v2 renderHeatmap (just merged).  All-equal series renders at
 * maxColor (full intensity) — matches v2 behaviour.
 *
 * v3 policy: produces an SVG markup string — no document.createElementNS.
 */

import type { CellRendererFn, TableCrafterColumn } from '../core/types';
import type { HeatmapDescriptor, HeatmapCell } from './descriptors';

/** Heatmap renderer options (attached to TableCrafterColumn as `column.heatmap`). */
export interface HeatmapOptions {
  width?: number | undefined;
  height?: number | undefined;
  /** CSS hex colour for the minimum-value end. Default '#ffffff'. */
  minColor?: string | undefined;
  /** CSS hex colour for the maximum-value end. Default '#000000'. */
  maxColor?: string | undefined;
}

type ColumnWithHeatmap = TableCrafterColumn & { heatmap?: HeatmapOptions };

interface Rgb { r: number; g: number; b: number }

/** Parse a 3- or 6-digit hex colour.  Returns null on failure. */
function parseHexRgb(hex: string): Rgb | null {
  if (typeof hex !== 'string') return null;
  let s = hex.trim().replace(/^#/, '');
  if (s.length === 3) s = s.split('').map(c => c + c).join('');
  if (s.length !== 6 || !/^[0-9a-f]{6}$/i.test(s)) return null;
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

/** Linear interpolation between two RGB colours. */
function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function fmtRgb(c: Rgb): string {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

/**
 * Produce a typed HeatmapDescriptor from a numeric array.
 * Returns null for non-array, empty, or all-NaN inputs.
 */
export function heatmapDescriptor(
  values: unknown,
  options?: HeatmapOptions
): HeatmapDescriptor | null {
  if (!Array.isArray(values) || values.length === 0) return null;

  const numeric = (values as unknown[]).filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v)
  );
  if (numeric.length === 0) return null;

  const opts = options ?? {};
  const width = typeof opts.width === 'number' ? opts.width : 80;
  const height = typeof opts.height === 'number' ? opts.height : 16;

  const minColor = parseHexRgb(opts.minColor ?? '#ffffff') ?? { r: 255, g: 255, b: 255 };
  const maxColor = parseHexRgb(opts.maxColor ?? '#000000') ?? { r: 0, g: 0, b: 0 };

  const n = numeric.length;
  const cellWidth = width / n;

  let min = numeric[0]!;
  let max = numeric[0]!;
  for (const v of numeric) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;

  const cells: HeatmapCell[] = numeric.map((v, i) => {
    // All-equal series → render at maxColor (t = 1). Matches v2 behaviour.
    const t = range === 0 ? 1 : (v - min) / range;
    const rgb = lerpRgb(minColor, maxColor, t);
    return {
      x: i * cellWidth,
      y: 0,
      width: cellWidth,
      height,
      fill: fmtRgb(rgb),
    };
  });

  return {
    kind: 'heatmap',
    svgWidth: width,
    svgHeight: height,
    cells,
    viewBox: `0 0 ${width} ${height}`,
  };
}

/**
 * CellRendererFn-compatible wrapper.
 * Returns an SVG markup string.
 */
export const renderHeatmap: CellRendererFn = (
  value: unknown,
  _row: unknown,
  column: TableCrafterColumn
): string => {
  const col = column as ColumnWithHeatmap;
  const desc = heatmapDescriptor(value, col.heatmap);
  if (!desc) return '';

  const rects = desc.cells
    .map(
      c =>
        `<rect x="${c.x}" y="${c.y}" width="${c.width}" ` +
        `height="${c.height}" fill="${c.fill}"/>`
    )
    .join('');

  return (
    `<svg class="tc-heatmap" width="${desc.svgWidth}" height="${desc.svgHeight}" ` +
    `viewBox="${desc.viewBox}" preserveAspectRatio="none" aria-hidden="true">` +
    `${rects}` +
    `</svg>`
  );
};
