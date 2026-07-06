import { describe, it, expect } from 'vitest';
import * as mod from './index';

describe('permissions module', () => {
  it('loads and exports canEditCell', () => {
    expect(typeof mod.canEditCell).toBe('function');
  });

  it('exports canViewCell', () => {
    expect(typeof mod.canViewCell).toBe('function');
  });

  it('exports isOwnRow', () => {
    expect(typeof mod.isOwnRow).toBe('function');
  });
});
