import { describe, it, expect } from 'vitest';
import * as mod from './index';

describe('sorting module', () => {
  it('loads and exports applySort', () => {
    expect(typeof mod.applySort).toBe('function');
  });

  it('exports compareValues', () => {
    expect(typeof mod.compareValues).toBe('function');
  });

  it('exports nextSortState', () => {
    expect(typeof mod.nextSortState).toBe('function');
  });
});
