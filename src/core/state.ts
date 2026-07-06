/**
 * core/state.ts
 *
 * Store factory.  createTable() is the single entry point for all v3 consumers.
 * Sorting, filtering, editing, and plugin modules are composed here.
 * Phase 0: typed stub -- implementation lands in Phase 1.
 */

import type {
  Store,
  TableCrafterConfig,
} from './types';

/**
 * Create a headless TableCrafter store from a configuration object.
 *
 * The returned Store holds all table state and is the central coordination
 * point for every v3 module.  Pass it to mountTable() for DOM rendering or
 * consume it directly from framework components.
 *
 * @param config - Table configuration including data, columns, and options.
 * @returns A fully-typed Store instance.
 */
export function createTable(_config: TableCrafterConfig): Store {
  throw new Error('createTable: not implemented -- Phase 1');
}
