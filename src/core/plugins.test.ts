import { describe, it, expect, vi } from 'vitest';
import { createPluginRegistry } from './plugins';
import type { HookablePlugin, PluginContextV3 } from './plugins';
import type { Store, PluginContext, TableCrafterPlugin } from './types';

/** Minimal fake store + context factory for isolated registry tests. */
function makeRegistry() {
  const fakeStore = { dispatch: vi.fn() } as unknown as Store;
  const contexts: PluginContext[] = [];
  const buildContext = (): PluginContext => {
    const ctx: PluginContext = {
      store: fakeStore,
      on: vi.fn() as unknown as Store['on'],
      dispatch: fakeStore.dispatch,
    };
    contexts.push(ctx);
    return ctx;
  };
  return { registry: createPluginRegistry(fakeStore, buildContext), contexts };
}

describe('core/plugins module', () => {
  it('loads and exports createPluginRegistry', () => {
    expect(typeof createPluginRegistry).toBe('function');
  });

  it('use() installs a plugin and passes a PluginContext to install()', () => {
    const { registry } = makeRegistry();
    const install = vi.fn();
    registry.use({ name: 'p1', install });
    expect(install).toHaveBeenCalledTimes(1);
    const ctx = install.mock.calls[0]![0] as PluginContext;
    expect(ctx.store).toBeDefined();
    expect(typeof ctx.on).toBe('function');
    expect(typeof ctx.dispatch).toBe('function');
    expect(registry.list()).toEqual(['p1']);
  });

  it('use() passes options through to install()', () => {
    const { registry } = makeRegistry();
    const install = vi.fn();
    registry.use({ name: 'p1', install }, { flag: true });
    expect(install.mock.calls[0]![1]).toEqual({ flag: true });
  });

  it('use() throws on a duplicate name', () => {
    const { registry } = makeRegistry();
    registry.use({ name: 'dup', install() {} });
    expect(() => registry.use({ name: 'dup', install() {} })).toThrow(
      /already registered/
    );
  });

  it('use() rejects a plugin without a string name', () => {
    const { registry } = makeRegistry();
    expect(() =>
      registry.use({ install() {} } as unknown as TableCrafterPlugin)
    ).toThrow(/name/);
    expect(() =>
      registry.use({ name: '', install() {} })
    ).toThrow(/name/);
  });

  it('unuse() calls uninstall and returns true; false when not found', () => {
    const { registry } = makeRegistry();
    const uninstall = vi.fn();
    registry.use({ name: 'p1', install() {}, uninstall });
    expect(registry.unuse('p1')).toBe(true);
    expect(uninstall).toHaveBeenCalledTimes(1);
    expect(registry.list()).toEqual([]);
    expect(registry.unuse('nope')).toBe(false);
  });

  it('fireHook() runs static hooks across plugins in registration order', () => {
    const { registry } = makeRegistry();
    const order: string[] = [];
    const p1: HookablePlugin = {
      name: 'p1',
      install() {},
      hooks: { beforeSort: () => void order.push('p1') },
    };
    const p2: HookablePlugin = {
      name: 'p2',
      install() {},
      hooks: { beforeSort: () => void order.push('p2') },
    };
    registry.use(p1);
    registry.use(p2);
    const proceed = registry.fireHook('beforeSort', { column: 'a', direction: 'asc' });
    expect(proceed).toBe(true);
    expect(order).toEqual(['p1', 'p2']);
  });

  it('fireHook() returns false when any before-hook returns false (cancel)', () => {
    const { registry } = makeRegistry();
    registry.use({
      name: 'veto',
      install() {},
      hooks: { beforeEdit: () => false },
    } as HookablePlugin);
    const proceed = registry.fireHook('beforeEdit', {
      rowId: 0,
      column: 'a',
      value: 1,
    });
    expect(proceed).toBe(false);
  });

  it('fireHook() treats a throwing hook as cancel and isolates it', () => {
    const { registry } = makeRegistry();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const other = vi.fn();
    registry.use({
      name: 'boom',
      install() {},
      hooks: {
        beforeSort() {
          throw new Error('x');
        },
      },
    } as HookablePlugin);
    registry.use({
      name: 'ok',
      install() {},
      hooks: { beforeSort: other },
    } as HookablePlugin);
    const proceed = registry.fireHook('beforeSort', { column: 'a', direction: 'asc' });
    expect(proceed).toBe(false);
    expect(other).toHaveBeenCalled(); // isolation: later plugin still runs
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('supports dynamic hook registration via ctx.hook() inside install', () => {
    const { registry } = makeRegistry();
    const spy = vi.fn();
    const plugin: TableCrafterPlugin = {
      name: 'dyn',
      install(ctx) {
        (ctx as PluginContextV3).hook('afterSort', spy);
      },
    };
    registry.use(plugin);
    registry.fireHook('afterSort', { column: 'a', direction: 'desc' });
    expect(spy).toHaveBeenCalledWith({ column: 'a', direction: 'desc' });
  });

  it('clear() uninstalls every plugin in reverse order', () => {
    const { registry } = makeRegistry();
    const order: string[] = [];
    registry.use({ name: 'a', install() {}, uninstall: () => void order.push('a') });
    registry.use({ name: 'b', install() {}, uninstall: () => void order.push('b') });
    registry.clear();
    expect(order).toEqual(['b', 'a']);
    expect(registry.list()).toEqual([]);
  });
});
