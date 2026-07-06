/**
 * adapters/xml.ts
 *
 * XML fetch adapter.  Fetches an XML document from a URL, parses it using
 * DOMParser, and extracts rows from a configurable element selector.
 * Phase 0: typed stub.
 */

import type { DataAdapter } from './inline';

export interface XmlAdapterOptions {
  /** URL of the XML document to fetch. */
  url: string;
  /** CSS selector for the row elements within the XML document. */
  rowSelector: string;
  /** Map of column keys to XML attribute names or child element names. */
  columnMap?: Record<string, string> | undefined;
}

/**
 * Create a data adapter that fetches and parses a remote XML document.
 */
export function createXmlAdapter(_options: XmlAdapterOptions): DataAdapter {
  throw new Error('createXmlAdapter: not implemented -- Phase 2');
}
