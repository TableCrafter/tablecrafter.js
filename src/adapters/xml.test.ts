import { afterEach, describe, expect, it, vi } from 'vitest';
import { createXmlAdapter, extractXmlRows } from './xml';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('adapters/xml: extractXmlRows', () => {
  it('extracts simple repeating elements into row objects', () => {
    const xml = `<?xml version="1.0"?>
      <items>
        <item><name>Ada</name><age>36</age></item>
        <item><name>Grace</name><age>45</age></item>
      </items>`;
    expect(extractXmlRows(xml, 'item')).toEqual([
      { name: 'Ada', age: '36' },
      { name: 'Grace', age: '45' },
    ]);
  });

  it('captures attributes on the row element as fields', () => {
    const xml = `<rows><row id="1" status='ok'><v>a</v></row></rows>`;
    expect(extractXmlRows(xml, 'row')).toEqual([
      { id: '1', status: 'ok', v: 'a' },
    ]);
  });

  it('decodes predefined and numeric entities', () => {
    const xml = `<r><x><a>Tom &amp; Jerry &lt;3</a><b>&#65;&#x42;</b></x></r>`;
    expect(extractXmlRows(xml, 'x')).toEqual([
      { a: 'Tom & Jerry <3', b: 'AB' },
    ]);
  });

  it('unwraps CDATA sections', () => {
    const xml = `<r><row><html><![CDATA[<b>bold & raw</b>]]></html></row></r>`;
    expect(extractXmlRows(xml, 'row')).toEqual([
      { html: '<b>bold & raw</b>' },
    ]);
  });

  it('treats self-closing children as empty strings', () => {
    const xml = `<r><row><a>1</a><b/></row></r>`;
    expect(extractXmlRows(xml, 'row')).toEqual([{ a: '1', b: '' }]);
  });

  it('supports self-closing row elements (attributes only)', () => {
    const xml = `<r><row id="1"/><row id="2"/></r>`;
    expect(extractXmlRows(xml, 'row')).toEqual([{ id: '1' }, { id: '2' }]);
  });

  it('ignores child element attributes and keeps text content', () => {
    const xml = `<r><row><a unit="kg">5</a></row></r>`;
    expect(extractXmlRows(xml, 'row')).toEqual([{ a: '5' }]);
  });

  it('returns [] when the row element is absent', () => {
    expect(extractXmlRows('<root><other/></root>', 'item')).toEqual([]);
    expect(extractXmlRows('', 'item')).toEqual([]);
  });

  it('handles namespaced-style element names literally', () => {
    const xml = `<feed><atom:entry><t>x</t></atom:entry></feed>`;
    expect(extractXmlRows(xml, 'atom:entry')).toEqual([{ t: 'x' }]);
  });
});

describe('adapters/xml: createXmlAdapter', () => {
  function textResponse(text: string, init?: { ok?: boolean; status?: number }) {
    return {
      ok: init?.ok ?? true,
      status: init?.status ?? 200,
      text: async () => text,
    };
  }

  it('fetches the source URL and extracts the configured row element', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        textResponse('<items><item><id>1</id></item></items>')
      );
    vi.stubGlobal('fetch', fetchMock);
    const rows = await createXmlAdapter({ rowElement: 'item' })(
      'https://x.test/feed.xml'
    );
    expect(rows).toEqual([{ id: '1' }]);
  });

  it('throws on non-ok responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(textResponse('', { ok: false, status: 502 }))
    );
    await expect(
      createXmlAdapter({ rowElement: 'item' })('u')
    ).rejects.toThrow('HTTP error! status: 502');
  });

  it('forwards the abort signal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse('<r/>'));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    await createXmlAdapter({ rowElement: 'r' })('u', controller.signal);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal).toBe(
      controller.signal
    );
  });
});
