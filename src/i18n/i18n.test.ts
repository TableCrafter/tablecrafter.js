import { describe, it, expect } from 'vitest';
import * as mod from './index';

describe('i18n module', () => {
  it('loads and exports resolveI18n', () => {
    expect(typeof mod.resolveI18n).toBe('function');
  });

  it('exports formatNumber', () => {
    expect(typeof mod.formatNumber).toBe('function');
  });

  it('exports formatDate', () => {
    expect(typeof mod.formatDate).toBe('function');
  });

  it('exports formatCurrency', () => {
    expect(typeof mod.formatCurrency).toBe('function');
  });

  it('exports getCollator', () => {
    expect(typeof mod.getCollator).toBe('function');
  });
});
