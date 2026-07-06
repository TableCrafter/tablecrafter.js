import { describe, it, expect } from 'vitest';
import * as mod from './index';

describe('validation module', () => {
  it('loads and exports validateCell', () => {
    expect(typeof mod.validateCell).toBe('function');
  });

  it('exports evalRule', () => {
    expect(typeof mod.evalRule).toBe('function');
  });
});
