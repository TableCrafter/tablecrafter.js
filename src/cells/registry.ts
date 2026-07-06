/**
 * cells/registry.ts
 *
 * Global cell renderer registry.  Maps cell type names to renderer functions.
 * Custom renderers registered via PluginContext.registerCell() are stored here.
 * Phase 0: typed stub.
 */

import type { CellRendererFn } from '../core/types';

/** The cell renderer registry interface. */
export interface CellRegistry {
  /** Register a named cell renderer.  Overwrites any prior registration. */
  register(name: string, renderer: CellRendererFn): void;
  /** Retrieve a renderer by name.  Returns undefined if not found. */
  get(name: string): CellRendererFn | undefined;
  /** Return all registered names. */
  keys(): string[];
}

/**
 * Create a fresh cell registry pre-populated with the built-in renderers.
 */
export function createCellRegistry(): CellRegistry {
  throw new Error('createCellRegistry: not implemented -- Phase 2');
}
