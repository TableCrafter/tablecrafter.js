/**
 * core/plugins.ts
 *
 * Plugin registry: use() / unuse() and config.plugins auto-registration, plus
 * the lifecycle-hook dispatch pipeline.
 *
 * Plugin contract v3 (RFC section 3): a plugin's `install(ctx)` receives a
 * PluginContext (store + optional renderer handle + on/dispatch + registerCell),
 * not the raw store `this`.  This lets plugins target headless or DOM consumers
 * without reaching into private fields.  Duplicate-name registration throws.
 *
 * Lifecycle hooks (paired around store mutations) carry over from v2's
 * `_fireHook` with identical cancellation semantics:
 *
 *   beforeSort / afterSort
 *   beforeEdit / afterEdit
 *   beforeLoad / afterLoad
 *   destroy
 *
 * A `before*` hook that returns `false` -- or throws -- cancels the operation:
 * `fireHook` returns `false`, the store aborts, and the paired `after*` hook is
 * not fired.  `after*` hooks ignore their return value.  Every hook runs in
 * registration order and in isolation: a throwing hook is caught and warned so
 * one noisy plugin cannot break the table (a throw in a `before*` hook counts
 * as a cancel, matching v2).
 *
 * Hooks may be supplied two ways, both feed the same registry:
 *   1. Statically on the plugin object: `{ name, install, hooks: { beforeSort } }`
 *      (v2-compatible; use the `HookablePlugin` type).
 *   2. Dynamically inside install: `ctx.hook('beforeSort', fn)`
 *      (use the `PluginContextV3` type for a typed `ctx.hook`).
 *
 * This module contains ZERO DOM access -- it is part of the headless core.
 */

import type {
  Store,
  TableCrafterPlugin,
  PluginContext,
  TableState,
} from './types';

// ---------------------------------------------------------------------------
// Hook names + payloads
// ---------------------------------------------------------------------------

/** The canonical lifecycle hook names fired by the store. */
export type HookName =
  | 'beforeSort'
  | 'afterSort'
  | 'beforeEdit'
  | 'afterEdit'
  | 'beforeLoad'
  | 'afterLoad'
  | 'destroy';

/** Typed payloads for each lifecycle hook. */
export interface HookPayloadMap {
  beforeSort: { column: string; direction: 'asc' | 'desc' };
  afterSort: { column: string; direction: 'asc' | 'desc' };
  beforeEdit: { rowId: string | number; column: string; value: unknown };
  afterEdit: {
    rowId: string | number;
    column: string;
    previousValue: unknown;
    value: unknown;
  };
  beforeLoad: { source: string };
  afterLoad: { rows: unknown[] };
  destroy: { state: TableState };
}

/** A single lifecycle hook implementation. */
export type HookFn<K extends HookName = HookName> = (
  payload: HookPayloadMap[K]
) => boolean | void;

/** Optional map of hooks a plugin may declare statically. */
export type HookMap = {
  [K in HookName]?: HookFn<K>;
};

/** A plugin that additionally declares static lifecycle hooks (v2 style). */
export interface HookablePlugin extends TableCrafterPlugin {
  hooks?: HookMap | undefined;
}

/**
 * The concrete PluginContext handed to `install`, extended with a typed
 * dynamic hook registrar.  The frozen `PluginContext` in types.ts remains the
 * public contract; this superset is what the store actually passes.
 */
export interface PluginContextV3 extends PluginContext {
  /** Register a lifecycle hook for the lifetime of this plugin. */
  hook<K extends HookName>(name: K, fn: HookFn<K>): void;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Internal registry that tracks installed plugins by name. */
export interface PluginRegistry {
  /** Install a plugin.  Throws if a plugin with the same name is already installed. */
  use(plugin: TableCrafterPlugin, options?: unknown): void;
  /** Uninstall a plugin by name.  Returns false if the name is not found. */
  unuse(name: string): boolean;
  /** Return the names of all currently-installed plugins. */
  list(): string[];
  /**
   * Fire a named lifecycle hook across all installed plugins, in registration
   * order.  Returns false when any hook returned false or threw (the cancel
   * signal used by `before*` callers); `after*` callers ignore the result.
   */
  fireHook<K extends HookName>(name: K, payload: HookPayloadMap[K]): boolean;
  /** Uninstall every plugin (used by store teardown). */
  clear(): void;
}

interface PluginRecord {
  plugin: HookablePlugin;
  options: unknown;
  context: PluginContextV3;
  /** Hooks registered dynamically via ctx.hook() during install. */
  dynamicHooks: Map<HookName, HookFn[]>;
}

/**
 * Create a plugin registry bound to the given store.
 *
 * The registry is created once per store instance by the store factory.
 * `buildContext` produces a fresh PluginContextV3 for each plugin so the
 * dynamic `hook()` registrar can capture that plugin's record.
 *
 * @param _store        The bound store (kept for symmetry / future use).
 * @param buildContext  Factory producing the base context (store, on, dispatch).
 */
export function createPluginRegistry(
  _store: Store,
  buildContext: () => PluginContext
): PluginRegistry {
  const records: PluginRecord[] = [];

  function collectHooks<K extends HookName>(
    record: PluginRecord,
    name: K
  ): HookFn<K>[] {
    const out: HookFn<K>[] = [];
    const staticHook = record.plugin.hooks?.[name];
    if (typeof staticHook === 'function') {
      out.push(staticHook as HookFn<K>);
    }
    const dynamic = record.dynamicHooks.get(name);
    if (dynamic) {
      for (const fn of dynamic) out.push(fn as HookFn<K>);
    }
    return out;
  }

  const registry: PluginRegistry = {
    use(plugin: TableCrafterPlugin, options?: unknown): void {
      if (!plugin || typeof plugin.name !== 'string' || plugin.name === '') {
        throw new Error('TableCrafter: plugin must have a non-empty string `name`');
      }
      if (records.some((r) => r.plugin.name === plugin.name)) {
        throw new Error(
          `TableCrafter: plugin "${plugin.name}" is already registered`
        );
      }

      const dynamicHooks = new Map<HookName, HookFn[]>();
      const base = buildContext();
      const context: PluginContextV3 = {
        ...base,
        hook<K extends HookName>(name: K, fn: HookFn<K>): void {
          let bucket = dynamicHooks.get(name);
          if (!bucket) {
            bucket = [];
            dynamicHooks.set(name, bucket);
          }
          bucket.push(fn as HookFn);
        },
      };

      const record: PluginRecord = {
        plugin: plugin as HookablePlugin,
        options,
        context,
        dynamicHooks,
      };

      if (typeof plugin.install === 'function') {
        plugin.install(context, options);
      }
      records.push(record);
    },

    unuse(name: string): boolean {
      const idx = records.findIndex((r) => r.plugin.name === name);
      if (idx === -1) return false;
      const record = records[idx];
      if (record && typeof record.plugin.uninstall === 'function') {
        try {
          record.plugin.uninstall(record.context);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(
            `TableCrafter: plugin "${name}" threw during uninstall`,
            err
          );
        }
      }
      records.splice(idx, 1);
      return true;
    },

    list(): string[] {
      return records.map((r) => r.plugin.name);
    },

    fireHook<K extends HookName>(name: K, payload: HookPayloadMap[K]): boolean {
      let proceed = true;
      // Snapshot so a hook that use()/unuse()s during dispatch is safe.
      const snapshot = records.slice();
      for (const record of snapshot) {
        for (const fn of collectHooks(record, name)) {
          try {
            if (fn(payload) === false) proceed = false;
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(
              `TableCrafter: plugin "${record.plugin.name}" threw in hook "${name}"`,
              err
            );
            proceed = false;
          }
        }
      }
      return proceed;
    },

    clear(): void {
      // Uninstall in reverse registration order.
      for (let i = records.length - 1; i >= 0; i--) {
        const record = records[i];
        if (record && typeof record.plugin.uninstall === 'function') {
          try {
            record.plugin.uninstall(record.context);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(
              `TableCrafter: plugin "${record.plugin.name}" threw during uninstall`,
              err
            );
          }
        }
      }
      records.length = 0;
    },
  };

  return registry;
}
