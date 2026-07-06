import { describe, it, expect } from 'vitest';
import * as mod from './index';

describe('editing module', () => {
  it('loads and exports startCellEdit', () => {
    expect(typeof mod.startCellEdit).toBe('function');
  });

  it('exports commitCellEdit', () => {
    expect(typeof mod.commitCellEdit).toBe('function');
  });

  it('exports cancelCellEdit', () => {
    expect(typeof mod.cancelCellEdit).toBe('function');
  });

  it('exports addRow', () => {
    expect(typeof mod.addRow).toBe('function');
  });

  it('exports duplicateRow', () => {
    expect(typeof mod.duplicateRow).toBe('function');
  });

  it('exports bulkFill', () => {
    expect(typeof mod.bulkFill).toBe('function');
  });

  it('exports nextCellPosition', () => {
    expect(typeof mod.nextCellPosition).toBe('function');
  });
});
