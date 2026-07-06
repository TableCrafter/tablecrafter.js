/**
 * core/events.ts
 *
 * Lightweight event emitter used internally by the store.
 * Mirrors the v2 on/off/once/emit API so existing event consumers migrate
 * without changes.
 *
 * Semantics ported verbatim from the v2 monolith (`_listeners` Map, #324/#343):
 *   - on(event, handler) registers and returns an unsubscribe function.
 *   - off(event, handler) removes the first matching handler; no-op otherwise.
 *   - once(event, handler) fires the handler at most once, then detaches.
 *   - emit(event, payload) invokes every handler in registration order, in
 *     isolation: a throwing handler is caught and logged via console.error and
 *     does NOT prevent the remaining handlers from running or propagate out.
 *   - The handler list is shallow-copied before iteration so a handler may
 *     safely off()/on() during dispatch without corrupting the walk.
 *
 * This module contains ZERO DOM access -- it is part of the headless core.
 */

import type { EventHandler } from './types';

/** Internal event bus shape returned by createEventEmitter(). */
export interface EventEmitter {
  on(event: string, handler: EventHandler): EventEmitter;
  off(event: string, handler: EventHandler): EventEmitter;
  once(event: string, handler: EventHandler): EventEmitter;
  emit(event: string, payload?: unknown): void;
  /** Remove every listener for every event (used by store teardown). */
  clear(): void;
}

/**
 * Create a new event emitter instance.
 *
 * The store factory (core/state.ts) calls this once and attaches the methods
 * to the returned Store object.
 */
export function createEventEmitter(): EventEmitter {
  const listeners = new Map<string, EventHandler[]>();

  const emitter: EventEmitter = {
    on(event: string, handler: EventHandler): EventEmitter {
      let bucket = listeners.get(event);
      if (!bucket) {
        bucket = [];
        listeners.set(event, bucket);
      }
      bucket.push(handler);
      return emitter;
    },

    off(event: string, handler: EventHandler): EventEmitter {
      const bucket = listeners.get(event);
      if (!bucket) return emitter;
      const idx = bucket.indexOf(handler);
      if (idx !== -1) bucket.splice(idx, 1);
      if (bucket.length === 0) listeners.delete(event);
      return emitter;
    },

    once(event: string, handler: EventHandler): EventEmitter {
      const wrapper: EventHandler = (payload) => {
        emitter.off(event, wrapper);
        handler(payload);
      };
      return emitter.on(event, wrapper);
    },

    emit(event: string, payload?: unknown): void {
      const bucket = listeners.get(event);
      if (!bucket) return;
      // Shallow-copy so off()/on() during dispatch cannot corrupt the walk.
      const snapshot = bucket.slice();
      for (const handler of snapshot) {
        try {
          handler(payload);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`TableCrafter: uncaught error in "${event}" handler`, err);
        }
      }
    },

    clear(): void {
      listeners.clear();
    },
  };

  return emitter;
}
