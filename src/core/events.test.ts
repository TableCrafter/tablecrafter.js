import { describe, it, expect } from 'vitest';
import * as mod from './events';

describe('core/events module', () => {
  it('loads and exports createEventEmitter', () => {
    expect(typeof mod.createEventEmitter).toBe('function');
  });
});
