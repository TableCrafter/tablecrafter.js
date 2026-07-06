/**
 * adapters/xml.ts
 *
 * XML fetch adapter (parity #336).
 *
 * ## Parsing approach: dependency-free string extractor (option a)
 *
 * `DOMParser` is unavailable in headless/Node contexts, and the RFC's core
 * principle is "no DOM references anywhere in core" -- the default loader in
 * `core/state.ts` is fetch-only so stores run in SSR/workers/tests without a
 * DOM.  Adapters plug into that same seam, so this module uses a small
 * regex/string-based extractor for the repeating-element case instead of
 * DOMParser.  That keeps the adapter runnable everywhere the store runs and
 * adds zero dependencies.
 *
 * Trade-off (documented deliberately): this is NOT a general XML parser.  It
 * targets flat, repeating-record documents (the overwhelmingly common
 * table-feed shape, e.g. `<items><item><name>..</name></item>...</items>`):
 * - row element attributes become fields;
 * - direct child elements become fields (text content, entities + CDATA
 *   decoded; nested markup is kept as raw text);
 * - namespaces, processing instructions, and mixed content are out of scope.
 * Documents needing full fidelity should be transformed server-side or via a
 * custom loader in a renderer context where DOMParser exists.
 */

import type { DataLoader } from '../core/state';

export interface XmlAdapterOptions {
  /** Name of the repeating row element (e.g. `"item"`, `"row"`, `"record"`). */
  rowElement: string;
  /** Additional fetch options (headers, credentials, ...). */
  fetchOptions?: RequestInit | undefined;
}

/** Decode CDATA sections and the predefined + numeric XML entities. */
function decodeXmlText(raw: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw);
  const text = cdata ? (cdata[1] as string) : raw;
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10))
    )
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function escapeRe(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ATTR_RE = /([\w:.-]+)\s*=\s*"([^"]*)"|([\w:.-]+)\s*=\s*'([^']*)'/g;
const CHILD_RE =
  /<([\w:.-]+)((?:\s[^<>]*?)?)\/>|<([\w:.-]+)(?:\s[^<>]*?)?>([\s\S]*?)<\/\3\s*>/g;

function parseAttributes(attrText: string, into: Record<string, string>): void {
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(attrText)) !== null) {
    const key = (m[1] ?? m[3]) as string;
    const value = (m[2] ?? m[4]) as string;
    into[key] = decodeXmlText(value);
  }
}

/**
 * Extract repeating `<rowElement>` records from an XML string into flat
 * row objects.  Attributes on the row element and its direct child elements
 * become fields; child element text has entities and CDATA decoded.
 * Unknown/missing structure yields `[]` rather than throwing.
 */
export function extractXmlRows(
  xml: string,
  rowElement: string
): Record<string, string>[] {
  const name = escapeRe(rowElement);
  const rowRe = new RegExp(
    `<${name}((?:\\s[^<>]*?)?)>([\\s\\S]*?)</${name}\\s*>|<${name}((?:\\s[^<>]*?)?)/>`,
    'g'
  );
  const rows: Record<string, string>[] = [];
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(String(xml ?? ''))) !== null) {
    const row: Record<string, string> = {};
    parseAttributes((rowMatch[1] ?? rowMatch[3] ?? '') as string, row);
    const inner = rowMatch[2];
    if (inner !== undefined) {
      CHILD_RE.lastIndex = 0;
      let child: RegExpExecArray | null;
      while ((child = CHILD_RE.exec(inner)) !== null) {
        if (child[1] !== undefined) {
          // Self-closing child: <name/>
          row[child[1]] = '';
        } else {
          row[child[3] as string] = decodeXmlText(child[4] as string);
        }
      }
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Create a {@link DataLoader} that fetches the `source` URL as XML text and
 * extracts rows from the configured repeating element.  The store's abort
 * signal is forwarded to `fetch`.
 *
 * @example
 * store.setLoader(createXmlAdapter({ rowElement: 'item' }));
 */
export function createXmlAdapter(options: XmlAdapterOptions): DataLoader {
  return async (source, signal) => {
    const init: RequestInit = { ...options.fetchOptions };
    if (signal) init.signal = signal;
    const response = await fetch(source, init);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();
    return extractXmlRows(text, options.rowElement);
  };
}
