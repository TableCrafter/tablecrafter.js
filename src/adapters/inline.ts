/**
 * adapters/inline.ts
 *
 * Inline data adapter.  Accepts a plain JavaScript array as the data source
 * and wraps it in the standard adapter interface so it is composable with
 * other adapters.
 * Phase 0: typed stub.
 */

import type { TableState } from '../core/types';

/** Standard adapter interface consumed by the store factory. */
export interface DataAdapter {
  /** Load data.  May be called multiple times (e.g. on pagination). */
  load(params: AdapterParams): Promise<AdapterResult>;
  /** Optional cleanup on store destroy. */
  destroy?: (() => void) | undefined;
}

export interface AdapterParams {
  page: number;
  pageSize: number;
  sort: TableState['sort'];
  filters: TableState['filters'];
  searchQuery: string;
}

export interface AdapterResult {
  rows: unknown[];
  totalRows: number;
}

/**
 * Create a data adapter backed by an in-memory array.
 */
export function createInlineAdapter(_data: unknown[]): DataAdapter {
  throw new Error('createInlineAdapter: not implemented -- Phase 2');
}
