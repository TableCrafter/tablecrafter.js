/**
 * cells/descriptors.ts
 *
 * Typed render descriptor shapes produced by every cell-type function.
 * These are plain data objects — no DOM, no HTML strings.
 * The render/dom module converts them into actual DOM nodes.
 *
 * RFC policy: cells/ produces descriptors; render/dom creates elements.
 */

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

export interface BadgeDescriptor {
  kind: 'badge';
  /** Display text (raw value, will be set via textContent). */
  text: string;
  /**
   * Status slug appended as `tc-badge-{status}` CSS class.
   * Only alphanumeric/underscore/hyphen slugs are accepted; anything
   * else leaves the badge un-themed (which is intentional XSS-safety).
   */
  status: string;
  ariaLabel?: string | undefined;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface ProgressDescriptor {
  kind: 'progress';
  /** Clamped percentage [0, 100]. */
  pct: number;
  ariaLabel: string;
}

// ---------------------------------------------------------------------------
// Link
// ---------------------------------------------------------------------------

export interface LinkDescriptor {
  kind: 'link';
  href: string;
  label: string;
  /** If false the href failed the safety check and should NOT be rendered. */
  safe: true;
}

export interface LinkUnsafeDescriptor {
  kind: 'link-unsafe';
  text: string;
}

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

export interface SparklineDescriptor {
  kind: 'sparkline';
  width: number;
  height: number;
  stroke: string;
  /** Space-separated "x,y" pairs for the SVG polyline `points` attribute. */
  points: string;
  /** "0 0 {width} {height}" */
  viewBox: string;
}

// ---------------------------------------------------------------------------
// Star rating
// ---------------------------------------------------------------------------

export interface StarDescriptor {
  kind: 'star';
  /** Number of filled stars. */
  filled: number;
  /** Total number of stars in the scale. */
  total: number;
  ariaLabel: string;
}

// ---------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------

export interface HeatmapCell {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
}

export interface HeatmapDescriptor {
  kind: 'heatmap';
  svgWidth: number;
  svgHeight: number;
  cells: HeatmapCell[];
  viewBox: string;
}

// ---------------------------------------------------------------------------
// Conditional formatting
// ---------------------------------------------------------------------------

export interface DataBarDescriptor {
  /** Width percentage [0, 100]. */
  pct: number;
  color: string;
}

export interface ConditionalDescriptor {
  kind: 'conditional';
  style?: Record<string, string> | undefined;
  classNames?: string[] | undefined;
  /** Icon character to prepend. */
  icon?: string | undefined;
  dataBar?: DataBarDescriptor | undefined;
  /** CSS color string for background. */
  colorScale?: string | undefined;
  ariaLabel?: string | undefined;
}

// ---------------------------------------------------------------------------
// Union
// ---------------------------------------------------------------------------

export type CellDescriptor =
  | BadgeDescriptor
  | ProgressDescriptor
  | LinkDescriptor
  | LinkUnsafeDescriptor
  | SparklineDescriptor
  | StarDescriptor
  | HeatmapDescriptor
  | ConditionalDescriptor;
