import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJsonAdapter, extractByPath, normalizeRows } from './json';

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('adapters/json: extractByPath (ported from v2 processData)', () => {
  // ported from v2: processData resolves config.root dot-path into nested data
  it('resolves a dot-path to a nested array', () => {
    const body = { data: { items: [{ id: 1 }, { id: 2 }] } };
    expect(extractByPath(body, 'data.items')).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('resolves a single-segment path', () => {
    expect(extractByPath({ rows: [1, 2] }, 'rows')).toEqual([1, 2]);
  });

  // ported from v2: missing path segment warns and returns [] (never throws)
  it('missing segment warns and returns []', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(extractByPath({ data: {} }, 'data.items')).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"items" not found'),
      expect.anything()
    );
  });

  // ported from v2: non-array leaf is wrapped in an array
  it('wraps a single-object leaf in an array', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(extractByPath({ data: { id: 7 } }, 'data')).toEqual([{ id: 7 }]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('adapters/json: normalizeRows (ported from v2 processData)', () => {
  it('array passes through, null/undefined become [], object is wrapped', () => {
    const arr = [1];
    expect(normalizeRows(arr)).toBe(arr);
    expect(normalizeRows(null)).toEqual([]);
    expect(normalizeRows(undefined)).toEqual([]);
    expect(normalizeRows({ a: 1 })).toEqual([{ a: 1 }]);
  });
});

describe('adapters/json: createJsonAdapter', () => {
  it('fetches the source URL and returns the JSON array', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ id: 1 }]));
    vi.stubGlobal('fetch', fetchMock);
    const rows = await createJsonAdapter()('https://api.test/rows');
    expect(rows).toEqual([{ id: 1 }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/rows',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('applies root dot-path extraction to the response body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ data: { items: [{ id: 3 }] } }))
    );
    const rows = await createJsonAdapter({ root: 'data.items' })('u');
    expect(rows).toEqual([{ id: 3 }]);
  });

  // ported from v2: config.dataRoot is an alias for config.root
  it('honours the dataRoot alias', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ payload: [{ id: 9 }] }))
    );
    const rows = await createJsonAdapter({ dataRoot: 'payload' })('u');
    expect(rows).toEqual([{ id: 9 }]);
  });

  // ported from v2 apiRequest: bearer auth sets Authorization header
  it('sends Authorization: Bearer header for bearer auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    await createJsonAdapter({ auth: { type: 'bearer', token: 'tok123' } })('u');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer tok123'
    );
  });

  // ported from v2 apiRequest: api-key auth sets the configured header name
  it('sends the configured header for api-key auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    await createJsonAdapter({
      auth: { type: 'api-key', headerName: 'X-Api-Key', key: 'k' },
    })('u');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('k');
  });

  // ported from v2 apiRequest: Content-Type json default + custom headers merge
  it('merges custom headers over the JSON default', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    await createJsonAdapter({ headers: { 'X-Extra': '1' } })('u');
    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit)
      .headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Extra']).toBe('1');
  });

  // ported from v2: loadData throws `HTTP error! status: N` on !response.ok
  it('throws on non-ok responses with the v2 error message shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(null, { ok: false, status: 500 }))
    );
    await expect(createJsonAdapter()('u')).rejects.toThrow(
      'HTTP error! status: 500'
    );
  });

  it('forwards the abort signal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    await createJsonAdapter()('u', controller.signal);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });

  // ported from v2: aborted in-flight loads reject with AbortError
  it('propagates an AbortError rejection from fetch', async () => {
    const abortError = Object.assign(new Error('The operation was aborted'), {
      name: 'AbortError',
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));
    const controller = new AbortController();
    controller.abort();
    await expect(createJsonAdapter()('u', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('omits signal from the fetch init when none is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    await createJsonAdapter()('u');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect('signal' in init).toBe(false);
  });
});
