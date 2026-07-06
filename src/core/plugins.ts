/**
 * core/plugins.ts
 *
 * Plugin registry: use() / unuse() and config.plugins auto-registration.
 * Plugins receive a PluginContext (not the raw store `this`) so they can
 * target headless or DOM consumers without accessing private fields.
 * Phase 0: typed stub.
 */

import type { Store, TableCrafterPlugin, PluginContext } from './types';

/** Internal registry that tracks installed plugins by name. */
export interface PluginRegistry {
  /** Install a plugin.  Throws if a plugin with the same name is already installed. */
  use(plugin: TableCrafterPlugin, options?: unknown): void;
  /** Uninstall a plugin by name.  No-op if the name is not found. */
  unuse(name: string): void;
  /** Return the names of all currently-installed plugins. */
  list(): string[];
}

/**
 * Create a plugin registry bound to the given store.
 *
 * The registry is created once per store instance by the store factory.
 */
export function createPluginRegistry(
  _store: Store,
  _buildContext: () => PluginContext
): PluginRegistry {
  throw new Error('createPluginRegistry: not implemented -- Phase 1');
}
