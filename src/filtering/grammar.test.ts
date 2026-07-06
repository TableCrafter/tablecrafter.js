import { describe, it, expect } from 'vitest';
import * as mod from './grammar';

describe('filtering/grammar module', () => {
  it('loads and exports parseQuery', () => {
    expect(typeof mod.parseQuery).toBe('function');
  });

  it('exports evalQuery', () => {
    expect(typeof mod.evalQuery).toBe('function');
  });

  it('exports tokenise', () => {
    expect(typeof mod.tokenise).toBe('function');
  });
});
