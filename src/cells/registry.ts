/**
 * cells/registry.ts
 *
 * Global cell renderer registry.  Maps cell type names to CellRendererFn
 * implementations.  Custom renderers registered via
 * PluginContext.registerCell() are stored here.
 *
 * The registry is pre-populated with all built-in cell types on creation.
 * The caller may override any built-in by re-registering the same name.
 */

import type { CellRendererFn } from '../core/types';

import { renderBadge } from './badge';
import { renderProgress } from './progress';
import { renderSparkline } from './sparkline';
import { renderLink } from './link';
import { renderStar } from './star';
import { renderHeatmap } from './heatmap';
import { renderConditional } from './conditional';

/** The cell renderer registry interface. */
export interface CellRegistry {
  /** Register a named cell renderer.  Overwrites any prior registration. */
  register(name: string, renderer: CellRendererFn): void;
  /** Retrieve a renderer by name.  Returns undefined if not found. */
  get(name: string): CellRendererFn | undefined;
  /** Return all registered names. */
  keys(): string[];
}

/** Built-in cell type names. */
export const BUILT_IN_CELL_TYPES = [
  'badge',
  'progress',
  'sparkline',
  'link',
  'star',
  'heatmap',
  'conditional',
] as const;

export type BuiltInCellType = (typeof BUILT_IN_CELL_TYPES)[number];

/**
 * Create a fresh cell registry pre-populated with the built-in renderers.
 *
 * Usage:
 *   const registry = createCellRegistry();
 *   registry.register('myType', myRenderer);
 *   const fn = registry.get('badge'); // → renderBadge
 */
export function createCellRegistry(): CellRegistry {
  const map = new Map<string, CellRendererFn>([
    ['badge', renderBadge],
    ['progress', renderProgress],
    ['sparkline', renderSparkline],
    ['link', renderLink],
    ['star', renderStar],
    ['heatmap', renderHeatmap],
    ['conditional', renderConditional],
  ]);

  return {
    register(name: string, renderer: CellRendererFn): void {
      if (typeof name !== 'string' || !name) {
        throw new TypeError('registerCell: name must be a non-empty string');
      }
      map.set(name, renderer);
    },

    get(name: string): CellRendererFn | undefined {
      return map.get(name);
    },

    keys(): string[] {
      return Array.from(map.keys());
    },
  };
}
