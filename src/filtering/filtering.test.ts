import { describe, it, expect } from 'vitest';
import * as mod from './index';

describe('filtering module', () => {
  it('loads and exports applyFilter', () => {
    expect(typeof mod.applyFilter).toBe('function');
  });

  it('exports clearFilter', () => {
    expect(typeof mod.clearFilter).toBe('function');
  });

  it('exports testFilter', () => {
    expect(typeof mod.testFilter).toBe('function');
  });

  it('exports detectFilterOperator', () => {
    expect(typeof mod.detectFilterOperator).toBe('function');
  });
});
