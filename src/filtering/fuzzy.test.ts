import { describe, it, expect } from 'vitest';
import * as mod from './fuzzy';

describe('filtering/fuzzy module', () => {
  it('loads and exports fuzzyMatch', () => {
    expect(typeof mod.fuzzyMatch).toBe('function');
  });

  it('exports highlightMatch', () => {
    expect(typeof mod.highlightMatch).toBe('function');
  });
});
