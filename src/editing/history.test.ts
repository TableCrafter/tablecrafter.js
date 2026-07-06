/**
 * editing/history.test.ts
 *
 * Vitest unit tests for the editing/history.ts functions:
 *   createHistory, pushHistory, popUndo, popRedo.
 */

import { describe, it, expect } from 'vitest';
import {
  createHistory,
  pushHistory,
  popUndo,
  popRedo,
} from './history';
import type { HistoryEntry } from './history';
import type { Action } from '../core/types';

// ---------------------------------------------------------------------------
// export presence (original stub tests preserved)
// ---------------------------------------------------------------------------

describe('editing/history module exports', () => {
  it('exports createHistory', () => {
    expect(typeof createHistory).toBe('function');
  });

  it('exports pushHistory', () => {
    expect(typeof pushHistory).toBe('function');
  });

  it('exports popUndo', () => {
    expect(typeof popUndo).toBe('function');
  });

  it('exports popRedo', () => {
    expect(typeof popRedo).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// createHistory
// ---------------------------------------------------------------------------

describe('createHistory', () => {
  it('returns an empty past stack', () => {
    const h = createHistory();
    expect(h.past).toHaveLength(0);
  });

  it('returns an empty future stack', () => {
    const h = createHistory();
    expect(h.future).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// pushHistory helpers
// ---------------------------------------------------------------------------

function makeEntry(label: string): HistoryEntry {
  const action: Action = {
    type: 'SET_ROWS',
    payload: { rows: [{ label }] },
  };
  const inverse: Action = {
    type: 'SET_ROWS',
    payload: { rows: [{ label: `undo-${label}` }] },
  };
  return { action, inverse };
}

// ---------------------------------------------------------------------------
// pushHistory
// ---------------------------------------------------------------------------

describe('pushHistory', () => {
  it('adds entry to past stack', () => {
    const h = createHistory();
    const h2 = pushHistory(h, makeEntry('A'));
    expect(h2.past).toHaveLength(1);
  });

  it('most recent entry is last in past', () => {
    const h = createHistory();
    const h2 = pushHistory(h, makeEntry('A'));
    const h3 = pushHistory(h2, makeEntry('B'));
    const lastEntry = h3.past[h3.past.length - 1]!;
    const action = lastEntry.action;
    expect(action.type === 'SET_ROWS' && (action.payload.rows[0]! as Record<string,unknown>)['label']).toBe('B');
  });

  it('clears future stack on push', () => {
    const h = createHistory();
    const h1 = pushHistory(h, makeEntry('A'));
    // Simulate a future entry via undo
    const { history: hUndo } = popUndo(h1);
    expect(hUndo.future).toHaveLength(1);

    // Push a new entry -- should clear future
    const h2 = pushHistory(hUndo, makeEntry('B'));
    expect(h2.future).toHaveLength(0);
  });

  it('does not mutate original history', () => {
    const h = createHistory();
    pushHistory(h, makeEntry('A'));
    expect(h.past).toHaveLength(0);
  });

  it('accumulates multiple entries', () => {
    const h = createHistory();
    const h2 = pushHistory(pushHistory(pushHistory(h, makeEntry('A')), makeEntry('B')), makeEntry('C'));
    expect(h2.past).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// popUndo
// ---------------------------------------------------------------------------

describe('popUndo', () => {
  it('returns null action when history is empty', () => {
    const h = createHistory();
    const { action } = popUndo(h);
    expect(action).toBeNull();
  });

  it('returns the inverse action of the most recent entry', () => {
    const h = createHistory();
    const entry = makeEntry('X');
    const h1 = pushHistory(h, entry);
    const { action } = popUndo(h1);
    expect(action).toBe(entry.inverse);
  });

  it('removes entry from past', () => {
    const h = createHistory();
    const h1 = pushHistory(h, makeEntry('A'));
    const { history } = popUndo(h1);
    expect(history.past).toHaveLength(0);
  });

  it('moves entry to future', () => {
    const h = createHistory();
    const h1 = pushHistory(h, makeEntry('A'));
    const { history } = popUndo(h1);
    expect(history.future).toHaveLength(1);
  });

  it('future entry is prepended (most recently-undone first)', () => {
    const h = createHistory();
    const h1 = pushHistory(pushHistory(h, makeEntry('A')), makeEntry('B'));
    const { history: h2 } = popUndo(h1); // undo B: future = [B]
    const { history: h3 } = popUndo(h2); // undo A: future = [A, B]
    // future[0] = A (most recently undone -- redone first to replay A then B)
    expect(h3.future).toHaveLength(2);
    const firstFuture = h3.future[0]!;
    const firstAction = firstFuture.action;
    expect(
      firstAction.type === 'SET_ROWS' && (firstAction.payload.rows[0]! as Record<string,unknown>)['label']
    ).toBe('A');
  });

  it('does not mutate original history', () => {
    const h = createHistory();
    const h1 = pushHistory(h, makeEntry('A'));
    const originalPastLength = h1.past.length;
    popUndo(h1);
    expect(h1.past).toHaveLength(originalPastLength);
  });
});

// ---------------------------------------------------------------------------
// popRedo
// ---------------------------------------------------------------------------

describe('popRedo', () => {
  it('returns null action when future is empty', () => {
    const h = createHistory();
    const { action } = popRedo(h);
    expect(action).toBeNull();
  });

  it('returns the forward action of the most recent future entry', () => {
    const h = createHistory();
    const entry = makeEntry('X');
    const h1 = pushHistory(h, entry);
    const { history: hUndo } = popUndo(h1);
    const { action } = popRedo(hUndo);
    expect(action).toBe(entry.action);
  });

  it('removes entry from future', () => {
    const h = createHistory();
    const h1 = pushHistory(h, makeEntry('A'));
    const { history: hUndo } = popUndo(h1);
    const { history: hRedo } = popRedo(hUndo);
    expect(hRedo.future).toHaveLength(0);
  });

  it('moves entry back to past', () => {
    const h = createHistory();
    const h1 = pushHistory(h, makeEntry('A'));
    const { history: hUndo } = popUndo(h1);
    const { history: hRedo } = popRedo(hUndo);
    expect(hRedo.past).toHaveLength(1);
  });

  it('does not mutate original history', () => {
    const h = createHistory();
    const h1 = pushHistory(h, makeEntry('A'));
    const { history: hUndo } = popUndo(h1);
    const originalFutureLength = hUndo.future.length;
    popRedo(hUndo);
    expect(hUndo.future).toHaveLength(originalFutureLength);
  });

  it('undo/redo round-trip restores original state', () => {
    const h = createHistory();
    const entry = makeEntry('A');
    const h1 = pushHistory(h, entry);

    const { history: hAfterUndo, action: undoAction } = popUndo(h1);
    expect(undoAction).toBe(entry.inverse);

    const { history: hAfterRedo, action: redoAction } = popRedo(hAfterUndo);
    expect(redoAction).toBe(entry.action);
    expect(hAfterRedo.past).toHaveLength(1);
    expect(hAfterRedo.future).toHaveLength(0);
  });
});
