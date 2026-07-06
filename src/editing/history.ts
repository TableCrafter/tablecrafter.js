/**
 * editing/history.ts
 *
 * Undo / redo stack for cell edits, row additions, and bulk-fill operations.
 * The history is stored as a list of Action pairs (do / undo) so the store
 * can replay them without diffing the full state.
 *
 * All functions are pure; no DOM access.
 */

import type { Action } from '../core/types';

/** An entry in the undo/redo stack. */
export interface HistoryEntry {
  /** Action that was dispatched (for redo). */
  action: Action;
  /** Inverse action that reverses the change (for undo). */
  inverse: Action;
}

/** The undo/redo history for a single store instance. */
export interface EditHistory {
  /** Actions that can be undone (most recent last). */
  past: HistoryEntry[];
  /** Actions that can be redone (most recent first). */
  future: HistoryEntry[];
}

/**
 * Maximum number of undo steps to retain.
 * Matches the v2 HISTORY_CAP constant in core/state.ts.
 */
export const HISTORY_CAP = 100;

/**
 * Create an empty EditHistory.
 */
export function createHistory(): EditHistory {
  return { past: [], future: [] };
}

/**
 * Push a new entry onto the past stack, clearing the future stack.
 * Enforces HISTORY_CAP by dropping the oldest entry when exceeded.
 * Returns a new EditHistory (the input is not mutated).
 */
export function pushHistory(
  history: EditHistory,
  entry: HistoryEntry
): EditHistory {
  const past = [...history.past, entry];
  if (past.length > HISTORY_CAP) {
    past.shift();
  }
  return { past, future: [] };
}

/**
 * Pop the most recent past entry and move it to the future stack.
 * Returns the inverse action to dispatch, or null if history is empty.
 * Returns a new EditHistory (the input is not mutated).
 */
export function popUndo(
  history: EditHistory
): { history: EditHistory; action: Action | null } {
  if (history.past.length === 0) {
    return { history, action: null };
  }

  const past = [...history.past];
  const entry = past.pop();

  if (entry === undefined) {
    return { history, action: null };
  }

  const future = [entry, ...history.future];

  return {
    history: { past, future },
    action: entry.inverse,
  };
}

/**
 * Pop the most recent future entry and move it to the past stack.
 * Returns the redo action to dispatch, or null if future is empty.
 * Returns a new EditHistory (the input is not mutated).
 */
export function popRedo(
  history: EditHistory
): { history: EditHistory; action: Action | null } {
  if (history.future.length === 0) {
    return { history, action: null };
  }

  const future = [...history.future];
  const entry = future.shift();

  if (entry === undefined) {
    return { history, action: null };
  }

  const past = [...history.past, entry];
  if (past.length > HISTORY_CAP) {
    past.shift();
  }

  return {
    history: { past, future },
    action: entry.action,
  };
}
