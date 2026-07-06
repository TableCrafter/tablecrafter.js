/**
 * editing/bulk-fill.test.ts
 *
 * Tests for the bulk-fill preview computation.
 */

import { describe, it, expect } from 'vitest';
import { computeBulkFillPreview, applyBulkFill } from './bulk-fill';

// ids deliberately do not collide with array indices so id-lookup and
// index-fallback resolution are unambiguous in tests
const rows = [
  { id: 101, status: 'open',   priority: 'low'  },
  { id: 102, status: 'closed', priority: 'high' },
  { id: 103, status: 'open',   priority: 'low'  },
  { id: 104, status: 'open',   priority: 'med'  },
];

describe('computeBulkFillPreview', () => {
  it('returns a preview with totalCount matching rowIds length', () => {
    const p = computeBulkFillPreview(rows, [0, 1, 2], 'status', 'resolved');
    expect(p.totalCount).toBe(3);
  });

  it('reports affectedCount for rows that will change', () => {
    const p = computeBulkFillPreview(rows, [0, 1], 'status', 'open');
    // row 0 status is already 'open' → no change
    // row 1 status is 'closed' → changes
    expect(p.affectedCount).toBe(1);
  });

  it('willChange = false when oldValue equals newValue', () => {
    const p = computeBulkFillPreview(rows, [0], 'status', 'open');
    expect(p.changes[0]?.willChange).toBe(false);
  });

  it('willChange = true when oldValue differs', () => {
    const p = computeBulkFillPreview(rows, [1], 'status', 'open');
    expect(p.changes[0]?.willChange).toBe(true);
  });

  it('records correct oldValue and newValue', () => {
    const p = computeBulkFillPreview(rows, [1], 'status', 'resolved');
    const c = p.changes[0];
    expect(c?.oldValue).toBe('closed');
    expect(c?.newValue).toBe('resolved');
  });

  it('stores the column name', () => {
    const p = computeBulkFillPreview(rows, [0], 'priority', 'urgent');
    expect(p.column).toBe('priority');
  });

  it('stores the newValue', () => {
    const p = computeBulkFillPreview(rows, [0], 'priority', 'urgent');
    expect(p.newValue).toBe('urgent');
  });

  it('returns affectedCount = 0 for empty rowIds', () => {
    const p = computeBulkFillPreview(rows, [], 'status', 'new');
    expect(p.affectedCount).toBe(0);
    expect(p.totalCount).toBe(0);
  });

  it('handles unresolvable rowIds gracefully', () => {
    const p = computeBulkFillPreview(rows, [999, 1000], 'status', 'new');
    expect(p.changes).toHaveLength(2);
    expect(p.changes[0]?.willChange).toBe(false);
    expect(p.changes[0]?.rowIndex).toBe(-1);
  });

  it('resolves by id field before index fallback', () => {
    const p = computeBulkFillPreview(rows, [101], 'status', 'resolved');
    // rowId = 101 resolves to the row with id: 101 at index 0
    const c = p.changes[0];
    expect(c?.rowIndex).toBe(0);
    expect(c?.oldValue).toBe('open');
  });

  it('resolves by string id field', () => {
    const stringIdRows = [
      { id: 'a1', status: 'open'   },
      { id: 'a2', status: 'closed' },
    ];
    const p = computeBulkFillPreview(stringIdRows, ['a2'], 'status', 'open');
    const c = p.changes[0];
    expect(c?.rowIndex).toBe(1);
    expect(c?.oldValue).toBe('closed');
    expect(c?.willChange).toBe(true);
  });

  it('all-same fill has affectedCount = 0', () => {
    const samePriorityRows = [
      { id: 10, priority: 'low' },
      { id: 11, priority: 'low' },
    ];
    const p = computeBulkFillPreview(samePriorityRows, [0, 1], 'priority', 'low');
    expect(p.affectedCount).toBe(0);
  });

  it('all-different fill has affectedCount = totalCount', () => {
    const p = computeBulkFillPreview(rows, [0, 1, 2, 3], 'status', 'resolved');
    // rows 1,2,3,4 have status open/closed/open/open
    // all change to 'resolved' → all 4 change
    expect(p.affectedCount).toBe(p.totalCount);
  });
});

describe('applyBulkFill', () => {
  it('applies the new value to changed rows', () => {
    const preview = computeBulkFillPreview(rows, [0, 1, 2], 'status', 'resolved');
    const newRows = applyBulkFill(rows, preview);
    expect((newRows[0] as { status: string }).status).toBe('resolved');
    expect((newRows[1] as { status: string }).status).toBe('resolved');
    expect((newRows[2] as { status: string }).status).toBe('resolved');
  });

  it('does not change rows outside the preview', () => {
    const preview = computeBulkFillPreview(rows, [0, 1], 'status', 'resolved');
    const newRows = applyBulkFill(rows, preview);
    // row 3 (index 3) was not in the preview
    expect((newRows[3] as { status: string }).status).toBe('open');
  });

  it('does not mutate the original rows array', () => {
    const preview = computeBulkFillPreview(rows, [0], 'status', 'resolved');
    applyBulkFill(rows, preview);
    expect((rows[0] as { status: string }).status).toBe('open');
  });

  it('skips rows where willChange = false', () => {
    // row 0 status is already 'open' — willChange should be false
    const preview = computeBulkFillPreview(rows, [0], 'status', 'open');
    const newRows = applyBulkFill(rows, preview);
    // should be unchanged
    expect((newRows[0] as { status: string }).status).toBe('open');
    expect(newRows[0]).not.toBe(rows[0]); // still a copy, but same value
  });

  it('preserves other fields on updated rows', () => {
    const preview = computeBulkFillPreview(rows, [1], 'status', 'pending');
    const newRows = applyBulkFill(rows, preview);
    expect((newRows[1] as { priority: string }).priority).toBe('high');
  });
});
