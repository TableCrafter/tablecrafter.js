import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MAX_PAGES,
  createPaginationLinkAdapter,
  parseLinkHeader,
} from './pagination-link';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('adapters/pagination-link: parseLinkHeader', () => {
  it('parses rel="next" and rel="last" from a GitHub-style header', () => {
    const header =
      '<https://api.test/items?page=2>; rel="next", <https://api.test/items?page=9>; rel="last"';
    expect(parseLinkHeader(header)).toEqual({
      next: 'https://api.test/items?page=2',
      last: 'https://api.test/items?page=9',
    });
  });

  it('parses a single link-value', () => {
    expect(parseLinkHeader('<https://a.test/p2>; rel="next"')).toEqual({
      next: 'https://a.test/p2',
    });
  });

  it('accepts unquoted rel parameters', () => {
    expect(parseLinkHeader('<https://a.test/p2>; rel=next')).toEqual({
      next: 'https://a.test/p2',
    });
  });

  it('ignores non-rel parameters and extra whitespace', () => {
    const header =
      '  <https://a.test/p2> ;  title="two" ; rel="next" , <https://a.test/p1>; rel="prev"';
    expect(parseLinkHeader(header)).toEqual({
      next: 'https://a.test/p2',
      prev: 'https://a.test/p1',
    });
  });

  it('supports space-separated multi-rel values (RFC-5988 s5.5)', () => {
    expect(parseLinkHeader('<https://a.test/p1>; rel="first prev"')).toEqual({
      first: 'https://a.test/p1',
      prev: 'https://a.test/p1',
    });
  });

  it('returns {} for missing, empty, or malformed headers', () => {
    expect(parseLinkHeader(null)).toEqual({});
    expect(parseLinkHeader(undefined)).toEqual({});
    expect(parseLinkHeader('')).toEqual({});
    expect(parseLinkHeader('not a link header')).toEqual({});
    expect(parseLinkHeader('<https://a.test/p2>')).toEqual({}); // no rel
  });
});

describe('adapters/pagination-link: createPaginationLinkAdapter', () => {
  function pageResponse(
    body: unknown,
    linkHeader?: string,
    init?: { ok?: boolean; status?: number }
  ) {
    return {
      ok: init?.ok ?? true,
      status: init?.status ?? 200,
      json: async () => body,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'link' ? (linkHeader ?? null) : null,
      },
    };
  }

  it('returns a single page when no Link header is present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(pageResponse([{ id: 1 }]))
    );
    const rows = await createPaginationLinkAdapter()('https://a.test/items');
    expect(rows).toEqual([{ id: 1 }]);
  });

  it('follows rel="next" links and accumulates rows across pages', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        pageResponse(
          [{ id: 1 }],
          '<https://a.test/items?page=2>; rel="next", <https://a.test/items?page=3>; rel="last"'
        )
      )
      .mockResolvedValueOnce(
        pageResponse([{ id: 2 }], '<https://a.test/items?page=3>; rel="next"')
      )
      .mockResolvedValueOnce(
        pageResponse([{ id: 3 }], '<https://a.test/items?page=1>; rel="first"')
      );
    vi.stubGlobal('fetch', fetchMock);
    const rows = await createPaginationLinkAdapter()('https://a.test/items');
    expect(rows).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://a.test/items?page=2');
    expect(fetchMock.mock.calls[2]?.[0]).toBe('https://a.test/items?page=3');
  });

  it('resolves relative next URLs against the current page URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        pageResponse([{ id: 1 }], '</items?page=2>; rel="next"')
      )
      .mockResolvedValueOnce(pageResponse([{ id: 2 }]));
    vi.stubGlobal('fetch', fetchMock);
    const rows = await createPaginationLinkAdapter()('https://a.test/items');
    expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://a.test/items?page=2');
  });

  it('enforces the page cap to break next-loops', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Server always advertises itself as next: infinite loop without the cap.
    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string) =>
        pageResponse([{ u: url }], `<${url}>; rel="next"`)
      );
    vi.stubGlobal('fetch', fetchMock);
    const rows = await createPaginationLinkAdapter({ maxPages: 5 })(
      'https://a.test/items'
    );
    expect(rows).toHaveLength(5);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('5 pages'));
  });

  it('defaults the cap to DEFAULT_MAX_PAGES (100)', () => {
    expect(DEFAULT_MAX_PAGES).toBe(100);
  });

  it('applies the root dot-path per page body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        pageResponse(
          { data: { items: [{ id: 1 }] } },
          '<https://a.test/p2>; rel="next"'
        )
      )
      .mockResolvedValueOnce(pageResponse({ data: { items: [{ id: 2 }] } }));
    vi.stubGlobal('fetch', fetchMock);
    const rows = await createPaginationLinkAdapter({ root: 'data.items' })(
      'https://a.test/p1'
    );
    expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('throws on a non-ok page response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        pageResponse([{ id: 1 }], '<https://a.test/p2>; rel="next"')
      )
      .mockResolvedValueOnce(
        pageResponse(null, undefined, { ok: false, status: 500 })
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      createPaginationLinkAdapter()('https://a.test/p1')
    ).rejects.toThrow('HTTP error! status: 500');
  });

  it('forwards the abort signal to every page fetch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        pageResponse([1], '<https://a.test/p2>; rel="next"')
      )
      .mockResolvedValueOnce(pageResponse([2]));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    await createPaginationLinkAdapter()('https://a.test/p1', controller.signal);
    for (const call of fetchMock.mock.calls) {
      expect((call[1] as RequestInit).signal).toBe(controller.signal);
    }
  });

  it('propagates an AbortError from a mid-pagination fetch', async () => {
    const abortError = Object.assign(new Error('aborted'), {
      name: 'AbortError',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        pageResponse([1], '<https://a.test/p2>; rel="next"')
      )
      .mockRejectedValueOnce(abortError);
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      createPaginationLinkAdapter()('https://a.test/p1')
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
