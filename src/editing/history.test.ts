/**
 * editing/history.test.ts
 *
 * Tests for the undo/redo history stack.
 */

import { describe, it, expect } from 'vitest';
import { createHistory, pushHistory, popUndo, popRedo, HISTORY_CAP } from './history';
import type { HistoryEntry, EditHistory } from './history';
import type { Action } from '../core/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(id: string): HistoryEntry {
  const action: Action = {
    type: 'SET_ROWS',
    payload: { rows: [{ id, label: `do-${id}` }] },
  };
  const inverse: Action = {
    type: 'SET_ROWS',
    payload: { rows: [{ id, label: `undo-${id}` }] },
  };
  return { action, inverse };
}

// ---------------------------------------------------------------------------
// createHistory
// ---------------------------------------------------------------------------

describe('createHistory', () => {
  it('exports createHistory', () => expect(typeof createHistory).toBe('function'));
  it('returns an object with past and future arrays', () => {
    const h = createHistory();
    expect(Array.isArray(h.past)).toBe(true);
    expect(Array.isArray(h.future)).toBe(true);
  });
  it('starts with empty past and future', () => {
    const h = createHistory();
    expect(h.past).toHaveLength(0);
    expect(h.future).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// pushHistory
// ---------------------------------------------------------------------------

describe('pushHistory', () => {
  it('exports pushHistory', () => expect(typeof pushHistory).toBe('function'));

  it('adds an entry to past', () => {
    const h = createHistory();
    const h2 = pushHistory(h, makeEntry('1'));
    expect(h2.past).toHaveLength(1);
  });

  it('clears the future stack', () => {
    let h = createHistory();
    h = pushHistory(h, makeEntry('1'));
    // Manually inject a future entry
    h = { ...h, future: [makeEntry('future')] };
    const h2 = pushHistory(h, makeEntry('2'));
    expect(h2.future).toHaveLength(0);
  });

  it('does not mutate the original history', () => {
    const h = createHistory();
    pushHistory(h, makeEntry('1'));
    expect(h.past).toHaveLength(0);
  });

  it('stacks multiple entries in order', () => {
    let h = createHistory();
    h = pushHistory(h, makeEntry('a'));
    h = pushHistory(h, makeEntry('b'));
    h = pushHistory(h, makeEntry('c'));
    expect(h.past).toHaveLength(3);
  });

  it(`enforces HISTORY_CAP (${HISTORY_CAP}) by dropping the oldest entry`, () => {
    let h = createHistory();
    for (let i = 0; i <= HISTORY_CAP; i++) {
      h = pushHistory(h, makeEntry(String(i)));
    }
    expect(h.past).toHaveLength(HISTORY_CAP);
  });
});

// ---------------------------------------------------------------------------
// popUndo
// ---------------------------------------------------------------------------

describe('popUndo', () => {
  it('exports popUndo', () => expect(typeof popUndo).toBe('function'));

  it('returns action = null on empty history', () => {
    const { action } = popUndo(createHistory());
    expect(action).toBeNull();
  });

  it('returns the inverse action of the most recent entry', () => {
    let h = createHistory();
    h = pushHistory(h, makeEntry('x'));
    const { action } = popUndo(h);
    expect(action?.type).toBe('SET_ROWS');
    // The inverse payload contains 'undo-x'
    const payload = (action as { type: 'SET_ROWS'; payload: { rows: unknown[] } } | null)?.payload;
    expect((payload?.rows[0] as { label: string })?.label).toBe('undo-x');
  });

  it('removes the entry from past', () => {
    let h = createHistory();
    h = pushHistory(h, makeEntry('1'));
    const { history: h2 } = popUndo(h);
    expect(h2.past).toHaveLength(0);
  });

  it('moves the entry to future', () => {
    let h = createHistory();
    h = pushHistory(h, makeEntry('1'));
    const { history: h2 } = popUndo(h);
    expect(h2.future).toHaveLength(1);
  });

  it('pops entries in LIFO order', () => {
    let h = createHistory();
    h = pushHistory(h, makeEntry('a'));
    h = pushHistory(h, makeEntry('b'));

    const { action: ub, history: h2 } = popUndo(h);
    const payload_b = (ub as { type: 'SET_ROWS'; payload: { rows: unknown[] } }).payload;
    expect((payload_b.rows[0] as { label: string }).label).toBe('undo-b');

    const { action: ua } = popUndo(h2);
    const payload_a = (ua as { type: 'SET_ROWS'; payload: { rows: unknown[] } }).payload;
    expect((payload_a.rows[0] as { label: string }).label).toBe('undo-a');
  });

  it('does not mutate the original history', () => {
    let h = createHistory();
    h = pushHistory(h, makeEntry('1'));
    const origPastLength = h.past.length;
    popUndo(h);
    expect(h.past).toHaveLength(origPastLength);
  });
});

// ---------------------------------------------------------------------------
// popRedo
// ---------------------------------------------------------------------------

describe('popRedo', () => {
  it('exports popRedo', () => expect(typeof popRedo).toBe('function'));

  it('returns action = null on empty future', () => {
    const { action } = popRedo(createHistory());
    expect(action).toBeNull();
  });

  function makeUndoneHistory(): EditHistory {
    let h = createHistory();
    h = pushHistory(h, makeEntry('r1'));
    const { history: h2 } = popUndo(h);
    return h2;
  }

  it('returns the redo action (original action)', () => {
    const h = makeUndoneHistory();
    const { action } = popRedo(h);
    expect(action?.type).toBe('SET_ROWS');
    const payload = (action as { type: 'SET_ROWS'; payload: { rows: unknown[] } }).payload;
    expect((payload.rows[0] as { label: string }).label).toBe('do-r1');
  });

  it('moves the entry back to past', () => {
    const h = makeUndoneHistory();
    const { history: h2 } = popRedo(h);
    expect(h2.past).toHaveLength(1);
  });

  it('removes the entry from future', () => {
    const h = makeUndoneHistory();
    const { history: h2 } = popRedo(h);
    expect(h2.future).toHaveLength(0);
  });

  it('does not mutate the original history', () => {
    const h = makeUndoneHistory();
    const origFutureLength = h.future.length;
    popRedo(h);
    expect(h.future).toHaveLength(origFutureLength);
  });

  it('undo → redo → undo round trip works', () => {
    let h = createHistory();
    h = pushHistory(h, makeEntry('rt'));

    // Undo
    const { history: h2, action: undoAction } = popUndo(h);
    expect(undoAction).not.toBeNull();
    expect(h2.past).toHaveLength(0);
    expect(h2.future).toHaveLength(1);

    // Redo
    const { history: h3, action: redoAction } = popRedo(h2);
    expect(redoAction).not.toBeNull();
    expect(h3.past).toHaveLength(1);
    expect(h3.future).toHaveLength(0);

    // Undo again
    const { history: h4, action: undoAction2 } = popUndo(h3);
    expect(undoAction2).not.toBeNull();
    expect(h4.past).toHaveLength(0);
  });
});
