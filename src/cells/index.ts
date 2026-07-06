/**
 * cells/index.ts
 *
 * Re-exports all built-in cell renderers, descriptor types, and the cell
 * registry factory.  Import from 'tablecrafter/cells' for the full set.
 */

// Registry
export { createCellRegistry, BUILT_IN_CELL_TYPES } from './registry';
export type { CellRegistry, BuiltInCellType } from './registry';

// Descriptor types
export type {
  BadgeDescriptor,
  ProgressDescriptor,
  LinkDescriptor,
  LinkUnsafeDescriptor,
  SparklineDescriptor,
  StarDescriptor,
  HeatmapDescriptor,
  HeatmapCell,
  ConditionalDescriptor,
  DataBarDescriptor,
  CellDescriptor,
} from './descriptors';

// Badge
export { renderBadge, badgeDescriptor } from './badge';
export type { BadgeOptions } from './badge';

// Progress
export { renderProgress, progressDescriptor } from './progress';
export type { ProgressOptions } from './progress';

// Link
export { renderLink, linkDescriptor, isSafeUrl, hrefFor, labelFrom } from './link';
export type { LinkOptions } from './link';

// Sparkline
export { renderSparkline, sparklineDescriptor } from './sparkline';
export type { SparklineOptions } from './sparkline';

// Star rating (parity #334)
export { renderStar, starDescriptor } from './star';
export type { StarOptions } from './star';

// Heatmap (just merged)
export { renderHeatmap, heatmapDescriptor } from './heatmap';
export type { HeatmapOptions } from './heatmap';

// Conditional formatting
export {
  renderConditional,
  evalConditionalRules,
  evalRule,
  matchingRules,
  conditionalDescriptorFromRules,
  colorScaleAt,
  dataBarPercent,
  interpolateColor,
} from './conditional';
export type {
  ConditionalRule,
  ConditionalOptions,
  ConditionalOp,
  DeclarativeWhen,
  WhenPredicate,
} from './conditional';

// Autoformat detection
export { detectAutoFormat, isBoolean, isEmail, isImageUrl, isUrl, isIsoDate } from './autoformat';
export type { AutoFormatType } from './autoformat';
