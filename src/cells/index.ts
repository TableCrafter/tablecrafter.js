/**
 * cells/index.ts
 *
 * Re-exports all built-in cell renderers and the cell registry factory.
 * Import from 'tablecrafter/cells' to access the full set.
 * Phase 0: typed stub.
 */

export { createCellRegistry } from './registry';
export type { CellRegistry } from './registry';

export { renderBadge } from './badge';
export { renderProgress } from './progress';
export { renderSparkline } from './sparkline';
export { renderLink } from './link';
export { renderStar } from './star';
export { renderConditional } from './conditional';
