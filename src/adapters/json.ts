/**
 * adapters/json.ts
 *
 * JSON fetch adapter.  Fetches data from a URL that returns JSON.
 * Uses AbortController for teardown.  Supports server-side pagination,
 * sorting, and filtering by appending query parameters.
 * Phase 0: typed stub.
 */

import type { DataAdapter } from './inline';

export interface JsonAdapterOptions {
  /** The URL to fetch.  Query params are appended for page/sort/filter. */
  url: string;
  /** Map from adapter params to URL query param names. */
  paramMap?: {
    page?: string | undefined;
    pageSize?: string | undefined;
    sort?: string | undefined;
    direction?: string | undefined;
    search?: string | undefined;
  } | undefined;
  /** Transform the raw response before handing rows to the store. */
  transform?: ((raw: unknown) => { rows: unknown[]; totalRows: number }) | undefined;
  /** Custom fetch options (headers, credentials, etc.). */
  fetchOptions?: RequestInit | undefined;
}

/**
 * Create a fetch adapter for a JSON API endpoint.
 */
export function createJsonAdapter(_options: JsonAdapterOptions): DataAdapter {
  throw new Error('createJsonAdapter: not implemented -- Phase 2');
}
