/**
 * core/events.ts
 *
 * Lightweight event emitter used internally by the store.
 * Mirrors the v2 on/off/once/emit API so existing event consumers migrate
 * without changes.  Phase 0: typed stub.
 */

import type { EventHandler } from './types';

/** Internal event bus shape returned by createEventEmitter(). */
export interface EventEmitter {
  on(event: string, handler: EventHandler): EventEmitter;
  off(event: string, handler: EventHandler): EventEmitter;
  once(event: string, handler: EventHandler): EventEmitter;
  emit(event: string, payload?: unknown): void;
}

/**
 * Create a new event emitter instance.
 *
 * The store factory (core/state.ts) calls this once and attaches the methods
 * to the returned Store object.
 */
export function createEventEmitter(): EventEmitter {
  throw new Error('createEventEmitter: not implemented -- Phase 1');
}
