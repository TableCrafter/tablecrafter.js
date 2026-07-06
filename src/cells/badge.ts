/**
 * cells/badge.ts
 *
 * Badge cell renderer.  Renders a value as a coloured pill badge using a
 * configurable statusFor function or theme-default CSS classes.
 *
 * v3 policy: produces an HTML string — no document.createElement.
 * The string is safe to set as innerHTML because the status slug is
 * validated against /^[a-zA-Z0-9_-]+$/ before use, and the display
 * text is escaped via a helper.
 */

import type { CellRendererFn, TableCrafterColumn } from '../core/types';
import type { BadgeDescriptor } from './descriptors';

/** Badge renderer options (attached to TableCrafterColumn as `column.badge`). */
export interface BadgeOptions {
  /**
   * A function that receives (value, row) and returns a CSS status slug,
   * e.g. 'success', 'warning', 'error'.  The slug is appended as
   * `tc-badge-{slug}` — only alphanumeric/underscore/hyphen slugs pass.
   */
  statusFor?: ((value: unknown, row: unknown) => string) | undefined;
}

type ColumnWithBadge = TableCrafterColumn & { badge?: BadgeOptions };

const SLUG_RE = /^[a-zA-Z0-9_-]+$/;

/** Escape text for safe embedding in HTML attribute or content. */
function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Produce a typed BadgeDescriptor from a raw value + column config.
 * Returns null for null/undefined inputs (caller renders empty cell).
 */
export function badgeDescriptor(
  value: unknown,
  row: unknown,
  column: TableCrafterColumn
): BadgeDescriptor | null {
  if (value === null || value === undefined) return null;

  const col = column as ColumnWithBadge;
  const rawStatus =
    col.badge && typeof col.badge.statusFor === 'function'
      ? col.badge.statusFor(value, row)
      : String(value).toLowerCase();

  const status = typeof rawStatus === 'string' && SLUG_RE.test(rawStatus)
    ? rawStatus
    : '';

  return {
    kind: 'badge',
    text: String(value),
    status,
  };
}

/**
 * CellRendererFn-compatible wrapper.
 * Returns an HTML string (safe, no DOM creation).
 */
export const renderBadge: CellRendererFn = (
  value: unknown,
  row: unknown,
  column: TableCrafterColumn
): string => {
  const desc = badgeDescriptor(value, row, column);
  if (!desc) return '';

  const classes = ['tc-badge'];
  if (desc.status) classes.push(`tc-badge-${desc.status}`);

  return `<span class="${classes.join(' ')}">${escHtml(desc.text)}</span>`;
};
