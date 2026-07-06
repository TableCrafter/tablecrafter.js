import { describe, it, expect } from 'vitest';
import * as mod from './state';

describe('core/state module', () => {
  it('loads and exports createTable', () => {
    expect(typeof mod.createTable).toBe('function');
  });
});
