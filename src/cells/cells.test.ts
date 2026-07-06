import { describe, it, expect } from 'vitest';
import * as mod from './index';

describe('cells module', () => {
  it('loads and exports createCellRegistry', () => {
    expect(typeof mod.createCellRegistry).toBe('function');
  });

  it('exports renderBadge', () => {
    expect(typeof mod.renderBadge).toBe('function');
  });

  it('exports renderProgress', () => {
    expect(typeof mod.renderProgress).toBe('function');
  });

  it('exports renderSparkline', () => {
    expect(typeof mod.renderSparkline).toBe('function');
  });

  it('exports renderLink', () => {
    expect(typeof mod.renderLink).toBe('function');
  });

  it('exports renderStar', () => {
    expect(typeof mod.renderStar).toBe('function');
  });

  it('exports renderConditional', () => {
    expect(typeof mod.renderConditional).toBe('function');
  });
});
