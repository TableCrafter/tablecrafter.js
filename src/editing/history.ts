/**
 * editing/history.ts
 *
 * Undo / redo stack for cell edits, row additions, and bulk-fill operations.
 * The history is stored as a list of Action pairs (do / undo) so the store
 * can replay them without diffing the full state.
 * Phase 0: typed stub.
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
 * Create an empty EditHistory.
 */
export function createHistory(): EditHistory {
  throw new Error('createHistory: not implemented -- Phase 2');
}

/**
 * Push a new entry onto the past stack, clearing the future stack.
 */
export function pushHistory(
  _history: EditHistory,
  _entry: HistoryEntry
): EditHistory {
  throw new Error('pushHistory: not implemented -- Phase 2');
}

/**
 * Pop the most recent past entry and move it to the future stack.
 * Returns the inverse action to dispatch, or null if history is empty.
 */
export function popUndo(
  _history: EditHistory
): { history: EditHistory; action: Action | null } {
  throw new Error('popUndo: not implemented -- Phase 2');
}

/**
 * Pop the most recent future entry and move it to the past stack.
 * Returns the redo action to dispatch, or null if future is empty.
 */
export function popRedo(
  _history: EditHistory
): { history: EditHistory; action: Action | null } {
  throw new Error('popRedo: not implemented -- Phase 2');
}
