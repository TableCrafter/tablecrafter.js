/**
 * editing/diff.ts
 *
 * Cell value diff for the "was: X" badge shown in the inline editor UI.
 *
 * Computes a human-readable change summary between the value captured when
 * the edit session opened (originalValue on EditingCell) and the current
 * pending value.  The renderer uses this to show "was: Alice" next to a text
 * input that has been modified.
 *
 * This module is pure: no store references, no DOM.
 */

// ---------------------------------------------------------------------------
// formatValueForBadge
// ---------------------------------------------------------------------------

/**
 * Format a single cell value for display in the "was: X" badge.
 *
 * Formatting rules (order matters):
 *   - null / undefined -> ''
 *   - boolean         -> 'yes' or 'no'
 *   - Array           -> comma-joined items
 *   - everything else -> String(value)
 *
 * @example
 *   formatValueForBadge(null)          // ''
 *   formatValueForBadge(true)          // 'yes'
 *   formatValueForBadge(false)         // 'no'
 *   formatValueForBadge(['a','b'])     // 'a, b'
 *   formatValueForBadge(42)            // '42'
 *   formatValueForBadge('Alice')       // 'Alice'
 */
export function formatValueForBadge(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.map(String).join(', ');
  return String(value);
}

// ---------------------------------------------------------------------------
// CellValueDiff
// ---------------------------------------------------------------------------

/** A formatted diff between the original and pending cell values. */
export interface CellValueDiff {
  /** Formatted original value (empty string when null/undefined). */
  originalFormatted: string;
  /** Formatted pending value. */
  pendingFormatted: string;
  /** True when the two values differ. */
  hasChanged: boolean;
  /**
   * Short "was: X" badge string.
   * Empty when values are the same OR when the original was empty (nothing
   * worth showing as the "previous" value).
   */
  badge: string;
}

// ---------------------------------------------------------------------------
// computeCellDiff
// ---------------------------------------------------------------------------

/**
 * Compute the diff between the original and pending cell values.
 *
 * Equality check order:
 *   1. Strict ===
 *   2. Array: JSON.stringify comparison
 *   3. Formatted string comparison (covers number/boolean/string variants)
 *
 * @param original - Value captured when the edit session started
 *                   (EditingCell.originalValue from core/state).
 * @param pending  - Current value in the editor input.
 *
 * @example
 *   computeCellDiff('Alice', 'Bob')
 *   // { originalFormatted: 'Alice', pendingFormatted: 'Bob',
 *   //   hasChanged: true, badge: 'was: Alice' }
 *
 *   computeCellDiff(null, 'new')
 *   // { originalFormatted: '', pendingFormatted: 'new',
 *   //   hasChanged: true, badge: '' }  // no "was" badge when original is empty
 *
 *   computeCellDiff('same', 'same')
 *   // { originalFormatted: 'same', pendingFormatted: 'same',
 *   //   hasChanged: false, badge: '' }
 */
export function computeCellDiff(original: unknown, pending: unknown): CellValueDiff {
  const originalFormatted = formatValueForBadge(original);
  const pendingFormatted = formatValueForBadge(pending);

  let hasChanged: boolean;

  if (original === pending) {
    hasChanged = false;
  } else if (Array.isArray(original) && Array.isArray(pending)) {
    try {
      hasChanged = JSON.stringify(original) !== JSON.stringify(pending);
    } catch {
      hasChanged = true;
    }
  } else {
    hasChanged = originalFormatted !== pendingFormatted;
  }

  // Only show "was: X" when there IS a non-empty original to show.
  const badge =
    hasChanged && originalFormatted !== '' ? `was: ${originalFormatted}` : '';

  return { originalFormatted, pendingFormatted, hasChanged, badge };
}
