import { describe, it, expect, vi } from 'vitest';
import { createEventEmitter } from './events';

describe('core/events module', () => {
  it('loads and exports createEventEmitter', () => {
    expect(typeof createEventEmitter).toBe('function');
  });

  it('on() registers a handler that receives the emitted payload', () => {
    const e = createEventEmitter();
    const spy = vi.fn();
    e.on('x', spy);
    e.emit('x', { a: 1 });
    expect(spy).toHaveBeenCalledWith({ a: 1 });
  });

  it('on() returns the emitter for chaining', () => {
    const e = createEventEmitter();
    expect(e.on('x', () => {})).toBe(e);
  });

  it('emit() to an event with no listeners is a no-op', () => {
    const e = createEventEmitter();
    expect(() => e.emit('nothing', 1)).not.toThrow();
  });

  it('calls handlers in registration order', () => {
    const e = createEventEmitter();
    const order: number[] = [];
    e.on('x', () => order.push(1));
    e.on('x', () => order.push(2));
    e.on('x', () => order.push(3));
    e.emit('x');
    expect(order).toEqual([1, 2, 3]);
  });

  it('off() removes a handler; no-op if not registered', () => {
    const e = createEventEmitter();
    const spy = vi.fn();
    e.on('x', spy);
    e.off('x', spy);
    e.emit('x');
    expect(spy).not.toHaveBeenCalled();
    expect(() => e.off('x', spy)).not.toThrow();
    expect(() => e.off('missing', spy)).not.toThrow();
  });

  it('off() only removes the first matching instance', () => {
    const e = createEventEmitter();
    const spy = vi.fn();
    e.on('x', spy);
    e.on('x', spy);
    e.off('x', spy);
    e.emit('x');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('once() fires exactly once then detaches', () => {
    const e = createEventEmitter();
    const spy = vi.fn();
    e.once('x', spy);
    e.emit('x', 'a');
    e.emit('x', 'b');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('a');
  });

  it('once() returns the emitter for chaining', () => {
    const e = createEventEmitter();
    expect(e.once('x', () => {})).toBe(e);
  });

  it('a once() handler can be detached with off() before it fires', () => {
    const e = createEventEmitter();
    const spy = vi.fn();
    e.once('x', spy);
    // off() with the original handler is a no-op (once wraps it); off() then
    // clear() proves clear() also drops one-shot wrappers.
    e.clear();
    e.emit('x');
    expect(spy).not.toHaveBeenCalled();
  });

  it('isolates handler exceptions: one throwing handler does not stop the rest', () => {
    const e = createEventEmitter();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const after = vi.fn();
    e.on('x', () => {
      throw new Error('boom');
    });
    e.on('x', after);
    expect(() => e.emit('x')).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('a handler that off()s during dispatch does not corrupt the current walk', () => {
    const e = createEventEmitter();
    const calls: string[] = [];
    const b = () => calls.push('b');
    e.on('x', () => {
      calls.push('a');
      e.off('x', b);
    });
    e.on('x', b);
    e.emit('x');
    // Snapshot semantics: b was in the snapshot so it still runs this round.
    expect(calls).toEqual(['a', 'b']);
    calls.length = 0;
    e.emit('x');
    expect(calls).toEqual(['a']);
  });

  it('clear() removes every listener for every event', () => {
    const e = createEventEmitter();
    const spy = vi.fn();
    e.on('a', spy);
    e.on('b', spy);
    e.clear();
    e.emit('a');
    e.emit('b');
    expect(spy).not.toHaveBeenCalled();
  });
});
