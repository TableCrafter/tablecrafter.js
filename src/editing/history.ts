/**
 * editing/history.ts
 *
 * Undo / redo stack for cell edits, row additions, and bulk-fill operations.
 *
 * The history is modeled as a pair of stacks (past / future) of Action pairs.
 * Each HistoryEntry records:
 *   - `action`  : the action that was dispatched (for redo)
 *   - `inverse` : the action that reverses the change (for undo)
 *
 * The store dispatches the inverse action on undo, and the forward action on
 * redo.  This keeps the history module pure -- it never calls the store directly.
 *
 * Note: the core/state.ts store already includes an internal undo/redo
 * implementation (undoStack / redoStack row snapshots).  This module provides
 * the typed, Action-pair-based alternative used by the headless API path.
 */

import type { Action } from '../core/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An entry in the undo/redo stack. */
export interface HistoryEntry {
  /** Action that was dispatched (replayed on redo). */
  action: Action;
  /** Inverse action that reverses the change (dispatched on undo). */
  inverse: Action;
}

/** The undo/redo history for a single store instance. */
export interface EditHistory {
  /** Actions that can be undone (most recent last). */
  past: HistoryEntry[];
  /** Actions that can be redone (most recent first). */
  future: HistoryEntry[];
}

// ---------------------------------------------------------------------------
// createHistory
// ---------------------------------------------------------------------------

/**
 * Create an empty EditHistory.
 *
 * @example
 *   const h = createHistory();
 *   h.past.length   // 0
 *   h.future.length // 0
 */
export function createHistory(): EditHistory {
  return { past: [], future: [] };
}

// ---------------------------------------------------------------------------
// pushHistory
// ---------------------------------------------------------------------------

/**
 * Push a new entry onto the past stack, clearing the future stack.
 * Returns a new EditHistory (immutable update).
 *
 * The future is cleared because once you make a new edit after undoing,
 * the previously-redoable actions are no longer reachable.
 *
 * @example
 *   const h1 = createHistory();
 *   const entry = {
 *     action:  { type: 'SET_ROWS', payload: { rows: [after] } },
 *     inverse: { type: 'SET_ROWS', payload: { rows: [before] } },
 *   };
 *   const h2 = pushHistory(h1, entry);
 *   h2.past.length // 1
 */
export function pushHistory(
  history: EditHistory,
  entry: HistoryEntry
): EditHistory {
  return {
    past: [...history.past, entry],
    future: [],
  };
}

// ---------------------------------------------------------------------------
// popUndo
// ---------------------------------------------------------------------------

/**
 * Pop the most recent past entry and move it to the future stack.
 * Returns the inverse Action to dispatch, or null when history is empty.
 *
 * @example
 *   const { history: h2, action } = popUndo(h1);
 *   if (action) store.dispatch(action); // dispatches the inverse
 */
export function popUndo(
  history: EditHistory
): { history: EditHistory; action: Action | null } {
  if (history.past.length === 0) {
    return { history, action: null };
  }

  const past = history.past.slice();
  const entry = past[past.length - 1];
  if (entry === undefined) return { history, action: null };
  past.pop();

  return {
    history: {
      past,
      future: [entry, ...history.future],
    },
    action: entry.inverse,
  };
}

// ---------------------------------------------------------------------------
// popRedo
// ---------------------------------------------------------------------------

/**
 * Pop the most recent future entry and move it to the past stack.
 * Returns the forward Action to dispatch, or null when future is empty.
 *
 * @example
 *   const { history: h3, action } = popRedo(h2);
 *   if (action) store.dispatch(action); // re-applies the original action
 */
export function popRedo(
  history: EditHistory
): { history: EditHistory; action: Action | null } {
  if (history.future.length === 0) {
    return { history, action: null };
  }

  const entry = history.future[0];
  if (entry === undefined) return { history, action: null };
  const remainingFuture = history.future.slice(1);

  return {
    history: {
      past: [...history.past, entry],
      future: remainingFuture,
    },
    action: entry.action,
  };
}
