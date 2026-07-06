/**
 * adapters/pagination-link.ts
 *
 * RFC 5988 Link header pagination adapter.  Follows `rel=next` link headers
 * returned by REST APIs to load subsequent pages without hard-coding URLs.
 * Phase 0: typed stub.
 */

import type { DataAdapter } from './inline';

export interface PaginationLinkAdapterOptions {
  /** The initial URL to fetch. */
  url: string;
  /** HTTP header that carries the Link pagination (default: 'Link'). */
  linkHeader?: string | undefined;
  /** Transform the raw response body to rows + optional totalRows. */
  transform?: ((raw: unknown) => { rows: unknown[]; totalRows?: number | undefined }) | undefined;
  /** Custom fetch options. */
  fetchOptions?: RequestInit | undefined;
}

/**
 * Create an adapter that follows RFC 5988 Link headers for pagination.
 */
export function createPaginationLinkAdapter(
  _options: PaginationLinkAdapterOptions
): DataAdapter {
  throw new Error('createPaginationLinkAdapter: not implemented -- Phase 2');
}

/**
 * Parse an RFC 5988 Link header string and return a map of rel to URL.
 * e.g. parseLinkHeader('<url2>; rel="next"') => { next: 'url2' }
 */
export function parseLinkHeader(
  _header: string
): Record<string, string> {
  throw new Error('parseLinkHeader: not implemented -- Phase 2');
}
