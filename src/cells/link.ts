/**
 * cells/link.ts
 *
 * Link cell renderer.  Renders a value as a clickable anchor tag with
 * configurable href template and optional label column.  Unsafe schemes
 * (anything other than https?, mailto:, tel:, /, #, ?) render as a plain span.
 *
 * v3 policy: produces an HTML string — no document.createElement.
 */

import type { CellRendererFn, TableCrafterColumn } from '../core/types';
import type { LinkDescriptor, LinkUnsafeDescriptor } from './descriptors';

/** Link renderer options (attached to TableCrafterColumn as `column.link`). */
export interface LinkOptions {
  /**
   * Function that receives (value, row) and returns the href string.
   * Defaults to String(value).
   */
  hrefFor?: ((value: unknown, row: unknown) => string) | undefined;
  /**
   * Data property key whose value is used as the anchor label.
   * Defaults to the cell value.
   */
  labelFrom?: string | undefined;
}

type ColumnWithLink = TableCrafterColumn & { link?: LinkOptions };

/**
 * Allowed href schemes (ported exactly from v2 _isSafeUrl).
 */
const SAFE_SCHEME_RE = /^(https?:|mailto:|tel:|\/|#|\?)/i;

/** Return true when href is safe to render as an anchor. */
export function isSafeUrl(href: string): boolean {
  return SAFE_SCHEME_RE.test(href);
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Derive the href string for a value using column options.
 * Always returns a string (possibly empty).
 */
export function hrefFor(value: unknown, row: unknown, column: TableCrafterColumn): string {
  const col = column as ColumnWithLink;
  if (col.link && typeof col.link.hrefFor === 'function') {
    return col.link.hrefFor(value, row);
  }
  return String(value ?? '');
}

/**
 * Derive the display label for a value using column options.
 */
export function labelFrom(value: unknown, row: unknown, column: TableCrafterColumn): string {
  const col = column as ColumnWithLink;
  const colRow = row as Record<string, unknown> | null | undefined;
  if (col.link && col.link.labelFrom && colRow) {
    const label = colRow[col.link.labelFrom];
    return label !== null && label !== undefined ? String(label) : String(value ?? '');
  }
  return String(value ?? '');
}

/**
 * Produce a typed link descriptor.
 * Returns null for null/undefined values.
 */
export function linkDescriptor(
  value: unknown,
  row: unknown,
  column: TableCrafterColumn
): LinkDescriptor | LinkUnsafeDescriptor | null {
  if (value === null || value === undefined) return null;

  const href = hrefFor(value, row, column);
  if (!href) return null;

  if (!isSafeUrl(href)) {
    return { kind: 'link-unsafe', text: String(value) };
  }

  return {
    kind: 'link',
    href,
    label: labelFrom(value, row, column),
    safe: true,
  };
}

/**
 * CellRendererFn-compatible wrapper.
 * Returns an HTML string.
 */
export const renderLink: CellRendererFn = (
  value: unknown,
  row: unknown,
  column: TableCrafterColumn
): string => {
  const desc = linkDescriptor(value, row, column);
  if (!desc) return '';

  if (desc.kind === 'link-unsafe') {
    return `<span>${escHtml(desc.text)}</span>`;
  }

  return (
    `<a class="tc-link" href="${escHtml(desc.href)}" ` +
    `target="_blank" rel="noopener noreferrer">${escHtml(desc.label)}</a>`
  );
};
