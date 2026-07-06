import { describe, it, expect } from 'vitest';
import * as dom from './dom';
import * as virtual from './virtual';
import * as a11y from './a11y';

describe('render modules', () => {
  it('dom module loads and exports mountTable', () => {
    expect(typeof dom.mountTable).toBe('function');
  });

  it('virtual module loads and exports mountVirtualScroll + computeVisibleRange', () => {
    expect(typeof virtual.mountVirtualScroll).toBe('function');
    expect(typeof virtual.computeVisibleRange).toBe('function');
  });

  it('a11y module loads and exports applyAriaGrid + mountRovingTabindex + createLiveRegion', () => {
    expect(typeof a11y.applyAriaGrid).toBe('function');
    expect(typeof a11y.mountRovingTabindex).toBe('function');
    expect(typeof a11y.createLiveRegion).toBe('function');
  });
});
