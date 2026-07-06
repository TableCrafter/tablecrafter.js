/**
 * adapters/json.ts
 *
 * JSON fetch adapter.  Fetches a URL that returns JSON and resolves the row
 * array, with optional dot-path `root`/`dataRoot` extraction and the v2
 * `api.authentication` header conventions (bearer token / api-key header).
 *
 * The abort signal handed to the loader by `store.load()` is forwarded to
 * `fetch`, so superseded loads are cancelled exactly as in v2's
 * `_loadController` handling.
 */

import type { DataLoader } from '../core/state';

/** v2 `config.api.authentication` conventions. */
export type JsonAuth =
  | { type: 'bearer'; token: string }
  | { type: 'api-key'; headerName: string; key: string };

export interface JsonAdapterOptions {
  /**
   * Dot-path to the row array within the response body, e.g. `"data.items"`
   * resolves `body.data.items`.  Ported from v2 `processData()`.
   */
  root?: string | undefined;
  /** v2 alias for {@link JsonAdapterOptions.root}; `root` wins when both set. */
  dataRoot?: string | undefined;
  /** Extra request headers (merged over the JSON defaults). */
  headers?: Record<string, string> | undefined;
  /** Authentication convention ported from v2 `apiRequest()`. */
  auth?: JsonAuth | undefined;
  /** Additional fetch options (method, credentials, ...). */
  fetchOptions?: RequestInit | undefined;
}

/**
 * v2 `processData()` normalisation: arrays pass through, `null`/`undefined`/
 * falsy become `[]`, and a single object is wrapped in an array.
 */
export function normalizeRows(data: unknown): unknown[] {
  return Array.isArray(data) ? data : data ? [data] : [];
}

/**
 * Resolve a dot-path (e.g. `"data.items"`) inside a response body and
 * normalise the result to a row array.
 *
 * Ported from v2 `processData()`: a missing path segment logs a warning and
 * yields `[]` rather than throwing.
 */
export function extractByPath(data: unknown, path: string): unknown[] {
  let current: unknown = data;
  for (const segment of path.split('.')) {
    if (
      current !== null &&
      typeof current === 'object' &&
      segment in (current as Record<string, unknown>)
    ) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      // v2 parity: warn and return [] instead of throwing.
      console.warn(
        `TableCrafter: Path segment "${segment}" not found in data`,
        data
      );
      return [];
    }
  }
  return normalizeRows(current);
}

/** Build the request headers per the v2 `apiRequest()` conventions. */
function buildHeaders(options: JsonAdapterOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  const auth = options.auth;
  if (auth) {
    if (auth.type === 'bearer') {
      headers['Authorization'] = `Bearer ${auth.token}`;
    } else {
      headers[auth.headerName] = auth.key;
    }
  }
  return headers;
}

/**
 * Create a {@link DataLoader} that fetches JSON from the `source` URL.
 *
 * @example
 * store.setLoader(createJsonAdapter({ root: 'data.items', auth: { type: 'bearer', token } }));
 * await store.load(); // fetches config.source and dispatches SET_ROWS
 */
export function createJsonAdapter(
  options: JsonAdapterOptions = {}
): DataLoader {
  return async (source, signal) => {
    const init: RequestInit = {
      method: 'GET',
      ...options.fetchOptions,
      headers: {
        ...buildHeaders(options),
        ...(options.fetchOptions?.headers as
          | Record<string, string>
          | undefined),
      },
    };
    if (signal) init.signal = signal;

    const response = await fetch(source, init);
    if (!response.ok) {
      // v2 parity: same error message shape as v2 loadData().
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const body: unknown = await response.json();
    const root = options.root ?? options.dataRoot;
    return root ? extractByPath(body, root) : normalizeRows(body);
  };
}
