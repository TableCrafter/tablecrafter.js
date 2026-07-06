import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGoogleSheetsAdapter, toGvizCsvUrl } from './google-sheets';

const ID = '1AbC-dEfG_hIjKlMnOpQrStUvWxYz0123456789';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('adapters/google-sheets: toGvizCsvUrl', () => {
  it('transforms a plain edit share URL', () => {
    expect(
      toGvizCsvUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit`)
    ).toBe(`https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?tqx=out:csv`);
  });

  it('preserves a gid found in the URL hash', () => {
    expect(
      toGvizCsvUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=123`)
    ).toBe(
      `https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?tqx=out:csv&gid=123`
    );
  });

  it('preserves a gid found in the query string', () => {
    expect(
      toGvizCsvUrl(
        `https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing&gid=77`
      )
    ).toBe(
      `https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?tqx=out:csv&gid=77`
    );
  });

  it('an explicit gid option overrides the URL gid', () => {
    expect(
      toGvizCsvUrl(
        `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=123`,
        { gid: 9 }
      )
    ).toBe(
      `https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?tqx=out:csv&gid=9`
    );
  });

  it('a sheet name option wins over gid and is URI-encoded', () => {
    expect(
      toGvizCsvUrl(
        `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=123`,
        { sheet: 'Q1 Data' }
      )
    ).toBe(
      `https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?tqx=out:csv&sheet=Q1%20Data`
    );
  });

  it('passes through URLs that are already gviz/export URLs', () => {
    const gviz = `https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?tqx=out:csv&gid=0`;
    expect(toGvizCsvUrl(gviz)).toBe(gviz);
    const exportUrl = `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv`;
    expect(toGvizCsvUrl(exportUrl)).toBe(exportUrl);
  });

  it('throws on non-Sheets URLs', () => {
    expect(() => toGvizCsvUrl('https://example.com/data.csv')).toThrow(
      'not a Google Sheets URL'
    );
  });
});

describe('adapters/google-sheets: createGoogleSheetsAdapter', () => {
  function textResponse(text: string, init?: { ok?: boolean; status?: number }) {
    return {
      ok: init?.ok ?? true,
      status: init?.status ?? 200,
      text: async () => text,
    };
  }

  it('fetches the transformed CSV URL and parses the body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(textResponse('name,age\nAda,36'));
    vi.stubGlobal('fetch', fetchMock);
    const rows = await createGoogleSheetsAdapter()(
      `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=5`
    );
    expect(rows).toEqual([{ name: 'Ada', age: '36' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?tqx=out:csv&gid=5`,
      expect.any(Object)
    );
  });

  it('throws on non-ok responses (e.g. private sheet)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(textResponse('', { ok: false, status: 403 }))
    );
    await expect(
      createGoogleSheetsAdapter()(
        `https://docs.google.com/spreadsheets/d/${ID}/edit`
      )
    ).rejects.toThrow('HTTP error! status: 403');
  });

  it('forwards the abort signal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse('a\n1'));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    await createGoogleSheetsAdapter()(
      `https://docs.google.com/spreadsheets/d/${ID}/edit`,
      controller.signal
    );
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal).toBe(
      controller.signal
    );
  });

  it('rejects before fetching when the source is not a Sheets URL', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      createGoogleSheetsAdapter()('https://example.com/x')
    ).rejects.toThrow('not a Google Sheets URL');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
