/**
 * adapters/inline.ts
 *
 * Inline data adapter.  Accepts a plain JavaScript array (or a sync/async
 * provider function that returns one) and wraps it in the standard
 * {@link DataLoader} seam so it plugs into `store.setLoader()`.
 *
 * The loader ignores the `source` string argument -- the data is captured at
 * adapter-creation time.  The array is returned as-is (no copy), matching v2
 * behaviour where `config.data` was consumed by reference.
 */

import type { DataLoader } from '../core/state';

/** A plain array, or a provider that returns one (sync or async). */
export type InlineSource =
  | unknown[]
  | (() => unknown[] | Promise<unknown[]>);

/**
 * Create a {@link DataLoader} backed by an in-memory array or an array
 * provider.
 *
 * @example
 * store.setLoader(createInlineAdapter([{ id: 1, name: 'Ada' }]));
 * await store.load();
 *
 * @example
 * // Async provider -- resolved fresh on every load()
 * store.setLoader(createInlineAdapter(async () => fetchRowsFromIndexedDb()));
 */
export function createInlineAdapter(data: InlineSource): DataLoader {
  return async (_source, _signal) => {
    const resolved = typeof data === 'function' ? await data() : data;
    if (!Array.isArray(resolved)) {
      throw new TypeError(
        'createInlineAdapter: expected an array (or a provider resolving to one)'
      );
    }
    return resolved;
  };
}
