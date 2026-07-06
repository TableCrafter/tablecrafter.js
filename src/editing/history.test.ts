import { describe, it, expect } from 'vitest';
import * as mod from './history';

describe('editing/history module', () => {
  it('loads and exports createHistory', () => {
    expect(typeof mod.createHistory).toBe('function');
  });

  it('exports pushHistory', () => {
    expect(typeof mod.pushHistory).toBe('function');
  });

  it('exports popUndo', () => {
    expect(typeof mod.popUndo).toBe('function');
  });

  it('exports popRedo', () => {
    expect(typeof mod.popRedo).toBe('function');
  });
});
