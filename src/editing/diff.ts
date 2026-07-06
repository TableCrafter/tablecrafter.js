/**
 * editing/diff.ts
 *
 * Edit diff descriptor — captures old vs new value for a cell edit.
 * Used by the renderer to render the "was: X" badge on the cell.
 * All functions are pure; no DOM access.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Describes the change made to a single cell during an edit.
 */
export interface EditDiff {
  /** The value before the edit. */
  oldValue: unknown;
  /** The value after the edit. */
  newValue: unknown;
  /** true when oldValue and newValue differ (deep-equal for arrays/objects). */
  changed: boolean;
  /** Human-readable "was: X" badge text.  Empty string when unchanged. */
  badge: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Loose equality check for cell values.
 * Arrays and plain objects are compared by JSON.stringify for simplicity;
 * this is sufficient for cell-level diffs (not deep object graphs).
 */
function cellEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // Handle null / undefined equivalence
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  // Arrays and objects: compare serialised form
  if (typeof a === 'object' || typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  // Primitive coercion: '42' === 42 is intentionally strict here
  return false;
}

/**
 * Produce a human-readable label for a cell value.
 * Arrays → comma-joined; booleans → Yes/No; null/undefined → '(empty)'.
 */
function valueLabel(v: unknown): string {
  if (v == null) return '(empty)';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) {
    if (v.length === 0) return '(empty)';
    return v.map(String).join(', ');
  }
  const s = String(v);
  return s === '' ? '(empty)' : s;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an EditDiff descriptor from before and after values.
 */
export function buildEditDiff(oldValue: unknown, newValue: unknown): EditDiff {
  const changed = !cellEquals(oldValue, newValue);
  const badge = changed ? `was: ${valueLabel(oldValue)}` : '';
  return { oldValue, newValue, changed, badge };
}

/**
 * Format the diff as the "was: X" badge text shown in the cell.
 * Returns an empty string when there is no change.
 */
export function formatDiffBadge(diff: EditDiff): string {
  return diff.badge;
}
