/**
 * adapters/pagination-link.ts
 *
 * RFC-5988 (now RFC-8288) `Link` header pagination adapter (parity #336).
 *
 * Follows `rel="next"` links returned by REST APIs (GitHub-style pagination)
 * until no further `next` relation exists, accumulating rows across all
 * pages.  A safety cap ({@link DEFAULT_MAX_PAGES}) prevents infinite loops on
 * misbehaving servers that keep emitting `next`.
 */

import type { DataLoader } from '../core/state';
import { extractByPath, normalizeRows } from './json';

/** Default safety cap on the number of pages fetched per load. */
export const DEFAULT_MAX_PAGES = 100;

/**
 * Parse an RFC-5988 `Link` header into a `rel -> URL` map.
 *
 * @example
 * parseLinkHeader('<https://api.test/p2>; rel="next", <https://api.test/p9>; rel="last"')
 * // => { next: 'https://api.test/p2', last: 'https://api.test/p9' }
 *
 * Malformed segments (missing `<url>` or missing `rel`) are skipped; a
 * missing/empty header yields `{}`.  Both quoted (`rel="next"`) and unquoted
 * (`rel=next`) parameter forms are accepted.
 */
export function parseLinkHeader(
  header: string | null | undefined
): Record<string, string> {
  const rels: Record<string, string> = {};
  if (!header) return rels;

  // Each link-value: <url> followed by ;-separated params, comma-delimited.
  const linkRe = /<\s*([^>]*)\s*>((?:\s*;\s*[^,<]*)*)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(header)) !== null) {
    const url = (m[1] as string).trim();
    const params = m[2] ?? '';
    const relMatch = /(?:^|;)\s*rel\s*=\s*(?:"([^"]*)"|([^\s;,"]+))/i.exec(
      params
    );
    if (!url || !relMatch) continue;
    const relValue = (relMatch[1] ?? relMatch[2] ?? '').trim();
    // rel may be a space-separated list of relation types (RFC-5988 s5.5).
    for (const rel of relValue.split(/\s+/)) {
      if (rel && !(rel in rels)) rels[rel] = url;
    }
  }
  return rels;
}

export interface PaginationLinkAdapterOptions {
  /** Safety cap on pages fetched per load (default {@link DEFAULT_MAX_PAGES}). */
  maxPages?: number | undefined;
  /** Dot-path to the row array within each page body (see adapters/json). */
  root?: string | undefined;
  /** Additional fetch options applied to every page request. */
  fetchOptions?: RequestInit | undefined;
}

/**
 * Create a {@link DataLoader} that fetches the `source` URL, then follows
 * `rel="next"` Link headers until exhausted (or the page cap is reached),
 * concatenating the rows of every page.  Relative `next` URLs are resolved
 * against the URL of the page that supplied them.  The store's abort signal
 * is forwarded to every page fetch.
 */
export function createPaginationLinkAdapter(
  options: PaginationLinkAdapterOptions = {}
): DataLoader {
  const maxPages =
    typeof options.maxPages === 'number' && options.maxPages > 0
      ? options.maxPages
      : DEFAULT_MAX_PAGES;

  return async (source, signal) => {
    const rows: unknown[] = [];
    let url: string | undefined = source;
    let pages = 0;

    while (url) {
      if (pages >= maxPages) {
        console.warn(
          `TableCrafter: pagination-link adapter stopped after ${maxPages} pages (safety cap); rows may be truncated`
        );
        break;
      }
      const init: RequestInit = { ...options.fetchOptions };
      if (signal) init.signal = signal;
      const response: Response = await fetch(url, init);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const body: unknown = await response.json();
      const pageRows = options.root
        ? extractByPath(body, options.root)
        : normalizeRows(body);
      for (const row of pageRows) rows.push(row);
      pages++;

      const next: string | undefined = parseLinkHeader(
        response.headers.get('Link') ?? response.headers.get('link')
      )['next'];
      // Resolve relative next URLs against the current page URL.
      url = next ? new URL(next, url).toString() : undefined;
    }
    return rows;
  };
}
